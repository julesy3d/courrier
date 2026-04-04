# Yeet — Client Architecture

> **Source of truth for the frontend.** If something contradicts this document, this document wins.
> Last updated: 2026-04-04 (v1.2.1 — Streaker Audio + AudioGlow)

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

| Gradients | `expo-linear-gradient` | SDK 55 |

**NOT used:** `expo-av` (replaced by `expo-video` + `expo-audio`), `@shopify/react-native-skia`.

---

## File Map

### Active Files

| File | Role |
|------|------|
| `src/app/(main)/index.tsx` | Main screen. Renders MatchupView or EmptyState. Floating buttons (account top-left, leaderboard top-right, "+" FAB bottom-center). Manages card pool lifecycle: initial fetch, pool-to-matchup popping, refill on resume. |
| `src/components/MatchupView.tsx` | **Core component.** Yeet gesture, independent slot state, local matchup sequencing (winner stays, next challenger from pool), seam glow, yeet animation, ghost overlay, audio slot management (streaker gets mic), AudioGlow indicator. Judgment is fire-and-forget. Key on `Reanimated.View` (not CardFace) for fresh native layers. |
| `src/components/CardFace.tsx` | Video renderer. `useVideoPlayer` + `VideoView`. Accepts `card`, `isPlaying`, `muted`, `slot`. Uses `audioMixingMode: 'mixWithOthers'` to prevent iOS audio session conflicts. Syncs `player.muted` when prop changes. DEV-only status/playing listeners for debugging. |
| `src/lib/store.ts` | Zustand store. Card pool management (`fetchCardPool`, `popChallenger`), fire-and-forget judgment (`reportJudgment`), all backend communication via `supabase.rpc()`. |
| `src/lib/videoCache.ts` | Local file cache for videos. Downloads to `Paths.cache/videos/`. Sync lookup via `getVideoUri()`. |
| `src/lib/sounds.ts` | Sound asset exports. Currently just `YEET_SOUND`. |
| `src/components/VideoCapture.tsx` | Hold-to-record (5s), crop guide, shutter button. |
| `src/components/EmptyState.tsx` | Shown when no matchups available. |
| `src/components/GlassSurface.tsx` | BlurView wrapper. Used by FAB. |
| `src/app/(main)/leaderboard.tsx` | Leaderboard screen. Top 5 with looping video previews, rest as text rows. |
| `src/app/onboarding.tsx` | @username input, uniqueness check, camera permission. |
| `src/app/(main)/profile.tsx` | Links to outbox. |
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
| `prefetchVideo(url)` | Async | Downloads to disk. Deduplicates in-flight downloads. Populates `resolvedMap`. Returns promise that resolves when file is on disk. |
| `prefetchCardVideos(cards)` | Fire-and-forget | Queues videos for concurrency-limited download (max 3 at a time, front-of-pool first). |
| `cleanVideoCache(activeUrls)` | Sync | Deletes cached files NOT in the active URL list. Enforces 200MB cap with LRU eviction. |
| `clearVideoCache()` | Sync | Nuclear option. Deletes entire cache directory. |

### Prefetch concurrency model

Downloads are limited to 3 concurrent via an internal queue (`prefetchQueue`). Cards are enqueued in pool order, so the next cards the user will see download first. Direct `prefetchVideo()` calls (from `initPool` or `handleYeet`) bypass the queue and get inflight deduplication — this gives swap-critical downloads priority over the background queue.

### When prefetching happens

1. `fetchCardPool()` in the store calls `prefetchCardVideos(newCards)` after appending to pool — enqueues all videos for background download (max 3 at a time)
2. **Initial display:** `initPool()` explicitly awaits `prefetchVideo()` for the first 2 cards before setting `isLoading = false`. The loading spinner stays until both videos are on disk.
3. **Swap gate:** In `handleYeet`, the card swap waits for `prefetchVideo(challenger.video_url)` with a **2s timeout**. On warm cache this resolves instantly. On slow connection, if the download isn't done in 2s, the swap proceeds with the remote URL (player streams it) rather than freezing the UI.

### When cleanup happens

On app startup, after `fetchCardPool()` and initial prefetch:
```
initPool() → returnUnusedCards (stale pool) → fetchCardPool() → await first 2 videos → cleanVideoCache(activeUrls)
```
Only files matching pool video URLs are kept. Everything else is deleted.

---

## The Yeet Gesture & Animation

### Layout

- Two video slots stacked vertically, each `flex: 1`
- 2px seam between them (Theme.colors.seam — `#2A2A2A`)
- `overflow: 'visible'` on slots (allows yeeted card to fly out of bounds)

### Gesture (`Gesture.Pan`)

- Touch must start within `SEAM_ZONE_HALF` (40px) of the seam
- A radial glow appears and follows the finger
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

### Animation + Swap Pipeline (v1.2.0 — Ghost Overlay)

The yeet mounts a "ghost" overlay with the dead card flying away, while the slot underneath swaps to the new challenger immediately. The new card starts playing behind the ghost.

1. Yeet triggers → animation shared values reset to 0
2. `requestAnimationFrame` → `withTiming` fires translateY, translateX, rotation (500ms)
3. **Immediately:** `popChallenger()` pops next card from pool (instant, local)
4. **Immediately:** `reportJudgment()` fires in background (NEVER awaited)
5. **Immediately:** Ghost state set (dead card + slot) — mounts an absolutely-positioned `CardFace` overlay
6. **Immediately:** Dead slot's card set to challenger (key change → new `Reanimated.View` + `CardFace` mount underneath ghost)
7. Ghost reads the same animation shared values → flies away with translateY/X + rotation
8. New challenger's `CardFace` starts playing underneath — visible as ghost moves off screen
9. After `YEET_DURATION + 50ms`: ghost cleared, animation values reset, `hasJudgedRef` resets → ready for next yeet

**Pool empty fallback:** When `popChallenger()` returns null, no ghost is used. `yeetingSlotSV` drives the slot animation directly (old behavior), then `onJudged()` is called.

**Key insight:** Three `VideoPlayer`s are briefly active (survivor + new challenger + ghost). `audioMixingMode: 'mixWithOthers'` prevents iOS audio session conflicts. The ghost's player starts from the beginning of the dead card's video, but this is imperceptible during a fast fly-away with rotation.

### Audio — Streaker Gets the Mic

Only one card plays audio at a time. The **streaking card** (the survivor that keeps winning) has audio on. The new challenger arrives silent. To hear the other card, the user must yeet the current streaker.

- `audioSlot` React state tracks which slot (`'top'` or `'bottom'`) has audio
- `CardFace` receives `muted` prop; a `useEffect` syncs `player.muted` when it changes
- On yeet, `setAudioSlotBoth(survivorSlot)` gives the mic to the survivor
- On initial load, audio slot is randomly assigned (both cards are new)
- Ghost overlay is always `muted={true}`

**AudioGlow indicator:** A gradient border overlay rendered inside each slot. The border is visible on the seam-facing half and fades to transparent toward the outer screen edge (using `expo-linear-gradient`). The seam-side edge has a white glow shadow (`shadowRadius: 8`). A gentle Reanimated opacity pulse (1.0 ↔ 0.5, 1800ms cycle) gives it life. `pointerEvents="none"` ensures it doesn't block gestures.

**Why not alternation?** We tried loop-based audio alternation (switch mic on each `playToEnd` event). The audio focal point caused users to tunnel-vision on whichever card had sound, ignoring the duel entirely. The streaker model forces engagement with both cards: you hear the winner, you see the silent newcomer, and you must actively choose to change the audio.

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

Persisted keys: `cardPool`, `poolExcludeIds`, `cachedOutbox`

Storage key: `'cards-storage'`

### Key Types

```typescript
Card: { id, video_url, sender_id, creator_username, emoji_tallies, total_wins, comment_count }
```

`Matchup` type has been removed. Matchup pairing is now done client-side.

### Pool Fetch Flow

```
App opens
  → initPool()
    → heartbeat()
    → if pool has stale cards from previous session:
      → returnUnusedCards(staleIds) — fire-and-forget fuel refund
      → clear cardPool + poolExcludeIds
    → fetchCardPool(10)
      → RPC fetch_card_pool(10, poolExcludeIds)
      → Append to cardPool, update poolExcludeIds
      → prefetchCardVideos(newCards)
    → cleanVideoCache(activeUrls)
  → Pop first 2 cards from pool → pass as initialCardA/B to MatchupView

AppState → 'active' (resume)
  → if pool < 5: fetchCardPool(10) in background
```

### Judgment Flow (Fire-and-Forget)

```
reportJudgment(cardAId, cardBId, keptCardId, emoji, streak)
  → Fire RPC report_judgment(...) — DO NOT AWAIT
  → On error: console.warn (no retry queue yet)
  → The client has already moved to the next matchup
```

### Fuel Return (Stale Pool Cleanup)

```
returnUnusedCards(cardIds)
  → Fire RPC return_unused_cards(...) — DO NOT AWAIT
  → Called on app open when pool has leftover cards from a previous session
  → Pool and poolExcludeIds are cleared before fetching fresh
```

### Store Actions

| Action | What it does | Blocks UI? |
|--------|-------------|------------|
| `fetchCardPool(count, excludeIds)` | RPC → append cards to pool → prefetch videos | No (async, UI shows loading only on first load) |
| `popChallenger(currentCardIds, excludeSenderIds)` | Pop next card from pool, avoid same-creator if possible | No (instant, synchronous) |
| `reportJudgment(...)` | Fire-and-forget RPC call | **Never** |
| `returnUnusedCards(cardIds)` | Fire-and-forget fuel refund for unplayed pool cards | **Never** |
| `heartbeat()` | Update `last_active_at` | No |

### Why `syncMatchups` and `judgeMatchup` were removed

In v1.1.0, the judgment flow was: `await judgeMatchup()` → `await syncMatchups()` → find ladder matchup → swap card. Two sequential RPCs on the critical path. In v1.2.0, there are zero RPCs on the critical path. The pool is pre-loaded, the swap is local, and the judgment is background-only.

---

## Independent Slot Architecture (MatchupView)

This is the most important architectural decision in the frontend. Each video slot is managed independently.

### State

```typescript
const [topCard, setTopCard] = useState<Card>(initialCardA);
const [bottomCard, setBottomCard] = useState<Card>(initialCardB);

const topCardIdRef = useRef(initialCardA.id);
const bottomCardIdRef = useRef(initialCardB.id);
const topSenderIdRef = useRef(initialCardA.sender_id);
const bottomSenderIdRef = useRef(initialCardB.sender_id);
```

All mutable data read inside `handleYeet` uses refs (not state) to avoid stale closures. `setTopCard`/`setBottomCard` are only used as setters — their current values are never read inside the callback.

`currentMatchupIdRef` has been removed — there is no server-created matchup ID. Matchup pairing is local.

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

### Card Swap (v1.2.0 — Ghost Overlay)

When the user yeets:

1. `popChallenger()` pops next card from local pool (instant)
2. `reportJudgment()` fires in background (never awaited)
3. Ghost overlay mounts with dead card — absolutely positioned over the dead slot, `zIndex: 10`
4. Dead slot's card state set to challenger immediately — new `Reanimated.View` (key change) mounts underneath the ghost
5. Ghost reads animation shared values and flies away (500ms) — new card plays underneath
6. The surviving slot's setter is **never called** — React sees no change, CardFace doesn't re-render, video keeps playing uninterrupted
7. After animation: ghost cleared, transforms reset → ready for next yeet

### Pool Empty (End of Queue)

When `popChallenger()` returns null (pool exhausted), the yeet animation plays to completion, then `onJudged()` is called. The parent (index.tsx) attempts to refill the pool. If refill succeeds, a new MatchupView is mounted. If not, EmptyState is shown.

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
│  ├───────────────────────┤  │  ← 2px dark seam
│  │     BOTTOM VIDEO      │  │  ← Reanimated.View key={bottomCard.id}
│  │                       │  │     └ CardFace card={bottomCard}
│  └───────────────────────┘  │
│                             │
│           [+]               │  ← Glass FAB (56×56)
└─────────────────────────────┘
```

---

## Visual Style — Dark Palette

All colors and fonts are defined in `src/theme.ts` and imported as `Theme`. No hardcoded colors anywhere in components.

| Token | Value | Usage |
|-------|-------|-------|
| `background` | `#121212` | Near-black — app chrome, video slot backgrounds |
| `surface` | `#1A1A1A` | Charcoal — elevated surfaces, sheets |
| `surfaceAlt` | `#222222` | Slightly lighter charcoal, subtle depth |
| `accent` | `#E8E4DF` | Off-white — primary actions, highlights |
| `accentMuted` | `rgba(232,228,223,0.15)` | Subtle glow, seam glow background |
| `secondary` | `#3A3A3A` | Mid-grey — secondary actions |
| `textPrimary` | `#E8E4DF` | Off-white on dark background |
| `textSecondary` | `rgba(232,228,223,0.50)` | Secondary text, timestamps |
| `textTertiary` | `rgba(232,228,223,0.30)` | Muted text, hints |
| `textOnAccent` | `#121212` | Dark text on off-white buttons |
| `danger` | `#8B4040` | Muted red |
| `seam` | `#2A2A2A` | The 2px line between video slots |
| `seamGlow` | `#E8E4DF` | Off-white glow on touch near seam |
| `audioBorder` | `#FFFFFF` | AudioGlow border on card with active audio |
| `fonts.base` | `Verdana` | All UI text |
| `fonts.mono` | `Menlo` | Numbers: win counts, ranks, timestamps |

Videos remain edge-to-edge, `contentFit="cover"`, no border radius.

---

## Known Issues & Next Steps

1. **Yeet sound disabled.** `yeet.mp3` playback is commented out while validating that `audioMixingMode: 'mixWithOthers'` fully resolves the surviving card freeze. Re-enable and test with audio on.

2. **Surviving card `playing=false` events.** With `audioMixingMode: 'mixWithOthers'`, the surviving card still emits `playing=false` → `playing=true` pairs around yeet transitions, but recovers immediately. These are cosmetic log noise, not visible freezes.

3. **No judgment retry queue.** `reportJudgment` is fire-and-forget. If the network call fails, that judgment is lost. Acceptable for beta (low volume). At scale, add a local outbox that retries on app resume.

4. **Black flash on card swap.** Largely mitigated by the ghost overlay — the dead card flies away on top while the new CardFace mounts and starts rendering underneath. The ghost covers the mount cycle. Any remaining flash is hidden behind the ghost during the 500ms animation.

5. **Test videos.** 37 Pexels clips trimmed to 5s with audio. Seeded via `scripts/seed-test-data.mjs` (requires `SUPABASE_SERVICE_KEY` env var). 1-2 may have silent audio tracks.

6. **Videos are 9:16, not square.** Camera records full sensor frame. Crop guide in VideoCapture is visual only. `contentFit="cover"` handles display cropping.

7. **PostLogSheet exists but is not wired** to any screen.

8. **Leaderboard fetches full videos for top 5.** At scale (100+ DAU), this is ~10MB per leaderboard open. Will need thumbnails or CDN optimization later.

9. **Pool persistence across sessions.** `cardPool` and `poolExcludeIds` are persisted to AsyncStorage. On cold start, stale cards are returned to the server via `returnUnusedCards` (fire-and-forget fuel refund), the pool is cleared, and a fresh batch is fetched. This prevents fuel loss from unplayed cards.
