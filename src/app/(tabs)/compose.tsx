import { Ionicons } from '@expo/vector-icons';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, AppState, Dimensions, Easing, Keyboard, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import { generateUSDZ, shareViaIMessage } from '../../../modules/postcard-usdz';
import Postcard from '../../components/Postcard';
import PostcardCapture from '../../components/PostcardCapture';
import { useTranslation } from '../../lib/i18n';
import { pickAndCompressImage, uploadPostcardImage } from '../../lib/imageUtils';
import { playSend } from '../../lib/sounds';
import { useStore } from '../../lib/store';
import { supabase } from '../../lib/supabase';
import { Theme } from '../../theme';

const { height: screenHeight } = Dimensions.get('window');

type ComposeStep = 'compose' | 'sending' | 'sent';

export default function ComposeScreen() {
    const { currentUser, sendLetter } = useStore();
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();

    const [videoUri, setVideoUri] = useState<string | null>(null);

    useEffect(() => {
        const loadVideo = async () => {
            const asset = Asset.fromModule(require('../../assets/video/WRITE_background.mp4'));
            await asset.downloadAsync();
            setVideoUri(asset.localUri || asset.uri);
        };
        loadVideo();
    }, []);

    const player = useVideoPlayer(
        videoUri,
        (player: any) => {
            player.loop = true;
            player.muted = true;
            player.playbackRate = 0.25;
            player.play();
        }
    );

    useEffect(() => {
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active' && player) {
                player.play();
            }
        });
        return () => subscription.remove();
    }, [player]);

    const [step, setStep] = useState<ComposeStep>('compose');
    const [cardKey, setCardKey] = useState(0);
    const [screenState, setScreenState] = useState<'video' | 'writing'>('video');
    const postcardOpacity = useRef(new Animated.Value(0)).current;

    const [body, setBody] = useState('');
    const [toName, setToName] = useState('');
    const [toAddress, setToAddress] = useState('');
    const [fromName, setFromName] = useState('');

    const [imageUri, setImageUri] = useState<string | null>(null);

    const [sendError, setSendError] = useState<string | null>(null);
    const sendAnim = useRef(new Animated.Value(0)).current;

    const [isSending, setIsSending] = useState(false);

    const rectoRef = useRef<View>(null);
    const versoRef = useRef<View>(null);
    const compositeRef = useRef<View>(null);

    const keyboardOffset = useRef(new Animated.Value(0)).current;
    const isKeyboardVisible = useRef(false);

    const stampAnimValue = useRef(new Animated.Value(0)).current;
    const stampRotationRef = useRef((Math.random() * 4) - 2);
    const stampOffsetXRef = useRef((Math.random() * 4) - 2);
    const stampOffsetYRef = useRef((Math.random() * 4) - 2);

    React.useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const showSub = Keyboard.addListener(showEvent, (e) => {
            isKeyboardVisible.current = true;
            const kbHeight = e.endCoordinates.height;
            const offset = Math.min(kbHeight * 0.45, 160);
            Animated.timing(keyboardOffset, {
                toValue: -offset,
                duration: Platform.OS === 'ios' ? e.duration || 250 : 250,
                useNativeDriver: true,
            }).start();
        });

        const hideSub = Keyboard.addListener(hideEvent, () => {
            isKeyboardVisible.current = false;
            Animated.timing(keyboardOffset, {
                toValue: 0,
                duration: 250,
                useNativeDriver: true,
            }).start();
        });

        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, [keyboardOffset]);

    const handlePickImage = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        Alert.alert(
            t('compose.imagePickerTitle'),
            undefined,
            [
                {
                    text: t('compose.camera'),
                    onPress: async () => {
                        const uri = await pickAndCompressImage('camera');
                        if (uri) setImageUri(uri);
                    },
                },
                {
                    text: t('compose.library'),
                    onPress: async () => {
                        const uri = await pickAndCompressImage('library');
                        if (uri) setImageUri(uri);
                    },
                },
                { text: t('common.cancel'), style: 'cancel' },
            ]
        );
    };

    const handleSharePostcard = async () => {
        try {
            if (!rectoRef.current || !versoRef.current) {
                Alert.alert('Error', 'Capture views not ready');
                return;
            }

            // Capture both sides as JPEG
            const rectoUri = await captureRef(rectoRef, {
                format: 'jpg',
                quality: 0.9,
                result: 'tmpfile',
            });
            const versoUri = await captureRef(versoRef, {
                format: 'jpg',
                quality: 0.9,
                result: 'tmpfile',
            });

            const rectoUrl = rectoUri.startsWith('file://') ? rectoUri : 'file://' + rectoUri;
            const versoUrl = versoUri.startsWith('file://') ? versoUri : 'file://' + versoUri;

            // Generate USDZ
            const usdzPath = await generateUSDZ(rectoUrl, versoUrl);

            // Build filename from recipient name
            let displayName = toName.trim();
            if (!displayName) {
                displayName = 'toi';
            }
            // If name is longer than 15 chars, use first initial
            if (displayName.length > 15) {
                displayName = displayName.charAt(0);
            }
            const filename = `carte postale pour ${displayName}.usdz`;

            // Open iMessage with the USDZ attached
            const messageText = "Je t'ai envoye une carte postale ! Telecharge Courrier pour y repondre.";
            const result = await shareViaIMessage(usdzPath, messageText, filename);

            if (result.status === 'sent') {
                setStep('sent');

                setTimeout(() => {
                    Animated.timing(postcardOpacity, {
                        toValue: 0,
                        duration: 400,
                        useNativeDriver: true,
                    }).start(() => {
                        setBody('');
                        setToName('');
                        setToAddress('');
                        setFromName('');
                        setImageUri(null);
                        setSendError(null);
                        sendAnim.setValue(0);
                        stampAnimValue.setValue(0);
                        setCardKey(k => k + 1);
                        setStep('compose');
                        setScreenState('video');
                        setIsSending(false);
                    });
                }, 3000);
            }
            // If cancelled, do nothing. User can continue editing.
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            Alert.alert('Erreur', msg);
            console.error('Share postcard error:', e);
        }
    };

    const handleShareImages = async () => {
        try {
            if (!compositeRef.current) {
                Alert.alert('Error', 'Capture view not ready');
                return;
            }

            const compositeUri = await captureRef(compositeRef, {
                format: 'png',
                quality: 1,
                result: 'tmpfile',
            });

            const compositeUrl = compositeUri.startsWith('file://') ? compositeUri : 'file://' + compositeUri;

            let displayName = toName.trim() || 'toi';
            if (displayName.length > 15) displayName = displayName.charAt(0);

            const filePath = FileSystem.cacheDirectory + 'carte_postale_pour_' + displayName + '.png';
            await FileSystem.copyAsync({ from: compositeUrl, to: filePath });

            if (!(await Sharing.isAvailableAsync())) {
                Alert.alert('Erreur', 'Le partage est indisponible');
                return;
            }

            await Sharing.shareAsync(filePath, {
                mimeType: 'image/png',
                dialogTitle: 'Carte postale pour ' + displayName,
            });

        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (!msg.toLowerCase().includes('cancel') && !msg.toLowerCase().includes('dismiss')) {
                Alert.alert('Erreur', msg);
            }
        }
    };

    const handleSharePrompt = () => {
        if (Platform.OS === 'android') {
            handleShareImages();
        } else {
            Alert.alert(
                'Envoyer la carte',
                'Comment souhaitez-vous partager cette carte postale ?',
                [
                    {
                        text: 'iMessage (3D)',
                        onPress: handleSharePostcard,
                    },
                    {
                        text: 'Autre messagerie',
                        onPress: handleShareImages,
                    },
                    {
                        text: 'Annuler',
                        style: 'cancel',
                    },
                ]
            );
        }
    };

    const canSend = !!imageUri && body.trim().length > 0 && toAddress.trim().length > 0;

    const handleSend = async () => {
        if (!canSend || step === 'sending') return;
        setIsSending(true);
        setSendError(null);
        Keyboard.dismiss();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

        const sendStart = Date.now();

        // Randomize stamp placement for this send
        stampRotationRef.current = (Math.random() * 4) - 2;
        stampOffsetXRef.current = (Math.random() * 4) - 2;
        stampOffsetYRef.current = (Math.random() * 4) - 2;

        // ── PHASE 1: Stamp appears ──
        stampAnimValue.setValue(1);

        // ── PHASE 2: After 1100ms, fly the card away ──
        await new Promise<void>((resolve) => {
            setTimeout(() => {
                Animated.parallel([
                    Animated.timing(sendAnim, {
                        toValue: 1,
                        duration: 1000,
                        easing: Easing.in(Easing.cubic),
                        useNativeDriver: true,
                    }),
                ]).start(() => {
                    // Fly-away animation COMPLETE — NOW we can unmount the card
                    resolve();
                });
            }, 1100);
        });

        // ── PHASE 3: Card is off-screen. Show spinner. ──
        setStep('sending');

        // Fire the actual send (image upload + Supabase insert)
        try {
            // Upload image if present
            let imageUrl: string | null = null;
            if (imageUri) {
                imageUrl = await uploadPostcardImage(imageUri, currentUser!.id, supabase);
            }

            await sendLetter(body.trim(), toAddress.trim(), imageUrl, fromName.trim() || null, toName.trim() || null);

            // Enforce minimum "sending" display time from the moment user pressed send
            const elapsed = Date.now() - sendStart;
            if (elapsed < 2800) {
                await new Promise(resolve => setTimeout(resolve, 2800 - elapsed));
            }

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            playSend();
            setStep('sent');

            setTimeout(() => {
                Animated.timing(postcardOpacity, {
                    toValue: 0,
                    duration: 400,
                    useNativeDriver: true,
                }).start(() => {
                    setBody('');
                    setToName('');
                    setToAddress('');
                    setFromName('');
                    setImageUri(null);
                    setSendError(null);
                    sendAnim.setValue(0);
                    stampAnimValue.setValue(0);
                    setCardKey(k => k + 1);
                    setStep('compose');
                    setScreenState('video');
                    setIsSending(false);
                });
            }, 3000);
        } catch (e) {
            // Error: reset animations and show error
            Animated.timing(sendAnim, {
                toValue: 0,
                duration: 500,
                useNativeDriver: true,
            }).start();
            stampAnimValue.setValue(0);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            const msg = e instanceof Error ? e.message : String(e);
            setSendError(`${t('compose.error')}\n\n[${msg}]`);
            setStep('compose');
            setIsSending(false);
        }
    };

    const hasContent = !!(body.trim() || imageUri || fromName.trim() || toName.trim() || toAddress.trim());

    const handleDiscard = () => {
        Alert.alert(
            t('compose.discard'),
            '',
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('compose.discardConfirm'),
                    style: 'destructive',
                    onPress: () => {
                        setBody('');
                        setFromName('');
                        setToName('');
                        setToAddress('');
                        setImageUri(null);
                    },
                },
            ]
        );
    };

    const cardTranslateY = sendAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -screenHeight],
    });
    const cardOpacity = sendAnim.interpolate({
        inputRange: [0, 0.7, 1],
        outputRange: [1, 0.5, 0],
    });

    return (
        <View style={{ flex: 1 }}>
            {hasContent && (
                <TouchableOpacity
                    onPress={handleDiscard}
                    style={{
                        position: 'absolute',
                        top: insets.top + 12,
                        right: 20,
                        zIndex: 100,
                        padding: 8,
                    }}
                >
                    <Ionicons name="trash-outline" size={22} color="rgba(255,255,255,0.7)" />
                </TouchableOpacity>
            )}
            <PostcardCapture
                imageUri={imageUri}
                body={body}
                fromName={fromName}
                toName={toName}
                fromAddress={currentUser?.address || ''}
                toAddress={toAddress}
                rectoRef={rectoRef}
                versoRef={versoRef}
                compositeRef={compositeRef}
            />

            {videoUri && player && (
                <VideoView
                    player={player}
                    style={StyleSheet.absoluteFillObject}
                    nativeControls={false}
                    contentFit="cover"
                    allowsVideoFrameAnalysis={false}
                />
            )}

            <SafeAreaView edges={['top']} style={{ flex: 1 }}>

                {screenState === 'video' ? (
                    <TouchableOpacity
                        style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
                        activeOpacity={0.8}
                        onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            postcardOpacity.setValue(0);
                            setScreenState('writing');
                            Animated.timing(postcardOpacity, {
                                toValue: 1,
                                duration: 400,
                                useNativeDriver: true,
                            }).start();
                        }}
                    >
                        <Text style={{
                            fontFamily: 'Georgia',
                            fontSize: 22,
                            color: '#FAF9F6',
                            textAlign: 'center',
                            paddingHorizontal: 40,
                            textShadowColor: 'rgba(0,0,0,0.5)',
                            textShadowOffset: { width: 0, height: 1 },
                            textShadowRadius: 4,
                        }}>
                            {t('compose.coldOpen')}
                        </Text>
                    </TouchableOpacity>
                ) : (
                    <Animated.View style={{ flex: 1, opacity: postcardOpacity }}>
                        {step === 'sending' ? (
                            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                                <ActivityIndicator size="large" color="#FAF9F6" />
                                <Text style={{
                                    fontFamily: 'Georgia',
                                    fontSize: 18,
                                    color: '#FAF9F6',
                                    marginTop: 24,
                                    textShadowColor: 'rgba(0,0,0,0.5)',
                                    textShadowOffset: { width: 0, height: 1 },
                                    textShadowRadius: 4,
                                }}>
                                    {t('compose.sending')}
                                </Text>
                            </View>
                        ) : step === 'sent' ? (
                            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                                <View style={{
                                    width: 64, height: 64, borderRadius: 32,
                                    backgroundColor: Theme.colors.accent,
                                    justifyContent: 'center', alignItems: 'center',
                                    marginBottom: 24,
                                }}>
                                    <Ionicons name="checkmark" size={36} color="#FFFFFF" />
                                </View>
                                <Text style={{
                                    fontFamily: 'Georgia',
                                    fontSize: 22,
                                    color: '#FAF9F6',
                                    textShadowColor: 'rgba(0,0,0,0.5)',
                                    textShadowOffset: { width: 0, height: 1 },
                                    textShadowRadius: 4,
                                }}>
                                    {t('compose.sentTitle')}
                                </Text>
                            </View>
                        ) : (
                            <View style={{ flex: 1 }}>
                                {/* Dark backdrop + dismiss target */}
                                <TouchableOpacity
                                    activeOpacity={1}
                                    style={{
                                        ...StyleSheet.absoluteFillObject,
                                        backgroundColor: 'rgba(0, 0, 0, 0.4)',
                                    }}
                                    onPress={() => {
                                        if (isKeyboardVisible.current) {
                                            // Step 1: just dismiss the keyboard, keep the card visible
                                            Keyboard.dismiss();
                                        } else {
                                            // Step 2: keyboard already closed, dismiss to video
                                            Animated.timing(postcardOpacity, {
                                                toValue: 0,
                                                duration: 400,
                                                useNativeDriver: true,
                                            }).start(() => {
                                                setScreenState('video');
                                            });
                                        }
                                    }}
                                />

                                {/* Postcard centered — blocks dismiss touches on the card itself */}
                                <Animated.View
                                    style={{
                                        flex: 1,
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        paddingHorizontal: 40,
                                        pointerEvents: 'box-none',
                                        transform: [{ translateY: keyboardOffset }],
                                    }}
                                >
                                    <View onStartShouldSetResponder={() => true}>
                                        <Animated.View style={{
                                            transform: [{ translateY: cardTranslateY }],
                                            opacity: cardOpacity,
                                        }}>
                                            <Postcard
                                                key={cardKey}
                                                mode="compose"
                                                imageUri={imageUri}
                                                onPickImage={handlePickImage}
                                                body={body}
                                                onBodyChange={setBody}
                                                toName={toName}
                                                onToNameChange={setToName}
                                                toAddress={toAddress}
                                                onToAddressChange={setToAddress}
                                                fromName={fromName}
                                                onFromNameChange={setFromName}
                                                fromAddressUser={currentUser}
                                                onSend={handleSend}
                                                canSend={canSend}
                                                isSending={isSending}
                                                stampAnim={stampAnimValue}
                                                stampRotation={stampRotationRef.current}
                                                stampOffsetX={stampOffsetXRef.current}
                                                stampOffsetY={stampOffsetYRef.current}
                                                onSharePostcard={handleSharePrompt}
                                            />
                                            {sendError && <Text style={styles.errorText}>{sendError}</Text>}
                                        </Animated.View>
                                    </View>
                                </Animated.View>
                            </View>
                        )}
                    </Animated.View>
                )}
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Theme.colors.background,
    },
    content: {
        paddingTop: 40,
        paddingBottom: 60,
        paddingHorizontal: 40,
        flexGrow: 1,
        alignItems: 'center',
    },
    errorText: {
        fontSize: 13,
        color: Theme.colors.accent,
        marginBottom: 16,
        textAlign: 'center',
    },
    overlayCenter: {
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
        backgroundColor: Theme.colors.background,
        zIndex: 10,
    },
    overlayText: {
        fontFamily: 'Georgia',
        fontSize: 18,
        color: Theme.colors.secondary,
        textAlign: 'center',
    },
    checkCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: Theme.colors.accent,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
});
