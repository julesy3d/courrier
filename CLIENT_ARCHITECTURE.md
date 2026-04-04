# Yeet — Client Architecture

> **Source of truth for the frontend.** If something contradicts this document, this document wins.
> Last updated: 2026-04-04 (v2.0.0 — Photo Mode)

---

## Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Expo / React Native (iOS only, TestFlight) | SDK 55 |
| Routing | Expo Router (file-based) | v4 |
| Images | `expo-image` (`Image`) | SDK 55 |
| Animation | `react-native-reanimated` | v3 |
| Gestures | `react-native-gesture-handler` (`Gesture.Pan`) | v2 |
| Camera | `expo-camera` (`CameraView` + `takePictureAsync`) | SDK 55 |
| Haptics | `expo-haptics` | SDK 55 |
| State | Zustand with AsyncStorage persistence | v4 |
| Bottom sheets | `@gorhom/bottom-sheet` | v5 |
| File system | `expo-file-system` (new API: `File`, `Directory`, `Paths`) | SDK 55 |

**NOT used:** `expo-av`, `expo-video`, `expo-audio`, `expo-linear-gradient`.

---

## File Map

### Active Files

| File | Role |
|------|------|
| `src/app/(main)/index.tsx` | Main screen. Renders MatchupView or EmptyState. Floating buttons (account top-left, leaderboard top-right, "+" FAB bottom-center). Manages card pool lifecycle: initial fetch, pool-to-matchup popping, refill on resume. |
| `src/components/MatchupView.tsx` | **Core component.** Yeet gesture, independent slot state, local matchup sequencing (winner stays, next challenger from pool), seam glow, yeet animation, ghost overlay. Judgment is fire-and-forget. Key on `Reanimated.View` (not CardFace) for fresh native layers. |
| `src/components/CardFace.tsx` | Image renderer. `expo-image` `Image` with `contentFit="cover"` and `transition={200}`. Accepts `card` and optional `style`. |
| `src/components/PhotoCapture.tsx` | Tap-to-shoot photo capture. Front camera default, flip toggle. Crop guide, preview with retake/send, upload with progress states. |
| `src/lib/store.ts` | Zustand store. Card pool management (`fetchCardPool`, `popChallenger`), fire-and-forget judgment (`reportJudgment`), all backend communication via `supabase.rpc()`. |
| `src/lib/imageUtils.ts` | `uploadCardImage()` — uploads JPEG to `card_videos` bucket (legacy name). |
| `src/components/EmptyState.tsx` | Shown when no matchups available. |
| `src/components/GlassSurface.tsx` | BlurView wrapper. Used by FAB. |
| `src/app/(main)/leaderboard.tsx` | Leaderboard screen. Top 5 with image thumbnails, rest as text rows with tap-to-preview. |
| `src/app/onboarding.tsx` | @username input, uniqueness check, camera permission. |
| `src/app/(main)/profile.tsx` | Links to outbox. |
| `src/app/(main)/outbox.tsx` | User's created cards with stats. Image thumbnails. |
| `src/lib/supabase.ts` | Supabase client init. |
| `src/lib/notifications.ts` | Push token registration. |
| `src/lib/i18n.ts` | Locale detection + translation helper. |
| `src/lib/dictionary.ts` | en/fr string dictionary. |
| `src/theme.ts` | Semantic design tokens (colors + fonts). Single source of truth for all visual constants. |

### Dead Code (safe to delete)

| File | Reason |
|------|--------|
| `src/components/PostLogSheet.tsx` | Exists but not wired to any screen. |

---

## Image Display

Images are rendered via `expo-image`'s `Image` component. It provides:
- Built-in disk caching (no manual cache system needed)
- `transition={200}` for smooth fade-in on load
- `contentFit="cover"` for edge-to-edge display in each slot

No prefetch queue, no manual cache cleanup. `expo-image` handles everything internally.

---

## The Yeet Gesture & Animation

### Layout

- Two image slots stacked vertically, each `flex: 1`
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

### Animation + Swap Pipeline (Ghost Overlay)

1. Yeet triggers → animation shared values reset to 0
2. `requestAnimationFrame` → `withTiming` fires translateY, translateX, rotation (500ms)
3. **Immediately:** `popChallenger()` pops next card from pool (instant, local)
4. **Immediately:** `reportJudgment()` fires in background (NEVER awaited)
5. **Immediately:** Ghost state set (dead card + slot) — mounts an absolutely-positioned `CardFace` overlay
6. **Immediately:** Dead slot's card set to challenger (key change → new `Reanimated.View` + `CardFace` mount underneath ghost)
7. Ghost reads the same animation shared values → flies away with translateY/X + rotation
8. New challenger's `CardFace` starts rendering underneath — `expo-image` loads from cache instantly if previously seen
9. After `YEET_DURATION + 50ms`: ghost cleared, animation values reset, `hasJudgedRef` resets → ready for next yeet

**Pool empty fallback:** When `popChallenger()` returns null, no ghost is used. `yeetingSlotSV` drives the slot animation directly, then `onJudged()` is called.

### Sound & Haptics

| Event | Effect |
|-------|--------|
| Yeet trigger | `Haptics.Heavy` |
| "+" button press | `Haptics.Medium` |
| Account/leaderboard buttons | `Haptics.Light` |

---

## State Management (`src/lib/store.ts`)

### Zustand with AsyncStorage persistence

Persisted keys: `cardPool`, `poolExcludeIds`, `cachedOutbox`

Storage key: `'cards-storage'`

### Key Types

```typescript
Card: { id, video_url, sender_id, creator_username, emoji_tallies, total_wins, comment_count }
```

Note: `video_url` field name is a legacy artifact — it now contains image URLs.

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

### Store Actions

| Action | What it does | Blocks UI? |
|--------|-------------|------------|
| `fetchCardPool(count, excludeIds)` | RPC → append cards to pool | No (async, UI shows loading only on first load) |
| `popChallenger(currentCardIds, excludeSenderIds)` | Pop next card from pool, avoid same-creator if possible | No (instant, synchronous) |
| `reportJudgment(...)` | Fire-and-forget RPC call | **Never** |
| `returnUnusedCards(cardIds)` | Fire-and-forget fuel refund for unplayed pool cards | **Never** |
| `heartbeat()` | Update `last_active_at` | No |

---

## Independent Slot Architecture (MatchupView)

Each image slot is managed independently.

### State

```typescript
const [topCard, setTopCard] = useState<Card>(initialCardA);
const [bottomCard, setBottomCard] = useState<Card>(initialCardB);

const topCardIdRef = useRef(initialCardA.id);
const bottomCardIdRef = useRef(initialCardB.id);
const topSenderIdRef = useRef(initialCardA.sender_id);
const bottomSenderIdRef = useRef(initialCardB.sender_id);
```

All mutable data read inside `handleYeet` uses refs (not state) to avoid stale closures.

### Render Structure

```tsx
{/* TOP SLOT — key on Reanimated.View for fresh native layer */}
<Reanimated.View key={topCard.id} style={[styles.videoHalf, topAnimatedStyle]}>
    <CardFace card={topCard} />
</Reanimated.View>

<View style={styles.seam} />

{/* BOTTOM SLOT */}
<Reanimated.View key={bottomCard.id} style={[styles.videoHalf, bottomAnimatedStyle]}>
    <CardFace card={bottomCard} />
</Reanimated.View>
```

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
    leaderboard.tsx    — Top images by wins
    settings.tsx       — Language, account settings
```

### Main Screen (`(main)/index.tsx`)

```
┌─────────────────────────────┐
│ [👤]                   [🏆] │  ← Floating buttons (z-index 20)
│                             │
│  ┌───────────────────────┐  │
│  │     TOP IMAGE         │  │  ← Reanimated.View key={topCard.id}
│  │                       │  │     └ CardFace card={topCard}
│  ├───────────────────────┤  │  ← 2px dark seam
│  │     BOTTOM IMAGE      │  │  ← Reanimated.View key={bottomCard.id}
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
| `background` | `#121212` | Near-black — app chrome, slot backgrounds |
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
| `seam` | `#2A2A2A` | The 2px line between image slots |
| `seamGlow` | `#E8E4DF` | Off-white glow on touch near seam |
| `fonts.base` | `Verdana` | All UI text |
| `fonts.mono` | `Menlo` | Numbers: win counts, ranks, timestamps |

Images remain edge-to-edge, `contentFit="cover"`, no border radius.

---

## Known Issues & Next Steps

1. **No judgment retry queue.** `reportJudgment` is fire-and-forget. If the network call fails, that judgment is lost. Acceptable for beta.

2. **Images are full camera resolution.** Camera captures at native resolution. `contentFit="cover"` handles display cropping. No server-side resizing yet.

3. **PostLogSheet exists but is not wired** to any screen.

4. **Pool persistence across sessions.** `cardPool` and `poolExcludeIds` are persisted to AsyncStorage. On cold start, stale cards are returned to the server via `returnUnusedCards`, the pool is cleared, and a fresh batch is fetched.

5. **`video_url` column name.** The DB column and Card type still use `video_url` — it now stores image URLs. Renaming is a future migration.
