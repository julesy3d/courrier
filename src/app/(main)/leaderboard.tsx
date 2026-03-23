import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    ActivityIndicator,
    TouchableOpacity,
    RefreshControl,
    Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { supabase } from '../../lib/supabase';
import { getVideoUri } from '../../lib/videoCache';
import { Theme } from '../../theme';

type LeaderboardEntry = {
    id: string;
    video_url: string;
    total_wins: number;
    pending_views: number;
    creator_username: string;
    rank: number;
};

// ─── Looping mini-player for top 5 ───
function MiniPlayer({ videoUrl, size }: { videoUrl: string; size: number }) {
    const uri = getVideoUri(videoUrl);
    const player = useVideoPlayer(uri, (p) => {
        p.loop = true;
        p.volume = 0;
        p.play();
    });

    return (
        <View style={[miniStyles.container, { width: size, height: size }]}>
            <VideoView
                player={player}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                nativeControls={false}
                allowsVideoFrameAnalysis={false}
            />
        </View>
    );
}

const miniStyles = StyleSheet.create({
    container: {
        borderRadius: 6,
        overflow: 'hidden',
        marginRight: 10,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
});

// ─── Video preview modal (for entries below top 5) ───
function VideoPreviewModal({ videoUrl, visible, onClose }: {
    videoUrl: string | null;
    visible: boolean;
    onClose: () => void;
}) {
    const player = useVideoPlayer(visible ? videoUrl : null, (p) => {
        p.loop = true;
        p.play();
    });

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableOpacity
                style={previewStyles.backdrop}
                activeOpacity={1}
                onPress={onClose}
            >
                <View style={previewStyles.videoContainer}>
                    {player && (
                        <VideoView
                            player={player}
                            style={previewStyles.video}
                            contentFit="cover"
                            nativeControls={false}
                        />
                    )}
                </View>
            </TouchableOpacity>
        </Modal>
    );
}

const previewStyles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: Theme.colors.overlayHeavy,
        justifyContent: 'center',
        alignItems: 'center',
    },
    videoContainer: {
        width: '75%',
        aspectRatio: 9 / 16,
        borderRadius: 12,
        overflow: 'hidden',
    },
    video: {
        width: '100%',
        height: '100%',
    },
});

// ─── Main screen ───
export default function LeaderboardScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const fetchLeaderboard = useCallback(async () => {
        try {
            const { data, error } = await supabase.rpc('get_leaderboard', { p_limit: 50 });
            if (error) throw error;
            setEntries((data || []) as LeaderboardEntry[]);
        } catch (e) {
            console.error('Leaderboard fetch error:', e);
        }
    }, []);

    useEffect(() => {
        fetchLeaderboard().finally(() => setLoading(false));
    }, []);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchLeaderboard();
        setRefreshing(false);
    }, [fetchLeaderboard]);

    const maxWins = entries.length > 0 ? entries[0].total_wins : 1;

    const renderItem = ({ item, index }: { item: LeaderboardEntry; index: number }) => {
        const isTop5 = index < 5;
        const isFirst = index === 0;
        const isSecond = index === 1;
        const isThird = index === 2;

        const barFraction = maxWins > 0 ? item.total_wins / maxWins : 0;
        const barWidth = `${Math.max(barFraction * 100, 8)}%` as const;

        // Top 5 get progressively smaller video + bar, rest are compact text rows
        const barHeight = isFirst ? 36 : isSecond ? 28 : isThird ? 24 : isTop5 ? 18 : 10;
        const fontSize = isFirst ? 15 : isSecond ? 14 : isThird ? 13 : isTop5 ? 12 : 11;
        const videoSize = isFirst ? 52 : isSecond ? 44 : isThird ? 38 : isTop5 ? 32 : 0;

        const barColor = isFirst
            ? Theme.colors.accent
            : isSecond
                ? 'rgba(138,206,0,0.7)'
                : isThird
                    ? 'rgba(138,206,0,0.5)'
                    : isTop5
                        ? 'rgba(138,206,0,0.3)'
                        : Theme.colors.buttonBorder;

        return (
            <TouchableOpacity
                style={[styles.row, isTop5 && styles.rowTop5]}
                activeOpacity={0.7}
                onPress={() => !isTop5 && setPreviewUrl(item.video_url)}
                disabled={isTop5}
            >
                <Text style={[
                    styles.rank,
                    isFirst && styles.rankFirst,
                    isTop5 && !isFirst && styles.rankTop5,
                ]}>
                    {item.rank}
                </Text>

                {/* Top 5: looping mini video. Rest: no video, tap row for preview */}
                {isTop5 && <MiniPlayer videoUrl={item.video_url} size={videoSize} />}

                <View style={styles.barContainer}>
                    <View
                        style={[
                            styles.bar,
                            { width: barWidth, height: barHeight, backgroundColor: barColor },
                        ]}
                    />
                    <View style={styles.labelRow}>
                        <Text
                            style={[styles.username, { fontSize }]}
                            numberOfLines={1}
                        >
                            @{item.creator_username}
                        </Text>
                        <Text style={[styles.wins, { fontSize }]}>
                            {item.total_wins}
                        </Text>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => router.back()}
                    style={styles.backButton}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                    <Ionicons name="chevron-back" size={22} color={Theme.colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.title}>Leaderboard</Text>
                <View style={{ width: 32 }} />
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={Theme.colors.textSecondary} />
                </View>
            ) : entries.length === 0 ? (
                <View style={styles.center}>
                    <Text style={styles.emptyText}>No winners yet</Text>
                </View>
            ) : (
                <FlatList
                    data={entries}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={[
                        styles.list,
                        { paddingBottom: insets.bottom + 20 },
                    ]}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={Theme.colors.textSecondary}
                        />
                    }
                />
            )}

            {/* Video preview modal for entries below top 5 */}
            <VideoPreviewModal
                videoUrl={previewUrl}
                visible={previewUrl !== null}
                onClose={() => setPreviewUrl(null)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Theme.colors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    backButton: {
        width: 32,
        height: 32,
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontFamily: Theme.fonts.base,
        color: Theme.colors.textPrimary,
        fontSize: 17,
        fontWeight: '600',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyText: {
        fontFamily: Theme.fonts.base,
        color: Theme.colors.textSecondary,
        fontSize: 15,
    },
    list: {
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    rowTop5: {
        marginBottom: 10,
    },
    rank: {
        fontFamily: Theme.fonts.mono,
        color: Theme.colors.textTertiary,
        fontSize: 11,
        width: 28,
        textAlign: 'right',
        marginRight: 10,
        fontVariant: ['tabular-nums'],
    },
    rankFirst: {
        color: Theme.colors.accent,
        fontSize: 17,
        fontWeight: '700',
    },
    rankTop5: {
        color: Theme.colors.textSecondary,
        fontSize: 13,
        fontWeight: '600',
    },
    barContainer: {
        flex: 1,
    },
    bar: {
        borderRadius: 3,
    },
    labelRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 3,
        paddingRight: 4,
    },
    username: {
        fontFamily: Theme.fonts.base,
        color: 'rgba(255,255,255,0.6)',
        flex: 1,
        marginRight: 8,
    },
    wins: {
        fontFamily: Theme.fonts.mono,
        color: Theme.colors.textTertiary,
        fontVariant: ['tabular-nums'],
    },
});
