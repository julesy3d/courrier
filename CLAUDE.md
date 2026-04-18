# Yeet — Claude Instructions

## What this is

Yeet is a head-to-head image duel app. Two photos, swipe to yeet one off screen, survivor faces a new challenger. iOS only, Expo SDK 55, TestFlight beta.

## Read these first

- `VISION.md` — product thesis, what Yeet is and is not
- `ROADMAP.md` — current SOTA, prioritized features/bugs/timeframes
- `CLIENT_ARCHITECTURE.md` — frontend architecture, slot architecture, theme tokens
- `SERVER_ARCHITECTURE.md` — DB schema, RPC functions, fuel system, matchup generation

These are the source of truth. If code contradicts the docs, the docs win. If you change behavior, update the docs.

## Product principle — READ THIS BEFORE PROPOSING ANY FEATURE

**Yeet is a daily tournament with a social-media splash. It is NOT social media.**

The core thesis (see `VISION.md`) is that there is **no graph**. Every photo competes on merit against every other, with zero follower advantage. The moment you add graph mechanics, the leaderboard becomes a popularity contest and the entire differentiator collapses.

**Never propose:**
- Followers / following / friends / friend requests
- DMs or any 1:1 messaging
- @mentions, user tagging
- Threaded comments on posts
- "X followed you" / "X liked your post" notifications
- Personalized/algorithmic social feeds

**The only acceptable "social" surface** is achievement badges earned through participation (judging, submitting, ranking, streaks) — recognition by *merit*, not by *graph*. Seeing other users' photos happens via the random duel dealer and the open leaderboard. That's the full social surface.

When reaching for retention/engagement ideas, check first whether the idea requires a graph. If it does, reject it and find a graph-free alternative (countdown timers, share-to-external-app, streak achievements, leaderboard narrative).

## Key constraints

- **Key goes on `Reanimated.View`, not on `CardFace`.** Fresh native layer on card change.
- **Keep CardFace minimal.** Just an `expo-image` `Image` with `contentFit="cover"`.
- **No opacity fade system.** We removed it. Don't add it back.
- **Never use React state for yeet slot selection.** Use Reanimated shared values only.
- **All mutable slot data in `handleYeet` must use refs, not state.** Card IDs and sender IDs are tracked in refs. Reading React state in `handleYeet` creates stale closures.
- **`reportJudgment` is fire-and-forget.** Never await it. Never put it on the critical path.
- **All colors come from `src/theme.ts`.** No hardcoded color values in components.
- **No video/audio.** We migrated from video to images. Do not add `expo-video`, `expo-audio`, or `expo-av`.

## Current state (v2.2.0 — Open Submissions + Leaderboard Revamp)

- **Daily game loop:** Day runs midnight-to-midnight UTC. Users submit photos anytime. Winner = most wins earned today. No daily objectives/themes.
- `fetch_card_pool` scoped to today's cards first (by `created_at` UTC date), falls back to any card with fuel.
- FAB always visible — no time gating.
- Trophy button → leaderboard screen with 3 tabs: Today, All Time, Mine. Brick wall image layout.
- Matchup pairing is fully client-side. Server is a card vending machine + scoreboard.
- `reportJudgment` is fire-and-forget. Zero RPCs on the gameplay critical path.
- Images prefetched via `Image.prefetch()` — same proactive pipeline as old video cache. First 2 awaited before display, rest in background.
- Stale pool cards return fuel to server on cold start via `return_unused_cards`.
- Ghost overlay system: dead card flies away on top while new card mounts underneath.
- Photo capture: tap-to-shoot, front camera default with flip toggle. Camera roll via `expo-image-picker`.
- Caption text: optional 140-char text overlay (Snapchat-style black bar, bottom third). Stored in `posts.caption`, rendered client-side by `CardFace`.
- Images uploaded as JPEG to `card_videos` Supabase Storage bucket (legacy name).

## Stack

Expo SDK 55, Expo Router v4, expo-image, react-native-reanimated v3, react-native-gesture-handler v2, Zustand v4, Supabase (Postgres + Storage + Edge Functions)

## Commands

- `npx tsc --noEmit` — type check
- `npx expo start` — dev server
- `npx expo prebuild --clean` — regenerate native project (prefix with `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` if CocoaPods fails)
- Archive via Xcode, not EAS

## Fonts

- `Verdana` — all UI text
- `Menlo` — numbers (wins, ranks, stats)

## Palette

- Background: `#121212` (near-black)
- Surface: `#1A1A1A` (charcoal)
- Accent: `#E8E4DF` (off-white)
- Text: `#E8E4DF` (off-white)
