# Yeet — Claude Instructions

## What this is

Yeet is a head-to-head video duel app. Two 5-second looping videos, swipe to yeet one off screen, survivor faces a new challenger. iOS only, Expo SDK 55, TestFlight beta.

## Read these first

- `CLIENT_ARCHITECTURE.md` — frontend architecture, video playback rules (7 hard-won rules), cache system, slot architecture, theme tokens
- `SERVER_ARCHITECTURE.md` — DB schema, RPC functions, fuel system, matchup generation

These are the source of truth. If code contradicts the docs, the docs win. If you change behavior, update the docs.

## Key constraints

- **Do not use `expo-av`.** We use `expo-video` + `expo-audio` exclusively.
- **Do not use `replaceAsync`** on video players. Causes `NativeSharedObjectNotFoundException`.
- **Do not swap URLs on a live `useVideoPlayer`.** Use React `key` to unmount/remount.
- **Key goes on `Reanimated.View`, not on `CardFace`.** Fresh native layer prevents black screens.
- **Keep CardFace minimal.** No useEffect for play/pause toggling, no complex state. Player is created once in the setup callback.
- **`audioMixingMode: 'mixWithOthers'`** on every VideoPlayer. Without it, iOS pauses sibling players.
- **No opacity fade system.** We removed it. Don't add it back.
- **Never use React state for yeet slot selection.** Use Reanimated shared values only. React state re-renders cause AVPlayerLayer freezes.
- **All mutable slot data in `handleYeet` must use refs, not state.** Card IDs and sender IDs are tracked in refs (`topCardIdRef`, `bottomCardIdRef`, `topSenderIdRef`, `bottomSenderIdRef`). Reading React state in `handleYeet` creates stale closures.
- **`reportJudgment` is fire-and-forget.** Never await it. Never put it on the critical path.
- **All colors come from `src/theme.ts`.** No hardcoded color values in components.

## Current state (v1.2.0 — Card Pool Architecture)

- Matchup pairing is fully client-side. Server is a card vending machine + scoreboard.
- `reportJudgment` is fire-and-forget. Zero RPCs on the gameplay critical path.
- Video prefetch queue downloads 3 at a time, front-of-pool first.
- Initial 2 videos are awaited on disk before display (loading spinner until ready).
- Swap gate: `max(200ms, prefetch)` with 2s timeout fallback to remote streaming.
- Stale pool cards return fuel to server on cold start via `return_unused_cards`.
- Yeet sound is disabled (investigating audio session conflicts).
- Ghost overlay system: dead card flies away on top while new card mounts underneath. Eliminates grey dead zone.
- `playing=false` → `playing=true` events still fire on surviving cards but recover immediately.

## Stack

Expo SDK 55, Expo Router v4, expo-video, expo-audio, react-native-reanimated v3, react-native-gesture-handler v2, Zustand v4, Supabase (Postgres + Storage + Edge Functions)

## Commands

- `npx tsc --noEmit` — type check (one pre-existing error in onboarding.tsx, ignore it)
- `npx expo start` — dev server
- `npx expo prebuild --clean` — regenerate native project (prefix with `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` if CocoaPods fails)
- Archive via Xcode, not EAS

## Fonts

- `Verdana` — all UI text
- `Menlo` — numbers (wins, ranks, stats)

## Palette

- Background: `#B7B3AA` (warm grey)
- Accent: `#01E048` (bright green)
- Secondary: `#2C7B45` (forest green)
- Text: `#1A1A1A` (near-black)
