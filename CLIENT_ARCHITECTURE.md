# Yeet — Client Architecture

> **Source of truth for the frontend.** If something contradicts this document, this document wins.
> Last updated: 2026-04-18 (v2.2.1 — P1 dead-code purge)

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
| Image Picker | `expo-image-picker` (camera roll) | SDK 55 |
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
| `src/app/(main)/index.tsx` | Main screen. Renders MatchupView or EmptyState. Floating buttons (account top-left, leaderboard top-right, "+" FAB bottom-center always visible). Manages card pool lifecycle: initial fetch, pool-to-matchup popping, refill on resume. |
| `src/components/MatchupView.tsx` | **Core component.** Yeet gesture, independent slot state, local matchup sequencing (winner stays, next challenger from pool), seam glow, yeet animation, ghost overlay. Judgment is fire-and-forget. Key on `Reanimated.View` (not CardFace) for fresh native layers. |
| `src/components/CardFace.tsx` | Image renderer. `expo-image` `Image` with `contentFit="cover"`. Renders optional `caption` overlay (Snapchat-style black bar, bottom third). Accepts `card` and optional `style`. No transition — ghost overlay handles visual masking during swaps. |
| `src/components/PhotoCapture.tsx` | Tap-to-shoot photo capture + camera roll picker (`expo-image-picker`). Front camera default, flip toggle. Crop guide, preview with caption text input (140 chars, tap image to add), retake/send, upload with progress states. |
| `src/lib/store.ts` | Zustand store. Card pool management (`fetchCardPool`, `popChallenger`), fire-and-forget judgment (`reportJudgment`), all backend communication via `supabase.rpc()`. |
| `src/lib/imageUtils.ts` | `uploadCardImage()` — uploads JPEG to `card_videos` bucket (legacy name). |
| `src/components/EmptyState.tsx` | Shown when no matchups available. |
| `src/components/GlassSurface.tsx` | BlurView wrapper. Used by FAB. |
| `src/app/(main)/leaderboard.tsx` | Leaderboard with 3 tabs (Today / All Time / Mine). Brick wall image layout: #1 full-width hero, #2-3 two-up, #4+ four-up rows. Pull to refresh. Tap image for full-screen preview. |
| `src/app/onboarding.tsx` | @username input, uniqueness check, camera permission. |
| `src/app/(main)/profile.tsx` | Username, language toggle, achievements list (stub copy — "Achievements coming soon."). |
| `src/app/(main)/settings.tsx` | Language, account settings. |
| `src/lib/supabase.ts` | Supabase client init. |
| `src/lib/notifications.ts` | Push token registration. |
| `src/lib/i18n.ts` | Locale detection + translation helper. |
| `src/lib/dictionary.ts` | en/fr string dictionary. |
| `src/theme.ts` | Semantic design tokens (colors + fonts). Single source of truth for all visual constants. |

---

## Image Display & Prefetch

Images are rendered via `expo-image`'s `Image` component with `contentFit="cover"`.

### Prefetch Pipeline

`expo-image`'s built-in cache only stores images *after* first display. To ensure instant card swaps, we proactively prefetch using `Image.prefetch(url)`:

1. **`fetchCardPool()`** — after appending new cards to the pool, fires `Image.prefetch()` for every new card (fire-and-forget, all in parallel)
2. **Initial display** — `initPool()` explicitly awaits `Image.prefetch()` for the first 2 cards before setting `isLoading = false`. Spinner stays until both images are cached.
3. **`popChallenger()`** — pre-warms the *next* card in the remaining pool (`Image.prefetch(remaining[0].video_url)`)
4. **`handleJudged()`** — when pool empties and refills, awaits first 2 images before restarting

This is the same architecture as the old video prefetch system, using `Image.prefetch()` instead of the custom `videoCache.ts` download queue.

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

Persisted keys: `cardPool`, `poolExcludeIds`

Storage key: `'cards-storage'`

### Key Types

```typescript
Card: { id, video_url, sender_id, creator_username, total_wins, caption }
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
reportJudgment(cardAId, cardBId, keptCardId)
  → Fire RPC report_judgment(...) — DO NOT AWAIT
  → On error: console.warn (no retry queue yet)
  → The client has already moved to the next matchup
```

### Store Actions

| Action | What it does | Blocks UI? |
|--------|-------------|------------|
| `fetchCardPool(count, excludeIds)` | RPC → append cards to pool | No (async, UI shows loading only on first load) |
| `popChallenger(currentCardIds, excludeSenderIds)` | Pop next card from pool, avoid same-creator if possible | No (instant, synchronous) |
| `reportJudgment(cardAId, cardBId, keptCardId)` | Fire-and-forget RPC call, 3 params | **Never** |
| `returnUnusedCards(cardIds)` | Fire-and-forget fuel refund for unplayed pool cards | **Never** |
| `createCard(videoUrl, caption)` | RPC → insert new post, returns post_id | Yes (awaited during submit flow) |
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
    profile.tsx        — Username, language toggle, achievements stub
    leaderboard.tsx    — 3-tab leaderboard (Today / All Time / Mine), all-day
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

## Daily Game Loop

- Day runs **midnight to midnight UTC**. No submission time gating — FAB always visible.
- `fetch_card_pool` scoped to cards created today (UTC `created_at`). Falls back to any card with fuel if none exist today.
- **Leaderboard** (trophy button) has 3 tabs:
  - **Today** — cards ranked by wins earned today (`get_daily_leaderboard` RPC, UTC date)
  - **All Time** — cards ranked by lifetime `total_wins` (`get_leaderboard` RPC)
  - **Mine** — current user's cards ranked by `total_wins` (direct PostgREST query)
- Brick wall layout: #1 full-width hero, #2-3 two-up, #4+ four-up rows. Pull to refresh.

### Caption / Text Overlay

- During photo preview (after capture or camera roll pick), tap the image to add text (max 140 chars).
- Text stored in `posts.caption` column (nullable text).
- Rendered client-side by `CardFace`: Snapchat-style black semi-transparent bar (`rgba(0,0,0,0.5)`) with centered white text, positioned in the bottom third of the card.
- Passed to `create_card` RPC via `p_caption` parameter. Returned by `fetch_card_pool` in JSON.

---

## Known Issues & Next Steps

1. **No judgment retry queue.** `reportJudgment` is fire-and-forget. If the network call fails, that judgment is lost. Acceptable for beta.

2. **Images are full camera resolution.** Camera captures at native resolution. `contentFit="cover"` handles display cropping. No server-side resizing yet.

3. **Pool persistence across sessions.** `cardPool` and `poolExcludeIds` are persisted to AsyncStorage. On cold start, stale cards are returned to the server via `returnUnusedCards`, the pool is cleared, and a fresh batch is fetched.

4. **`video_url` column name.** The DB column and Card type still use `video_url` — it now stores image URLs. Renaming is a future migration.

5. **Push notifications not wired.** Daily winner notifications need Supabase Edge Functions + pg_cron + Expo Push API. Tokens already in `users.push_token`.

6. **Legacy matchups column names.** The DB uses `viewer_id` (the judge) and `killed_card_id` (the yeeted card). These quirks are cosmetic; don't rename without a dedicated migration.
