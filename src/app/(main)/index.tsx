import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, AppState, ActivityIndicator, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useStore } from '../../lib/store';
import { supabase } from '../../lib/supabase';
import MatchupView from '../../components/MatchupView';
import EmptyState from '../../components/EmptyState';
import VideoCapture from '../../components/VideoCapture';
import GlassSurface from '../../components/GlassSurface';
import { cleanVideoCache } from '../../lib/videoCache';
import { Theme } from '../../theme';

export default function MainScreen() {
    const { currentUser, cachedMatchups, syncMatchups, heartbeat } = useStore();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [isLoading, setIsLoading] = useState(true);
    const [showCamera, setShowCamera] = useState(false);
    const [activeMatchupCount, setActiveMatchupCount] = useState(0);

    const fetchActiveCount = async () => {
        try {
            const { count } = await supabase
                .from('matchups')
                .select('id', { count: 'exact', head: true })
                .is('judged_at', null);
            setActiveMatchupCount(count || 0);
        } catch (e) {
            console.error('Error fetching count', e);
        }
    };

    const syncAll = async () => {
        try {
            // Clear stale cached matchups — always start fresh from the server
            useStore.setState({ cachedMatchups: [] });
            await heartbeat();
            await syncMatchups();
            await fetchActiveCount();

            // Clean video files not needed by current matchups
            const matchups = useStore.getState().cachedMatchups;
            const activeUrls = matchups.flatMap(m => [m.card_a.video_url, m.card_b.video_url]);
            cleanVideoCache(activeUrls);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        syncAll();
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') syncAll();
        });
        return () => sub.remove();
    }, []);

    const handleJudged = () => {
        fetchActiveCount();
    };

    const currentMatchup = cachedMatchups[0];

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
                {isLoading && cachedMatchups.length === 0 ? (
                    <View style={styles.center}>
                        <ActivityIndicator size="large" color={Theme.colors.textSecondary} />
                    </View>
                ) : currentMatchup ? (
                    <MatchupView
                        matchup={currentMatchup}
                        onJudged={handleJudged}
                    />
                ) : (
                    <EmptyState activeMatchupCount={activeMatchupCount} />
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
                    <VideoCapture
                        onComplete={() => {
                            setShowCamera(false);
                            syncAll();
                        }}
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
