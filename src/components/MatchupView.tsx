import React, { useState, useRef, useCallback } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Reanimated, {
    SharedValue,
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    Easing,
    runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer } from 'expo-audio';
import { Card, useStore } from '../lib/store';
import CardFace from './CardFace';
import { prefetchVideo } from '../lib/videoCache';
import { YEET_SOUND } from '../lib/sounds';
import { Theme } from '../theme';

// Yeet slot encoding for shared value (avoids React state re-renders)
const YEET_NONE = 0;
const YEET_TOP = 1;
const YEET_BOTTOM = 2;

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const SEAM_ZONE_HALF = 40;
const YEET_THRESHOLD = 60;
const GLOW_SIZE = 80;

// ─── Yeet animation tuning ───
const YEET_DURATION = 500;
const YEET_TRANSLATE_Y = SCREEN_HEIGHT;
const YEET_TRANSLATE_X_MAX = 140;
const YEET_ROTATION = 40;

// Delay before ending when pool is empty (let animation play)
const SWAP_DELAY_MS = 200;

export type Phase = 'READY' | 'YEETING';

function SeamGlow({ x, y, opacity }: {
    x: SharedValue<number>;
    y: SharedValue<number>;
    opacity: SharedValue<number>;
}) {
    const style = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [
            { translateX: x.value - GLOW_SIZE / 2 },
            { translateY: y.value - GLOW_SIZE / 2 },
        ],
    }));

    return (
        <Reanimated.View style={[glowStyles.glow, style]} pointerEvents="none" />
    );
}

const glowStyles = StyleSheet.create({
    glow: {
        position: 'absolute',
        width: GLOW_SIZE,
        height: GLOW_SIZE,
        borderRadius: GLOW_SIZE / 2,
        backgroundColor: Theme.colors.accentMuted,
        shadowColor: Theme.colors.seamGlow,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
    },
});


interface MatchupViewProps {
    initialCardA: Card;
    initialCardB: Card;
    onJudged: () => void;
    onPhaseChange?: (phase: Phase) => void;
}

export default function MatchupView({ initialCardA, initialCardB, onJudged, onPhaseChange }: MatchupViewProps) {
    const { reportJudgment, popChallenger } = useStore();
    const yeetPlayer = useAudioPlayer(YEET_SOUND);
    const hasJudgedRef = useRef(false);
    const streakRef = useRef(0);
    const streakCardRef = useRef<string | null>(null);
    const [containerHeight, setContainerHeight] = useState(SCREEN_HEIGHT);

    // ═══════════════════════════════════════════════════════════════
    // INDEPENDENT SLOT STATE
    // ═══════════════════════════════════════════════════════════════
    const [topCard, setTopCard] = useState<Card>(initialCardA);
    const [bottomCard, setBottomCard] = useState<Card>(initialCardB);

    const topCardIdRef = useRef(initialCardA.id);
    const bottomCardIdRef = useRef(initialCardB.id);
    const topSenderIdRef = useRef(initialCardA.sender_id);
    const bottomSenderIdRef = useRef(initialCardB.sender_id);

    // Full card objects in refs (for ghost overlay — avoids stale closures in handleYeet)
    const topCardObjRef = useRef<Card>(initialCardA);
    const bottomCardObjRef = useRef<Card>(initialCardB);

    // Ghost overlay: the yeeted card flies away on top while the new challenger appears underneath
    const [ghost, setGhost] = useState<{ card: Card; slot: 'top' | 'bottom' } | null>(null);

    // Track which slot is being yeeted as a shared value (NOT React state).
    // Using React state here caused re-renders that triggered native layout
    // invalidation on the surviving slot's AVPlayerLayer, freezing the video.
    const yeetingSlotSV = useSharedValue(YEET_NONE);

    // --- Yeet animation values (shared between both slots, only one yeeted at a time) ---
    const yeetTranslateY = useSharedValue(0);
    const yeetTranslateX = useSharedValue(0);
    const yeetRotation = useSharedValue(0);

    // --- Glow state ---
    const glowX = useSharedValue(0);
    const glowY = useSharedValue(0);
    const glowOpacity = useSharedValue(0);
    const displayX = useSharedValue(0);
    const displayY = useSharedValue(0);

    const seamY = containerHeight / 2;

    // --- Judge handler ---
    const handleYeet = useCallback((direction: 'up' | 'down') => {
        if (hasJudgedRef.current) return;
        hasJudgedRef.current = true;

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        // DEBUG: yeet sound disabled to test if freeze is audio-related
        // yeetPlayer.seekTo(0);
        // setTimeout(() => yeetPlayer.play(), 50);

        const deadSlot: 'top' | 'bottom' = direction === 'up' ? 'top' : 'bottom';
        const keptCardId = direction === 'up' ? bottomCardIdRef.current : topCardIdRef.current;

        if (onPhaseChange) onPhaseChange('YEETING');
        glowOpacity.value = withTiming(0, { duration: 100 });

        // ── Streak tracking ──
        if (keptCardId === streakCardRef.current) {
            streakRef.current += 1;
        } else {
            streakRef.current = 1;
            streakCardRef.current = keptCardId;
        }
        const currentStreak = streakRef.current;

        // ── Reset animation values ──
        yeetTranslateY.value = 0;
        yeetTranslateX.value = 0;
        yeetRotation.value = 0;

        // ── Randomize the fling ──
        const lateralSign = Math.random() > 0.5 ? 1 : -1;
        const lateralAmount = YEET_TRANSLATE_X_MAX * (0.5 + Math.random() * 0.5);
        const rotationAmount = YEET_ROTATION * (0.7 + Math.random() * 0.3);
        const yeetEasing = Easing.out(Easing.quad);
        const flingY = direction === 'up' ? -YEET_TRANSLATE_Y : YEET_TRANSLATE_Y;

        // ── Fire the animation (shared values — ghost or slot reads them) ──
        requestAnimationFrame(() => {
            yeetTranslateY.value = withTiming(flingY, { duration: YEET_DURATION, easing: yeetEasing });
            yeetTranslateX.value = withTiming(lateralAmount * lateralSign, { duration: YEET_DURATION, easing: yeetEasing });
            yeetRotation.value = withTiming(rotationAmount * lateralSign, { duration: YEET_DURATION, easing: yeetEasing });
        });

        // ── Fire judgment in background (NEVER await) ──
        reportJudgment(
            topCardIdRef.current,
            bottomCardIdRef.current,
            keptCardId,
            null,
            currentStreak,
        );

        // ── Pop next challenger ──
        const keptSenderId = direction === 'up' ? bottomSenderIdRef.current : topSenderIdRef.current;
        const challenger = popChallenger([keptCardId], [keptSenderId]);

        if (challenger) {
            // Ghost approach: mount an overlay with the dead card flying away,
            // immediately swap the slot underneath to the new challenger.
            const deadCard = deadSlot === 'top' ? topCardObjRef.current : bottomCardObjRef.current;
            setGhost({ card: deadCard, slot: deadSlot });

            // Swap the dead slot immediately — new card starts loading under the ghost
            if (deadSlot === 'top') {
                setTopCard(challenger);
                topCardIdRef.current = challenger.id;
                topSenderIdRef.current = challenger.sender_id;
                topCardObjRef.current = challenger;
            } else {
                setBottomCard(challenger);
                bottomCardIdRef.current = challenger.id;
                bottomSenderIdRef.current = challenger.sender_id;
                bottomCardObjRef.current = challenger;
            }

            // Prefetch in background (likely already cached from pool fetch)
            prefetchVideo(challenger.video_url).catch(() => {});

            // Clear ghost after animation completes.
            // Do NOT reset shared values here — React takes a frame to unmount
            // the ghost, and resetting transforms to 0 would flash it back to
            // its original position for one frame. Values reset at next yeet start.
            setTimeout(() => {
                setGhost(null);
                hasJudgedRef.current = false;
                if (onPhaseChange) onPhaseChange('READY');
            }, YEET_DURATION + 50);
        } else {
            // Pool empty: animate the slot directly (no ghost, old behavior)
            yeetingSlotSV.value = deadSlot === 'top' ? YEET_TOP : YEET_BOTTOM;
            setTimeout(() => {
                yeetingSlotSV.value = YEET_NONE;
                yeetTranslateY.value = 0;
                yeetTranslateX.value = 0;
                yeetRotation.value = 0;
                onJudged();
            }, SWAP_DELAY_MS);
        }

    }, [reportJudgment, popChallenger, onJudged, onPhaseChange]);

    // --- Gesture ---
    const panGesture = Gesture.Pan()
        .onBegin((e) => {
            const distFromSeam = Math.abs(e.y - seamY);
            if (distFromSeam > SEAM_ZONE_HALF) return;

            glowX.value = e.x;
            glowY.value = e.y;
            displayX.value = e.x;
            displayY.value = e.y;
            glowOpacity.value = withTiming(1, { duration: 100 });
        })
        .onUpdate((e) => {
            glowX.value = e.x;
            glowY.value = e.y;
            displayX.value = e.x;
            displayY.value = e.y;

            if (Math.abs(e.translationY) > YEET_THRESHOLD) {
                if (e.translationY < 0) {
                    runOnJS(handleYeet)('up');
                } else {
                    runOnJS(handleYeet)('down');
                }
            }
        })
        .onEnd(() => {
            glowOpacity.value = withTiming(0, { duration: 200 });
        })
        .onFinalize(() => {
            glowOpacity.value = withTiming(0, { duration: 200 });
        });

    // --- Animated styles ---
    // Only the yeeted slot gets transforms. The surviving slot returns {}
    // and its native view is never touched by Reanimated during the animation.
    const topAnimatedStyle = useAnimatedStyle(() => {
        if (yeetingSlotSV.value === YEET_TOP) {
            return {
                transform: [
                    { translateY: yeetTranslateY.value },
                    { translateX: yeetTranslateX.value },
                    { rotate: `${yeetRotation.value}deg` },
                ],
            };
        }
        return {};
    });

    const bottomAnimatedStyle = useAnimatedStyle(() => {
        if (yeetingSlotSV.value === YEET_BOTTOM) {
            return {
                transform: [
                    { translateY: yeetTranslateY.value },
                    { translateX: yeetTranslateX.value },
                    { rotate: `${yeetRotation.value}deg` },
                ],
            };
        }
        return {};
    });

    // Ghost animated style — always applies transforms (ghost only exists during animation)
    const ghostAnimatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateY: yeetTranslateY.value },
            { translateX: yeetTranslateX.value },
            { rotate: `${yeetRotation.value}deg` },
        ],
    }));
    const slotHeight = (containerHeight - 2) / 2;

    // --- Render ---
    return (
        <View
            style={styles.container}
            onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
        >
            <GestureDetector gesture={panGesture}>
                <Reanimated.View style={styles.gestureContainer}>

                    {/* TOP SLOT */}
                    <Reanimated.View
                        key={topCard.id}
                        style={[styles.videoHalf, topAnimatedStyle]}
                    >
                        <CardFace
                            card={topCard}
                            isPlaying={true}
                            slot="top"
                        />
                    </Reanimated.View>

                    {/* Seam */}
                    <View style={styles.seam} />

                    {/* BOTTOM SLOT */}
                    <Reanimated.View
                        key={bottomCard.id}
                        style={[styles.videoHalf, bottomAnimatedStyle]}
                    >
                        <CardFace
                            card={bottomCard}
                            isPlaying={true}
                            slot="bottom"
                        />
                    </Reanimated.View>

                    {/* Seam glow */}
                    <SeamGlow x={displayX} y={displayY} opacity={glowOpacity} />

                    {/* Ghost overlay — yeeted card flies away on top while new card plays underneath */}
                    {ghost && (
                        <Reanimated.View
                            key={`ghost-${ghost.card.id}`}
                            style={[
                                {
                                    position: 'absolute',
                                    top: ghost.slot === 'top' ? 0 : slotHeight + 2,
                                    left: 0,
                                    right: 0,
                                    height: slotHeight,
                                    zIndex: 10,
                                    overflow: 'visible' as const,
                                },
                                ghostAnimatedStyle,
                            ]}
                            pointerEvents="none"
                        >
                            <CardFace card={ghost.card} isPlaying={true} slot="ghost" />
                        </Reanimated.View>
                    )}

                </Reanimated.View>
            </GestureDetector>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Theme.colors.background,
    },
    gestureContainer: {
        flex: 1,
    },
    videoHalf: {
        flex: 1,
        overflow: 'visible',
    },
    seam: {
        height: 2,
        backgroundColor: Theme.colors.seam,
    },
});
