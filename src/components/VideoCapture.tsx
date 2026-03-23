import React, { useRef, useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Dimensions, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming, SharedValue } from 'react-native-reanimated';
import { uploadCardVideo } from '../lib/imageUtils';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { useTranslation } from '../lib/i18n';
import { Theme } from '../theme';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const GUIDE_PADDING = 12; // horizontal padding from screen edge
const GUIDE_WIDTH = screenWidth - GUIDE_PADDING * 2;
// Match the half-screen aspect ratio where cards are displayed:
const GUIDE_HEIGHT = GUIDE_WIDTH * (screenHeight / 2) / screenWidth;

interface VideoCaptureProps {
    onComplete: () => void;
    onClose: () => void;
}

type Phase = 'idle' | 'recording' | 'preview' | 'uploading' | 'done' | 'error';

function CropGuideProgress({ progress }: { progress: SharedValue<number> }) {
    // Top edge: progress 0–0.25 → width 0–100%
    const topStyle = useAnimatedStyle(() => {
        const p = Math.min(Math.max(progress.value / 0.25, 0), 1);
        return { width: GUIDE_WIDTH * p };
    });

    // Right edge: progress 0.25–0.50 → height 0–100%
    const rightStyle = useAnimatedStyle(() => {
        const p = Math.min(Math.max((progress.value - 0.25) / 0.25, 0), 1);
        return { height: GUIDE_HEIGHT * p };
    });

    // Bottom edge: progress 0.50–0.75 → width 0–100%, anchored right
    const bottomStyle = useAnimatedStyle(() => {
        const p = Math.min(Math.max((progress.value - 0.5) / 0.25, 0), 1);
        return { width: GUIDE_WIDTH * p };
    });

    // Left edge: progress 0.75–1.00 → height 0–100%, anchored bottom
    const leftStyle = useAnimatedStyle(() => {
        const p = Math.min(Math.max((progress.value - 0.75) / 0.25, 0), 1);
        return { height: GUIDE_HEIGHT * p };
    });

    return (
        <View style={cropProgressStyles.container} pointerEvents="none">
            {/* Top edge — anchored top-left, grows right */}
            <Reanimated.View style={[cropProgressStyles.edge, {
                top: 0, left: 0, height: 3,
            }, topStyle]} />

            {/* Right edge — anchored top-right, grows down */}
            <Reanimated.View style={[cropProgressStyles.edge, {
                top: 0, right: 0, width: 3,
            }, rightStyle]} />

            {/* Bottom edge — anchored bottom-right, grows left */}
            <Reanimated.View style={[cropProgressStyles.edge, {
                bottom: 0, right: 0, height: 3,
            }, bottomStyle]} />

            {/* Left edge — anchored bottom-left, grows up */}
            <Reanimated.View style={[cropProgressStyles.edge, {
                bottom: 0, left: 0, width: 3,
            }, leftStyle]} />
        </View>
    );
}

const cropProgressStyles = StyleSheet.create({
    container: {
        position: 'absolute',
        width: GUIDE_WIDTH,
        height: GUIDE_HEIGHT,
    },
    edge: {
        position: 'absolute',
        backgroundColor: Theme.colors.danger,
        borderRadius: 1.5,
    },
});

export default function VideoCapture({ onComplete, onClose }: VideoCaptureProps) {
    const { currentUser, createCard } = useStore();
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const [permission, requestPermission] = useCameraPermissions();

    const cameraRef = useRef<CameraView>(null);
    const [phase, setPhase] = useState<Phase>('idle');
    const [error, setError] = useState<string | null>(null);
    const [videoUri, setVideoUri] = useState<string | null>(null);

    const progress = useSharedValue(0);
    const recordingTimeout = useRef<NodeJS.Timeout | null>(null);

    const player = useVideoPlayer(videoUri, player => {
        player.loop = true;
        player.play();
    });

    useEffect(() => {
        if (phase === 'preview' && videoUri) {
            player.replace(videoUri);
            player.loop = true;
            player.play();
        } else if (phase !== 'preview') {
            player.pause();
        }
    }, [phase, videoUri]);

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

    const startRecording = async () => {
        if (phase !== 'idle' || !cameraRef.current) return;

        try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setPhase('recording');

            // Animate the crop guide progress
            progress.value = withTiming(1, { duration: 5000 });

            // Auto-stop after 5s
            recordingTimeout.current = setTimeout(() => {
                stopRecording();
            }, 5000);

            const result = await cameraRef.current.recordAsync({
                maxDuration: 5,
            });

            if (result?.uri) {
                setVideoUri(result.uri);
                setPhase('preview');
                progress.value = 0;
            }
        } catch (e) {
            console.error('Recording failed', e);
            setPhase('idle');
            progress.value = 0;
        }
    };

    const stopRecording = () => {
        if (cameraRef.current && phase === 'recording') {
            cameraRef.current.stopRecording();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
    };

    const handleSend = async () => {
        if (!videoUri) return;
        setPhase('uploading');

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('No active session');

            const url = await uploadCardVideo(
                videoUri,
                currentUser!.id,
                session.access_token
            );

            await createCard(url);

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

    return (
        <View style={styles.container}>
            {/* Camera View */}
            {(phase === 'idle' || phase === 'recording') && (
                <View style={StyleSheet.absoluteFill}>
                    <CameraView
                        ref={cameraRef}
                        style={StyleSheet.absoluteFill}
                        facing="back"
                        mode="video"
                    />

                    {/* Dark overlay with transparent crop-guide hole */}
                    <View style={styles.overlayHost} pointerEvents="none">
                        <View style={styles.overlayTop} />
                        <View style={styles.overlayMiddleRow}>
                            <View style={styles.overlaySide} />
                            <View style={styles.guideRect}>
                                {/* Subtle white border when idle */}
                                {phase === 'idle' && (
                                    <View style={styles.guideBorderIdle} />
                                )}
                                {/* Red progress border when recording */}
                                {phase === 'recording' && (
                                    <CropGuideProgress progress={progress} />
                                )}
                            </View>
                            <View style={styles.overlaySide} />
                        </View>
                        <View style={styles.overlayBottom} />
                    </View>
                </View>
            )}

            {/* Preview View */}
            {phase === 'preview' && videoUri && (
                <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center' }]}>
                    <View style={styles.previewContainer}>
                        <VideoView
                            player={player}
                            style={StyleSheet.absoluteFill}
                            contentFit="cover"
                            showsTimecodes={false}
                            nativeControls={false}
                        />
                    </View>

                    <View style={styles.previewActions}>
                        <TouchableOpacity style={styles.actionBtn} onPress={() => {
                            setPhase('idle');
                            setVideoUri(null);
                        }}>
                            <Ionicons name="close" size={24} color={Theme.colors.textPrimary} />
                            <Text style={styles.actionText}>Retake</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.actionBtn, styles.sendBtn]} onPress={handleSend}>
                            <Text style={[styles.actionText, { fontWeight: '600' }]}>Send</Text>
                            <Ionicons name="paper-plane" size={20} color={Theme.colors.textPrimary} />
                        </TouchableOpacity>
                    </View>
                </View>
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

            {/* Controls (Idle / Recording) */}
            {(phase === 'idle' || phase === 'recording') && (
                <>
                    {phase === 'idle' && (
                        <TouchableOpacity
                            style={[styles.closeCamera, { top: insets.top + 12 }]}
                            onPress={onClose}
                        >
                            <Ionicons name="close" size={28} color={Theme.colors.textPrimary} />
                        </TouchableOpacity>
                    )}

                    <View style={[styles.shutterHost, { bottom: insets.bottom + 40 }]}>
                        <TouchableOpacity
                            activeOpacity={0.9}
                            onPressIn={startRecording}
                            style={styles.shutterBtn}
                        >
                            <Reanimated.View style={[
                                phase === 'recording' ? styles.shutterInnerRecording : styles.shutterInner,
                            ]} />
                        </TouchableOpacity>
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
        // transparent hole — no backgroundColor
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

    // Shutter
    shutterHost: {
        position: 'absolute',
        alignSelf: 'center',
        width: 80,
        height: 80,
        justifyContent: 'center',
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
    shutterInnerRecording: {
        width: 28,
        height: 28,
        borderRadius: 6,
        backgroundColor: Theme.colors.danger,
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
