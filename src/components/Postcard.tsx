import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, ImageBackground, Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from '../lib/i18n';
import { AppUser, useStore } from '../lib/store';
import { Theme } from '../theme';

const { width: windowWidth } = Dimensions.get('window');
const HORIZONTAL_PADDING = 40;
const CARD_WIDTH = windowWidth - (HORIZONTAL_PADDING * 2);
const CARD_ASPECT_RATIO = 297 / 422;
const CARD_HEIGHT = CARD_WIDTH / CARD_ASPECT_RATIO;

type PostcardMode = 'compose' | 'view';

export interface PostcardProps {
    mode: PostcardMode;

    // Content fields
    body: string;
    onBodyChange?: (text: string) => void;

    toName?: string;
    onToNameChange?: (text: string) => void;
    toAddress?: string;
    onToAddressChange?: (text: string) => void;

    fromName?: string;
    onFromNameChange?: (text: string) => void;
    fromAddressUser?: AppUser | null; // For display on composed or viewed

    // Info for view mode
    dateStr?: string;

    // Actions
    onSend?: () => void;
    canSend?: boolean;
}

export default function Postcard({
    mode,
    body, onBodyChange,
    toName, onToNameChange,
    toAddress, onToAddressChange,
    fromName, onFromNameChange,
    fromAddressUser,
    dateStr,
    onSend, canSend = false
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
    const canFlipToVerso = isEditable ? body.trim().length > 0 : true;

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
                            <TextInput
                                style={styles.bodyInput}
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
                            <Animated.Text style={[styles.bodyText, { opacity: viewFadeAnim }]}>
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
                            <View style={styles.versoRow}>
                                {/* FROM HALF (Left) */}
                                <View style={styles.versoHalf}>
                                    {!isEditable ? (
                                        <View style={{ paddingTop: 30 }}>
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

                                {/* Divider handled by the image background already, just aligning the flex boxes */}
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
                                        <View style={{ paddingTop: 30 }}>
                                            <Text style={styles.versoLabel}>{t('letter.detail.to')}</Text>
                                            <Text style={[styles.readOnlyText, { color: Theme.colors.text }]}>
                                                {currentUser?.address || '—'}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            </View>
                        </View>
                    </ImageBackground>
                </Animated.View>
            </View>

            {/* FOOTER ACTIONS */}
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
        borderWidth: 0, // Removing border, the graphic texture serves as the shape
    },
    cardVerso: {
        position: 'absolute',
        top: 0,
    },
    cardBg: {
        width: '100%',
        height: '100%',
    },
    bodyInput: {
        flex: 1,
        fontFamily: 'Georgia',
        fontSize: 16,
        color: Theme.colors.text,
        paddingTop: 24,
        paddingHorizontal: 20,
        paddingBottom: 60,
    },
    bodyText: {
        flex: 1,
        fontFamily: 'Georgia',
        fontSize: 16,
        color: Theme.colors.text,
        paddingTop: 24,
        paddingHorizontal: 20,
        paddingBottom: 60,
    },
    charCount: {
        position: 'absolute',
        bottom: 24,
        right: 20,
        fontSize: 11,
        fontFamily: Theme.fonts.body,
    },
    versoContentContainer: {
        flex: 1,
        paddingTop: CARD_HEIGHT * 0.35, // Adjusting starting point for text
        paddingHorizontal: 20,
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
        marginBottom: 8,
    },
    versoInput: {
        fontFamily: 'Georgia',
        fontSize: 14,
        color: Theme.colors.text,
        padding: 0,
    },
    versoText: {
        fontFamily: 'Georgia',
        fontSize: 14,
        color: Theme.colors.text,
    },
    readOnlyText: {
        fontFamily: 'Georgia',
        fontSize: 14,
        color: Theme.colors.secondary,
        marginTop: 8,
        fontStyle: 'italic',
    },
    footerContainer: {
        width: CARD_WIDTH,
    },
    actionRight: {
        alignItems: 'flex-end',
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
    }
});
