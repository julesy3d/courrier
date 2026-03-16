import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import React, { useCallback, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import PostcardInspector from './PostcardInspector';
import { uploadPostcardImage } from '../lib/imageUtils';
import { useTranslation } from '../lib/i18n';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';

type CapturePhase =
    | 'idle'
    | 'capturing_recto'
    | 'switching'
    | 'capturing_selfie'
    | 'preview'
    | 'uploading'
    | 'done'
    | 'error';

interface DualCameraCaptureProps {
    onComplete: () => void;
    onClose: () => void;
}

export default function DualCameraCapture({ onComplete, onClose }: DualCameraCaptureProps) {
    const insets = useSafeAreaInsets();
    const { t } = useTranslation();
    const { currentUser, broadcastPostcard, setHasPostedFirst, hasPostedFirst } = useStore();
    const [permission, requestPermission] = useCameraPermissions();

    const cameraRef = useRef<CameraView>(null);
    const [facing, setFacing] = useState<'back' | 'front'>('back');
    const [phase, setPhase] = useState<CapturePhase>('idle');
    const [error, setError] = useState<string | null>(null);
    const [isCameraReady, setIsCameraReady] = useState(false);
    const [cameraKey, setCameraKey] = useState(0);
    const [capturedRectoUri, setCapturedRectoUri] = useState<string | null>(null);
    const [capturedSelfieUri, setCapturedSelfieUri] = useState<string | null>(null);

    // Flash animation
    const flashOpacity = useRef(new Animated.Value(0)).current;

    const triggerFlash = () => {
        flashOpacity.setValue(1);
        Animated.timing(flashOpacity, {
            toValue: 0,
            duration: 150,
            useNativeDriver: true,
        }).start();
    };

    const handleCapture = useCallback(async () => {
        if (phase !== 'idle' || !cameraRef.current || !isCameraReady) return;

        setError(null);

        try {
            // ── Step 1: Capture recto (back camera) ──
            setPhase('capturing_recto');
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            triggerFlash();

            const rectoResult = await cameraRef.current.takePictureAsync({
                quality: 0.8,
            });
            if (!rectoResult?.uri) throw new Error('Back camera capture failed');

            // Fix orientation mapping
            const rectoFixed = await ImageManipulator.manipulateAsync(
                rectoResult.uri,
                [], // empty array triggers re-encode which bakes EXIF rotation
                { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
            );
            const rectoUri = rectoFixed.uri;

            // ── Step 2: Switch to front camera ──
            setPhase('switching');
            setIsCameraReady(false);
            setFacing('front');

            // Wait for camera to switch and stabilize
            await new Promise<void>((resolve) => {
                const checkReady = setInterval(() => {
                    // isCameraReady will be set by onCameraReady callback
                    // We use a timeout as a fallback
                }, 100);

                const timeout = setTimeout(() => {
                    clearInterval(checkReady);
                    resolve();
                }, 1000); // Max 1s wait for camera switch

                // Also resolve early when camera is ready via a ref flag
                const earlyResolve = () => {
                    clearInterval(checkReady);
                    clearTimeout(timeout);
                    // Small extra delay for auto-exposure to settle
                    setTimeout(resolve, 300);
                };

                // Store the resolver so onCameraReady can call it
                cameraReadyResolver.current = earlyResolve;
            });

            // ── Step 3: Capture selfie (front camera) ──
            setPhase('capturing_selfie');
            triggerFlash();

            const selfieResult = await cameraRef.current.takePictureAsync({
                quality: 0.8,
            });
            let selfieUri = selfieResult?.uri || null;

            if (selfieUri) {
                const selfieFixed = await ImageManipulator.manipulateAsync(
                    selfieUri,
                    [],
                    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
                );
                selfieUri = selfieFixed.uri;
            }

            // ── Step 4: Enter preview ──
            setCapturedRectoUri(rectoUri);
            setCapturedSelfieUri(selfieUri);
            setPhase('preview');

        } catch (e) {
            console.error('Capture error:', e);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            setError(e instanceof Error ? e.message : 'Something went wrong');
            setPhase('error');
            // Reset camera to back for retry
            setFacing('back');
        }
    }, [phase, isCameraReady]);

    const handleSend = async () => {
        if (!capturedRectoUri) return;
        setPhase('uploading');

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('No active session');

            const rectoUrl = await uploadPostcardImage(
                capturedRectoUri,
                currentUser!.id,
                session.access_token
            );

            let selfieUrl: string | null = null;
            if (capturedSelfieUri) {
                selfieUrl = await uploadPostcardImage(
                    capturedSelfieUri,
                    currentUser!.id,
                    session.access_token
                );
            }

            await broadcastPostcard({ rectoUrl, selfieUrl });

            if (!hasPostedFirst) {
                setHasPostedFirst(true);
            }

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setPhase('done');

            // Linger on confirmation for 2 seconds, then dismiss
            setTimeout(() => {
                onComplete();
            }, 2000);

        } catch (e) {
            console.error('Send error:', e);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            setError(e instanceof Error ? e.message : 'Something went wrong');
            setPhase('error');
        }
    };

    // Ref to resolve the camera-switch wait early
    const cameraReadyResolver = useRef<(() => void) | null>(null);

    const handleCameraReady = useCallback(() => {
        setIsCameraReady(true);
        if (cameraReadyResolver.current) {
            cameraReadyResolver.current();
            cameraReadyResolver.current = null;
        }
    }, []);

    const handleRetry = () => {
        setPhase('idle');
        setError(null);
        setIsCameraReady(false);
        setCameraKey(k => k + 1);
        // Camera will fire onCameraReady when it's back
    };

    // ── Permission handling ──
    if (!permission) {
        return <View style={styles.container} />;
    }

    if (!permission.granted) {
        return (
            <View style={[styles.container, styles.centered]}>
                <Text style={styles.permissionText}>
                    Camera access is needed to take postcards.
                </Text>
                <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
                    <Text style={styles.permissionButtonText}>Grant Access</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ marginTop: 16, padding: 12 }} onPress={onClose}>
                    <Text style={[styles.permissionText, { fontSize: 14 }]}>Cancel</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // ── Uploading / switching overlay ──
    const showOverlay = phase === 'uploading' || phase === 'switching' || phase === 'capturing_selfie';

    return (
        <View style={styles.container}>
            {phase !== 'preview' && phase !== 'uploading' && phase !== 'done' && (
                <CameraView
                    key={cameraKey}
                    ref={cameraRef}
                    style={StyleSheet.absoluteFill}
                    facing={facing}
                    mirror={facing === 'front'}
                    onCameraReady={handleCameraReady}
                />
            )}

            {/* Flash effect */}
            <Animated.View
                style={[
                    StyleSheet.absoluteFill,
                    { backgroundColor: '#FFFFFF', opacity: flashOpacity },
                ]}
                pointerEvents="none"
            />

            {/* Processing overlay */}
            {showOverlay && (
                <View style={[StyleSheet.absoluteFill, styles.overlay]}>
                    <ActivityIndicator size="large" color="#FFFFFF" />
                    <Text style={styles.overlayText}>
                        {phase === 'switching' || phase === 'capturing_selfie'
                            ? t('common.loading')
                            : t('firstPost.posting')}
                    </Text>
                </View>
            )}

            {/* Preview State */}
            {phase === 'preview' && capturedRectoUri && (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 100 }]}>
                    <PostcardInspector
                        letter={{ id: 'preview', sent_at: new Date().toISOString(), opened_at: null }}
                        post={{ id: 'preview', recto_url: capturedRectoUri, selfie_url: capturedSelfieUri }}
                        senderName={currentUser?.display_name || ''}
                        onDismiss={() => {
                            setCapturedRectoUri(null);
                            setCapturedSelfieUri(null);
                            setPhase('idle');
                            onClose();
                        }}
                        mode="preview"
                        onRetake={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setCapturedRectoUri(null);
                            setCapturedSelfieUri(null);
                            setFacing('back');
                            setPhase('idle');
                            setIsCameraReady(false);
                            setCameraKey(k => k + 1);
                        }}
                        onSend={handleSend}
                    />
                </View>
            )}

            {/* Error state */}
            {phase === 'error' && (
                <View style={[StyleSheet.absoluteFill, styles.overlay]}>
                    <Ionicons name="alert-circle-outline" size={48} color="#FF4444" />
                    <Text style={[styles.overlayText, { color: '#FF4444', marginTop: 12 }]}>
                        {error}
                    </Text>
                    <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
                        <Text style={styles.retryButtonText}>{t('compose.error').split('.')[1]?.trim() || 'Try Again'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={{ marginTop: 12, padding: 12 }} onPress={onClose}>
                        <Text style={styles.overlayText}>{t('common.cancel')}</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Sent confirmation */}
            {phase === 'done' && (
                <View style={[StyleSheet.absoluteFill, styles.overlay]}>
                    <View style={{
                        width: 80,
                        height: 80,
                        borderRadius: 40,
                        backgroundColor: 'rgba(255,255,255,0.15)',
                        justifyContent: 'center',
                        alignItems: 'center',
                        marginBottom: 16,
                    }}>
                        <Ionicons name="checkmark" size={40} color="#FFFFFF" />
                    </View>
                    <Text style={[styles.overlayText, { fontSize: 22, marginTop: 0 }]}>
                        Sent
                    </Text>
                </View>
            )}

            {/* Controls — only visible in idle state */}
            {phase === 'idle' && (
                <>
                    {/* Close button */}
                    <TouchableOpacity
                        style={[styles.closeButton, { top: insets.top + 12 }]}
                        onPress={onClose}
                    >
                        <Ionicons name="close" size={28} color="#FFFFFF" />
                    </TouchableOpacity>

                    {/* Shutter button */}
                    <View style={[styles.shutterContainer, { bottom: insets.bottom + 40 }]}>
                        <TouchableOpacity
                            style={styles.shutterButton}
                            onPress={handleCapture}
                            disabled={!isCameraReady}
                            activeOpacity={0.7}
                        >
                            <View style={[
                                styles.shutterInner,
                                !isCameraReady && { opacity: 0.4 },
                            ]} />
                        </TouchableOpacity>
                    </View>
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    centered: {
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    overlay: {
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    overlayText: {
        fontFamily: 'Avenir Next',
        fontSize: 16,
        color: '#FFFFFF',
        marginTop: 16,
        textAlign: 'center',
    },
    closeButton: {
        position: 'absolute',
        left: 16,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    shutterContainer: {
        position: 'absolute',
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    shutterButton: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 4,
        borderColor: '#FFFFFF',
        padding: 4,
        justifyContent: 'center',
        alignItems: 'center',
    },
    shutterInner: {
        width: '100%',
        height: '100%',
        borderRadius: 36,
        backgroundColor: '#FFFFFF',
    },
    retryButton: {
        marginTop: 20,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 12,
        paddingHorizontal: 24,
        paddingVertical: 12,
    },
    retryButtonText: {
        fontFamily: 'Avenir Next',
        fontSize: 16,
        color: '#FFFFFF',
        fontWeight: '600',
    },
    permissionText: {
        fontFamily: 'Avenir Next',
        fontSize: 16,
        color: '#FFFFFF',
        textAlign: 'center',
    },
    permissionButton: {
        marginTop: 20,
        backgroundColor: '#C4654A',
        borderRadius: 12,
        paddingHorizontal: 24,
        paddingVertical: 12,
    },
    permissionButtonText: {
        fontFamily: 'Avenir Next',
        fontSize: 16,
        color: '#FFFFFF',
        fontWeight: '600',
    },
});
