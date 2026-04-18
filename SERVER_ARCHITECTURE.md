# Yeet — Server Architecture

> **Source of truth.** If something contradicts this document, this document wins.
> Last updated: 2026-04-18 (v2.2.1 — P1 dead-code purge)

---

## Overview

Yeet is a head-to-head image duel app with a daily photo contest. The entire backend runs on **Supabase** (Postgres + Auth + Storage). All mutations go through **RPC functions** (`SECURITY DEFINER`). The client never writes directly to tables — all mutations go through RPCs.

**Supabase project:** `https://kevfztwwnioouohjmaoy.supabase.co`

---

## Tables

### `users`
| Column | Type | Default | Nullable | Notes |
|--------|------|---------|----------|-------|
| `id` | uuid | `gen_random_uuid()` | NO | PK |
| `auth_id` | uuid | | NO | FK to Supabase Auth |
| `display_name` | text | | NO | UNIQUE |
| `lang` | text | | NO | `'en'` or `'fr'` |
| `push_token` | text | | YES | |
| `is_admin` | boolean | `false` | NO | **RLS prevents client writes.** Set via Supabase dashboard only. |
| `achievements` | jsonb | `'[]'` | NO | |
| `created_at` | timestamptz | `now()` | YES | |
| `last_active_at` | timestamptz | | YES | Updated by `heartbeat()` |

### `posts` (= cards)
| Column | Type | Default | Nullable | Notes |
|--------|------|---------|----------|-------|
| `id` | uuid | `gen_random_uuid()` | NO | PK |
| `sender_id` | uuid | | NO | FK to `users.id` |
| `video_url` | text | | YES | Public URL in `card_videos` bucket (legacy name — stores JPEG image URLs) |
| `pending_views` | integer | `0` | NO | Fuel. How many times this card can still appear in new matchups |
| `total_wins` | integer | `0` | NO | Lifetime win count. Never decreases |
| `emoji_tallies` | jsonb | `'{}'` | NO | Legacy — no longer written by any RPC. Column retained; will drop in a later migration |
| `caption` | text | | YES | Optional text overlay (max 140 chars). Rendered client-side. |
| `created_at` | timestamptz | `now()` | YES | |

**Indexes:**
- `idx_posts_pending_views` on `(pending_views) WHERE pending_views > 0` — fast card selection

### `matchups`
| Column | Type | Default | Nullable | Notes |
|--------|------|---------|----------|-------|
| `id` | uuid | `gen_random_uuid()` | NO | PK |
| `card_a_id` | uuid | | NO | FK to `posts.id`. One of the two cards the user saw |
| `card_b_id` | uuid | | NO | FK to `posts.id`. The other card the user saw |
| `viewer_id` | uuid | | NO | FK to `users.id`. **Legacy name** — this is the judge who swiped. Kept for compatibility. |
| `kept_card_id` | uuid | | YES | The survivor (winner) |
| `killed_card_id` | uuid | | YES | **Legacy name** — this is the yeeted (loser) card. Kept for compatibility. |
| `created_at` | timestamptz | `now()` | NO | |
| `judged_at` | timestamptz | | YES | Set to `now()` when `report_judgment` inserts the row |

**Convention (v2.2.1):** `report_judgment` always writes all columns in one INSERT — there are no unjudged rows. `kept_card_id` is the winner, `killed_card_id` is the loser, `viewer_id` is the judge.

**Naming quirk:** The column names `viewer_id` / `killed_card_id` are legacy. Client and server both tolerate them; renaming would require a migration and downtime window.

### `config` (key-value tuning)
| Key | Value | Used by |
|-----|-------|---------|
| `backfill_count` | `5` | `backfill_new_user_v2` (legacy, may be unused with card pool) |
| `matchup_fan_out` | `3` | **UNUSED** — legacy from push-based distribution |
| `min_active_cards_for_matchup` | `2` | **UNUSED** — legacy |

### `daily_tops` (legacy, unscheduled)
Table still exists; the `compute_daily_tops` cron was unscheduled in the P1 cleanup. Safe to drop in a later migration.

### Dropped in P1 cleanup (2026-04-18)
- Tables: `daily_objectives`, `comments`, `reposts`
- Columns: `posts.objective_id`, `matchups.emoji`
- Functions: `generate_matchups`, `get_kept_history`, `expire_stale_matchups`, `judge_matchup`, `create_card(text)`, `create_card(text, uuid)`
- Crons: `daily-tops`, `expire-stale-matchups`, `process-letter-delivery`
- Config rows: `active_threshold_days`, `daily_objective_enabled`, `daily_objective_theme`

---

## Storage

**Bucket:** `card_videos` (public read, authenticated write) — legacy name, stores JPEG images.

URL pattern: `https://kevfztwwnioouohjmaoy.supabase.co/storage/v1/object/public/card_videos/{user_id}/{timestamp}.jpg`

Test images: `card_videos/test/{user_id}/card_XX.jpg`

---

## Fuel System (`pending_views`)

The core distribution mechanic. Every card has a `pending_views` counter — its "fuel."

### How fuel enters the system
- **New card created:** `pending_views = 7` (guaranteed minimum exposure)
- **Refund on unjudged:** see "How fuel is recovered" below

> Historical: v1.1.0 awarded bonus fuel per streaked win (`+ceil((k+1)/2)`). Removed in P1 cleanup — `report_judgment` no longer mutates `pending_views`. All fuel now comes from the initial 7 and refunds.

### How fuel leaves the system
- **Card dealt to a user's pool:** `pending_views -= 1` when `fetch_card_pool` returns it. One card = one fuel spent, regardless of how many matchups it appears in during that session (a winning card can face multiple opponents from the same pool for only 1 fuel).
- **Card hits 0:** stops appearing in new pools.

### How fuel is recovered
- **Client returns unused cards:** `return_unused_cards(cardIds)` refunds 1 fuel per card. Called on cold start for stale pool cards.
- **Stale matchup expires** (unjudged > 24h): both cards get `pending_views += 1` refund. (Legacy — v1.2.0 creates no unjudged rows, but old rows from v1.1.0 may still exist.)

### Distribution model
**Pull-based, not push-based.** There is no fan-out after a win. The winner earns fuel (pending_views), and that fuel is spent when ANY user calls `fetch_card_pool`.

---

## RPC Functions

### `create_card(p_video_url text, p_caption text DEFAULT NULL) → uuid` *(LANGUAGE sql)*
Creates a new post for the authenticated user.
- Resolves `sender_id` from `auth.uid()` inline (no separate lookup)
- Sets `pending_views = 7` (guaranteed minimum exposure)
- Stores `p_caption` if provided (max 140 chars, enforced client-side)
- Returns the new post UUID

### `fetch_card_pool(p_count integer DEFAULT 10, p_exclude_ids uuid[] DEFAULT '{}') → jsonb` *(LANGUAGE sql)*
**Card pool vending machine.** Returns individual cards for the client to assemble into matchups locally.

Single CTE-chained query:
1. `picked` CTE: Find `p_count` cards where:
   - `pending_views > 0` (has fuel)
   - `sender_id != current user` (no self-judging)
   - `video_url IS NOT NULL`
   - `id NOT IN p_exclude_ids` (client passes IDs it already has)
   - `ORDER BY (is_today DESC, random())` — today's cards first, older cards fill remaining slots if today is thin
   - `FOR UPDATE ... SKIP LOCKED` to avoid race conditions
2. `decremented` CTE: UPDATE `pending_views -= 1` for each picked card (fuel cost)
3. Final SELECT: JOIN picked ⨝ decremented and build jsonb output

Returns JSON array of card objects:
```json
[{
  "id": "uuid",
  "video_url": "https://...",
  "sender_id": "uuid",
  "creator_username": "display_name",
  "total_wins": 0,
  "caption": "optional text or null"
}]
```

Returns `'[]'::jsonb` when no eligible cards exist.

**No matchups-table exclusion.** `fetch_card_pool` does NOT check the `matchups` table. Rematch avoidance is client-side only — the client accumulates seen IDs in `poolExcludeIds` (persisted) and passes them on each call. Cross-session rematches are possible; accepted as rare.

### `report_judgment(p_card_a_id uuid, p_card_b_id uuid, p_kept_card_id uuid) → void` *(LANGUAGE sql, v2.2.1)*
**Async judgment recorder.** Called fire-and-forget by the client after each yeet. Pure bookkeeping — no validation, no scoring side effects, no return value.

Single INSERT into `matchups`:
- `card_a_id`, `card_b_id` = the pair the user saw
- `viewer_id` = `(SELECT id FROM users WHERE auth_id = auth.uid())` (the judge)
- `kept_card_id` = winner
- `killed_card_id` = the other one (derived via CASE)
- `judged_at` = `now()`

**What it does NOT do (intentionally removed in P1):**
- Does not increment `total_wins` on the winner
- Does not grant streak/fuel bonus
- Does not write to `reposts` (table dropped)
- Does not validate self-voting or emoji (client-side only)
- Does not return a result

**Score derivation:** `total_wins` is computed on demand by `get_daily_leaderboard` / `get_leaderboard` via `COUNT(*) FROM matchups WHERE kept_card_id = p.id`. The `posts.total_wins` counter column is currently stale for new activity — not used by active queries. Future cleanup: either drop the column or recompute periodically.

### `return_unused_cards(p_card_ids uuid[]) → void`
**Fuel refund for unplayed cards.** Called fire-and-forget when the client discards stale pool cards (e.g., on app open with a leftover pool from a previous session).

Increments `pending_views` by 1 for each card ID. This reverses the fuel cost from `fetch_card_pool` for cards that were dealt but never shown to the user.

### `get_daily_leaderboard(p_date date DEFAULT CURRENT_DATE) → SETOF json`
Returns today's cards ranked by wins earned today. Joins `posts` with a per-card win count derived from `matchups.kept_card_id` where `judged_at::date = p_date`. No objective coupling.

Each row: `{ post_id, video_url, sender_id, creator_username, caption, wins_today }`.

### `get_leaderboard(p_limit integer DEFAULT 20) → jsonb`
Returns top cards ranked by `total_wins`. (Note: `total_wins` is a stale counter column — for accurate current ranking, prefer a query derived from `matchups`. Candidate for rewrite in a future pass.)

### `heartbeat() → void`
Updates `users.last_active_at` to `now()`.

### `backfill_new_user_v2(p_user_id uuid) → integer`
Seeds a new user with initial matchups. Reads `backfill_count` from `config` table (currently 5). Legacy — candidate for removal, as the card-pool architecture doesn't require pre-seeded matchups.

### Possibly still deployed, status uncertain
These RPCs were documented before the P1 cleanup. They may still exist in the DB, unused. Candidates for verification and drop in a future pass: `compute_daily_winner`, `compute_daily_tops`, `get_daily_objective`, `set_daily_objective`, `generate_matchups_for_user`, `sync_matchups`. (The P1 snapshot query only checked for an explicit drop list; these weren't on it.)

---

## Client ↔ Server Contract (v1.2.0 — Card Pool Architecture)

### Why we changed (v1.2.0)
The v1.1.0 system required **two sequential server round-trips per swipe**: `judge_matchup` (create ladder matchup) → `sync_matchups` (fetch it back). On cellular this was 500ms-2s of dead time between yeets. The server was on the critical path for every single interaction because matchup pairing happened server-side.

The v1.2.0 architecture moves matchup pairing to the client. The server is now a **card vending machine** (give me N fresh cards) and a **scoreboard** (here's what happened). The client sequences matchups locally with zero server wait.

### Pool fetch flow
```
App opens (cold start)
  → If stale pool exists from previous session:
    → returnUnusedCards(staleIds) — fire-and-forget fuel refund
    → Clear cardPool + poolExcludeIds
  → store.fetchCardPool(10)
    → RPC fetch_card_pool(10, excludeIds)
      → Server picks random cards with fuel, decrements pending_views
    → Append cards to cardPool
    → prefetchCardVideos(newCards) — queued download, 3 at a time
  → Await prefetchVideo for first 2 cards (loading spinner until on disk)
  → Pop first 2 cards from pool → pass as initialCardA/B to MatchupView

App resumes (from background)
  → If pool < 5: fetchCardPool(10) in background
```

### Yeet flow (zero server wait)
```
User swipes (yeet gesture)
  → Pop next challenger from cardPool (instant, local)
  → Fire yeet animation (500ms)
  → Fire reportJudgment() in background (NEVER awaited)
    → RPC report_judgment(cardA, cardB, kept) — 3 params, void return
      → Server: single INSERT into matchups
  → Ghost overlay handles the swap visual
  → Winner stays in place, untouched
  → If pool < 5 cards remaining: fetchCardPool(10) in background
```

### Judgment reporting
```
reportJudgment(cardAId, cardBId, keptCardId)
  → Fire-and-forget RPC call (3 params, no emoji/streak)
  → On failure: logged to console (no retry queue yet)
  → Server INSERT into matchups with judged_at=now()
  → Does NOT block the next yeet in any way
```

### Fuel return (stale pool cleanup)
```
App opens with leftover pool from previous session
  → returnUnusedCards(staleCardIds) — fire-and-forget
  → Server: pending_views += 1 for each card
  → Client clears pool + poolExcludeIds, fetches fresh
```

### Card creation flow
```
User takes photo (tap-to-shoot) or picks from camera roll
  → Upload JPEG to card_videos bucket (legacy name)
  → store.createCard(imageUrl, caption)
    → RPC create_card(imageUrl, caption)
      → Insert post with pending_views = 7, caption stored if provided
      → No immediate matchup generation
    → Card enters the pool, gets picked when ANY user calls fetch_card_pool
```

### No-rematch model
- **Cross-session:** Client accumulates seen IDs in `poolExcludeIds` (persisted in AsyncStorage). Passed to `fetch_card_pool` as `p_exclude_ids`. **The server does not check the `matchups` table.**
- **In-session:** Same mechanism — `poolExcludeIds` grows with each fetch.
- **Stale pool cleanup:** On cold start, `returnUnusedCards(staleIds)` refunds fuel for leftover pool cards, then the pool + excludes clear and a fresh batch is fetched.
- **Rematch edge case:** Since `poolExcludeIds` clears on cold start, cross-session rematches are possible. Accepted as rare; relying on fuel depletion as the absolute guard.

---

## Emoji System

Removed in P1. The client no longer sends emoji reactions, and `matchups.emoji` was dropped. `posts.emoji_tallies` column is retained but stale (no writes). Candidate for removal in a future migration.

---

## Invariants

These must always hold. If code violates any of these, it's a bug.

1. **A card with `pending_views = 0` is never dealt to a user.** `fetch_card_pool` only picks cards with `pending_views > 0`.
2. **A user never judges their own card.** `fetch_card_pool` excludes `sender_id = current_user`. (v2.2.1: `report_judgment` no longer validates this server-side — it trusts the pool filter.)
3. **`pending_views` never goes below 0.** All decrements use `GREATEST(pending_views - 1, 0)`.
4. **The judgment RPC never blocks gameplay.** `report_judgment` is fire-and-forget. The client proceeds regardless of its result.
5. **Same-creator avoidance is best-effort client-side.** `popChallenger` tries to avoid pairing cards by the same creator, but falls back to any available card if the pool is small.
6. **Winner ranking is derived from matchups, not `posts.total_wins`.** Active leaderboards count `matchups.kept_card_id` rows scoped by date. `posts.total_wins` is a stale legacy counter.

---

## Row Level Security (RLS)

All tables have RLS enabled. All RPC functions are `SECURITY DEFINER` and bypass RLS entirely — these policies only gate **direct PostgREST access** (i.e. `supabase.from('table')` calls from the client).

### Policies

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `users` | All authenticated | Own row (`auth_id = auth.uid()`) | Own row, **`is_admin` immutable** (WITH CHECK blocks changes) | — |
| `posts` | All authenticated | — (via RPC) | — (via RPC) | — |
| `matchups` | Own only (`viewer_id` = current user) | — (via RPC) | — (via RPC) | — |
| `config` | All authenticated | — | — | — |

### Why these policies exist

The client makes direct table calls in only a few places:
- **`users`** — SELECT to load current user by `auth_id`, check username availability; INSERT during onboarding; UPDATE for language change
- **`posts`** — SELECT for leaderboard "Mine" tab (`sender_id = currentUser.id`)

Everything else (card creation, judging, leaderboard, heartbeat) goes through `SECURITY DEFINER` RPCs and is unaffected by RLS.

**DDL gotcha:** Supabase SQL editor's "run with RLS" prompt mangles plpgsql dollar-quoted function bodies, making them parse as raw SQL. For `CREATE FUNCTION` DDL, always say NO to the RLS prompt — or use `LANGUAGE sql` when the function has no control flow.

---

## What's NOT in the server

- **Feed / discovery / algorithm** — There is none. Content spreads only through the duel mechanic.
- **Social graph** — No follows, friends, DMs, or mentions. See VISION.md and CLAUDE.md — this is a hard product principle, not a missing feature.
- **Daily objectives / themes** — Removed in v2.2. Users submit whatever they want; the leaderboard ranks all cards created today by win count.
- **Emoji reactions** — Removed in P1. `matchups.emoji` dropped, client no longer sends.
- **Comments / reposts** — Removed in P1. Tables dropped.
- **Push notifications** — Not implemented yet. Daily winner notifications need Supabase Edge Functions + pg_cron + Expo Push API. Tokens already stored in `users.push_token`.
- **Image resizing** — Images uploaded as-is from the device camera (JPEG). No server-side resizing yet.
- **Moderation** — None yet.
- **Automated winner computation** — No current automation. Future: pg_cron at 00:00 UTC to freeze the day's leaderboard.
