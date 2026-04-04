import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, AppState, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Card, useStore } from '../../lib/store';
import MatchupView from '../../components/MatchupView';
import EmptyState from '../../components/EmptyState';
import PhotoCapture from '../../components/PhotoCapture';
import GlassSurface from '../../components/GlassSurface';
import { Theme } from '../../theme';

export default function MainScreen() {
    const { currentUser, cardPool, fetchCardPool, heartbeat, returnUnusedCards } = useStore();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [isLoading, setIsLoading] = useState(true);
    const [showCamera, setShowCamera] = useState(false);
    const [initialCards, setInitialCards] = useState<{ a: Card; b: Card } | null>(null);

    const initPool = async () => {
        try {
            await heartbeat();

            // Return fuel for stale cards from a previous session, then start fresh
            const stalePool = useStore.getState().cardPool;
            if (stalePool.length > 0) {
                returnUnusedCards(stalePool.map(c => c.id));
                useStore.setState({ cardPool: [], poolExcludeIds: [] });
            }

            await fetchCardPool(10);

            // Wait for the first 2 images to be cached before displaying.
            // The rest are prefetched in background by fetchCardPool.
            const pool = useStore.getState().cardPool;
            if (pool.length >= 2) {
                await Promise.all([
                    Image.prefetch(pool[0].video_url),
                    Image.prefetch(pool[1].video_url),
                ]);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    // Pop first two cards for display once pool is ready
    useEffect(() => {
        const pool = useStore.getState().cardPool;
        if (!isLoading && pool.length >= 2 && !initialCards) {
            const a = pool[0];
            const b = pool[1];
            useStore.setState({ cardPool: pool.slice(2) });
            setInitialCards({ a, b });
        }
    }, [isLoading, cardPool.length]);

    useEffect(() => {
        initPool();
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') {
                // On resume: refill pool if low, don't reset current matchup
                const pool = useStore.getState().cardPool;
                if (pool.length < 5) {
                    fetchCardPool(10).catch(console.error);
                }
            }
        });
        return () => sub.remove();
    }, []);

    const handleJudged = () => {
        // Pool ran out during play — try to refill and restart
        setInitialCards(null);
        setIsLoading(true);
        fetchCardPool(10).then(async () => {
            const pool = useStore.getState().cardPool;
            if (pool.length >= 2) {
                await Promise.all([
                    Image.prefetch(pool[0].video_url),
                    Image.prefetch(pool[1].video_url),
                ]);
                setInitialCards({ a: pool[0], b: pool[1] });
                useStore.setState({ cardPool: pool.slice(2) });
            }
            setIsLoading(false);
        }).catch(() => setIsLoading(false));
    };

    const handleVideoCreated = () => {
        setShowCamera(false);
        // Refill pool in background after creating a card
        const pool = useStore.getState().cardPool;
        if (pool.length < 5) {
            fetchCardPool(10).catch(console.error);
        }
    };

    return (
        <View style={styles.container}>
            {/* Floating avatar — top left */}
            {!showCamera && (
                <TouchableOpacity
                    onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.push('/(main)/profile' as any);
                    }}
                    style={[styles.avatarButton, { top: insets.top + 8 }]}
                >
                    <Ionicons name="person-outline" size={18} color={Theme.colors.textPrimary} />
                </TouchableOpacity>
            )}

            {/* Floating leaderboard — top right */}
            {!showCamera && (
                <TouchableOpacity
                    onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.push('/(main)/leaderboard' as any);
                    }}
                    style={[styles.leaderboardButton, { top: insets.top + 8 }]}
                >
                    <Text style={styles.leaderboardIcon}>🏆</Text>
                </TouchableOpacity>
            )}

            {/* Content area — full screen */}
            <View style={styles.content}>
                {isLoading && !initialCards ? (
                    <View style={styles.center}>
                        <ActivityIndicator size="large" color={Theme.colors.textSecondary} />
                    </View>
                ) : initialCards ? (
                    <MatchupView
                        initialCardA={initialCards.a}
                        initialCardB={initialCards.b}
                        onJudged={handleJudged}
                    />
                ) : (
                    <EmptyState />
                )}
            </View>

            {/* Buried FAB */}
            {!showCamera && (
                <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        setShowCamera(true);
                    }}
                    style={[styles.fab, { bottom: insets.bottom + 12 }]}
                >
                    <GlassSurface style={styles.fabGlass} intensity={50} tint="default">
                        <Ionicons name="add" size={30} color={Theme.colors.textPrimary} />
                    </GlassSurface>
                </TouchableOpacity>
            )}

            {/* Camera Overlay */}
            {showCamera && (
                <View style={StyleSheet.absoluteFill}>
                    <PhotoCapture
                        onComplete={handleVideoCreated}
                        onClose={() => {
                            setShowCamera(false);
                        }}
                    />
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Theme.colors.background,
    },
    content: {
        flex: 1,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarButton: {
        position: 'absolute',
        left: 16,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: Theme.colors.buttonBackground,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 20,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: Theme.colors.buttonBorder,
    },
    leaderboardButton: {
        position: 'absolute',
        right: 16,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: Theme.colors.buttonBackground,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 20,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: Theme.colors.buttonBorder,
    },
    leaderboardIcon: {
        fontSize: 14,
    },
    fab: {
        position: 'absolute',
        alignSelf: 'center',
        width: 56,
        height: 56,
        borderRadius: 28,
        zIndex: 20,
        overflow: 'hidden',
    },
    fabGlass: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 28,
    },
});
