# Yeet — Server Architecture

> **Source of truth.** If something contradicts this document, this document wins.
> Last updated: 2026-03-27

---

## Overview

Yeet is a head-to-head video duel app. The entire backend runs on **Supabase** (Postgres + Auth + Storage). All mutations go through **RPC functions** (plpgsql, `SECURITY DEFINER`). The client never writes directly to tables except `comments`.

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
| `achievements` | jsonb | `'[]'` | NO | |
| `created_at` | timestamptz | `now()` | YES | |
| `last_active_at` | timestamptz | | YES | Updated by `heartbeat()` |

### `posts` (= videos/cards)
| Column | Type | Default | Nullable | Notes |
|--------|------|---------|----------|-------|
| `id` | uuid | `gen_random_uuid()` | NO | PK |
| `sender_id` | uuid | | NO | FK to `users.id` |
| `video_url` | text | | YES | Public URL in `card_videos` bucket |
| `pending_views` | integer | `0` | NO | Fuel. How many times this card can still appear in new matchups |
| `total_wins` | integer | `0` | NO | Lifetime win count (w). Never decreases |
| `emoji_tallies` | jsonb | `'{}'` | NO | `{"heart_fire": N, "thinking": N, ...}` |
| `created_at` | timestamptz | `now()` | YES | |

**Indexes:**
- `idx_posts_pending_views` on `(pending_views) WHERE pending_views > 0` — fast card selection

**There is no `active_branches` column.** It was removed and replaced by `pending_views`.

### `matchups`
| Column | Type | Default | Nullable | Notes |
|--------|------|---------|----------|-------|
| `id` | uuid | `gen_random_uuid()` | NO | PK |
| `card_a_id` | uuid | | NO | FK to `posts.id`. In ladder matchups, this is always the **defender** (surviving card) |
| `card_b_id` | uuid | | NO | FK to `posts.id`. In ladder matchups, this is always the **challenger** |
| `viewer_id` | uuid | | NO | FK to `users.id`. Who judges this matchup |
| `kept_card_id` | uuid | | YES | Set when judged |
| `killed_card_id` | uuid | | YES | Set when judged |
| `emoji` | text | | YES | Optional reaction. Currently always `null` in yeet flow |
| `created_at` | timestamptz | `now()` | NO | |
| `judged_at` | timestamptz | | YES | `null` = pending, set = judged |

**Indexes:**
- `idx_matchups_viewer_pair` on `(viewer_id, card_a_id, card_b_id)` — fast no-rematch lookup

**Convention (v1.2.0):** `card_a` and `card_b` are the two cards the user saw. `kept_card_id` records which one won. Order matches what the client sends to `report_judgment`.

### `comments`
| Column | Type | Default | Nullable | Notes |
|--------|------|---------|----------|-------|
| `id` | uuid | `gen_random_uuid()` | NO | PK |
| `post_id` | uuid | | NO | FK to `posts.id` |
| `author_id` | uuid | | NO | FK to `users.id` |
| `body` | text | | NO | |
| `created_at` | timestamptz | `now()` | YES | |

### `reposts` (journey log)
| Column | Type | Default | Nullable | Notes |
|--------|------|---------|----------|-------|
| `id` | uuid | `gen_random_uuid()` | NO | PK |
| `post_id` | uuid | | NO | FK to `posts.id` |
| `user_id` | uuid | | NO | FK to `users.id` |
| `emoji` | text | | YES | |
| `created_at` | timestamptz | `now()` | YES | |

### `daily_tops`
| Column | Type | Default | Nullable | Notes |
|--------|------|---------|----------|-------|
| `id` | uuid | `gen_random_uuid()` | NO | PK |
| `post_id` | uuid | | NO | |
| `emoji` | text | | NO | |
| `day` | date | | NO | |
| `stamp_count` | integer | | NO | |

Unique on `(emoji, day)`.

### `config` (key-value tuning)
| Key | Value | Used by |
|-----|-------|---------|
| `active_threshold_days` | `7` | **UNUSED** — legacy from `generate_matchups` fan-out |
| `backfill_count` | `5` | `backfill_new_user_v2` (legacy, may be unused with card pool) |
| `matchup_fan_out` | `3` | **UNUSED** — legacy from push-based distribution |
| `min_active_cards_for_matchup` | `2` | **UNUSED** — legacy |

---

## Storage

**Bucket:** `card_videos` (public read, authenticated write)

URL pattern: `https://kevfztwwnioouohjmaoy.supabase.co/storage/v1/object/public/card_videos/{user_id}/{timestamp}.mp4`

Test videos: `card_videos/test/{user_id}/card_XX.mp4`

---

## Fuel System (`pending_views`)

The core distribution mechanic. Every card has a `pending_views` counter — its "fuel."

### How fuel enters the system
- **New video created:** `pending_views = 7` (guaranteed minimum exposure)
- **Win at streak position k:** `pending_views += ceil((k + 1) / 2)`

| Streak position | Fuel earned | Cumulative after K wins |
|-----------------|-------------|------------------------|
| 1st | +1 | 1 |
| 2nd | +2 | 3 |
| 3rd | +2 | 5 |
| 4th | +3 | 8 |
| 5th | +3 | 11 |
| 10th | +6 | 33 |

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

### `create_card(p_video_url text) → uuid`
Creates a new post for the authenticated user.
- Sets `pending_views = 7`
- Returns the new post UUID
- Does NOT generate any matchups (old `generate_matchups` call removed)

### `fetch_card_pool(p_count integer DEFAULT 10, p_exclude_ids uuid[] DEFAULT '{}') → jsonb` *(v1.2.0)*
**Card pool vending machine.** Returns individual cards for the client to assemble into matchups locally.

1. Look up authenticated user
2. Find `p_count` random cards where:
   - `pending_views > 0` (has fuel)
   - `sender_id != current user` (no self-judging)
   - `video_url IS NOT NULL`
   - `id NOT IN p_exclude_ids` (client passes IDs it already has)
   - Card not already seen by this user in any prior matchup (checks `matchups` table)
3. Decrement `pending_views` by 1 for each returned card (fuel cost)
4. Uses `FOR UPDATE ... SKIP LOCKED` to avoid race conditions on concurrent fetches

Returns JSON array of card objects:
```json
[{
  "id": "uuid",
  "video_url": "https://...",
  "sender_id": "uuid",
  "creator_username": "display_name",
  "emoji_tallies": {},
  "total_wins": 0,
  "comment_count": 0
}]
```

Returns `'[]'::jsonb` when no eligible cards exist.

**Why this replaced `sync_matchups` + `generate_matchups_for_user`:** The old system generated matchup *pairs* server-side. The client consumed them one at a time, requiring two sequential RPCs per swipe (judge → sync) before the next card could appear. With `fetch_card_pool`, the client gets a batch of individual cards upfront, sequences matchups locally (winner stays, next challenger from pool), and never waits for the server during gameplay. Judgment is reported asynchronously via `report_judgment`.

### `report_judgment(p_card_a_id uuid, p_card_b_id uuid, p_kept_card_id uuid, p_emoji text DEFAULT NULL, p_streak integer DEFAULT 1) → jsonb` *(v1.2.0)*
**Async judgment recorder.** Called fire-and-forget by the client after each yeet.

**Validations:**
1. User exists (via `auth.uid()`)
2. Emoji is valid or null
3. Kept card is one of the two submitted cards
4. Neither card belongs to this user (prevents self-voting)
5. Streak is capped server-side to `LEAST(GREATEST(p_streak, 1), 20)` to prevent abuse

**Actions:**
1. Insert a matchup row recording the result (`judged_at = now()`) — purely for history/analytics
2. Winner: `total_wins += 1`
3. Winner: `pending_views += ceil((capped_streak + 1) / 2.0)` (fuel bonus)
4. If emoji provided: increment `emoji_tallies[emoji]`
5. Insert `reposts` row (journey log)

**Returns:**
```json
{
  "kept": "uuid",
  "killed": "uuid",
  "streak_bonus": 1,
  "kept_total_wins": 5,
  "kept_pending_views": 12
}
```

**Why this replaced `judge_matchup`:** The old `judge_matchup` validated against a server-created matchup row, then created a ladder matchup for the next round. Both operations put the server on the critical path. `report_judgment` is purely a bookkeeping endpoint — the client doesn't wait for its response. Matchup rows are created only when a result is reported (not upfront), so there are no orphaned unjudged rows.

### `return_unused_cards(p_card_ids uuid[]) → void` *(v1.2.0)*
**Fuel refund for unplayed cards.** Called fire-and-forget when the client discards stale pool cards (e.g., on app open with a leftover pool from a previous session).

Increments `pending_views` by 1 for each card ID. This reverses the fuel cost from `fetch_card_pool` for cards that were dealt but never shown to the user.

### Legacy RPCs (still deployed, not called by client v1.2.0+)

These functions are still in the database for rollback safety. The client no longer calls them.

- **`generate_matchups_for_user(p_user_id, p_count)`** — was the pull-based pair generator. Replaced by `fetch_card_pool`.
- **`sync_matchups(p_after)`** — was the main sync endpoint returning pre-paired matchups. Replaced by `fetch_card_pool`.
- **`judge_matchup(p_matchup_id, p_kept_card_id, p_emoji, p_streak)`** — was the synchronous judgment endpoint that also created ladder matchups. Replaced by `report_judgment`.

### `backfill_new_user_v2(p_user_id uuid) → integer`
Seeds a new user with matchups from high-scoring cards. Reads `backfill_count` from `config` table (currently 5). Both cards in each matchup spend 1 `pending_views`.

### `expire_stale_matchups() → integer`
**Cron job.** Finds unjudged matchups older than 24 hours, refunds both cards 1 `pending_views` each, deletes the matchup row. Uses `FOR UPDATE SKIP LOCKED` for safety.

Scheduled daily at 3am UTC via `pg_cron`:
```sql
SELECT cron.schedule('expire-stale-matchups', '0 3 * * *', $$SELECT expire_stale_matchups()$$);
```

### `get_leaderboard(p_limit integer DEFAULT 20) → jsonb`
Returns top cards ranked by `total_wins`. Used by the leaderboard screen.

Returns: `[{ id, video_url, total_wins, pending_views, creator_username, rank }]`

### `heartbeat() → void`
Updates `users.last_active_at` to `now()`.

### `compute_daily_tops() → void`
Cron (00:05 UTC). Finds top card per emoji for yesterday. Writes to `daily_tops`.

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
  → Client tracks streak locally (ref counter)
  → Pop next challenger from cardPool (instant, local)
  → Fire yeet animation (500ms)
  → Fire reportJudgment() in background (NEVER awaited)
    → RPC report_judgment(cardA, cardB, kept, emoji, streak)
      → Server: record result, score, fuel
  → Wait for BOTH: animation minimum (200ms) AND video prefetch
  → Swap dead slot with challenger from pool
  → Winner stays in place, untouched
  → If pool < 5 cards remaining: fetchCardPool(10) in background
```

### Judgment reporting
```
reportJudgment(cardAId, cardBId, keptCardId, emoji, streak)
  → Fire-and-forget RPC call
  → On failure: logged to console (no retry queue yet)
  → Server records matchup result (single INSERT with judged_at set)
  → Does NOT block the next yeet in any way
```

### Fuel return (stale pool cleanup)
```
App opens with leftover pool from previous session
  → returnUnusedCards(staleCardIds) — fire-and-forget
  → Server: pending_views += 1 for each card
  → Client clears pool + poolExcludeIds, fetches fresh
```

### Streak tracking
- Client-side only (refs in MatchupView)
- Incremented when the same card wins consecutively
- Reset to 1 when: card loses, pool runs out, app backgrounds
- Passed to `report_judgment` as `p_streak` parameter
- Server caps the value to `LEAST(GREATEST(p_streak, 1), 20)` — gaming it only inflates distribution (pending_views), not score (total_wins). Low stakes.

### Card creation flow
```
User records video (5s, hold-to-record)
  → Upload MP4 to card_videos bucket
  → store.createCard(videoUrl)
    → RPC create_card(videoUrl)
      → Insert post with pending_views = 7
      → No immediate matchup generation
    → Video enters the pool, gets picked when ANY user calls fetch_card_pool
```

### No-rematch model (v1.2.0)
- **Cross-session:** `fetch_card_pool` excludes cards that appeared in any prior matchup for this user (checks `matchups` table). Since `report_judgment` now creates matchup rows, seen cards accumulate naturally.
- **In-session:** Client passes `p_exclude_ids` (all card IDs already in the local pool) to avoid fetching the same card twice in one session.
- **Same-pair:** Client avoids pairing the same two cards within a session (tracked locally). Cross-session same-pair repeats are possible but rare and acceptable — the user would need to see the same two cards from different fetch batches.

---

## Emoji System

Four emoji reactions available. Currently **not used in the yeet flow** (emoji is always `null`). May be re-introduced in profile/history views.

| Display | DB key | `emoji_tallies` field |
|---------|--------|----------------------|
| :heart_fire: | `heart_fire` | `emoji_tallies.heart_fire` |
| :thinking: | `thinking` | `emoji_tallies.thinking` |
| :laughing: | `laughing` | `emoji_tallies.laughing` |
| :mindblown: | `mindblown` | `emoji_tallies.mindblown` |

Validation: `report_judgment` rejects any emoji not in this list.

---

## Invariants

These must always hold. If code violates any of these, it's a bug.

1. **A card with `pending_views = 0` is never dealt to a user.** `fetch_card_pool` only picks cards with `pending_views > 0`.
2. **A user never judges their own card.** `fetch_card_pool` excludes `sender_id = current_user`. `report_judgment` also validates this server-side.
3. **`total_wins` only increments by 1 per judgment.** The streak bonus only affects `pending_views`, not score.
4. **`pending_views` never goes below 0.** All decrements use `GREATEST(pending_views - 1, 0)`.
5. **Streak is capped server-side.** `report_judgment` caps `p_streak` to range `[1, 20]` to prevent abuse.
6. **The judgment RPC never blocks gameplay.** `report_judgment` is fire-and-forget. The client proceeds regardless of its result.
7. **Same-creator avoidance is best-effort client-side.** `popChallenger` tries to avoid pairing cards by the same creator, but falls back to any available card if the pool is small.

---

## Row Level Security (RLS)

All tables have RLS enabled. All RPC functions are `SECURITY DEFINER` and bypass RLS entirely — these policies only gate **direct PostgREST access** (i.e. `supabase.from('table')` calls from the client).

### Policies

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `users` | All authenticated | Own row (`auth_id = auth.uid()`) | Own row (`auth_id = auth.uid()`) | — |
| `posts` | All authenticated | — (via RPC) | — (via RPC) | — |
| `matchups` | Own only (`viewer_id` = current user) | — (via RPC) | — (via RPC) | — |
| `comments` | All authenticated | Own (`author_id` = current user) | — | — |
| `reposts` | All authenticated | — (via RPC) | — | — |
| `daily_tops` | All authenticated | — (via RPC) | — | — |
| `config` | All authenticated | — | — | — |

### Why these policies exist

The client makes direct table calls in a few places:
- **`users`** — SELECT to load current user by `auth_id`, check username availability; INSERT during onboarding; UPDATE for language change
- **`posts`** — SELECT to fetch own outbox (`sender_id = currentUser.id`)
- **`matchups`** — SELECT for history (v1.2.0 no longer queries this from the client during gameplay)
- **`comments`** — SELECT for post log; INSERT for adding comments
- **`reposts`** — SELECT with join to `users` for post log

Everything else (creating cards, judging matchups, generating matchups, backfill, leaderboard, heartbeat) goes through `SECURITY DEFINER` RPCs and is unaffected by RLS.

---

## What's NOT in the server

- **Feed / discovery / algorithm** — There is none. Content spreads only through the duel mechanic.
- **Push notifications for matchups** — Not implemented. Users see matchups when they open the app.
- **Video transcoding** — Videos are uploaded as-is from the device camera (H.264, varying resolution).
- **Moderation** — None yet.
- **Daily contest winner announcement** — `compute_daily_tops` writes to `daily_tops` but nothing reads it yet.
