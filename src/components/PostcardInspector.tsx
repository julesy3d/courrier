import { Ionicons } from '@expo/vector-icons';
import {
    Blur,
    Canvas,
    Group,
    Image,
    Rect,
    RoundedRect,
    Skia,
    useImage,
    LinearGradient,
    RadialGradient,
    vec,
} from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import CommentsSheet from './CommentsSheet';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
    runOnJS,
    useAnimatedReaction,
    useAnimatedStyle,
    useDerivedValue,
    useSharedValue,
    withSpring,
    withTiming,
    SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../lib/i18n';
import {
    IMAGE_INSET,
} from '../lib/postcardLayout';
import { Comment, useStore } from '../lib/store';

// ── Dimensions ──────────────────────────────────────────────
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const INSPECTOR_CARD_WIDTH = screenWidth - 80;
const INSPECTOR_CARD_HEIGHT = INSPECTOR_CARD_WIDTH / (297 / 422);

// ── Helpers ─────────────────────────────────────────────────
function clamp(val: number, min: number, max: number) {
    'worklet';
    return Math.min(Math.max(val, min), max);
}

const SHADOW_COLOR = Skia.Color('rgba(0,0,0,0.3)');

// ── Hooks ─────────────────────────────────────────────────
function useLightLayerValues(tiltX: SharedValue<number>, tiltY: SharedValue<number>, cardWidth: number, cardHeight: number) {
    const glareAngle = useDerivedValue(() => Math.atan2(tiltX.value, tiltY.value));
    const glareOffset = useDerivedValue(() => {
        const magnitude = Math.sqrt(tiltX.value ** 2 + tiltY.value ** 2);
        return (magnitude / 15) * 0.3;
    });
    const glareStart = useDerivedValue(() => {
        const angle = glareAngle.value;
        const radius = Math.max(cardWidth, cardHeight) * 0.8;
        const offset = glareOffset.value * radius * 2;
        const cx = cardWidth / 2;
        const cy = cardHeight / 2;
        return vec(
            cx - Math.cos(angle) * radius + Math.sin(angle) * offset,
            cy - Math.sin(angle) * radius - Math.cos(angle) * offset
        );
    });
    const glareEnd = useDerivedValue(() => {
        const angle = glareAngle.value;
        const radius = Math.max(cardWidth, cardHeight) * 0.8;
        const offset = glareOffset.value * radius * 2;
        const cx = cardWidth / 2;
        const cy = cardHeight / 2;
        return vec(
            cx + Math.cos(angle) * radius + Math.sin(angle) * offset,
            cy + Math.sin(angle) * radius - Math.cos(angle) * offset
        );
    });

    const specularCenter = useDerivedValue(() => vec(
        cardWidth / 2 + tiltY.value * 8,
        cardHeight / 2 + tiltX.value * 8
    ));

    const fresnelStart = useDerivedValue(() => vec(cardWidth / 2, cardHeight / 2));
    const fresnelEnd = useDerivedValue(() => vec(
        cardWidth / 2 + tiltY.value * 20,
        cardHeight / 2 + tiltX.value * 20
    ));
    const fresnelOpacity = useDerivedValue(() => Math.min(1, (Math.abs(tiltX.value) + Math.abs(tiltY.value)) / 30));

    const innerShadowLeft = useDerivedValue(() => clamp(tiltY.value / 15, 0, 1));
    const innerShadowRight = useDerivedValue(() => clamp(-tiltY.value / 15, 0, 1));
    const innerShadowTop = useDerivedValue(() => clamp(-tiltX.value / 15, 0, 1));
    const innerShadowBottom = useDerivedValue(() => clamp(tiltX.value / 15, 0, 1));

    return { glareStart, glareEnd, specularCenter, fresnelStart, fresnelEnd, fresnelOpacity, innerShadowLeft, innerShadowRight, innerShadowTop, innerShadowBottom };
}

// ── Props ───────────────────────────────────────────────────
interface PostcardInspectorProps {
    letter: any;
    post: any;
    senderName: string;
    onDismiss: () => void;
    mode?: 'inspect' | 'preview';
    onRetake?: () => void;
    onSend?: () => void;
}

export default function PostcardInspector({
    letter,
    post,
    senderName,
    onDismiss,
    mode = 'inspect',
    onRetake,
    onSend,
}: PostcardInspectorProps) {
    const { t, locale } = useTranslation();
    const insets = useSafeAreaInsets();
    const cardWidth = INSPECTOR_CARD_WIDTH;
    const cardHeight = INSPECTOR_CARD_HEIGHT;

    const [showComments, setShowComments] = useState(false);
    const [commentCount, setCommentCount] = useState(0);

    const fetchCommentCount = useCallback(() => {
        if (post?.id) {
            useStore.getState().fetchComments(post.id)
                .then((comments: Comment[]) => setCommentCount(comments.length))
                .catch(() => {});
        }
    }, [post?.id]);

    useEffect(() => {
        fetchCommentCount();
    }, [fetchCommentCount]);

    const handleCloseComments = useCallback(() => {
        setShowComments(false);
        fetchCommentCount();
    }, [fetchCommentCount]);

    // Fade IN/OUT animation
    const overlayOpacity = useSharedValue(0);

    useEffect(() => {
        overlayOpacity.value = withTiming(1, { duration: 250 });
    }, []);

    const handleDismiss = () => {
        overlayOpacity.value = withTiming(0, { duration: 200 }, (finished) => {
            if (finished) runOnJS(onDismiss)();
        });
    };

    const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));

    const CANVAS_PADDING = 80;
    const canvasWidth = cardWidth + CANVAS_PADDING * 2;
    const canvasHeight = cardHeight + CANVAS_PADDING * 2;

    // Vertical centering — offset upward to leave room for date + reply below
    const cardTop = (screenHeight - cardHeight) / 2 - 40;
    const cardLeft = 40;

    // ── Load Skia assets ────────────────────────────────────
    const rectoTexture = useImage(require('../assets/images/postcard_recto.webp'));
    const versoTextureFR = useImage(require('../assets/images/postcard_verso_FR.webp'));
    const versoTextureENG = useImage(require('../assets/images/postcard_verso_ENG.webp'));
    const versoTexture = locale === 'fr' ? versoTextureFR : versoTextureENG;
    const rectoPhoto = useImage(post?.recto_url);
    const selfiePhoto = useImage(post?.selfie_url);

    // ── Shared values for gesture ───────────────────────────
    const flipAngle = useSharedValue(0); // for flip (0 or 180)
    const tiltX = useSharedValue(0);     // pitch (forward/back)
    const tiltY = useSharedValue(0);     // yaw (left/right)
    const isFlipped = useSharedValue(false);

    // ── Flip mid-progress (peaks at 1.0 when angle = 90°) ──
    const flipMidProgress = useDerivedValue(() => {
        const progress = Math.abs(flipAngle.value) / 180;
        return 1 - Math.abs(progress - 0.5) * 2;
    });

    // ── Single center-axis card transform with lift ─────────
    const cardTransform = useDerivedValue(() => {
        const lift = -flipMidProgress.value * 20; // card rises 20px at 90°
        return [
            { perspective: 800 },
            { translateY: lift },
            { rotateX: ((-tiltX.value) * Math.PI) / 180 },
            { rotateY: ((tiltY.value + flipAngle.value) * Math.PI) / 180 },
        ];
    });

    // ── Face visibility ─────────────────────────────────────
    const combinedTiltY = useDerivedValue(() => tiltY.value + flipAngle.value);
    const rectoOpacity = useDerivedValue(() => Math.abs(combinedTiltY.value) > 90 ? 0 : 1);
    const versoOpacity = useDerivedValue(() => Math.abs(combinedTiltY.value) > 90 ? 1 : 0);

    // ── Skia Light Layer & Parallax Values ──────────────────
    const versoTiltY = useDerivedValue(() => -tiltY.value);
    const rectoLight = useLightLayerValues(tiltX, tiltY, cardWidth, cardHeight);
    const versoLight = useLightLayerValues(tiltX, versoTiltY, cardWidth, cardHeight);

    const PARALLAX_BLEED = 8;
    const photoClipRect = useMemo(() =>
        Skia.XYWHRect(IMAGE_INSET, IMAGE_INSET, cardWidth - IMAGE_INSET * 2, cardHeight - IMAGE_INSET * 2),
        [cardWidth, cardHeight]
    );

    const rectoPhotoOffsetX = useDerivedValue(() => -tiltY.value * 0.4);
    const rectoPhotoOffsetY = useDerivedValue(() => tiltX.value * 0.4);
    const rectoPhotoTransform = useDerivedValue(() => [
        { translateX: rectoPhotoOffsetX.value },
        { translateY: rectoPhotoOffsetY.value },
    ]);

    const versoPhotoOffsetX = useDerivedValue(() => versoTiltY.value * 0.4);
    const versoPhotoOffsetY = useDerivedValue(() => tiltX.value * 0.4);
    const versoPhotoTransform = useDerivedValue(() => [
        { translateX: versoPhotoOffsetX.value },
        { translateY: versoPhotoOffsetY.value },
    ]);

    // ── Shadow — grows at mid-flip ───────────────────────────
    const shadowTransform = useDerivedValue(() => [
        { translateX: tiltY.value * -0.5 },
        { translateY: -tiltX.value * 0.5 + 10 + flipMidProgress.value * 6 },
    ]);
    const shadowBlur = useDerivedValue(() =>
        12 + Math.abs(tiltX.value) * 0.3 + flipMidProgress.value * 8
    );

    // ── Gestures ────────────────────────────────────────────
    const tapGesture = Gesture.Tap()
        .maxDuration(300)
        .maxDistance(15)
        .onEnd((e) => {
            const isOutsideX = e.x < CANVAS_PADDING || e.x > CANVAS_PADDING + cardWidth;
            const isOutsideY = e.y < CANVAS_PADDING || e.y > CANVAS_PADDING + cardHeight;

            if (isOutsideX || isOutsideY) {
                runOnJS(handleDismiss)();
            } else {
                const flipTarget = isFlipped.value ? 0 : 180;
                // Tap on card → flip
                flipAngle.value = withSpring(flipTarget, {
                    damping: 26,
                    stiffness: 180,
                    mass: 0.8,
                });
                isFlipped.value = !isFlipped.value;
                runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
            }
        });

    const lastHapticAngle = useRef(0);

    const panGesture = Gesture.Pan()
        .onUpdate((e) => {
            tiltX.value = clamp(e.translationY / 8, -15, 15);
            tiltY.value = clamp(e.translationX / 8, -15, 15);

            const currentAngle = Math.sqrt(tiltX.value ** 2 + tiltY.value ** 2);
            if (Math.abs(currentAngle - lastHapticAngle.current) > 5) {
                lastHapticAngle.current = currentAngle;
                runOnJS(Haptics.selectionAsync)();
            }
        })
        .onEnd(() => {
            tiltX.value = withSpring(0, { damping: 60, stiffness: 80, mass: 2.5 });
            tiltY.value = withSpring(0, { damping: 60, stiffness: 80, mass: 2.5 });
            lastHapticAngle.current = 0;
        });

    const composedGesture = Gesture.Exclusive(panGesture, tapGesture);

    // ── Haptics: detect crossing ±90° ───────────────────────
    useAnimatedReaction(
        () => flipAngle.value,
        (current, previous) => {
            if (previous !== null) {
                const crossedForward = (previous < 90 && current >= 90) || (previous > -90 && current <= -90);
                const crossedBack = (previous > 90 && current <= 90) || (previous < -90 && current >= -90);
                if (crossedForward || crossedBack) {
                    runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
                }
            }
        }
    );

    const { dateString, bottomOffset } = useMemo(() => {
        const dateString = letter.sent_at
            ? new Date(letter.sent_at).toLocaleDateString(undefined, { dateStyle: 'full' } as any)
            : '';
        const bottomOffset = cardTop + cardHeight + 20;

        return { dateString, bottomOffset };
    }, [letter.sent_at, cardTop, cardHeight]);

    const cardOrigin = useMemo(() => Skia.Point(CANVAS_PADDING + cardWidth / 2, CANVAS_PADDING + cardHeight / 2), [cardWidth, cardHeight]);
    const versoOrigin = useMemo(() => Skia.Point(cardWidth / 2, cardHeight / 2), [cardWidth, cardHeight]);
    const cardClip = useMemo(() =>
        Skia.RRectXY(Skia.XYWHRect(0, 0, cardWidth, cardHeight), 8, 8),
        [cardWidth, cardHeight]
    );

    const renderLightAndGrain = (light: ReturnType<typeof useLightLayerValues>, isVerso: boolean) => (
        <>
            {/* Layer 1: Glare (diffuse wash) */}
            <Group blendMode="overlay">
                <Rect x={0} y={0} width={cardWidth} height={cardHeight}>
                    <LinearGradient
                        start={light.glareStart}
                        end={light.glareEnd}
                        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0)']}
                    />
                </Rect>
            </Group>

            {/* Layer 2: Specular (inset to photo bounds) */}
            <Group blendMode="softLight">
                <Rect
                    x={IMAGE_INSET}
                    y={IMAGE_INSET}
                    width={cardWidth - IMAGE_INSET * 2}
                    height={cardHeight - IMAGE_INSET * 2}
                >
                    <RadialGradient
                        c={light.specularCenter}
                        r={cardWidth * 2.0}
                        colors={['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.02)', 'rgba(255,255,255,0)']}
                    />
                    <Blur blur={15} />
                </Rect>
            </Group>

            {/* Layer 3: Fresnel edge catch */}
            <Group blendMode="screen" opacity={light.fresnelOpacity}>
                <Rect x={0} y={0} width={cardWidth} height={cardHeight}>
                    <LinearGradient
                        start={light.fresnelStart}
                        end={light.fresnelEnd}
                        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.15)']}
                    />
                </Rect>
            </Group>

            {/* ── Inner edge shadows (thickness simulation) ── */}
            {/* Left inner shadow — visible when tilting right */}
            <Group opacity={light.innerShadowLeft}>
                <Rect x={0} y={0} width={12} height={cardHeight}>
                    <LinearGradient
                        start={vec(0, 0)}
                        end={vec(12, 0)}
                        colors={['rgba(0,0,0,0.12)', 'rgba(0,0,0,0)']}
                    />
                </Rect>
            </Group>

            {/* Right inner shadow — visible when tilting left */}
            <Group opacity={light.innerShadowRight}>
                <Rect x={cardWidth - 12} y={0} width={12} height={cardHeight}>
                    <LinearGradient
                        start={vec(cardWidth, 0)}
                        end={vec(cardWidth - 12, 0)}
                        colors={['rgba(0,0,0,0.12)', 'rgba(0,0,0,0)']}
                    />
                </Rect>
            </Group>

            {/* Top inner shadow — visible when tilting toward viewer */}
            <Group opacity={light.innerShadowTop}>
                <Rect x={0} y={0} width={cardWidth} height={12}>
                    <LinearGradient
                        start={vec(0, 0)}
                        end={vec(0, 12)}
                        colors={['rgba(0,0,0,0.12)', 'rgba(0,0,0,0)']}
                    />
                </Rect>
            </Group>

            {/* Bottom inner shadow — visible when tilting away */}
            <Group opacity={light.innerShadowBottom}>
                <Rect x={0} y={cardHeight - 12} width={cardWidth} height={12}>
                    <LinearGradient
                        start={vec(0, cardHeight)}
                        end={vec(0, cardHeight - 12)}
                        colors={['rgba(0,0,0,0.12)', 'rgba(0,0,0,0)']}
                    />
                </Rect>
            </Group>
        </>
    );

    return (
        <Reanimated.View style={[StyleSheet.absoluteFillObject, overlayStyle]} pointerEvents="box-none">
            {/* Dark backdrop */}
            <View style={[StyleSheet.absoluteFillObject]}>
                <TouchableOpacity
                    activeOpacity={1}
                    style={[StyleSheet.absoluteFillObject, {
                        backgroundColor: mode === 'preview' ? 'rgba(245,242,238,0.97)' : 'rgba(0,0,0,0.5)',
                    }]}
                    onPress={handleDismiss}
                />
            </View>

            {mode === 'preview' && (
                <TouchableOpacity
                    onPress={() => onDismiss()}
                    style={{
                        position: 'absolute',
                        top: insets.top + 12,
                        right: 16,
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: 'rgba(255,255,255,0.15)',
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: 'rgba(255,255,255,0.2)',
                        justifyContent: 'center',
                        alignItems: 'center',
                        zIndex: 10,
                    }}
                >
                    <Ionicons name="close" size={22} color="rgba(255,255,255,0.8)" />
                </TouchableOpacity>
            )}

            {/* Card — Skia Canvas with gesture */}
            <GestureDetector gesture={composedGesture}>
                <View style={{
                    position: 'absolute',
                    top: cardTop - CANVAS_PADDING,
                    left: cardLeft - CANVAS_PADDING,
                    width: canvasWidth,
                    height: canvasHeight,
                }}>
                    <Canvas style={{ flex: 1 }}>
                        {/* ── Shadow ── */}
                        <Group transform={shadowTransform}>
                            <RoundedRect
                                x={CANVAS_PADDING}
                                y={CANVAS_PADDING}
                                width={cardWidth}
                                height={cardHeight}
                                r={8}
                                color={SHADOW_COLOR}
                            >
                                <Blur blur={shadowBlur} />
                            </RoundedRect>
                        </Group>

                        {/* ── Card ── */}
                        <Group transform={cardTransform} origin={cardOrigin}>
                            <Group transform={[{ translateX: CANVAS_PADDING }, { translateY: CANVAS_PADDING }]}>
                                {/* ── Rounded Corners Clip ── */}
                                <Group clip={cardClip}>
                                    {/* ── RECTO (scene photo — full bleed) ── */}
                                    <Group opacity={rectoOpacity}>
                                        {rectoTexture && (
                                            <Image
                                                image={rectoTexture}
                                                x={0} y={0}
                                                width={cardWidth}
                                                height={cardHeight}
                                                fit="cover"
                                            />
                                        )}
                                        {rectoPhoto && (
                                            <Group clip={photoClipRect}>
                                                <Group transform={rectoPhotoTransform}>
                                                    <Image
                                                        image={rectoPhoto}
                                                        x={IMAGE_INSET - PARALLAX_BLEED}
                                                        y={IMAGE_INSET - PARALLAX_BLEED}
                                                        width={cardWidth - IMAGE_INSET * 2 + PARALLAX_BLEED * 2}
                                                        height={cardHeight - IMAGE_INSET * 2 + PARALLAX_BLEED * 2}
                                                        fit="cover"
                                                    />
                                                </Group>
                                            </Group>
                                        )}
                                        {renderLightAndGrain(rectoLight, false)}
                                    </Group>

                                    {/* ── VERSO (selfie — full bleed, mirrored for flip) ── */}
                                    <Group
                                        opacity={versoOpacity}
                                        transform={[{ rotateY: Math.PI }]}
                                        origin={versoOrigin}
                                    >
                                        {/* Same paper texture as base — makes it feel like a real card */}
                                        {rectoTexture && (
                                            <Image
                                                image={rectoTexture}
                                                x={0} y={0}
                                                width={cardWidth}
                                                height={cardHeight}
                                                fit="cover"
                                            />
                                        )}
                                        {/* Selfie photo inset — same dimensions as recto photo */}
                                        {selfiePhoto ? (
                                            <Group clip={photoClipRect}>
                                                <Group transform={versoPhotoTransform}>
                                                    <Image
                                                        image={selfiePhoto}
                                                        x={IMAGE_INSET - PARALLAX_BLEED}
                                                        y={IMAGE_INSET - PARALLAX_BLEED}
                                                        width={cardWidth - IMAGE_INSET * 2 + PARALLAX_BLEED * 2}
                                                        height={cardHeight - IMAGE_INSET * 2 + PARALLAX_BLEED * 2}
                                                        fit="cover"
                                                    />
                                                </Group>
                                            </Group>
                                        ) : versoTexture ? (
                                            // Fallback to verso paper texture if no selfie
                                            <Image
                                                image={versoTexture}
                                                x={0} y={0}
                                                width={cardWidth}
                                                height={cardHeight}
                                                fit="cover"
                                            />
                                        ) : null}

                                        {renderLightAndGrain(versoLight, true)}
                                    </Group>
                                </Group>
                            </Group>
                        </Group>
                    </Canvas>
                </View>
            </GestureDetector>

            {/* Sender name + comment button / or Preview actions — below card */}
            <View style={{
                position: 'absolute',
                top: bottomOffset,
                left: 0,
                right: 0,
                alignItems: 'center',
            }}>
                {mode === 'inspect' ? (
                    <>
                        <Text style={{
                            fontFamily: 'Avenir Next',
                            fontSize: 14,
                            fontWeight: '400',
                            color: '#FAF9F6',
                            textAlign: 'center',
                            textShadowColor: 'rgba(0,0,0,0.5)',
                            textShadowOffset: { width: 0, height: 1 },
                            textShadowRadius: 3,
                        }}>
                            {senderName}
                        </Text>
                        <Text style={{
                            fontFamily: 'Avenir Next',
                            fontSize: 12,
                            fontWeight: '300',
                            color: 'rgba(250,249,246,0.5)',
                            marginTop: 4,
                            textShadowColor: 'rgba(0,0,0,0.5)',
                            textShadowOffset: { width: 0, height: 1 },
                            textShadowRadius: 3,
                        }}>
                            {dateString}
                        </Text>

                        {/* Comment button */}
                        <TouchableOpacity
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                setShowComments(true);
                            }}
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                marginTop: 16,
                                padding: 10,
                            }}
                        >
                            <Ionicons name="chatbubble-outline" size={20} color="rgba(250,249,246,0.8)" />
                            {commentCount > 0 && (
                                <Text style={{
                                    fontFamily: 'Avenir Next',
                                    fontSize: 13,
                                    fontWeight: '500',
                                    color: 'rgba(250,249,246,0.8)',
                                    marginLeft: 6,
                                }}>
                                    {commentCount}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </>
                ) : (
                    /* Preview mode — Retake / Send buttons */
                    <View style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        width: '100%',
                        paddingHorizontal: 40,
                        marginTop: 8,
                    }}>
                        <TouchableOpacity
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                onRetake?.();
                            }}
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                padding: 14,
                            }}
                        >
                            <Ionicons name="refresh-outline" size={20} color="rgba(255,255,255,0.8)" />
                            <Text style={{
                                fontFamily: 'Avenir Next',
                                fontSize: 16,
                                fontWeight: '500',
                                color: 'rgba(255,255,255,0.8)',
                                marginLeft: 8,
                            }}>
                                {t('capture.retake' as any) || 'Retake'}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                onSend?.();
                            }}
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                backgroundColor: 'rgba(255,255,255,0.15)',
                                borderRadius: 14,
                                paddingVertical: 14,
                                paddingHorizontal: 24,
                                borderWidth: StyleSheet.hairlineWidth,
                                borderColor: 'rgba(255,255,255,0.3)',
                            }}
                        >
                            <Text style={{
                                fontFamily: 'Avenir Next',
                                fontSize: 16,
                                fontWeight: '600',
                                color: 'rgba(255,255,255,0.95)',
                                marginRight: 8,
                            }}>
                                {t('capture.send' as any) || 'Send'}
                            </Text>
                            <Ionicons name="paper-plane-outline" size={18} color="rgba(255,255,255,0.95)" />
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            {mode === 'inspect' && showComments && post && (
                <CommentsSheet
                    postId={post.id}
                    onClose={handleCloseComments}
                />
            )}
        </Reanimated.View>
    );
}
