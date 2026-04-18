import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Reanimated, {
    SharedValue,
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withDelay,
    withSequence,
    Easing,
    runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { Card, useStore } from '../lib/store';
import CardFace from './CardFace';
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

// ─── Verdict emoji tuning ───
const VERDICT_HOLD_MS = 80;
const VERDICT_FADE_MS = 300;
const VERDICT_EMOJI_SIZE = 200;

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

// ─── Verdict emoji overlay ───
function VerdictEmoji({ emoji, opacity, scale }: {
    emoji: string;
    opacity: SharedValue<number>;
    scale: SharedValue<number>;
}) {
    const style = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ scale: scale.value }],
    }));

    return (
        <Reanimated.View style={[verdictStyles.container, style]} pointerEvents="none">
            <Text style={verdictStyles.emoji}>{emoji}</Text>
        </Reanimated.View>
    );
}

const verdictStyles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 15,
    },
    emoji: {
        fontSize: VERDICT_EMOJI_SIZE,
    },
});

interface MatchupViewProps {
    initialCardA: Card;
    initialCardB: Card;
    onJudged: () => void;
    onPhaseChange?: (phase: Phase) => void;
    onMatchupChanged?: (a: Card, b: Card) => void;
}

export default function MatchupView({ initialCardA, initialCardB, onJudged, onPhaseChange, onMatchupChanged }: MatchupViewProps) {
    const { reportJudgment, popChallenger } = useStore();
    const hasJudgedRef = useRef(false);
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

    // Report current pair up so the parent can persist it across tab remounts
    useEffect(() => {
        onMatchupChanged?.(topCard, bottomCard);
    }, [topCard, bottomCard, onMatchupChanged]);

    // Track which slot is being yeeted as a shared value (NOT React state).
    const yeetingSlotSV = useSharedValue(YEET_NONE);

    // --- Yeet animation values ---
    const yeetTranslateY = useSharedValue(0);
    const yeetTranslateX = useSharedValue(0);
    const yeetRotation = useSharedValue(0);

    // --- Verdict emoji animation values ---
    const [verdict, setVerdict] = useState<{ keptSlot: 'top' | 'bottom' } | null>(null);
    const verdictOpacity = useSharedValue(0);
    const verdictScale = useSharedValue(0.3);

    // --- Glow state ---
    const glowX = useSharedValue(0);
    const glowY = useSharedValue(0);
    const glowOpacity = useSharedValue(0);
    const displayX = useSharedValue(0);
    const displayY = useSharedValue(0);

    const seamY = containerHeight / 2;

    // --- Fire verdict emoji animation ---
    const showVerdict = useCallback((keptSlot: 'top' | 'bottom') => {
        setVerdict({ keptSlot });
        verdictScale.value = 0.3;
        verdictOpacity.value = 1;
        verdictScale.value = withSequence(
            withTiming(1.15, { duration: 120, easing: Easing.out(Easing.back(2)) }),
            withTiming(1, { duration: 80 }),
        );
        verdictOpacity.value = withDelay(
            VERDICT_HOLD_MS,
            withTiming(0, { duration: VERDICT_FADE_MS }),
        );
        // Clear state after animation
        setTimeout(() => setVerdict(null), VERDICT_HOLD_MS + VERDICT_FADE_MS + 50);
    }, []);

    // --- Judge handler ---
    const handleYeet = useCallback((direction: 'up' | 'down') => {
        if (hasJudgedRef.current) return;
        hasJudgedRef.current = true;

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

        const deadSlot: 'top' | 'bottom' = direction === 'up' ? 'top' : 'bottom';
        const keptSlot: 'top' | 'bottom' = direction === 'up' ? 'bottom' : 'top';
        const keptCardId = direction === 'up' ? bottomCardIdRef.current : topCardIdRef.current;

        if (onPhaseChange) onPhaseChange('YEETING');
        glowOpacity.value = withTiming(0, { duration: 100 });

        // ── Show verdict emojis ──
        showVerdict(keptSlot);

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

        // ── Fire the animation ──
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
        );

        // ── Pop next challenger ──
        const keptSenderId = direction === 'up' ? bottomSenderIdRef.current : topSenderIdRef.current;
        const challenger = popChallenger([keptCardId], [keptSenderId]);

        if (challenger) {
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

            // Clear ghost after animation completes.
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

    }, [reportJudgment, popChallenger, onJudged, onPhaseChange, showVerdict]);

    // --- Double-tap handler ---
    const handleDoubleTap = useCallback((y: number) => {
        if (hasJudgedRef.current) return;
        // Tapped on top card → keep top → yeet bottom (down)
        // Tapped on bottom card → keep bottom → yeet top (up)
        if (y < seamY) {
            handleYeet('down');
        } else {
            handleYeet('up');
        }
    }, [seamY, handleYeet]);

    // --- Gestures ---
    const doubleTapGesture = Gesture.Tap()
        .numberOfTaps(2)
        .maxDuration(300)
        .onEnd((e) => {
            runOnJS(handleDoubleTap)(e.y);
        });

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

    // Double-tap can fire anywhere; pan only near seam. Exclusive: pan wins if near seam.
    const composedGesture = Gesture.Exclusive(panGesture, doubleTapGesture);

    // --- Animated styles ---
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

    // Ghost animated style — always applies transforms
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
            <GestureDetector gesture={composedGesture}>
                <Reanimated.View style={styles.gestureContainer}>

                    {/* TOP SLOT */}
                    <Reanimated.View
                        key={topCard.id}
                        style={[styles.videoHalf, topAnimatedStyle]}
                    >
                        <CardFace card={topCard} />
                        {verdict && (
                            <VerdictEmoji
                                emoji={verdict.keptSlot === 'top' ? '✅' : '❌'}
                                opacity={verdictOpacity}
                                scale={verdictScale}
                            />
                        )}
                    </Reanimated.View>

                    {/* Seam */}
                    <View style={styles.seam} />

                    {/* BOTTOM SLOT */}
                    <Reanimated.View
                        key={bottomCard.id}
                        style={[styles.videoHalf, bottomAnimatedStyle]}
                    >
                        <CardFace card={bottomCard} />
                        {verdict && (
                            <VerdictEmoji
                                emoji={verdict.keptSlot === 'bottom' ? '✅' : '❌'}
                                opacity={verdictOpacity}
                                scale={verdictScale}
                            />
                        )}
                    </Reanimated.View>

                    {/* Seam glow */}
                    <SeamGlow x={displayX} y={displayY} opacity={glowOpacity} />

                    {/* Ghost overlay — yeeted card flies away on top while new card appears underneath */}
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
                            <CardFace card={ghost.card} />
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
