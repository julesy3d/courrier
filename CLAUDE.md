# Yeet — Claude Instructions

## What this is

Yeet is a head-to-head image duel app. Two photos, swipe to yeet one off screen, survivor faces a new challenger. iOS only, Expo SDK 55, TestFlight beta.

## Read these first

- `CLIENT_ARCHITECTURE.md` — frontend architecture, slot architecture, theme tokens
- `SERVER_ARCHITECTURE.md` — DB schema, RPC functions, fuel system, matchup generation

These are the source of truth. If code contradicts the docs, the docs win. If you change behavior, update the docs.

## Key constraints

- **Key goes on `Reanimated.View`, not on `CardFace`.** Fresh native layer on card change.
- **Keep CardFace minimal.** Just an `expo-image` `Image` with `contentFit="cover"`.
- **No opacity fade system.** We removed it. Don't add it back.
- **Never use React state for yeet slot selection.** Use Reanimated shared values only.
- **All mutable slot data in `handleYeet` must use refs, not state.** Card IDs and sender IDs are tracked in refs. Reading React state in `handleYeet` creates stale closures.
- **`reportJudgment` is fire-and-forget.** Never await it. Never put it on the critical path.
- **All colors come from `src/theme.ts`.** No hardcoded color values in components.
- **No video/audio.** We migrated from video to images. Do not add `expo-video`, `expo-audio`, or `expo-av`.

## Current state (v2.0.0 — Photo Mode)

- Matchup pairing is fully client-side. Server is a card vending machine + scoreboard.
- `reportJudgment` is fire-and-forget. Zero RPCs on the gameplay critical path.
- Images displayed via `expo-image` with built-in disk caching (no manual cache system).
- Stale pool cards return fuel to server on cold start via `return_unused_cards`.
- Ghost overlay system: dead card flies away on top while new card mounts underneath.
- Photo capture: tap-to-shoot, front camera default with flip toggle.
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
