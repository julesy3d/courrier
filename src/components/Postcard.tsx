import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Image, ImageBackground, Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from '../lib/i18n';
import { playFlip } from '../lib/sounds';
import { AppUser, useStore } from '../lib/store';
import { Theme } from '../theme';

const { width: windowWidth } = Dimensions.get('window');
const HORIZONTAL_PADDING = 40;
const CARD_WIDTH = windowWidth - (HORIZONTAL_PADDING * 2);
const CARD_ASPECT_RATIO = 297 / 422;
const CARD_HEIGHT = CARD_WIDTH / CARD_ASPECT_RATIO;

// Stamp positioning — centered at 40px from right, 40px from top on 297×422 texture
const STAMP_CENTER_X_RATIO = (297 - 40) / 297;  // 0.865 from left
const STAMP_CENTER_Y_RATIO = 40 / 422;           // 0.0948 from top
const STAMP_WIDTH = CARD_WIDTH * 0.17;
const STAMP_HEIGHT = STAMP_WIDTH * 1.25;          // Slightly taller than wide, like a real stamp

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

    fromName?: string;
    onFromNameChange?: (text: string) => void;
    fromAddressUser?: AppUser | null;

    viewToAddress?: string; // Override "To" in view mode (returned letters)

    // Info for view mode
    dateStr?: string;

    // Actions
    onSend?: () => void;
    canSend?: boolean;
    isSending?: boolean;

    // Stamp animation (for send flow)
    stampAnim?: Animated.Value;      // Scale value 0→1, drives stamp appearance
    stampRotation?: number;          // Random rotation in degrees (-2 to +2)
    stampOffsetX?: number;           // Random X offset in points (-2 to +2)
    stampOffsetY?: number;           // Random Y offset in points (-2 to +2)
}

export default function Postcard({
    mode,
    imageUri, onPickImage,
    body, onBodyChange,
    toName, onToNameChange,
    toAddress, onToAddressChange,
    fromName, onFromNameChange,
    fromAddressUser,
    viewToAddress,
    dateStr,
    onSend, canSend = false, isSending = false,
    stampAnim, stampRotation = 0, stampOffsetX = 0, stampOffsetY = 0,
}: PostcardProps) {
    const { t } = useTranslation();
    const { currentUser } = useStore();
    const [side, setSide] = useState<'recto' | 'verso'>('recto');
    const [isFlipped, setIsFlipped] = useState(false);
    const flipAnim = useRef(new Animated.Value(0)).current;

    const frontInterpolate = flipAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '180deg'],
    });
    const backInterpolate = flipAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['180deg', '360deg'],
    });

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

    const flipToBack = () => {
        if (mode === 'compose') Keyboard.dismiss();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        playFlip();
        Animated.timing(flipAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.ease),
        }).start(() => {
            setSide('verso');
            setIsFlipped(true);
        });
    };

    const flipToFront = () => {
        if (mode === 'compose') Keyboard.dismiss();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        playFlip();
        Animated.timing(flipAnim, {
            toValue: 0,
            duration: 600,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.ease),
        }).start(() => {
            setSide('recto');
            setIsFlipped(false);
        });
    };

    const isEditable = mode === 'compose';
    const MAX_CHARS = 300;
    const canFlipToVerso = isEditable ? !!imageUri : true;

    return (
        <View style={styles.container}>
            <View style={styles.cardContainer}>
                {/* RECTO */}
                <Animated.View
                    pointerEvents={isFlipped ? 'none' : 'auto'}
                    style={[
                        styles.cardLayer,
                        { transform: [{ rotateY: frontInterpolate }] }
                    ]}>
                    <ImageBackground
                        source={require('../assets/images/lettreMAIN_rectoretouche1_0.png')}
                        style={styles.cardBg}
                        resizeMode="cover"
                    >
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
                    pointerEvents={isFlipped ? 'auto' : 'none'}
                    style={[
                        styles.cardLayer,
                        styles.cardVerso,
                        { transform: [{ rotateY: backInterpolate }] }
                    ]}>
                    <ImageBackground
                        source={require('../assets/images/lettreMAIN_versoretouche1_1.png')}
                        style={styles.cardBg}
                        resizeMode="cover"
                    >
                        <View style={styles.versoContentContainer}>
                            {/* BODY TEXT ZONE — upper portion */}
                            <View style={styles.versoBodyZone}>
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
                                        { color: body.length >= 280 ? Theme.colors.accent : Theme.colors.secondary }
                                    ]}>
                                        {body.length}/{MAX_CHARS}
                                    </Text>
                                )}
                            </View>

                            {/* ADDRESS ZONE — lower portion */}
                            <View style={styles.versoAddressZone}>
                                <View style={styles.versoRow}>
                                    {/* FROM HALF (Left) */}
                                    <View style={styles.versoHalf}>
                                        {!isEditable ? (
                                            <View>
                                                <Text style={styles.versoLabel}>{t('letter.detail.from')}</Text>
                                                <Text style={[styles.readOnlyText, { color: Theme.colors.text }]}>
                                                    {fromAddressUser?.address || 'Unknown'}
                                                </Text>
                                            </View>
                                        ) : (
                                            <>
                                                <Text style={styles.versoLabel}>{t('compose.from')}</Text>
                                                <TextInput
                                                    style={styles.versoInput}
                                                    placeholder={t('compose.placeholderFromName')}
                                                    placeholderTextColor={Theme.colors.secondary + '60'}
                                                    value={fromName}
                                                    onChangeText={onFromNameChange}
                                                />
                                                <Text style={styles.readOnlyText}>{fromAddressUser?.address || '—'}</Text>
                                            </>
                                        )}
                                    </View>

                                    <View style={{ width: 20 }} />

                                    {/* TO HALF (Right) */}
                                    <View style={[styles.versoHalf, styles.versoRightHalf]}>
                                        {isEditable ? (
                                            <>
                                                <Text style={styles.versoLabel}>{t('compose.to')}</Text>
                                                <TextInput
                                                    style={styles.versoInput}
                                                    placeholder={t('compose.placeholderToName')}
                                                    placeholderTextColor={Theme.colors.secondary + '60'}
                                                    value={toName}
                                                    onChangeText={onToNameChange}
                                                />
                                                <TextInput
                                                    style={[styles.versoInput, { marginTop: 12 }]}
                                                    placeholder={t('compose.placeholderToAddress')}
                                                    placeholderTextColor={Theme.colors.secondary + '60'}
                                                    value={toAddress}
                                                    onChangeText={onToAddressChange}
                                                    autoCorrect={false}
                                                    autoCapitalize="none"
                                                />
                                            </>
                                        ) : (
                                            <View>
                                                <Text style={styles.versoLabel}>{t('letter.detail.to')}</Text>
                                                <Text style={[styles.readOnlyText, { color: Theme.colors.text }]}>
                                                    {viewToAddress || currentUser?.address || '—'}
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                </View>
                            </View>
                        </View>
                        {/* STAMP — appears during send animation */}
                        {stampAnim && (
                            <Animated.View
                                style={{
                                    position: 'absolute',
                                    top: CARD_HEIGHT * STAMP_CENTER_Y_RATIO - STAMP_HEIGHT / 2 + stampOffsetY,
                                    left: CARD_WIDTH * STAMP_CENTER_X_RATIO - STAMP_WIDTH / 2 + stampOffsetX,
                                    width: STAMP_WIDTH,
                                    height: STAMP_HEIGHT,
                                    transform: [
                                        { scale: stampAnim },
                                        { rotate: `${stampRotation}deg` },
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
                    </ImageBackground>
                </Animated.View>
            </View>

            {/* FOOTER ACTIONS */}
            {!isSending && (
                <View style={[styles.footerContainer, { minHeight: 80, justifyContent: 'flex-end' }]}>
                    {side === 'recto' ? (
                        <TouchableOpacity
                            style={styles.actionButtonRight}
                            onPress={flipToBack}
                            disabled={!canFlipToVerso}
                        >
                            <Text style={[
                                styles.actionTextRight,
                                !canFlipToVerso && { color: Theme.colors.secondary }
                            ]}>
                                {t('compose.turnOver')}
                            </Text>
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.versoFooter}>
                            {isEditable && (
                                <Text style={styles.hintText}>{t('compose.addressHint')}</Text>
                            )}
                            <View style={styles.actionRow}>
                                <TouchableOpacity onPress={flipToFront} style={styles.actionButtonLeft}>
                                    <Text style={styles.actionTextLeft}>{t('compose.turnBack')}</Text>
                                </TouchableOpacity>

                                {isEditable ? (
                                    <TouchableOpacity onPress={onSend} disabled={!canSend} style={styles.actionButtonRight}>
                                        <Text style={[
                                            styles.actionTextRight,
                                            !canSend && { color: Theme.colors.secondary }
                                        ]}>{t('compose.send')}</Text>
                                    </TouchableOpacity>
                                ) : null}
                            </View>
                        </View>
                    )}
                </View>
            )}
        </View>
    );
}

const IMAGE_INSET = 20; // Padding around the inset image on the recto

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
    versoContentContainer: {
        flex: 1,
        paddingTop: CARD_HEIGHT * 0.25, // Below "CARTE POSTALE" header + stamp + divider
        paddingHorizontal: 20,
        paddingBottom: 16,
    },
    versoBodyZone: {
        flex: 1, // Takes available space above address zone
        marginBottom: 12,
    },
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
    versoAddressZone: {
        height: CARD_HEIGHT * 0.35, // Fixed height for address area
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: Theme.colors.secondary + '40',
        paddingTop: 10,
    },
    versoRow: {
        flexDirection: 'row',
        flex: 1,
    },
    versoHalf: {
        flex: 1,
        paddingRight: 10,
    },
    versoRightHalf: {
        paddingRight: 0,
        paddingLeft: 10,
    },
    versoLabel: {
        fontSize: 10,
        textTransform: 'uppercase',
        color: Theme.colors.secondary,
        marginBottom: 6,
    },
    versoInput: {
        fontFamily: 'Georgia',
        fontSize: 13,
        color: Theme.colors.text,
        padding: 0,
    },
    readOnlyText: {
        fontFamily: 'Georgia',
        fontSize: 13,
        color: Theme.colors.secondary,
        marginTop: 6,
        fontStyle: 'italic',
    },

    // === FOOTER ===
    footerContainer: {
        width: CARD_WIDTH,
    },
    actionTextRight: {
        fontFamily: Theme.fonts.body,
        fontSize: 16,
        color: Theme.colors.accent,
        textAlign: 'right',
    },
    versoFooter: {
        width: '100%',
    },
    hintText: {
        fontSize: 13,
        color: Theme.colors.secondary,
        textAlign: 'center',
        marginBottom: 16,
    },
    actionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    actionButtonLeft: {
        paddingVertical: 8,
    },
    actionButtonRight: {
        paddingVertical: 8,
    },
    actionTextLeft: {
        fontFamily: Theme.fonts.body,
        fontSize: 16,
        color: Theme.colors.secondary,
    },
});
