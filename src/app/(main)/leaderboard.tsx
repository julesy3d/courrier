import React, { useEffect, useState, useCallback, useRef } from 'react';
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
    FlatList,
    NativeSyntheticEvent,
    NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { supabase } from '../../lib/supabase';
import { useStore } from '../../lib/store';
import { Theme } from '../../theme';
import TabBar, { TAB_BAR_HEIGHT } from '../../components/TabBar';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Tab = 'today' | 'alltime' | 'mine';
const TABS: Tab[] = ['today', 'alltime', 'mine'];

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

// ─── Brick wall layout (flush, no gaps) ───
function BrickWall({ entries, onSelect }: {
    entries: LeaderboardEntry[];
    onSelect: (url: string) => void;
}) {
    if (entries.length === 0) return null;

    const fullWidth = SCREEN_WIDTH;
    const heroHeight = fullWidth * 0.75;
    const twoUpWidth = fullWidth / 2;
    const twoUpHeight = twoUpWidth * 1.1;
    const fourUpWidth = fullWidth / 4;
    const fourUpHeight = fourUpWidth * 1.2;

    const rows: React.ReactNode[] = [];
    let idx = 0;

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
            <View key={`row-2up`} style={wallStyles.row}>
                {row}
            </View>
        );
    }

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
            <View key={`row-4up-${rowNum}`} style={wallStyles.row}>
                {row}
            </View>
        );
        rowNum++;
    }

    return <View>{rows}</View>;
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
    const insets = useSafeAreaInsets();
    const { currentUser } = useStore();
    const bottomReserved = TAB_BAR_HEIGHT + insets.bottom;

    const [tabIndex, setTabIndex] = useState(0);
    const [entriesByTab, setEntriesByTab] = useState<Record<Tab, LeaderboardEntry[]>>({
        today: [], alltime: [], mine: [],
    });
    const [loadingByTab, setLoadingByTab] = useState<Record<Tab, boolean>>({
        today: true, alltime: true, mine: true,
    });
    const [refreshingTab, setRefreshingTab] = useState<Tab | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const pagerRef = useRef<FlatList<Tab>>(null);

    const fetchTab = useCallback(async (t: Tab): Promise<LeaderboardEntry[]> => {
        if (t === 'today') {
            const { data, error } = await supabase.rpc('get_daily_leaderboard', {
                p_date: new Date().toISOString().split('T')[0],
            });
            if (error) throw error;
            return ((data || []) as any[]).map(d => ({
                post_id: d.post_id,
                video_url: d.video_url,
                sender_id: d.sender_id,
                creator_username: d.creator_username,
                wins: d.wins_today,
                caption: d.caption ?? null,
            }));
        }
        if (t === 'alltime') {
            const { data, error } = await supabase.rpc('get_leaderboard', { p_limit: 50 });
            if (error) throw error;
            return ((data || []) as any[]).map(d => ({
                post_id: d.id,
                video_url: d.video_url,
                sender_id: '',
                creator_username: d.creator_username,
                wins: d.total_wins,
                caption: d.caption ?? null,
            }));
        }
        if (!currentUser) return [];
        const { data, error } = await supabase
            .from('posts')
            .select('id, video_url, total_wins, sender_id, caption')
            .eq('sender_id', currentUser.id)
            .order('total_wins', { ascending: false })
            .limit(50);
        if (error) throw error;
        return ((data || []) as any[]).map(d => ({
            post_id: d.id,
            video_url: d.video_url,
            sender_id: d.sender_id,
            creator_username: currentUser.display_name,
            wins: d.total_wins,
            caption: d.caption ?? null,
        }));
    }, [currentUser]);

    const loadTab = useCallback(async (t: Tab) => {
        try {
            const entries = await fetchTab(t);
            setEntriesByTab(prev => ({ ...prev, [t]: entries }));
        } catch (e) {
            console.error('Leaderboard fetch error:', e);
        } finally {
            setLoadingByTab(prev => ({ ...prev, [t]: false }));
        }
    }, [fetchTab]);

    useEffect(() => {
        // Prefetch all three so swiping feels instant
        TABS.forEach(loadTab);
    }, [loadTab]);

    const goTab = (i: number) => {
        setTabIndex(i);
        pagerRef.current?.scrollToIndex({ index: i, animated: true });
    };

    const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
        if (i !== tabIndex) setTabIndex(i);
    };

    const onRefresh = useCallback(async (t: Tab) => {
        setRefreshingTab(t);
        try {
            const entries = await fetchTab(t);
            setEntriesByTab(prev => ({ ...prev, [t]: entries }));
        } catch (e) {
            console.error('Leaderboard refresh error:', e);
        } finally {
            setRefreshingTab(null);
        }
    }, [fetchTab]);

    const renderPage = ({ item: t }: { item: Tab }) => {
        const entries = entriesByTab[t];
        const loading = loadingByTab[t];

        if (loading) {
            return (
                <View style={[styles.page, styles.center]}>
                    <ActivityIndicator size="large" color={Theme.colors.textSecondary} />
                </View>
            );
        }
        if (entries.length === 0) {
            return (
                <View style={[styles.page, styles.center]}>
                    <Text style={styles.emptyText}>
                        {t === 'today' ? 'No entries yet today' : t === 'mine' ? 'You haven\'t posted yet' : 'No entries yet'}
                    </Text>
                </View>
            );
        }
        return (
            <ScrollView
                style={styles.page}
                contentContainerStyle={{ paddingBottom: bottomReserved + 24 }}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshingTab === t}
                        onRefresh={() => onRefresh(t)}
                        tintColor={Theme.colors.textSecondary}
                    />
                }
            >
                <BrickWall
                    entries={entries}
                    onSelect={(url) => setPreviewUrl(url)}
                />
            </ScrollView>
        );
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <View style={styles.header}>
                <Text style={styles.title}>Leaderboard</Text>
            </View>

            <View style={styles.filterRow}>
                <TabButton label="Today" active={tabIndex === 0} onPress={() => goTab(0)} />
                <TabButton label="All Time" active={tabIndex === 1} onPress={() => goTab(1)} />
                <TabButton label="Mine" active={tabIndex === 2} onPress={() => goTab(2)} />
            </View>

            <FlatList
                ref={pagerRef}
                data={TABS}
                keyExtractor={(t) => t}
                renderItem={renderPage}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={onMomentumScrollEnd}
                getItemLayout={(_, index) => ({
                    length: SCREEN_WIDTH,
                    offset: SCREEN_WIDTH * index,
                    index,
                })}
                initialNumToRender={3}
                windowSize={3}
            />

            <TabBar />

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
        justifyContent: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    title: {
        fontFamily: Theme.fonts.base,
        color: Theme.colors.textPrimary,
        fontSize: 17,
        fontWeight: '600',
    },
    filterRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingBottom: 12,
    },
    page: {
        width: SCREEN_WIDTH,
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
