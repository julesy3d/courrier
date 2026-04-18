import React, { useEffect, useState } from 'react';
import { View, StyleSheet, AppState, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Card, useStore } from '../../lib/store';
import MatchupView from '../../components/MatchupView';
import EmptyState from '../../components/EmptyState';
import TabBar, { TAB_BAR_HEIGHT } from '../../components/TabBar';
import { Theme } from '../../theme';

// Module-level: survives component unmount/remount across tab switches
// within a single app session. Resets on app kill (true cold start).
let hasHandledColdStart = false;
let activeMatchup: { a: Card; b: Card } | null = null;

export default function MainScreen() {
    const { cardPool, fetchCardPool, heartbeat, returnUnusedCards } = useStore();
    const insets = useSafeAreaInsets();

    // Lazy init from module-level matchup so warm mounts render instantly
    // with no spinner → EmptyState flash
    const [isLoading, setIsLoading] = useState(() => !activeMatchup);
    const [initialCards, setInitialCards] = useState<{ a: Card; b: Card } | null>(() => activeMatchup);

    const initPool = async () => {
        try {
            if (!hasHandledColdStart) {
                await heartbeat();

                // Return fuel for stale cards from a previous session, then start fresh
                const stalePool = useStore.getState().cardPool;
                if (stalePool.length > 0) {
                    returnUnusedCards(stalePool.map(c => c.id));
                }
                useStore.setState({ cardPool: [], poolExcludeIds: [], isPoolFetching: false });

                await fetchCardPool(10);
                hasHandledColdStart = true;
            } else if (activeMatchup) {
                // Already rendering persisted matchup; opportunistic top-up only
                const pool = useStore.getState().cardPool;
                if (pool.length < 5) {
                    fetchCardPool(10).catch(console.error);
                }
                return;
            } else {
                // Warm mount, no persisted matchup — ensure pool has enough
                const pool = useStore.getState().cardPool;
                if (pool.length < 2) {
                    await fetchCardPool(10);
                }
            }

            // Pop two cards, prefetch, then set initialCards atomically with isLoading=false
            const pool = useStore.getState().cardPool;
            if (pool.length >= 2) {
                const a = pool[0];
                const b = pool[1];
                await Promise.all([
                    Image.prefetch(a.video_url),
                    Image.prefetch(b.video_url),
                ]);
                useStore.setState({ cardPool: pool.slice(2) });
                activeMatchup = { a, b };
                setInitialCards({ a, b });
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        initPool();
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') {
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
        activeMatchup = null;
        setInitialCards(null);
        setIsLoading(true);
        fetchCardPool(10).then(async () => {
            const pool = useStore.getState().cardPool;
            if (pool.length >= 2) {
                await Promise.all([
                    Image.prefetch(pool[0].video_url),
                    Image.prefetch(pool[1].video_url),
                ]);
                activeMatchup = { a: pool[0], b: pool[1] };
                setInitialCards({ a: pool[0], b: pool[1] });
                useStore.setState({ cardPool: pool.slice(2) });
            }
            setIsLoading(false);
        }).catch(() => setIsLoading(false));
    };

    const tabBarReservedHeight = TAB_BAR_HEIGHT + insets.bottom;

    return (
        <View style={styles.container}>
            <View
                style={[
                    styles.content,
                    { marginBottom: tabBarReservedHeight },
                ]}
            >
                {isLoading && !initialCards ? (
                    <View style={styles.center}>
                        <ActivityIndicator size="large" color={Theme.colors.textSecondary} />
                    </View>
                ) : initialCards ? (
                    <MatchupView
                        initialCardA={initialCards.a}
                        initialCardB={initialCards.b}
                        onJudged={handleJudged}
                        onMatchupChanged={(a, b) => { activeMatchup = { a, b }; }}
                    />
                ) : (
                    <EmptyState />
                )}
            </View>

            <TabBar />
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
        zIndex: 10,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
