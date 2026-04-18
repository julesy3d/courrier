# Yeet — Roadmap & SOTA

> State of the art as of 2026-04-18.
> Audit by Opus 4.7 against branch `feature/daily-objectives` (v2.2.0 WIP).
> Built for a one-person operation — sequenced so each tier ships standalone.

---

## TL;DR — 3-week plan

| Week | Theme | Outcome |
|------|-------|---------|
| **W1** (Apr 20–26) | Verify + dead code purge | Green build, 0 dormant tables/RPCs, docs match reality |
| **W2** (Apr 27–May 3) | Onboarding + account polish | New users land gracefully, accounts feel finished, App Store-compliant |
| **W3** (May 4–10) | Leaderboard polish + push notifs | "Today" feels alive, users come back the next day |

Ship a TestFlight build at the end of each week.

---

## P0 — Verify now (possible live bugs, 1–2 h)

These are suspicious enough to check before anything else. All are quick DB checks or RPC reads in Supabase SQL editor.

| # | Item | Why it's suspicious | How to verify |
|---|------|---------------------|---------------|
| 0.1 | `get_daily_leaderboard` may filter by `objective_id NOT NULL` | Doc says it ranks cards "for this objective." No client sends `objective_id` on `create_card` anymore (see [store.ts:336](src/lib/store.ts:336)). If the function joins on objectives, **today's tab returns 0 rows.** | Open the RPC in Supabase SQL editor. If it references `daily_objectives` or `objective_id`, rewrite to rank by all matchups judged today, no objective filter. |
| 0.2 | `fetch_card_pool` cross-session no-rematch exclusion | Doc says server excludes seen cards via `matchups` table. After a few weeks, a heavy judge would exhaust the pool entirely. | Check RPC body. Cap the lookback window (e.g. last 7 days) or drop the exclusion entirely — with `pending_views` fuel already limiting supply, rematches of different pairs are acceptable. |
| 0.3 | Anonymous auth persistence | `supabase.auth.signInAnonymously()` in [onboarding.tsx:78](src/app/onboarding.tsx:78). If the user clears app data or reinstalls, account is **unrecoverable** — the row remains orphaned in `users` with no way to log back in. | Confirm behavior; this is not a bug so much as a ticking UX bomb. See P3.1. |
| 0.4 | `achievements` jsonb column | Declared in schema, rendered by [profile.tsx:38](src/app/(main)/profile.tsx:38), but no RPC writes to it anywhere. Profile will always show "No achievements yet." | Decide: ship the awarding logic (P5) or hide the section entirely. |

---

## P1 — Dead code purge (Week 1, ~1 day)

The v2.0 → v2.2 migration left a graveyard. Clean it in one atomic commit per side.

### 1.1 Server-side (Supabase SQL)

Drop in this order to avoid FK pain:

```sql
-- Legacy matchmaking RPCs (replaced by fetch_card_pool + report_judgment in v1.2.0)
DROP FUNCTION IF EXISTS generate_matchups_for_user(uuid, integer);
DROP FUNCTION IF EXISTS sync_matchups(timestamptz);
DROP FUNCTION IF EXISTS judge_matchup(uuid, uuid, text, integer);
DROP FUNCTION IF EXISTS backfill_new_user_v2(uuid);  -- verify grep: no client calls

-- Daily objectives (feature removed in v2.2)
ALTER TABLE posts DROP COLUMN IF EXISTS objective_id;
DROP FUNCTION IF EXISTS get_daily_objective(date);
DROP FUNCTION IF EXISTS set_daily_objective(date, text, text);
DROP TABLE IF EXISTS daily_objectives CASCADE;

-- daily_tops: nothing reads it (per SERVER_ARCHITECTURE.md line 427)
DROP FUNCTION IF EXISTS compute_daily_tops();
DROP TABLE IF EXISTS daily_tops;
SELECT cron.unschedule('compute-daily-tops');  -- if scheduled

-- Stale config rows
DELETE FROM config WHERE key IN (
  'active_threshold_days', 'matchup_fan_out', 'min_active_cards_for_matchup', 'backfill_count'
);

-- Matchups.emoji — always null in yeet flow
ALTER TABLE matchups DROP COLUMN IF EXISTS emoji;

-- expire_stale_matchups: keep only if old v1.1.0 unjudged rows exist, else drop
-- Check: SELECT count(*) FROM matchups WHERE judged_at IS NULL AND created_at < now() - interval '1 day';
-- If 0: drop the function and its pg_cron schedule
```

**Why:** `fetch_card_pool` has to JOIN / exclude subset of `matchups` on every call — every unused table/column is a small perf and mental tax.

**Also:** Create a `supabase/migrations/` folder in the repo and check these in. Right now the DB schema lives **only** on the hosted Supabase project — if someone (or a bad migration) nukes it, you have no source of truth. This is the single biggest infra risk and takes 20 minutes to fix with `supabase db pull`.

### 1.2 Client-side

| Delete | Why |
|--------|-----|
| [src/components/PostLogSheet.tsx](src/components/PostLogSheet.tsx) | Only consumed by outbox, which is itself deprecated per CLAUDE.md |
| `fetchPostLog`, `fetchComments`, `addComment`, `LogEntry`, `Comment` types in [store.ts](src/lib/store.ts) | Only used by PostLogSheet |
| `reposts` table writes in `report_judgment` (server-side) + the table itself | Only read by `fetchPostLog` |
| `comments` table + RLS policies | No feature consumes this anymore |
| [src/app/(main)/outbox.tsx](src/app/(main)/outbox.tsx) + `cachedOutbox` in store | Replaced by "Mine" tab in leaderboard. Redirect profile → leaderboard?tab=mine instead. |
| `assets/images/icon.old.png`, `assets/yeet_logo.icon` (old v1), `tests logos/` folder | Untracked junk (see `git status`) |

### 1.3 Stale docs

Fix or delete in [CLIENT_ARCHITECTURE.md](CLIENT_ARCHITECTURE.md):
- Remove `admin.tsx` references (file doesn't exist)
- Remove `fetchDailyObjective` / `setDailyObjective` from Store Actions table (not in store.ts)
- Remove the "Leaderboard (6am-9pm) / winner (9pm-6am)" line in routing (no time gating)
- Update #326: `profile.tsx` no longer links to outbox

**Estimated effort:** 4–6 hours, mostly verification. Commit as one PR titled "Purge v2.2 dead code."

---

## P2 — Onboarding polish (Week 2, ~2 days)

Current flow ([onboarding.tsx](src/app/onboarding.tsx)):
1. Pick @username
2. Allow camera (skippable)
3. Dropped into main screen with no context

Gaps, in order of impact:

### 2.1 First-duel tutorial (half day)

A brand-new user sees two photos stacked vertically with a 2px seam and no instructions. The swipe-at-seam gesture is **not discoverable**. Add a one-shot overlay on the first matchup:
- Ghosted finger icon animating up/down at the seam
- Caption: "swipe at the line to yeet one away"
- Dismisses on first successful yeet
- Store `hasSeenTutorial: true` in AsyncStorage

This alone probably doubles D1 retention.

### 2.2 Skip-camera-permission trap (1 h)

User who taps "skip for now" at [onboarding.tsx:199](src/app/onboarding.tsx:199) ends up on the main screen with a FAB that does nothing useful — `PhotoCapture` will prompt again but the flow feels broken. Two options:
- **A:** Remove skip. Camera is required.
- **B:** Keep skip, but on FAB tap re-prompt explicitly with messaging ("Yeet needs the camera to submit photos") and deep-link to Settings if permanently denied.

B is better. Takes 1 h.

### 2.3 Username changes (half day)

Currently username is permanent. Add: tap @username on profile → modal → same validation flow as onboarding, same RPC pattern. This + account recovery (P3) are the biggest "feels unfinished" signals.

### 2.4 Welcome card / empty state for day-one users (half day)

If the pool is empty on first launch (likely in early beta), show a real empty state with:
- "No duels today yet. Post the first one?"
- Big CTA to open camera
- Today's date in the corner

Currently the FAB is always visible but there's no nudge toward posting as the primary action when the app is empty.

---

## P3 — Account system polish (Week 2, ~2 days)

### 3.1 Real auth (App Store blocker, 1 day)

**This is the most important item on the whole doc.** Anonymous-only sign-in means every reinstall = new account. No account recovery. The user's wins and achievements are tied to an `auth_id` that can't be restored. At beta scale this is annoying; at launch it's fatal.

Simplest path: **Sign in with Apple** (Apple requires it anyway when you use any other third-party sign-in, and for iOS-only this is the lightest lift). Supabase has first-party support via `supabase.auth.signInWithIdToken({ provider: 'apple', ... })`. Keep anonymous as a fallback for demo/dev.

Flow:
- Onboarding step 0 (new): "Sign in with Apple" button + "Continue as guest" link
- Guest users get a banner on their profile: "Link your account to save your progress"
- Tapping → triggers `supabase.auth.linkIdentity({ provider: 'apple' })` (Supabase merges the anonymous session into the Apple identity)

### 3.2 Delete account (App Store guideline 5.1.1(v), half day)

If you have account creation you need account deletion. Settings → "Delete my account" → confirm → RPC:

```sql
CREATE FUNCTION delete_my_account() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE posts SET pending_views = 0 WHERE sender_id = (SELECT id FROM users WHERE auth_id = auth.uid());
  DELETE FROM users WHERE auth_id = auth.uid();
  -- auth.users row deleted via cascade / auth hook
END; $$;
```

(Keep posts for leaderboard integrity — just zero their fuel and anonymize `creator_username` to `[deleted]` in `fetch_card_pool` output.)

### 3.3 Real profile (1 day)

Current [profile.tsx](src/app/(main)/profile.tsx) is a sparse shell. Make it:
- Avatar placeholder (can be just a generated blob from the username hash for v1)
- Lifetime stats: duels judged, wins earned, cards posted, "best rank" (today's rank if ≠ null)
- Language toggle moved out (it's also in settings — pick one, settings is the better home)
- "Link account" banner for guest users
- Settings button in header → existing settings screen
- Sign out button

Achievements section: either hide it until P5 or ship a stub "First yeet" badge awarded client-side via AsyncStorage on first judgment.

---

## P4 — Leaderboard polish (Week 3a, ~2 days)

Current state ([leaderboard.tsx](src/app/(main)/leaderboard.tsx)) is a solid foundation. Make it feel like the destination of the app.

### 4.1 Today tab: lead with the narrative (half day)

Replace the generic header with:
- Live: "Today — [X] duels, [Y] submissions" (counter at top, updates on pull-to-refresh)
- Hero cell gets a "LEADER" pill + pulse animation on the border
- If current user has a card ranked, sticky-pin a "you: #N" chip to the top bar (tappable → scroll to their card)

### 4.2 Countdown to midnight UTC (half day)

Visual timer on the Today tab showing "3h 12m until reset." When < 1h: the timer glows red. Creates end-of-day urgency, which is the single best retention signal a contest app can have.

### 4.3 Lightbox preview (half day)

Current preview modal ([leaderboard.tsx:37](src/app/(main)/leaderboard.tsx:37)) uses `contentFit: cover` at 3:4 ratio → crops images badly. Swap to `contentFit: contain`, add pinch-to-zoom + swipe-to-dismiss via `react-native-gesture-handler`. Show the caption below the image.

### 4.4 Share card (half day)

Tap a cell → bottom sheet with "Share image." Uses `Sharing.shareAsync()` from `expo-sharing` (already a transitive dep via other expo modules, or add it). Renders a branded composite: the image + rank + "#1 on Yeet today, Apr 18" caption.

Biggest growth lever you have. Winners will share their trophy if you make it trivial.

### 4.5 Visual polish (quarter day)

- Replace ❤️ emoji with Ionicons `trophy` / `flame` (consistent with rest of app)
- Use `Menlo` for the win counts per theme rules
- Bigger gap between hero and the two-up row — the hero doesn't breathe right now
- Empty state for "Today" before any duels: show a photo of the sky / skeleton, "Be the first to post today" button

### 4.6 Past winners tab (cut or defer)

Tempting but adds a lot of surface area. Park it for v2.3+.

---

## P5 — Push notifications + automation (Week 3b, ~2 days)

Tokens are already stored in `users.push_token`. You need the delivery pipe.

### 5.1 Supabase Edge Function + pg_cron (1.5 days)

Two scheduled notifications:
- **08:00 local (Europe/Paris):** "Today's arena is open — post your shot"
  Blocked on: determining per-user timezone. Cheapest path: store user's timezone on first open (from device), fire cron hourly that picks users where local time == 8am.
- **21:00 Europe/Paris:** "Today's winner: @username. Can you beat them tomorrow?"
  Also triggers `compute_daily_winner` automation.

Edge Function `dispatch-notifications` reads eligible users, fans out to Expo Push API. Schedule via `pg_cron`:

```sql
SELECT cron.schedule('push-morning', '0 * * * *', $$SELECT net.http_post('.../dispatch-notifications', '{"type":"morning"}')$$);
SELECT cron.schedule('push-evening', '0 19 * * *', $$SELECT net.http_post('.../dispatch-notifications', '{"type":"evening"}')$$);
SELECT cron.schedule('compute-winner', '5 0 * * *', $$SELECT compute_daily_winner(CURRENT_DATE - 1)$$);
```

(Note: `compute_daily_winner` was scoped to objectives — refactor it during P0.1 to work without them, so yesterday's winner is just "most-wins card with created_at = yesterday UTC.")

### 5.2 Judgment retry queue (half day)

Today, a failed `report_judgment` silently drops the judgment (see [store.ts:279](src/lib/store.ts:279)). For beta scale it's fine, but if a user judges 50 cards on a subway, you lose them all.

Simplest fix: on failure, push to an AsyncStorage queue. On next app foreground, drain it (same fire-and-forget RPC). Takes 3–4 h.

---

## v2.3+ (Later, not scheduled)

Drop these in `VISION.md` or a separate `BACKLOG.md` — they're real but don't ship in the next 3 weeks.

- **Image resizing** on upload (2k-wide JPEG, ~100kb). Supabase bandwidth bill will bite at scale. Edge Function + `sharp` or client-side via `expo-image-manipulator`.
- **Moderation** — minimum viable: report button → `reports` table → admin dashboard. Apple requires a user-facing block/report flow for UGC apps.
- **Rename `video_url` → `image_url`** everywhere. Migration is mechanical but touches DB + server + client + storage bucket name (`card_videos` → `card_images`). Do it in one big PR when the schema is already moving.
- **Hall of fame / past winners screen.**
- **Real achievement awarding logic.** Edge Function or pg_cron pass that reads matchups + posts and grants badges.
- **Web viewer for shared cards** (for the share button from P4.4 to link somewhere).
- **Analytics.** Even PostHog free tier or Supabase's own event table. You need to see D1/D7 retention curves before you know what to tune.

---

## Risk register

1. **No schema source control** → P1 (create `supabase/migrations/`).
2. **Anonymous accounts only** → P3.1.
3. **No moderation path before public launch** → required for App Store.
4. **Storage cost on full-res JPEGs** → v2.3 item, but monitor.
5. **Single-point-of-failure backend** (Supabase hosted) — acceptable for beta, revisit at ~10k MAU.

---

## Cutlist — things to say NO to

- Follower graphs, DMs, comments on posts. VISION.md is explicit.
- Algorithmic feed of any kind. Core differentiator.
- Multiple daily themes / tournaments / rooms. The "one contest per day" stake is the whole game.
- Android port. Stay focused on iOS TestFlight until v2.5+.
