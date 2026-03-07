import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, ImageBackground, Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from '../lib/i18n';
import {
    CARD_HEIGHT,
    CARD_WIDTH,
    IMAGE_INSET,
    STAMP_BOX_CENTER_X,
    STAMP_BOX_CENTER_Y,
    STAMP_HEIGHT,
    STAMP_WIDTH,
    TAMPON_HEIGHT,
    TAMPON_WIDTH,
    VERSO_CONTENT_LEFT,
    VERSO_CONTENT_RIGHT,
    VERSO_MESSAGE_BOTTOM,
    VERSO_MESSAGE_TOP,
    VERSO_RECIPIENT_ADDR_Y,
    VERSO_RECIPIENT_NAME_Y,
} from '../lib/postcardLayout';
import { playFlip } from '../lib/sounds';
import { AppUser, useStore } from '../lib/store';
import { Theme } from '../theme';

const rectoTexture = require('../assets/images/postcard_recto.webp');
const versoTextureFr = require('../assets/images/postcard_verso_FR.webp');
const versoTextureEng = require('../assets/images/postcard_verso_ENG.webp');

/**
 * Simple seeded pseudo-random number generator.
 * Given a string seed (letter ID), produces deterministic values 0-1.
 * Call multiple times for multiple random values — each call advances the sequence.
 */
function seededRandom(seed: string): () => number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        const char = seed.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32-bit int
    }
    return () => {
        hash = (hash * 16807 + 0) % 2147483647;
        if (hash < 0) hash += 2147483647;
        return (hash - 1) / 2147483646;
    };
}

type PostcardMode = 'compose' | 'view';

export interface PostcardProps {
    mode: PostcardMode;

    // Image (recto)
    imageUri?: string | null;       // Local URI (compose) or remote URL (view)
    onPickImage?: () => void;       // Callback to trigger image picker (compose only)

    // Content fields (now on verso)
    body: string;
    onBodyChange?: (text: string) => void;

    toName?: string;
    onToNameChange?: (text: string) => void;
    toAddress?: string;
    onToAddressChange?: (text: string) => void;

    fromName?: string;              // Sender name (view mode only, from existing letters in database)
    fromAddressUser?: AppUser | null;

    viewToAddress?: string; // Override "To" in view mode (returned letters)

    // Info for view mode
    dateStr?: string;

    // Actions
    isFlipped?: boolean;        // Controlled flip state from parent
    onFlip?: () => void;        // Callback when flip is triggered
    onSend?: () => void;
    canSend?: boolean;
    isSending?: boolean;

    // Stamp animation (for send flow)
    stampAnim?: Animated.Value;      // Scale value 0→1, drives stamp appearance
    stampRotation?: number;          // Random rotation in degrees (-2 to +2)
    stampOffsetX?: number;           // Random X offset in points (-2 to +2)
    stampOffsetY?: number;           // Random Y offset in points (-2 to +2)

    isDelivered?: boolean;    // True for received letters — shows stamp + postmark
    letterId?: string;        // Letter UUID — seeds the stamp/postmark randomization
}

export default function Postcard({
    mode,
    imageUri, onPickImage,
    body, onBodyChange,
    toName, onToNameChange,
    toAddress, onToAddressChange,
    fromName,
    fromAddressUser,
    viewToAddress,
    dateStr,
    onSend, canSend = false, isSending = false,
    stampAnim, stampRotation = 0, stampOffsetX = 0, stampOffsetY = 0,
    isDelivered = false,
    letterId,
    isFlipped, onFlip,
}: PostcardProps) {
    const { t, locale } = useTranslation();
    const { currentUser } = useStore();
    const [internalFlipped, setInternalFlipped] = useState(false);
    const flipped = isFlipped !== undefined ? isFlipped : internalFlipped;
    const flipAnim = useRef(new Animated.Value(0)).current;

    const versoTexture = locale === 'fr' ? versoTextureFr : versoTextureEng;

    // Deterministic random placement for delivered letters
    const deliveredOffsets = useMemo(() => {
        if (!isDelivered || !letterId) {
            return { stampRot: 0, stampDx: 0, stampDy: 0, tamponRot: 0, tamponDx: 0, tamponDy: 0 };
        }
        const rand = seededRandom(letterId);

        // Stamp: very subtle variation
        const stampRot = (rand() * 4) - 2;       // -2° to +2°
        const stampDx = (rand() * 4) - 2;        // -2pt to +2pt
        const stampDy = (rand() * 4) - 2;        // -2pt to +2pt

        // Postmark: a bit more variation but still subtle
        const tamponRot = (rand() * 10) - 5;     // -5° to +5°
        const tamponDx = (rand() * 8) - 4;       // -4pt to +4pt
        const tamponDy = (rand() * 6) - 3;       // -3pt to +3pt

        return { stampRot, stampDx, stampDy, tamponRot, tamponDx, tamponDy };
    }, [isDelivered, letterId]);

    const frontInterpolate = flipAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '180deg'],
    });
    const backInterpolate = flipAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['180deg', '360deg'],
    });

    const isFirstRender = useRef(true);

    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        if (flipped) {
            // Flip to verso
            if (mode === 'compose') Keyboard.dismiss();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            playFlip();
            Animated.timing(flipAnim, {
                toValue: 1,
                duration: 600,
                useNativeDriver: true,
                easing: Easing.inOut(Easing.ease),
            }).start();
        } else {
            // Flip to recto
            if (mode === 'compose') Keyboard.dismiss();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            playFlip();
            Animated.timing(flipAnim, {
                toValue: 0,
                duration: 600,
                useNativeDriver: true,
                easing: Easing.inOut(Easing.ease),
            }).start();
        }
    }, [flipped, mode]);

    const viewFadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (mode === 'view') {
            Animated.timing(viewFadeAnim, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
            }).start();
        }
    }, [mode, viewFadeAnim]);

    const handleTap = () => {
        if (onFlip) {
            onFlip();
        } else {
            setInternalFlipped(f => !f);
        }
    };

    const isEditable = mode === 'compose';
    const MAX_CHARS = 400;
    const canFlipToVerso = isEditable ? !!imageUri : true;

    return (
        <View style={styles.container}>
            <View style={styles.cardContainer}>
                {/* RECTO */}
                <Animated.View
                    pointerEvents={flipped ? 'none' : 'auto'}
                    style={[
                        styles.cardLayer,
                        { transform: [{ rotateY: frontInterpolate }] }
                    ]}>
                    <ImageBackground
                        source={rectoTexture}
                        style={styles.cardBg}
                        resizeMode="cover"
                    >
                        {mode === 'view' && (
                            <TouchableOpacity
                                activeOpacity={0.95}
                                onPress={handleTap}
                                style={StyleSheet.absoluteFillObject}
                            />
                        )}
                        {isEditable ? (
                            <TouchableOpacity
                                style={styles.rectoImageContainer}
                                onPress={onPickImage}
                                activeOpacity={0.8}
                            >
                                {imageUri ? (
                                    <Image
                                        source={{ uri: imageUri }}
                                        style={styles.rectoImage}
                                        resizeMode="cover"
                                    />
                                ) : (
                                    <View style={styles.rectoPlaceholder}>
                                        <Ionicons name="image-outline" size={48} color={Theme.colors.secondary + '80'} />
                                        <Text style={styles.rectoPlaceholderText}>
                                            {t('compose.tapToAddPhoto')}
                                        </Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        ) : (
                            <View style={styles.rectoImageContainer}>
                                {imageUri ? (
                                    <Image
                                        source={{ uri: imageUri }}
                                        style={styles.rectoImage}
                                        resizeMode="cover"
                                    />
                                ) : (
                                    <View style={styles.rectoPlaceholder}>
                                        <Ionicons name="image-outline" size={48} color={Theme.colors.secondary + '40'} />
                                    </View>
                                )}
                            </View>
                        )}
                    </ImageBackground>
                </Animated.View>

                {/* VERSO */}
                <Animated.View
                    pointerEvents={flipped ? 'auto' : 'none'}
                    style={[
                        styles.cardLayer,
                        styles.cardVerso,
                        { transform: [{ rotateY: backInterpolate }] }
                    ]}>
                    <ImageBackground
                        source={versoTexture}
                        style={styles.cardBg}
                        resizeMode="cover"
                    >
                        {mode === 'view' && (
                            <TouchableOpacity
                                activeOpacity={0.95}
                                onPress={handleTap}
                                style={StyleSheet.absoluteFillObject}
                            />
                        )}
                        {/* VERSO content — overlaid on texture */}
                        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
                            {/* MESSAGE BODY — full width zone */}
                            <View style={{
                                position: 'absolute',
                                top: CARD_HEIGHT * VERSO_MESSAGE_TOP,
                                bottom: CARD_HEIGHT * (1 - VERSO_MESSAGE_BOTTOM),
                                left: CARD_WIDTH * VERSO_CONTENT_LEFT,
                                right: CARD_WIDTH * (1 - VERSO_CONTENT_RIGHT),
                            }}>
                                {isEditable ? (
                                    <TextInput
                                        style={styles.versoBodyInput}
                                        multiline
                                        placeholder={t('compose.prompt')}
                                        placeholderTextColor={Theme.colors.secondary + '60'}
                                        value={body}
                                        onChangeText={(text) => {
                                            if (text.length <= MAX_CHARS && onBodyChange) onBodyChange(text);
                                        }}
                                        textAlignVertical="top"
                                    />
                                ) : (
                                    <Animated.Text style={[styles.versoBodyText, { opacity: viewFadeAnim }]}>
                                        {body}
                                    </Animated.Text>
                                )}
                                {isEditable && (
                                    <Text style={[
                                        styles.charCount,
                                        { color: body.length >= 380 ? Theme.colors.accent : Theme.colors.secondary }
                                    ]}>
                                        {body.length}/{MAX_CHARS}
                                    </Text>
                                )}
                            </View>

                            {/* RECIPIENT NAME — positioned on first dotted line */}
                            <View style={{
                                position: 'absolute',
                                top: CARD_HEIGHT * VERSO_RECIPIENT_NAME_Y,
                                left: CARD_WIDTH * VERSO_CONTENT_LEFT,
                                right: CARD_WIDTH * (1 - VERSO_CONTENT_RIGHT),
                                height: CARD_HEIGHT * 0.05,
                            }}>
                                {isEditable ? (
                                    <TextInput
                                        style={styles.versoRecipientInput}
                                        placeholder={t('compose.placeholderToName')}
                                        placeholderTextColor={Theme.colors.secondary + '60'}
                                        value={toName}
                                        onChangeText={onToNameChange}
                                    />
                                ) : (
                                    <Text style={styles.versoRecipientText}>
                                        {fromName ? `${fromName} — ` : ''}{fromAddressUser?.address || t('letters.unknownSender')}
                                    </Text>
                                )}
                            </View>

                            {/* RECIPIENT ADDRESS — positioned on second dotted line */}
                            <View style={{
                                position: 'absolute',
                                top: CARD_HEIGHT * VERSO_RECIPIENT_ADDR_Y,
                                left: CARD_WIDTH * VERSO_CONTENT_LEFT,
                                right: CARD_WIDTH * (1 - VERSO_CONTENT_RIGHT),
                                height: CARD_HEIGHT * 0.05,
                            }}>
                                {isEditable ? (
                                    <TextInput
                                        style={styles.versoRecipientInput}
                                        placeholder={t('compose.placeholderToAddress')}
                                        placeholderTextColor={Theme.colors.secondary + '60'}
                                        value={toAddress}
                                        onChangeText={onToAddressChange}
                                        autoCorrect={false}
                                        autoCapitalize="none"
                                    />
                                ) : (
                                    <Text style={styles.versoRecipientText}>
                                        {viewToAddress || currentUser?.address || '—'}
                                    </Text>
                                )}
                            </View>
                        </View>
                        {/* STAMP — animated during send, static on delivered letters */}
                        {(stampAnim || isDelivered) && (
                            <Animated.View
                                style={{
                                    position: 'absolute',
                                    top: CARD_HEIGHT * STAMP_BOX_CENTER_Y - STAMP_HEIGHT / 2
                                        + (isDelivered ? deliveredOffsets.stampDy : stampOffsetY),
                                    left: CARD_WIDTH * STAMP_BOX_CENTER_X - STAMP_WIDTH / 2
                                        + (isDelivered ? deliveredOffsets.stampDx : stampOffsetX),
                                    width: STAMP_WIDTH,
                                    height: STAMP_HEIGHT,
                                    transform: [
                                        { scale: isDelivered ? 1 : (stampAnim || 1) },
                                        { rotate: `${isDelivered ? deliveredOffsets.stampRot : stampRotation}deg` },
                                    ],
                                }}
                            >
                                <Image
                                    source={require('../assets/images/stamp.png')}
                                    style={{ width: '100%', height: '100%' }}
                                    resizeMode="contain"
                                />
                            </Animated.View>
                        )}

                        {/* POSTMARK (tampon) — only on delivered letters, overlaps the stamp */}
                        {isDelivered && (
                            <View
                                style={{
                                    position: 'absolute',
                                    // Anchor: circular part of tampon centered on the stamp,
                                    // wavy lines extend leftward. Clamp to stay within card bounds.
                                    top: Math.max(
                                        0,
                                        Math.min(
                                            CARD_HEIGHT * STAMP_BOX_CENTER_Y - TAMPON_HEIGHT / 2
                                            + deliveredOffsets.tamponDy,
                                            CARD_HEIGHT - TAMPON_HEIGHT
                                        )
                                    ),
                                    left: Math.max(
                                        0,
                                        Math.min(
                                            CARD_WIDTH * STAMP_BOX_CENTER_X - TAMPON_WIDTH * 0.72
                                            + deliveredOffsets.tamponDx,
                                            CARD_WIDTH - TAMPON_WIDTH
                                        )
                                    ),
                                    width: TAMPON_WIDTH,
                                    height: TAMPON_HEIGHT,
                                    transform: [{ rotate: `${deliveredOffsets.tamponRot}deg` }],
                                    opacity: 0.7,
                                    overflow: 'hidden',
                                }}
                            >
                                <Image
                                    source={require('../assets/images/tampon.png')}
                                    style={{ width: '100%', height: '100%' }}
                                    resizeMode="contain"
                                />
                            </View>
                        )}
                    </ImageBackground>
                </Animated.View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        alignItems: 'center',
    },
    cardContainer: {
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        position: 'relative',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
        elevation: 4,
        marginBottom: 24,
    },
    cardLayer: {
        ...StyleSheet.absoluteFillObject,
        backfaceVisibility: 'hidden',
        borderWidth: 0,
    },
    cardVerso: {
        position: 'absolute',
        top: 0,
    },
    cardBg: {
        width: '100%',
        height: '100%',
        overflow: 'hidden',
    },

    // === RECTO (image) ===
    rectoImageContainer: {
        flex: 1,
        margin: IMAGE_INSET,
        borderRadius: 4,
        overflow: 'hidden',
        backgroundColor: Theme.colors.background + '40',
    },
    rectoImage: {
        width: '100%',
        height: '100%',
    },
    rectoPlaceholder: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    rectoPlaceholderText: {
        fontSize: 13,
        color: Theme.colors.secondary + '80',
        marginTop: 8,
        fontFamily: Theme.fonts.body,
    },

    // === VERSO (body text + addresses) ===
    versoBodyInput: {
        flex: 1,
        fontFamily: 'Georgia',
        fontSize: 14,
        lineHeight: 20,
        color: Theme.colors.text,
        padding: 0,
        textAlignVertical: 'top',
    },
    versoBodyText: {
        flex: 1,
        fontFamily: 'Georgia',
        fontSize: 14,
        lineHeight: 20,
        color: Theme.colors.text,
    },
    charCount: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        fontSize: 11,
        fontFamily: Theme.fonts.body,
    },
    versoRecipientInput: {
        fontFamily: 'Georgia',
        fontSize: 14,
        color: Theme.colors.text,
        padding: 0,
        height: '100%',
    },
    versoRecipientText: {
        fontFamily: 'Georgia',
        fontSize: 14,
        color: Theme.colors.text,
    },
});
