# Yeet — Client Architecture

> **Source of truth for the frontend.** If something contradicts this document, this document wins.
> Last updated: 2026-03-23

---

## Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Expo / React Native (iOS only, TestFlight) | SDK 55 |
| Routing | Expo Router (file-based) | v4 |
| Video | `expo-video` (`useVideoPlayer` + `VideoView`) | SDK 55 |
| Audio | `expo-audio` (`useAudioPlayer`) | SDK 55 |
| Animation | `react-native-reanimated` | v3 |
| Gestures | `react-native-gesture-handler` (`Gesture.Pan`) | v2 |
| Camera | `expo-camera` (`CameraView` + `recordAsync`) | SDK 55 |
| Haptics | `expo-haptics` | SDK 55 |
| State | Zustand with AsyncStorage persistence | v4 |
| Bottom sheets | `@gorhom/bottom-sheet` | v5 |
| File system | `expo-file-system` (new API: `File`, `Directory`, `Paths`) | SDK 55 |

**NOT used:** `expo-av` (replaced by `expo-video` + `expo-audio`), `@shopify/react-native-skia`, `expo-linear-gradient`.

---

## File Map

### Active Files

| File | Role |
|------|------|
| `src/app/(main)/index.tsx` | Main screen. Renders MatchupView or EmptyState. Floating buttons (account top-left, leaderboard top-right, "+" FAB bottom-center). Orchestrates sync-on-launch and AppState resume. |
| `src/components/MatchupView.tsx` | **Core component.** Yeet gesture, independent slot state, ladder transitions, seam glow, yeet animation, sound. |
| `src/components/CardFace.tsx` | Pure video renderer. `useVideoPlayer` + `VideoView`. Accepts `card`, `isPlaying`, `onReady`. |
| `src/lib/store.ts` | Zustand store. All backend communication via `supabase.rpc()`. Optimistic cache management. |
| `src/lib/videoCache.ts` | Local file cache for videos. Downloads to `Paths.cache/videos/`. Sync lookup via `getVideoUri()`. |
| `src/lib/sounds.ts` | Sound asset exports. Currently just `YEET_SOUND`. |
| `src/components/VideoCapture.tsx` | Hold-to-record (5s), crop guide, shutter button. |
| `src/components/EmptyState.tsx` | Shown when no matchups available. |
| `src/components/GlassSurface.tsx` | BlurView wrapper. Used by FAB. |
| `src/app/(main)/leaderboard.tsx` | Leaderboard screen. Top 5 with looping video previews, rest as text rows. |
| `src/app/onboarding.tsx` | @username input, uniqueness check, camera permission. |
| `src/app/(main)/profile.tsx` | Links to kept history + outbox. |
| `src/app/(main)/kept-history.tsx` | Scrolling list of kept cards. |
| `src/app/(main)/outbox.tsx` | User's created cards with stats. |
| `src/lib/supabase.ts` | Supabase client init. |
| `src/lib/imageUtils.ts` | `uploadCardVideo()` — uploads MP4 to `card_videos` bucket. |
| `src/lib/notifications.ts` | Push token registration. |
| `src/lib/i18n.ts` | Locale detection + translation helper. |
| `src/lib/dictionary.ts` | en/fr string dictionary. |

### Dead Code (safe to delete)

| File | Reason |
|------|--------|
| `src/components/PostLogSheet.tsx` | Exists but not wired to any screen (theme import fixed). |

Previously deleted: `Postcard.tsx`, `PostcardCapture.tsx`, `postcardLayout.ts`, old `theme.ts`, `random.ts`, `photoProcessor.ts`, `EmojiQuadrant.tsx`. Dead image-picker code in `imageUtils.ts` was also removed (only `uploadCardVideo` remains).

---

## Video Playback — Critical Rules

These rules exist because we spent days debugging black screens, frozen videos, and `NativeSharedObjectNotFoundException` crashes. Do not deviate.

### Rule 1: Never swap URLs on a live `useVideoPlayer`

`useVideoPlayer(source)` creates a native player tied to a native `VideoView`. Changing the source destroys the old player and creates a new one, but the `VideoView` can lose its connection to the new player — resulting in **audio playing but black video**.

`replaceAsync()` is also unreliable. The native shared object can be garbage-collected before the promise resolves.

**Instead:** Use React `key` to unmount/remount the entire `CardFace` component when the card changes.

```tsx
<CardFace key={card.id} card={card} isPlaying={true} />
```

When `card.id` changes, React unmounts the old `CardFace` (destroying the old player cleanly) and mounts a new one (creating a fresh player with the new URL). No stale state, no orphaned native objects.

### Rule 2: `useVideoPlayer` is called once per CardFace lifetime

```tsx
const player = useVideoPlayer(videoUri, p => {
    p.loop = true;
    if (isPlaying) p.play();
});
```

The setup callback runs once. `isPlaying` is read at creation time. There is no `useEffect` to toggle play/pause — the component is always mounted with `isPlaying={true}` and unmounted when no longer needed.

### Rule 3: Use `onFirstFrameRender` to signal readiness

```tsx
<VideoView
    player={player}
    onFirstFrameRender={() => onReady?.()}
/>
```

The parent (`MatchupView`) uses this to delay the challenger fade-in until the video is actually rendering frames. Without this, the user sees a black rectangle during the load gap.

### Rule 4: Use local file cache for instant loads

`CardFace` calls `getVideoUri(card.video_url)` synchronously at render time. If the video was prefetched to disk, this returns a `file://` URI. If not, it returns the remote URL and the player downloads directly.

```tsx
const videoUri = getVideoUri(card.video_url);
const player = useVideoPlayer(videoUri, ...);
```

### Rule 5: Keep yeet animation on the UI thread — never use React state for slot selection

The yeet animation applies `translateY`, `translateX`, `rotate` to the `Reanimated.View` wrapping `CardFace`. The slot being yeeted is tracked with a Reanimated **shared value** (`yeetingSlotSV`), NOT React state. This is critical because:

- React state changes (`setState`) re-render the parent, which triggers native view property updates on BOTH slots
- On iOS, native layout invalidation (`setNeedsLayout`) on a view hosting an `AVPlayerLayer` can cause the video to freeze (audio continues, video stops rendering frames)
- Using a shared value keeps the slot selection entirely on the UI thread — the surviving slot's native view is never touched

Each slot has its own `useAnimatedStyle` that reads `yeetingSlotSV` and conditionally applies transforms. Only the dead slot gets transforms; the surviving slot's animated style returns only `{ opacity }` and never changes during the animation.

The sequence is:
1. Yeet triggers → `yeetingSlotSV.value = YEET_TOP | YEET_BOTTOM` (no React re-render)
2. `requestAnimationFrame` → `withTiming` fires translateY, translateX, rotation
3. Video keeps playing while spinning off screen (500ms)
4. After animation: hide slot (opacity 0), `yeetingSlotSV.value = YEET_NONE`, reset transforms
5. Card swap via `setTopCard`/`setBottomCard` (only the dead slot re-renders via key change)
6. New CardFace mounts, loads video
7. `onFirstFrameRender` fires → fade slot back in (60ms)

---

## Video Cache (`src/lib/videoCache.ts`)

### Architecture

```
Remote URL → localFilename() → deterministic filename
           → resolvedMap (in-memory Map<remoteUrl, localUri>)
           → disk: Paths.cache/videos/{userId}_{timestamp}.mp4
```

### Key functions

| Function | Sync/Async | Purpose |
|----------|-----------|---------|
| `getVideoUri(url)` | **Sync** | Returns local URI if cached, remote URL otherwise. Called by CardFace at render time. |
| `prefetchVideo(url)` | Async | Downloads to disk. Deduplicates in-flight downloads. Populates `resolvedMap`. |
| `prefetchMatchupVideos(matchups)` | Fire-and-forget | Prefetches all video URLs from a batch of matchups. |
| `cleanVideoCache(activeUrls)` | Sync | Deletes cached files NOT in the active URL list. Called on app startup after sync. |
| `clearVideoCache()` | Sync | Nuclear option. Deletes entire cache directory. |

### When prefetching happens

1. `syncMatchups()` in the store calls `prefetchMatchupVideos(trulyNew)` after merging new matchups
2. This fires `prefetchVideo()` for every video URL in the new matchups (fire-and-forget)
3. By the time the user swipes and the next CardFace mounts, the video is likely on disk

### When cleanup happens

On app startup, after `syncMatchups()` populates the cache:
```
syncAll() → syncMatchups() → get active URLs → cleanVideoCache(activeUrls)
```
Only files matching queued matchup videos are kept. Everything else is deleted.

---

## The Yeet Gesture & Animation

### Layout

- Two video slots stacked vertically, each `flex: 1`
- 2px white seam between them
- `overflow: 'visible'` on slots (allows yeeted card to fly out of bounds)

### Gesture (`Gesture.Pan`)

- Touch must start within `SEAM_ZONE_HALF` (40px) of the seam
- A white radial glow appears and follows the finger
- When `|translationY| > YEET_THRESHOLD` (60px), yeet triggers
- **Swipe up = top card flies up and off screen. Bottom survives.**
- **Swipe down = bottom card flies down and off screen. Top survives.**
- `hasJudgedRef` prevents double-firing from continuous `onUpdate` events

### Animation Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `YEET_DURATION` | 500ms | Animation length |
| `YEET_TRANSLATE_Y` | `SCREEN_HEIGHT` | Full screen vertical fling |
| `YEET_TRANSLATE_X_MAX` | 140px | Max lateral drift (randomized 50-100%) |
| `YEET_ROTATION` | 40deg | Max rotation (randomized 70-100%) |
| `CHALLENGER_FADE_DURATION` | 60ms | New card fade-in after `onFirstFrameRender` |

### Animation Implementation

The yeet animation runs on the **real video slot** (not an overlay):

1. `setYeetingSlot(deadSlot)` — applies `yeetStyle` (transforms) to that slot's `Reanimated.View`
2. `requestAnimationFrame` — ensures React has rendered the style attachment
3. `withTiming` — fires translateY, translateX, rotation simultaneously
4. Easing: `Easing.out(Easing.quad)` — starts fast, decelerates (punchy impact feel)
5. Lateral drift and rotation directions are randomized per yeet

### Sound & Haptics

| Event | Effect |
|-------|--------|
| Yeet trigger | `Haptics.Heavy` + `yeet.mp3` via `useAudioPlayer` (use `replace()` + `play()`, NOT `seekTo(0)` + `play()` — seekTo is async and can silently kill playback) |
| "+" button press | `Haptics.Medium` |
| Account/leaderboard buttons | `Haptics.Light` |

---

## State Management (`src/lib/store.ts`)

### Zustand with AsyncStorage persistence

Persisted keys: `cachedMatchups`, `cachedKeptHistory`, `cachedOutbox`

Storage key: `'cards-storage'`

### Key Types

```typescript
Card: { id, video_url, creator_username, emoji_tallies, total_wins, comment_count }
Matchup: { matchup_id, card_a_id, card_b_id, card_a: Card, card_b: Card, created_at }
KeptEntry: { card_id, my_emoji (nullable), judged_at, video_url, emoji_tallies, pending_views, total_wins, creator_username }
```

### Sync Flow

```
App opens / AppState → 'active'
  → syncAll()
    → Clear cachedMatchups (start fresh from server)
    → heartbeat()
    → syncMatchups()
      → RPC sync_matchups(p_after: highWaterMark)
      → Deduplicate, merge into cachedMatchups
      → prefetchMatchupVideos(newMatchups)
    → fetchActiveCount()
    → cleanVideoCache(activeUrls)
```

### Judgment Flow (Optimistic)

```
judgeMatchup(matchupId, keptCardId, null, streak)
  → IMMEDIATELY: remove matchup from cachedMatchups
  → THEN: RPC judge_matchup(...)
  → If RPC fails: matchup is already removed from cache, judgment is lost but UX continues
```

The animation MUST complete before `judgeMatchup` is called (it runs in a `setTimeout(YEET_DURATION + 50)`). If called too early, the component unmounts mid-animation.

---

## Independent Slot Architecture (MatchupView)

This is the most important architectural decision in the frontend. Each video slot is managed independently.

### State

```typescript
const [topCard, setTopCard] = useState<Card>(initialMatchup.card_a);
const [bottomCard, setBottomCard] = useState<Card>(initialMatchup.card_b);

const topCardIdRef = useRef(initialMatchup.card_a_id);
const bottomCardIdRef = useRef(initialMatchup.card_b_id);
const currentMatchupIdRef = useRef(initialMatchup.matchup_id);
```

### Ladder Transition

When the user yeets and a ladder matchup exists:

1. Only the dead slot's state setter is called (`setTopCard` or `setBottomCard`)
2. The surviving slot's setter is **never called** — React sees no change, CardFace doesn't re-render, video keeps playing uninterrupted
3. The dead slot gets a new `key` (card.id changed) → React unmounts old CardFace, mounts new one
4. `pendingFadeSlotRef` tracks which slot needs to fade in
5. `onFirstFrameRender` → `handleSlotReady` → `topOpacity` or `bottomOpacity` animates to 1

### Streak Tracking

```typescript
const streakRef = useRef(0);
const streakCardRef = useRef<string | null>(null);

// In handleYeet:
if (keptCardId === streakCardRef.current) {
    streakRef.current += 1;  // same card won again
} else {
    streakRef.current = 1;   // new card, reset
    streakCardRef.current = keptCardId;
}
```

Streak resets when: different card wins, no ladder matchup found, app backgrounds (component unmounts).

---

## Screen Architecture

### Routing (Expo Router)

```
src/app/
  _layout.tsx          — Root layout (auth check, restore session)
  index.tsx            — Auth gate → onboarding or (main)
  onboarding.tsx       — Username setup
  (main)/
    _layout.tsx        — Stack navigator
    index.tsx          — Duel screen (MatchupView)
    profile.tsx        — User profile
    kept-history.tsx   — Cards user has kept
    outbox.tsx         — Cards user has created
    leaderboard.tsx    — Top videos by wins
    settings.tsx       — Language, account settings
```

### Main Screen (`(main)/index.tsx`)

```
┌─────────────────────────────┐
│ [👤]                   [🏆] │  ← Floating buttons (z-index 20)
│                             │
│  ┌───────────────────────┐  │
│  │     TOP VIDEO         │  │  ← CardFace key={topCard.id}
│  │                       │  │
│  ├───────────────────────┤  │  ← 2px white seam
│  │     BOTTOM VIDEO      │  │  ← CardFace key={bottomCard.id}
│  │                       │  │
│  └───────────────────────┘  │
│                             │
│           [+]               │  ← Glass FAB (56×56)
└─────────────────────────────┘
```

---

## Visual Style — "Slime" Palette

All colors and fonts are defined in `src/theme.ts` and imported as `Theme`. No hardcoded colors anywhere in components.

| Token | Value | Usage |
|-------|-------|-------|
| `background` | `#0A0A0A` | App chrome, video slot backgrounds |
| `surface` | `#141414` | Elevated surfaces (empty state cards) |
| `surfaceAlt` | `#1A1A1A` | Thumbnail backgrounds |
| `accent` | `#8ACE00` | Primary brand color — lime green. Seam, CTA buttons, send button, highlights |
| `accentMuted` | `rgba(138,206,0,0.3)` | Seam glow background |
| `textPrimary` | `#FFFFFF` | All primary text |
| `textSecondary` | `rgba(255,255,255,0.5)` | Secondary text, timestamps |
| `textTertiary` | `rgba(255,255,255,0.35)` | Muted text, hints |
| `textOnAccent` | `#0A0A0A` | Black text on green buttons |
| `danger` | `#FF3B30` | Errors, recording indicator (unified — no more #FF4444) |
| `seam` | `#8ACE00` | The 2px line between video slots (was white) |
| `seamGlow` | `#8ACE00` | Shadow/glow color on touch near seam (was white) |
| `fonts.base` | `Verdana` | All UI text (was System/SF Pro) |
| `fonts.mono` | `Menlo` | Numbers: win counts, ranks, timestamps |

Videos remain edge-to-edge, `contentFit="cover"`, no border radius.

---

## Known Issues & Constraints

1. **Video freezing on surviving card after yeet** — Root cause identified: `setYeetingSlot` was React state, causing parent re-renders that triggered native `setNeedsLayout` on the surviving slot's AVPlayerLayer. Fixed by replacing with a Reanimated shared value (`yeetingSlotSV`). If freezes persist, investigate `overflow: 'visible'` causing AVPlayerLayer overlap during animation (potential iOS compositor contention).

2. **Test videos are static colors** — 20 of 26 test videos are solid-color 720×720 MP4s. Makes it hard to spot freezing bugs. Need real motion test videos.

3. **Videos are 9:16, not square.** Camera records full sensor frame. Crop guide in VideoCapture is visual only. `contentFit="cover"` handles display cropping.

4. **No sound design yet** beyond `yeet.mp3`. No ambient sound, no UI sounds.

5. **PostLogSheet exists but is not wired** to any screen. Theme import fixed to use new `src/theme.ts`.

6. **Leaderboard fetches full videos for top 5.** At scale (100+ DAU), this is ~10MB per leaderboard open. Acceptable for beta testing. Will need thumbnails or CDN optimization later.
