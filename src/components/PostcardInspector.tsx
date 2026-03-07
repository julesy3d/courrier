import { Ionicons } from '@expo/vector-icons';
import {
    Blur,
    Canvas,
    Group,
    Image,
    Rect,
    RoundedRect,
    Skia,
    Text as SkiaText,
    useFont,
    useImage
} from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useAnimatedReaction, useDerivedValue, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../lib/i18n';
import {
    IMAGE_INSET,
    STAMP_BOX_CENTER_X,
    STAMP_BOX_CENTER_Y,
    VERSO_CONTENT_LEFT,
    VERSO_CONTENT_RIGHT,
    VERSO_MESSAGE_TOP,
    VERSO_RECIPIENT_ADDR_Y,
    VERSO_RECIPIENT_NAME_Y
} from '../lib/postcardLayout';

// ── Dimensions ──────────────────────────────────────────────
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const INSPECTOR_CARD_WIDTH = screenWidth - 80;
const INSPECTOR_CARD_HEIGHT = INSPECTOR_CARD_WIDTH / (297 / 422);

// ── Helpers ─────────────────────────────────────────────────
function clamp(val: number, min: number, max: number) {
    'worklet';
    return Math.min(Math.max(val, min), max);
}

function seededRandom(seed: string): () => number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        const char = seed.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return () => {
        hash = (hash * 16807 + 0) % 2147483647;
        if (hash < 0) hash += 2147483647;
        return (hash - 1) / 2147483646;
    };
}

function wrapText(text: string, font: any, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
        const testLine = currentLine ? currentLine + ' ' + word : word;
        const width = font.getTextWidth(testLine);
        if (width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = testLine;
        }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
}

// ── Props ───────────────────────────────────────────────────
interface PostcardInspectorProps {
    letter: any;
    senderAddress: string;
    fromName: string;
    toName: string;
    isReturned: boolean;
    recipientAddress?: string;
    onDismiss: () => void;
    onReply: () => void;
}

export default function PostcardInspector({
    letter,
    senderAddress,
    fromName,
    toName,
    isReturned,
    recipientAddress,
    onDismiss,
    onReply,
}: PostcardInspectorProps) {
    const { t, locale } = useTranslation();
    const insets = useSafeAreaInsets();
    const cardWidth = INSPECTOR_CARD_WIDTH;
    const cardHeight = INSPECTOR_CARD_HEIGHT;

    // Fade IN/OUT animation
    const overlayOpacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(overlayOpacity, {
            toValue: 1,
            duration: 250,
            useNativeDriver: true,
        }).start();
    }, []);

    const handleDismiss = () => {
        Animated.timing(overlayOpacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
        }).start(() => {
            onDismiss();
        });
    };

    const CANVAS_PADDING = 80;
    const canvasWidth = cardWidth + CANVAS_PADDING * 2;
    const canvasHeight = cardHeight + CANVAS_PADDING * 2;

    // Vertical centering — offset upward to leave room for date + reply below
    const cardTop = (screenHeight - cardHeight) / 2 - 40;
    const cardLeft = 40;

    // ── Load Skia assets ────────────────────────────────────
    const rectoTexture = useImage(require('../assets/images/postcard_recto.webp'));
    const versoTexture = locale === 'fr'
        ? useImage(require('../assets/images/postcard_verso_FR.webp'))
        : useImage(require('../assets/images/postcard_verso_ENG.webp'));
    const photoImage = useImage(letter.image_url);
    const stampImage = useImage(require('../assets/images/stamp.png'));
    const tamponImage = useImage(require('../assets/images/tampon.png'));

    const font = useFont(require('../assets/fonts/LibreBaskerville-Regular.ttf'), 14);
    const smallFont = useFont(require('../assets/fonts/LibreBaskerville-Regular.ttf'), 11);

    // ── Deterministic stamp/postmark offsets (same as Postcard.tsx) ──
    const deliveredOffsets = useMemo(() => {
        if (!letter.sent_at) {
            return { stampRot: 0, stampDx: 0, stampDy: 0, tamponRot: 0, tamponDx: 0, tamponDy: 0 };
        }
        const rand = seededRandom(letter.sent_at);
        return {
            stampRot: (rand() * 4) - 2,
            stampDx: (rand() * 4) - 2,
            stampDy: (rand() * 4) - 2,
            tamponRot: (rand() * 10) - 5,
            tamponDx: (rand() * 8) - 4,
            tamponDy: (rand() * 6) - 3,
        };
    }, [letter.sent_at]);

    // ── Wrap message body text ──────────────────────────────
    const bodyLines = useMemo(() => {
        if (!font || !letter.body) return [];
        const maxW = cardWidth * (VERSO_CONTENT_RIGHT - VERSO_CONTENT_LEFT) - 8;
        return wrapText(letter.body, font, maxW);
    }, [font, letter.body, cardWidth]);

    // ── Shared values for gesture ───────────────────────────
    const tiltX = useSharedValue(5);   // resting tilt
    const tiltY = useSharedValue(0);
    const isFlipped = useSharedValue(false);

    // ── 3D transform (driven by tilt) ───────────────────────
    const cardTransform = useDerivedValue(() => {
        return [
            { rotateX: (tiltX.value * Math.PI) / 180 },
            { rotateY: (tiltY.value * Math.PI) / 180 },
        ];
    });

    // ── Which face is visible? (numeric for opacity) ────────
    const rectoOpacity = useDerivedValue(() => {
        return Math.abs(tiltY.value) > 90 ? 0 : 1;
    });

    const versoOpacity = useDerivedValue(() => {
        return Math.abs(tiltY.value) > 90 ? 1 : 0;
    });

    const nearEdgeOpacity = useDerivedValue(() => {
        return Math.abs(Math.abs(tiltY.value) - 90) < 10 ? 1 : 0;
    });

    // ── Shadow offsets ──────────────────────────────────────
    const shadowOffsetX = useDerivedValue(() => tiltY.value * -0.3);
    const shadowOffsetY = useDerivedValue(() => tiltX.value * 0.3 + 10);
    const shadowBlur = useDerivedValue(() => 12 + Math.abs(tiltX.value) * 0.2);

    // Shadow transform as a derived value
    const shadowTransform = useDerivedValue(() => {
        return [
            { translateX: tiltY.value * -0.3 },
            { translateY: tiltX.value * 0.3 + 10 },
        ];
    });

    // ── Pan gesture ─────────────────────────────────────────
    const panGesture = Gesture.Pan()
        .onUpdate((e) => {
            tiltY.value = clamp(e.translationX * 0.3, -180, 180);
            tiltX.value = clamp(e.translationY * -0.2, -30, 30);
        })
        .onEnd((e) => {
            const absY = Math.abs(tiltY.value);

            if (absY > 40) {
                // Flip
                const flipTarget = isFlipped.value ? 0 : 180;
                const direction = tiltY.value > 0 ? 1 : -1;
                tiltY.value = withSpring(flipTarget * direction, {
                    damping: 25,
                    stiffness: 200,
                    mass: 0.5,
                    velocity: e.velocityX * 0.15,
                });
                isFlipped.value = !isFlipped.value;
                runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
            } else {
                // Spring back to resting angle
                const restingY = isFlipped.value ? (tiltY.value > 0 ? 180 : -180) : 0;
                tiltY.value = withSpring(restingY, {
                    damping: 22,
                    stiffness: 200,
                });
            }

            // Vertical tilt → slight resting angle
            tiltX.value = withSpring(5, {
                damping: 22,
                stiffness: 200,
            });
        });

    // ── Haptics: detect crossing ±90° ───────────────────────
    useAnimatedReaction(
        () => tiltY.value,
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

    // ── Verso layout constants (in canvas pixels) ───────────
    const versoContentLeft = cardWidth * VERSO_CONTENT_LEFT;
    const versoMaxTextWidth = cardWidth * (VERSO_CONTENT_RIGHT - VERSO_CONTENT_LEFT) - 8;

    // Stamp / postmark positions for verso
    const stampW = cardWidth * 0.285;
    const stampH = stampW * 1.25;
    const stampX = cardWidth * STAMP_BOX_CENTER_X - stampW / 2 + deliveredOffsets.stampDx;
    const stampY = cardHeight * STAMP_BOX_CENTER_Y - stampH / 2 + deliveredOffsets.stampDy;

    const tamponAspect = 280 / 120;
    const tamponH = stampH * 0.74;
    const tamponW = tamponH * tamponAspect;
    const tamponX = Math.max(0, Math.min(
        cardWidth * STAMP_BOX_CENTER_X - tamponW * 0.72 + deliveredOffsets.tamponDx,
        cardWidth - tamponW
    ));
    const tamponY = Math.max(0, Math.min(
        cardHeight * STAMP_BOX_CENTER_Y - tamponH / 2 + deliveredOffsets.tamponDy,
        cardHeight - tamponH
    ));

    // Sender line for verso
    const senderLine = fromName ? `${fromName} — ${senderAddress}` : senderAddress;
    const addressLine = recipientAddress || senderAddress;

    // Date string
    const dateString = letter.sent_at
        ? new Date(letter.sent_at).toLocaleDateString(undefined, { dateStyle: 'full' } as any)
        : '';

    // Bottom offset for date/reply
    const bottomOffset = cardTop + cardHeight + 20;

    return (
        <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: overlayOpacity }]} pointerEvents="box-none">
            {/* Dark backdrop */}
            <TouchableOpacity
                activeOpacity={1}
                style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
                onPress={handleDismiss}
            />

            {/* Card — Skia Canvas with gesture */}
            <GestureDetector gesture={panGesture}>
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
                                r={4}
                                color={Skia.Color('rgba(0,0,0,0.3)')}
                            >
                                <Blur blur={shadowBlur} />
                            </RoundedRect>
                        </Group>

                        {/* ── Card with 3D transform ── */}
                        <Group
                            transform={cardTransform}
                            origin={Skia.Point(CANVAS_PADDING + cardWidth / 2, CANVAS_PADDING + cardHeight / 2)}
                        >
                            <Group transform={[{ translateX: CANVAS_PADDING }, { translateY: CANVAS_PADDING }]}>
                                {/* ── Edge reveal (thin cream strip near 90°) ── */}
                                <Group>
                                    <Rect
                                        x={cardWidth / 2 - 1.5}
                                        y={0}
                                        width={3}
                                        height={cardHeight}
                                        color={Skia.Color('#F5F0EB')}
                                        opacity={nearEdgeOpacity}
                                    />
                                </Group>

                                {/* ── RECTO (photo side) ── */}
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
                                    {photoImage && (
                                        <Image
                                            image={photoImage}
                                            x={IMAGE_INSET} y={IMAGE_INSET}
                                            width={cardWidth - IMAGE_INSET * 2}
                                            height={cardHeight - IMAGE_INSET * 2}
                                            fit="cover"
                                        />
                                    )}
                                </Group>

                                {/* ── VERSO (message side — mirrored) ── */}
                                <Group
                                    opacity={versoOpacity}
                                    transform={[{ scaleX: -1 }]}
                                    origin={Skia.Point(cardWidth / 2, cardHeight / 2)}
                                >
                                    {versoTexture && (
                                        <Image
                                            image={versoTexture}
                                            x={0} y={0}
                                            width={cardWidth}
                                            height={cardHeight}
                                            fit="cover"
                                        />
                                    )}

                                    {/* Message body (wrapped) */}
                                    {font && bodyLines.map((line, i) => (
                                        <SkiaText
                                            key={i}
                                            x={versoContentLeft}
                                            y={cardHeight * VERSO_MESSAGE_TOP + 16 + i * 20}
                                            text={line}
                                            font={font}
                                            color={Skia.Color('#1A1A1A')}
                                        />
                                    ))}

                                    {/* Sender name + address on first dotted line */}
                                    {font && (
                                        <SkiaText
                                            x={versoContentLeft}
                                            y={cardHeight * VERSO_RECIPIENT_NAME_Y + 14}
                                            text={senderLine}
                                            font={font}
                                            color={Skia.Color('#1A1A1A')}
                                        />
                                    )}

                                    {/* Recipient address on second dotted line (for returned) or user address */}
                                    {font && (
                                        <SkiaText
                                            x={versoContentLeft}
                                            y={cardHeight * VERSO_RECIPIENT_ADDR_Y + 14}
                                            text={addressLine}
                                            font={font}
                                            color={Skia.Color('#1A1A1A')}
                                        />
                                    )}

                                    {/* Stamp */}
                                    {stampImage && (
                                        <Image
                                            image={stampImage}
                                            x={stampX}
                                            y={stampY}
                                            width={stampW}
                                            height={stampH}
                                            fit="contain"
                                        />
                                    )}

                                    {/* Postmark (tampon) */}
                                    {tamponImage && (
                                        <Group opacity={0.7}>
                                            <Image
                                                image={tamponImage}
                                                x={tamponX}
                                                y={tamponY}
                                                width={tamponW}
                                                height={tamponH}
                                                fit="contain"
                                            />
                                        </Group>
                                    )}
                                </Group>
                            </Group>
                        </Group>
                    </Canvas>
                </View>
            </GestureDetector>

            {/* Date + Reply button — below canvas */}
            <View style={{
                position: 'absolute',
                top: bottomOffset,
                left: 0,
                right: 0,
                alignItems: 'center',
            }}>
                <Text style={{
                    fontFamily: 'Georgia',
                    fontSize: 13,
                    color: '#FAF9F6',
                    textAlign: 'center',
                    textShadowColor: 'rgba(0,0,0,0.5)',
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 3,
                }}>
                    {dateString}
                </Text>
                {!isReturned && (
                    <TouchableOpacity
                        onPress={onReply}
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginTop: 16,
                            padding: 10,
                        }}
                    >
                        <Ionicons name="arrow-undo-outline" size={18} color="rgba(250,249,246,0.8)" />
                        <Text style={{
                            fontFamily: 'Georgia',
                            fontSize: 13,
                            color: 'rgba(250,249,246,0.8)',
                            marginLeft: 8,
                            textShadowColor: 'rgba(0,0,0,0.5)',
                            textShadowOffset: { width: 0, height: 1 },
                            textShadowRadius: 3,
                        }}>
                            {t('letter.reply')}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>
        </Animated.View>
    );
}
