# Yeet — Client Architecture

> **Source of truth for the frontend.** If something contradicts this document, this document wins.
> Last updated: 2026-03-23 (v1.1.0)

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
| `src/app/(main)/index.tsx` | Main screen. Renders MatchupView or EmptyState. Floating buttons (account top-left, leaderboard top-right, "+" FAB bottom-center). Orchestrates sync-on-launch and AppState resume. No `key` prop on MatchupView — the component manages its own slot state internally. |
| `src/components/MatchupView.tsx` | **Core component.** Yeet gesture, independent slot state, ladder transitions, seam glow, yeet animation, backend call. Key on `Reanimated.View` (not CardFace) to get fresh native layers after yeet. |
| `src/components/CardFace.tsx` | Video renderer. `useVideoPlayer` + `VideoView`. Accepts `card`, `isPlaying`, `slot`. Uses `audioMixingMode: 'mixWithOthers'` to prevent iOS audio session conflicts. DEV-only status/playing listeners for debugging. |
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
| `src/theme.ts` | Semantic design tokens (colors + fonts). Single source of truth for all visual constants. |

### Dead Code (safe to delete)

| File | Reason |
|------|--------|
| `src/components/PostLogSheet.tsx` | Exists but not wired to any screen. |

Previously deleted (v1.1.0): `Postcard.tsx`, `PostcardCapture.tsx`, `PostcardInspector.tsx`, `postcardLayout.ts`, old `theme.ts`, `random.ts`, `photoProcessor.ts`, `EmojiQuadrant.tsx`, `AddressBuilder.tsx`, `CommentsSheet.tsx`, `DualCameraCapture.tsx`, `contacts.ts`, `carnet.tsx`, `first-post.tsx`, `letter/[id].tsx`.

---

## Video Playback — Critical Rules

These rules exist because we spent days debugging black screens, frozen videos, and `NativeSharedObjectNotFoundException` crashes. Do not deviate.

### Rule 1: Never swap URLs on a live `useVideoPlayer`

`useVideoPlayer(source)` creates a native player tied to a native `VideoView`. Changing the source destroys the old player and creates a new one, but the `VideoView` can lose its connection to the new player — resulting in **audio playing but black video**.

`replaceAsync()` is also unreliable. The native shared object can be garbage-collected before the promise resolves.

**Instead:** Use React `key` to unmount/remount the entire component when the card changes.

### Rule 2: Key goes on the `Reanimated.View` wrapper, not on `CardFace`

```tsx
<Reanimated.View key={topCard.id} style={[styles.videoHalf, topAnimatedStyle]}>
    <CardFace card={topCard} isPlaying={true} slot="top" />
</Reanimated.View>
```

When the card changes, React unmounts the entire `Reanimated.View` and mounts a fresh one. This ensures a **fresh native view and fresh CALayer** for the new VideoView. Putting the key on CardFace only (with a stable Reanimated.View wrapper) caused black screens — the native layer from the previous animation state was reused, and iOS's compositor failed to render the new AVPlayerLayer into the stale container.

### Rule 3: `useVideoPlayer` is called once per CardFace lifetime

```tsx
const player = useVideoPlayer(videoUri, p => {
    p.loop = true;
    p.audioMixingMode = 'mixWithOthers';
    if (isPlaying) p.play();
});
```

The setup callback runs once. `isPlaying` is read at creation time. There is no `useEffect` to toggle play/pause — the component is always mounted with `isPlaying={true}` and unmounted when no longer needed.

### Rule 4: Always set `audioMixingMode = 'mixWithOthers'`

Without this, iOS reconfigures the audio session every time a new VideoPlayer is created. This intermittently pauses sibling players — causing the **surviving card freeze** (video stops, audio may or may not continue). The symptom is `playing=false` events on the surviving card immediately after the dead slot mounts a new CardFace.

With `mixWithOthers`, iOS allows multiple AVPlayers to output simultaneously without session negotiation.

### Rule 5: Use local file cache for instant loads

`CardFace` calls `getVideoUri(card.video_url)` synchronously at render time. If the video was prefetched to disk, this returns a `file://` URI. If not, it returns the remote URL and the player downloads directly.

```tsx
const videoUri = getVideoUri(card.video_url);
const player = useVideoPlayer(videoUri, ...);
```

### Rule 6: Keep yeet animation on the UI thread — never use React state for slot selection

The yeet animation applies `translateY`, `translateX`, `rotate` to the `Reanimated.View` wrapping `CardFace`. The slot being yeeted is tracked with a Reanimated **shared value** (`yeetingSlotSV`), NOT React state. This is critical because:

- React state changes (`setState`) re-render the parent, which triggers native view property updates on BOTH slots
- On iOS, native layout invalidation (`setNeedsLayout`) on a view hosting an `AVPlayerLayer` can cause the video to freeze
- Using a shared value keeps the slot selection entirely on the UI thread — the surviving slot's native view is never touched

Each slot has its own `useAnimatedStyle` that reads `yeetingSlotSV` and conditionally applies transforms. Only the dead slot gets transforms; the surviving slot's animated style returns `{}` and its native view is never invalidated during the animation.

### Rule 7: No opacity system — no fade-in, no fade-out

We removed the opacity-based fade-in/fade-out system. It added complexity (safety timeouts, pending-fade refs, slot-ready callbacks) and masked bugs rather than fixing them. The new card mounts and plays immediately. There may be a brief black flash during the CardFace mount cycle — this is acceptable and far less disruptive than the bugs the opacity system introduced.

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
- 2px seam between them (Theme.colors.seam — `#2C7B45`)
- `overflow: 'visible'` on slots (allows yeeted card to fly out of bounds)

### Gesture (`Gesture.Pan`)

- Touch must start within `SEAM_ZONE_HALF` (40px) of the seam
- A green radial glow appears and follows the finger
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

### Animation + Backend Pipeline

The yeet fires the animation and the backend call **simultaneously**. The card swap happens as soon as the backend responds (~150-200ms), cutting the animation short:

1. Yeet triggers → `yeetingSlotSV.value = YEET_TOP | YEET_BOTTOM` (no React re-render)
2. `requestAnimationFrame` → `withTiming` fires translateY, translateX, rotation
3. **Simultaneously:** `judgeMatchup()` + `syncMatchups()` fire
4. Backend responds (~150ms) → reset transforms, swap dead slot's card immediately
5. New `Reanimated.View` mounts (key change) → new `CardFace` loads video
6. `hasJudgedRef` resets → ready for next yeet

The animation is intentionally cut short. Users perceive the fast swap as snappy responsiveness. The ~150ms of visible animation is enough to convey the "fling" feel.

### Sound & Haptics

| Event | Effect |
|-------|--------|
| Yeet trigger | `Haptics.Heavy` |
| "+" button press | `Haptics.Medium` |
| Account/leaderboard buttons | `Haptics.Light` |

**Note:** Yeet sound (`yeet.mp3`) is currently disabled while investigating audio session conflicts. Re-enable after confirming `audioMixingMode: 'mixWithOthers'` fully resolves the surviving card freeze.

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

The backend call fires during the yeet animation (not after). MatchupView calls `judgeMatchup` then `syncMatchups` in sequence, and swaps the card as soon as both complete.

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

### Render Structure

```tsx
{/* TOP SLOT — key on Reanimated.View for fresh native layer */}
<Reanimated.View key={topCard.id} style={[styles.videoHalf, topAnimatedStyle]}>
    <CardFace card={topCard} isPlaying={true} slot="top" />
</Reanimated.View>

<View style={styles.seam} />

{/* BOTTOM SLOT */}
<Reanimated.View key={bottomCard.id} style={[styles.videoHalf, bottomAnimatedStyle]}>
    <CardFace card={bottomCard} isPlaying={true} slot="bottom" />
</Reanimated.View>
```

### Ladder Transition

When the user yeets and a ladder matchup exists:

1. Backend fires in parallel with animation (~150ms response)
2. Reset transforms → `yeetingSlotSV.value = YEET_NONE`, all transform values to 0
3. Only the dead slot's state setter is called (`setTopCard` or `setBottomCard`)
4. The surviving slot's setter is **never called** — React sees no change, CardFace doesn't re-render, video keeps playing uninterrupted
5. The dead slot gets a new `key` (card.id changed) → React unmounts old `Reanimated.View`, mounts new one with fresh native layer
6. New CardFace mounts, loads video from local cache, plays immediately

### No Ladder Matchup (End of Queue)

When `syncMatchups()` returns no ladder matchup for the kept card, `onJudged()` is called, which triggers the parent to show EmptyState.

**Known issue:** The yeet animation gets cut short when this happens (transforms reset abruptly). Needs graceful handling — let the animation finish, then transition to empty state.

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
│  │     TOP VIDEO         │  │  ← Reanimated.View key={topCard.id}
│  │                       │  │     └ CardFace card={topCard}
│  ├───────────────────────┤  │  ← 2px green seam
│  │     BOTTOM VIDEO      │  │  ← Reanimated.View key={bottomCard.id}
│  │                       │  │     └ CardFace card={bottomCard}
│  └───────────────────────┘  │
│                             │
│           [+]               │  ← Glass FAB (56×56)
└─────────────────────────────┘
```

---

## Visual Style — "Warm Green" Palette

All colors and fonts are defined in `src/theme.ts` and imported as `Theme`. No hardcoded colors anywhere in components.

| Token | Value | Usage |
|-------|-------|-------|
| `background` | `#B7B3AA` | Warm grey — app chrome, video slot backgrounds |
| `surface` | `#A8A49B` | Elevated surfaces, sheets |
| `surfaceAlt` | `#9F9B92` | Thumbnail backgrounds, subtle depth |
| `accent` | `#01E048` | Primary brand green — CTA buttons, highlights, glow |
| `accentMuted` | `rgba(1,224,72,0.25)` | Seam glow background |
| `secondary` | `#2C7B45` | Darker forest green — seam, secondary actions |
| `textPrimary` | `#1A1A1A` | Near-black on warm background |
| `textSecondary` | `rgba(26,26,26,0.55)` | Secondary text, timestamps |
| `textTertiary` | `rgba(26,26,26,0.38)` | Muted text, hints |
| `textOnAccent` | `#1A1A1A` | Dark text on green buttons |
| `danger` | `#FF3B30` | Errors, recording indicator |
| `seam` | `#2C7B45` | The 2px line between video slots |
| `seamGlow` | `#01E048` | Glow color on touch near seam |
| `fonts.base` | `Verdana` | All UI text |
| `fonts.mono` | `Menlo` | Numbers: win counts, ranks, timestamps |

Videos remain edge-to-edge, `contentFit="cover"`, no border radius.

---

## Known Issues & Next Steps

1. **Yeet sound disabled.** `yeet.mp3` playback is commented out while validating that `audioMixingMode: 'mixWithOthers'` fully resolves the surviving card freeze. Re-enable and test with audio on.

2. **Surviving card `playing=false` events.** With `audioMixingMode: 'mixWithOthers'`, the surviving card still emits `playing=false` → `playing=true` pairs around yeet transitions, but recovers immediately. These are cosmetic log noise, not visible freezes. Monitor in production — if any `playing=false` does NOT have a matching `playing=true`, that's a real freeze.

3. **End-of-queue handling.** When no ladder matchup exists after a yeet, the animation is cut short and the screen transitions abruptly. Should: let the yeet animation finish, then gracefully transition to EmptyState or reload fresh matchups.

4. **Black flash on card swap.** Between the old CardFace unmounting and the new one rendering its first frame, there's a brief black flash (~50-100ms). Acceptable for now. A future optimization could pre-mount the next CardFace in a hidden layer before the yeet fires.

5. **Test videos are static colors.** 20 of 26 test videos are solid-color 720×720 MP4s. Makes it hard to spot freezing bugs. Need real motion test videos.

6. **Videos are 9:16, not square.** Camera records full sensor frame. Crop guide in VideoCapture is visual only. `contentFit="cover"` handles display cropping.

7. **PostLogSheet exists but is not wired** to any screen.

8. **Leaderboard fetches full videos for top 5.** At scale (100+ DAU), this is ~10MB per leaderboard open. Will need thumbnails or CDN optimization later.
