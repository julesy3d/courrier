import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    TouchableOpacity,
    RefreshControl,
    Modal,
    Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { supabase } from '../../lib/supabase';
import { useStore } from '../../lib/store';
import { Theme } from '../../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_GAP = 3;

type Tab = 'today' | 'alltime' | 'mine';

type LeaderboardEntry = {
    post_id: string;
    video_url: string;
    sender_id: string;
    creator_username: string;
    wins: number;
    caption?: string | null;
};

// ─── Image preview modal ───
function ImagePreviewModal({ imageUrl, visible, onClose }: {
    imageUrl: string | null;
    visible: boolean;
    onClose: () => void;
}) {
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <TouchableOpacity
                style={previewStyles.backdrop}
                activeOpacity={1}
                onPress={onClose}
            >
                <View style={previewStyles.imageContainer}>
                    {imageUrl && (
                        <Image
                            source={{ uri: imageUrl }}
                            style={previewStyles.image}
                            contentFit="cover"
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
    imageContainer: {
        width: '85%',
        aspectRatio: 3 / 4,
        borderRadius: 12,
        overflow: 'hidden',
    },
    image: {
        width: '100%',
        height: '100%',
    },
});

// ─── Brick cell ───
function BrickCell({ entry, rank, width, height, onPress }: {
    entry: LeaderboardEntry;
    rank: number;
    width: number;
    height: number;
    onPress: () => void;
}) {
    return (
        <TouchableOpacity
            activeOpacity={0.85}
            onPress={onPress}
            style={[brickStyles.cell, { width, height }]}
        >
            <Image
                source={{ uri: entry.video_url }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
            />
            {/* Bottom gradient overlay for stats */}
            <View style={brickStyles.overlay}>
                <View style={brickStyles.statsRow}>
                    <Text style={[brickStyles.stat, rank <= 3 && brickStyles.statLarge]}>
                        ❤️ <Text style={brickStyles.statNum}>{entry.wins}</Text>
                    </Text>
                    <Text style={[brickStyles.stat, rank <= 3 && brickStyles.statLarge]}>
                        🏆 <Text style={brickStyles.statNum}>{rank}</Text>
                    </Text>
                </View>
                <Text
                    style={[brickStyles.username, rank <= 3 && brickStyles.usernameLarge]}
                    numberOfLines={1}
                >
                    @{entry.creator_username}
                </Text>
            </View>
        </TouchableOpacity>
    );
}

const brickStyles = StyleSheet.create({
    cell: {
        overflow: 'hidden',
        backgroundColor: Theme.colors.surfaceAlt,
    },
    overlay: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 8,
        paddingVertical: 6,
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 2,
    },
    stat: {
        fontSize: 11,
        color: '#FFFFFF',
    },
    statLarge: {
        fontSize: 14,
    },
    statNum: {
        fontFamily: Theme.fonts.mono,
        fontWeight: '700',
    },
    username: {
        fontFamily: Theme.fonts.base,
        fontSize: 10,
        color: 'rgba(255,255,255,0.7)',
    },
    usernameLarge: {
        fontSize: 13,
    },
});

// ─── Brick wall layout ───
function BrickWall({ entries, onSelect }: {
    entries: LeaderboardEntry[];
    onSelect: (url: string) => void;
}) {
    if (entries.length === 0) return null;

    const fullWidth = SCREEN_WIDTH;

    // #1: full-width hero
    const heroHeight = fullWidth * 0.75;
    // #2-3: two-up
    const twoUpWidth = (fullWidth - CARD_GAP) / 2;
    const twoUpHeight = twoUpWidth * 1.1;
    // #4+: four-up
    const fourUpWidth = (fullWidth - CARD_GAP * 3) / 4;
    const fourUpHeight = fourUpWidth * 1.2;

    const rows: React.ReactNode[] = [];
    let idx = 0;

    // Row 1: hero (#1)
    if (idx < entries.length) {
        const heroEntry = entries[idx];
        rows.push(
            <BrickCell
                key={heroEntry.post_id}
                entry={heroEntry}
                rank={idx + 1}
                width={fullWidth}
                height={heroHeight}
                onPress={() => onSelect(heroEntry.video_url)}
            />
        );
        idx++;
    }

    // Row 2: two-up (#2, #3)
    if (idx < entries.length) {
        const row: React.ReactNode[] = [];
        const rowStart = idx;
        while (idx < entries.length && idx < rowStart + 2) {
            const i = idx;
            row.push(
                <BrickCell
                    key={entries[i].post_id}
                    entry={entries[i]}
                    rank={i + 1}
                    width={twoUpWidth}
                    height={twoUpHeight}
                    onPress={() => onSelect(entries[i].video_url)}
                />
            );
            idx++;
        }
        rows.push(
            <View key={`row-2up`} style={[wallStyles.row, { gap: CARD_GAP }]}>
                {row}
            </View>
        );
    }

    // Remaining: four-up rows
    let rowNum = 0;
    while (idx < entries.length) {
        const row: React.ReactNode[] = [];
        const rowStart = idx;
        while (idx < entries.length && idx < rowStart + 4) {
            const i = idx;
            row.push(
                <BrickCell
                    key={entries[i].post_id}
                    entry={entries[i]}
                    rank={i + 1}
                    width={fourUpWidth}
                    height={fourUpHeight}
                    onPress={() => onSelect(entries[i].video_url)}
                />
            );
            idx++;
        }
        rows.push(
            <View key={`row-4up-${rowNum}`} style={[wallStyles.row, { gap: CARD_GAP }]}>
                {row}
            </View>
        );
        rowNum++;
    }

    return <View style={{ gap: CARD_GAP }}>{rows}</View>;
}

const wallStyles = StyleSheet.create({
    row: {
        flexDirection: 'row',
    },
});

// ═══════════════════════════════════════════════
// MAIN LEADERBOARD SCREEN
// ═══════════════════════════════════════════════

export default function LeaderboardScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { currentUser } = useStore();

    const [tab, setTab] = useState<Tab>('today');
    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const fetchData = useCallback(async (activeTab: Tab) => {
        try {
            if (activeTab === 'today') {
                const { data, error } = await supabase.rpc('get_daily_leaderboard', {
                    p_date: new Date().toISOString().split('T')[0],
                });
                if (error) throw error;
                setEntries(((data || []) as any[]).map(d => ({
                    post_id: d.post_id,
                    video_url: d.video_url,
                    sender_id: d.sender_id,
                    creator_username: d.creator_username,
                    wins: d.wins_today,
                    caption: d.caption ?? null,
                })));
            } else if (activeTab === 'alltime') {
                const { data, error } = await supabase.rpc('get_leaderboard', {
                    p_limit: 50,
                });
                if (error) throw error;
                setEntries(((data || []) as any[]).map(d => ({
                    post_id: d.id,
                    video_url: d.video_url,
                    sender_id: '',
                    creator_username: d.creator_username,
                    wins: d.total_wins,
                    caption: d.caption ?? null,
                })));
            } else {
                // Mine: current user's cards ranked by total_wins
                if (!currentUser) { setEntries([]); return; }
                const { data, error } = await supabase
                    .from('posts')
                    .select('id, video_url, total_wins, sender_id, caption')
                    .eq('sender_id', currentUser.id)
                    .order('total_wins', { ascending: false })
                    .limit(50);
                if (error) throw error;
                setEntries(((data || []) as any[]).map(d => ({
                    post_id: d.id,
                    video_url: d.video_url,
                    sender_id: d.sender_id,
                    creator_username: currentUser.display_name,
                    wins: d.total_wins,
                    caption: d.caption ?? null,
                })));
            }
        } catch (e) {
            console.error('Leaderboard fetch error:', e);
        }
    }, [currentUser]);

    useEffect(() => {
        setLoading(true);
        fetchData(tab).finally(() => setLoading(false));
    }, [tab]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchData(tab);
        setRefreshing(false);
    }, [tab, fetchData]);

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

            {/* Content */}
            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={Theme.colors.textSecondary} />
                </View>
            ) : entries.length === 0 ? (
                <View style={styles.center}>
                    <Text style={styles.emptyText}>
                        {tab === 'today' ? 'No entries yet today' : tab === 'mine' ? 'You haven\'t posted yet' : 'No entries yet'}
                    </Text>
                </View>
            ) : (
                <ScrollView
                    contentContainerStyle={{ paddingBottom: insets.bottom + 60 }}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={Theme.colors.textSecondary}
                        />
                    }
                >
                    <BrickWall
                        entries={entries}
                        onSelect={(url) => setPreviewUrl(url)}
                    />
                </ScrollView>
            )}

            {/* Bottom tabs */}
            <View style={[styles.tabBar, { paddingBottom: insets.bottom + 4 }]}>
                <TabButton label="Today" active={tab === 'today'} onPress={() => setTab('today')} />
                <TabButton label="All Time" active={tab === 'alltime'} onPress={() => setTab('alltime')} />
                <TabButton label="Mine" active={tab === 'mine'} onPress={() => setTab('mine')} />
            </View>

            <ImagePreviewModal
                imageUrl={previewUrl}
                visible={previewUrl !== null}
                onClose={() => setPreviewUrl(null)}
            />
        </View>
    );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
    return (
        <TouchableOpacity
            onPress={onPress}
            style={[styles.tab, active && styles.tabActive]}
            activeOpacity={0.7}
        >
            <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
        </TouchableOpacity>
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
    tabBar: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        backgroundColor: Theme.colors.surface,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: Theme.colors.seam,
        paddingTop: 8,
    },
    tab: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 16,
    },
    tabActive: {
        backgroundColor: Theme.colors.accentMuted,
    },
    tabText: {
        fontFamily: Theme.fonts.base,
        fontSize: 14,
        fontWeight: '500',
        color: Theme.colors.textTertiary,
    },
    tabTextActive: {
        color: Theme.colors.textPrimary,
        fontWeight: '700',
    },
});
