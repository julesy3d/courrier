import React, { useRef, useState } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    Text,
    TextInput,
    Dimensions,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Keyboard,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { uploadCardImage } from '../lib/imageUtils';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { Theme } from '../theme';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const GUIDE_PADDING = 12;
const GUIDE_WIDTH = screenWidth - GUIDE_PADDING * 2;
const GUIDE_HEIGHT = GUIDE_WIDTH * (screenHeight / 2) / screenWidth;

const CAPTION_MAX = 140;

interface PhotoCaptureProps {
    onComplete: () => void;
    onClose: () => void;
}

type Phase = 'idle' | 'preview' | 'uploading' | 'done' | 'error';

export default function PhotoCapture({ onComplete, onClose }: PhotoCaptureProps) {
    const { currentUser, createCard } = useStore();
    const insets = useSafeAreaInsets();
    const [permission, requestPermission] = useCameraPermissions();

    const cameraRef = useRef<CameraView>(null);
    const [phase, setPhase] = useState<Phase>('idle');
    const [error, setError] = useState<string | null>(null);
    const [imageUri, setImageUri] = useState<string | null>(null);
    const [facing, setFacing] = useState<CameraType>('front');
    const [caption, setCaption] = useState('');
    const [showCaptionInput, setShowCaptionInput] = useState(false);

    if (!permission) return <View style={styles.container} />;

    if (!permission.granted) {
        return (
            <View style={[styles.container, styles.centered]}>
                <Text style={styles.errorText}>Camera access is needed.</Text>
                <TouchableOpacity style={styles.retryButton} onPress={requestPermission}>
                    <Text style={styles.retryText}>Grant Access</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ marginTop: 20 }} onPress={onClose}>
                    <Text style={styles.errorText}>Cancel</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const takePicture = async () => {
        if (phase !== 'idle' || !cameraRef.current) return;

        try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const result = await cameraRef.current.takePictureAsync({ quality: 0.8 });
            if (result?.uri) {
                setImageUri(result.uri);
                setCaption('');
                setShowCaptionInput(false);
                setPhase('preview');
            }
        } catch (e) {
            console.error('Photo capture failed', e);
        }
    };

    const pickFromLibrary = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                quality: 0.8,
                allowsEditing: true,
            });
            if (!result.canceled && result.assets[0]) {
                setImageUri(result.assets[0].uri);
                setCaption('');
                setShowCaptionInput(false);
                setPhase('preview');
            }
        } catch (e) {
            console.error('Image picker failed', e);
        }
    };

    const handleSend = async () => {
        if (!imageUri) return;
        setPhase('uploading');

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('No active session');

            const url = await uploadCardImage(
                imageUri,
                currentUser!.id,
                session.access_token
            );

            await createCard(url, caption.trim() || null);

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setPhase('done');

            setTimeout(() => {
                onComplete();
            }, 1000);
        } catch (e) {
            console.error('Send error:', e);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            setError(e instanceof Error ? e.message : 'Something went wrong');
            setPhase('error');
        }
    };

    const handlePreviewTap = () => {
        if (showCaptionInput) {
            Keyboard.dismiss();
            setShowCaptionInput(false);
        } else {
            setShowCaptionInput(true);
        }
    };

    return (
        <View style={styles.container}>
            {/* Camera View */}
            {phase === 'idle' && (
                <View style={StyleSheet.absoluteFill}>
                    <CameraView
                        ref={cameraRef}
                        style={StyleSheet.absoluteFill}
                        facing={facing}
                        mode="picture"
                    />

                    {/* Dark overlay with transparent crop-guide hole */}
                    <View style={styles.overlayHost} pointerEvents="none">
                        <View style={styles.overlayTop} />
                        <View style={styles.overlayMiddleRow}>
                            <View style={styles.overlaySide} />
                            <View style={styles.guideRect}>
                                <View style={styles.guideBorderIdle} />
                            </View>
                            <View style={styles.overlaySide} />
                        </View>
                        <View style={styles.overlayBottom} />
                    </View>
                </View>
            )}

            {/* Preview View */}
            {phase === 'preview' && imageUri && (
                <KeyboardAvoidingView
                    style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center' }]}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    <TouchableOpacity
                        activeOpacity={1}
                        onPress={handlePreviewTap}
                        style={styles.previewContainer}
                    >
                        <Image
                            source={{ uri: imageUri }}
                            style={StyleSheet.absoluteFill}
                            contentFit="cover"
                        />
                        {/* Caption overlay preview */}
                        {caption.trim() !== '' && !showCaptionInput && (
                            <View style={styles.captionPreviewWrap}>
                                <View style={styles.captionPreviewBar}>
                                    <Text style={styles.captionPreviewText}>{caption}</Text>
                                </View>
                            </View>
                        )}
                        {/* Tap hint */}
                        {!caption && !showCaptionInput && (
                            <View style={styles.captionHintWrap}>
                                <Text style={styles.captionHintText}>Tap to add text</Text>
                            </View>
                        )}
                    </TouchableOpacity>

                    {/* Caption text input */}
                    {showCaptionInput && (
                        <View style={styles.captionInputWrap}>
                            <TextInput
                                style={styles.captionInput}
                                value={caption}
                                onChangeText={(t) => setCaption(t.slice(0, CAPTION_MAX))}
                                placeholder="Add a caption..."
                                placeholderTextColor={Theme.colors.textTertiary}
                                maxLength={CAPTION_MAX}
                                autoFocus
                                returnKeyType="done"
                                onSubmitEditing={() => {
                                    Keyboard.dismiss();
                                    setShowCaptionInput(false);
                                }}
                                multiline={false}
                            />
                            <Text style={styles.captionCount}>{caption.length}/{CAPTION_MAX}</Text>
                        </View>
                    )}

                    {!showCaptionInput && (
                        <View style={styles.previewActions}>
                            <TouchableOpacity style={styles.actionBtn} onPress={() => {
                                setPhase('idle');
                                setImageUri(null);
                                setCaption('');
                            }}>
                                <Ionicons name="close" size={24} color={Theme.colors.textPrimary} />
                                <Text style={styles.actionText}>Retake</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={[styles.actionBtn, styles.sendBtn]} onPress={handleSend}>
                                <Text style={[styles.actionText, { fontWeight: '600' }]}>Send</Text>
                                <Ionicons name="paper-plane" size={20} color={Theme.colors.textPrimary} />
                            </TouchableOpacity>
                        </View>
                    )}
                </KeyboardAvoidingView>
            )}

            {/* Uploading & Status Overlays */}
            {(phase === 'uploading' || phase === 'done' || phase === 'error') && (
                <View style={[StyleSheet.absoluteFill, styles.statusOverlay]}>
                    {phase === 'uploading' && (
                        <>
                            <ActivityIndicator size="large" color={Theme.colors.textPrimary} />
                            <Text style={styles.statusText}>Uploading...</Text>
                        </>
                    )}
                    {phase === 'done' && (
                        <>
                            <View style={styles.successIcon}>
                                <Ionicons name="checkmark" size={40} color={Theme.colors.textOnAccent} />
                            </View>
                            <Text style={styles.statusText}>Sent</Text>
                        </>
                    )}
                    {phase === 'error' && (
                        <>
                            <Ionicons name="alert-circle" size={48} color={Theme.colors.danger} />
                            <Text style={[styles.statusText, { color: Theme.colors.danger }]}>{error}</Text>
                            <TouchableOpacity style={[styles.retryButton, { marginTop: 24 }]} onPress={() => setPhase('preview')}>
                                <Text style={styles.retryText}>Try Again</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            )}

            {/* Controls (Idle) */}
            {phase === 'idle' && (
                <>
                    <TouchableOpacity
                        style={[styles.closeCamera, { top: insets.top + 12 }]}
                        onPress={onClose}
                    >
                        <Ionicons name="close" size={28} color={Theme.colors.textPrimary} />
                    </TouchableOpacity>

                    {/* Flip camera toggle */}
                    <TouchableOpacity
                        style={[styles.flipButton, { top: insets.top + 12 }]}
                        onPress={() => setFacing(f => f === 'front' ? 'back' : 'front')}
                    >
                        <Ionicons name="camera-reverse-outline" size={24} color={Theme.colors.textPrimary} />
                    </TouchableOpacity>

                    <View style={[styles.shutterHost, { bottom: insets.bottom + 40 }]}>
                        {/* Gallery picker */}
                        <TouchableOpacity
                            style={styles.galleryButton}
                            onPress={pickFromLibrary}
                        >
                            <Ionicons name="images-outline" size={28} color={Theme.colors.textPrimary} />
                        </TouchableOpacity>

                        {/* Shutter */}
                        <TouchableOpacity
                            activeOpacity={0.9}
                            onPress={takePicture}
                            style={styles.shutterBtn}
                        >
                            <View style={styles.shutterInner} />
                        </TouchableOpacity>

                        {/* Spacer to balance the row */}
                        <View style={{ width: 48 }} />
                    </View>
                </>
            )}
        </View>
    );
}

const overlayBg = Theme.colors.overlay;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Theme.colors.background,
    },
    centered: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    errorText: {
        fontFamily: Theme.fonts.base,
        color: Theme.colors.textPrimary,
        fontSize: 16,
    },
    retryButton: {
        backgroundColor: Theme.colors.buttonBorder,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 8,
        marginTop: 16,
    },
    retryText: {
        fontFamily: Theme.fonts.base,
        color: Theme.colors.textPrimary,
        fontWeight: '600',
    },
    closeCamera: {
        position: 'absolute',
        left: 20,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: Theme.colors.buttonBackground,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    flipButton: {
        position: 'absolute',
        right: 20,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: Theme.colors.buttonBackground,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },

    // Crop overlay
    overlayHost: {
        ...StyleSheet.absoluteFillObject,
    },
    overlayTop: {
        flex: 1,
        backgroundColor: overlayBg,
    },
    overlayMiddleRow: {
        flexDirection: 'row',
        height: GUIDE_HEIGHT,
    },
    overlaySide: {
        width: GUIDE_PADDING,
        backgroundColor: overlayBg,
    },
    guideRect: {
        width: GUIDE_WIDTH,
        height: GUIDE_HEIGHT,
    },
    guideBorderIdle: {
        ...StyleSheet.absoluteFillObject,
        borderWidth: 1,
        borderColor: Theme.colors.sheetHandle,
        borderRadius: 8,
    },
    overlayBottom: {
        flex: 1,
        backgroundColor: overlayBg,
    },

    // Shutter row
    shutterHost: {
        position: 'absolute',
        alignSelf: 'center',
        width: screenWidth * 0.6,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    shutterBtn: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 4,
        borderColor: 'rgba(255,255,255,0.6)',
        padding: 6,
        justifyContent: 'center',
        alignItems: 'center',
    },
    shutterInner: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: Theme.colors.textPrimary,
    },
    galleryButton: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: Theme.colors.buttonBackground,
        justifyContent: 'center',
        alignItems: 'center',
    },

    // Preview
    previewContainer: {
        width: GUIDE_WIDTH,
        height: GUIDE_HEIGHT,
        borderRadius: 8,
        overflow: 'hidden',
    },
    previewActions: {
        flexDirection: 'row',
        marginTop: 40,
        width: GUIDE_WIDTH,
        justifyContent: 'space-between',
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Theme.colors.buttonBorder,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 24,
    },
    sendBtn: {
        backgroundColor: Theme.colors.accent,
    },
    actionText: {
        fontFamily: Theme.fonts.base,
        color: Theme.colors.textPrimary,
        fontSize: 16,
        marginHorizontal: 8,
    },

    // Caption overlay on preview image
    captionPreviewWrap: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: '18%',
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    captionPreviewBar: {
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 4,
        maxWidth: '100%',
    },
    captionPreviewText: {
        fontFamily: Theme.fonts.base,
        fontSize: 15,
        fontWeight: '600',
        color: '#FFFFFF',
        textAlign: 'center',
    },

    // Tap hint
    captionHintWrap: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: '18%',
        alignItems: 'center',
    },
    captionHintText: {
        fontFamily: Theme.fonts.base,
        fontSize: 13,
        color: 'rgba(255,255,255,0.5)',
    },

    // Caption input
    captionInputWrap: {
        width: GUIDE_WIDTH,
        marginTop: 16,
        flexDirection: 'row',
        alignItems: 'center',
    },
    captionInput: {
        flex: 1,
        fontFamily: Theme.fonts.base,
        fontSize: 16,
        color: Theme.colors.textPrimary,
        backgroundColor: Theme.colors.inputBackground,
        borderWidth: 1,
        borderColor: Theme.colors.inputBorder,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    captionCount: {
        fontFamily: Theme.fonts.mono,
        fontSize: 11,
        color: Theme.colors.textTertiary,
        marginLeft: 8,
    },

    // Status
    statusOverlay: {
        backgroundColor: Theme.colors.overlayHeavy,
        justifyContent: 'center',
        alignItems: 'center',
    },
    statusText: {
        fontFamily: Theme.fonts.base,
        fontSize: 18,
        color: Theme.colors.textPrimary,
        marginTop: 16,
        fontWeight: '600',
    },
    successIcon: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: Theme.colors.accent,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
