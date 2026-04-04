import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Dimensions, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useStore } from '../../lib/store';
import PostLogSheet from '../../components/PostLogSheet';
import { Theme } from '../../theme';

const { width } = Dimensions.get('window');

function OutboxCard({ item, onPress }: { item: any; onPress: () => void }) {
    const isDead = item.pending_views === 0;

    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.8}
            style={[styles.card, isDead && { opacity: 0.4 }]}
        >
            <View style={styles.thumbnailContainer}>
                <Image
                    source={{ uri: item.video_url }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                />

                {isDead && (
                    <View style={styles.deadOverlay}>
                        <Text style={{ fontSize: 32 }}>💀</Text>
                    </View>
                )}
            </View>

            <View style={styles.cardInfo}>
                <Text style={styles.creatorName}>{new Date(item.created_at).toLocaleDateString()}</Text>
                <View style={styles.statsRow}>
                    <Text style={styles.statText}>🏆 <Text style={styles.statNumber}>{item.total_wins}</Text></Text>
                    <Text style={styles.statText}>🌿 <Text style={styles.statNumber}>{item.pending_views}</Text></Text>
                </View>
            </View>
        </TouchableOpacity>
    );
}

export default function OutboxScreen() {
    const { cachedOutbox, fetchOutbox } = useStore();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [isLoading, setIsLoading] = useState(true);
    const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

    useEffect(() => {
        fetchOutbox()
            .catch(console.error)
            .finally(() => setIsLoading(false));
    }, []);

    return (
        <View style={styles.container}>
            <SafeAreaView style={{ flex: 1 }} edges={['top']}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={28} color={Theme.colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.title}>My Cards</Text>
                    <View style={{ width: 28 }} />
                </View>

                {isLoading ? (
                    <View style={styles.center}>
                        <ActivityIndicator size="large" color={Theme.colors.textSecondary} />
                    </View>
                ) : cachedOutbox.length === 0 ? (
                    <View style={styles.center}>
                        <Text style={styles.emptyText}>You haven't created any cards yet.</Text>
                    </View>
                ) : (
                    <FlatList
                        data={cachedOutbox}
                        keyExtractor={(item) => item.id}
                        numColumns={2}
                        columnWrapperStyle={styles.row}
                        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 20 }}
                        renderItem={({ item }) => (
                            <OutboxCard
                                item={item}
                                onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    setSelectedPostId(item.id);
                                }}
                            />
                        )}
                    />
                )}
            </SafeAreaView>

            {selectedPostId && (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: Theme.colors.overlay, zIndex: 100 }]}>
                    <TouchableOpacity
                        style={StyleSheet.absoluteFill}
                        activeOpacity={1}
                        onPress={() => setSelectedPostId(null)}
                    />
                    <PostLogSheet
                        postId={selectedPostId}
                        onClose={() => setSelectedPostId(null)}
                    />
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Theme.colors.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
    backButton: { padding: 4 },
    title: { fontFamily: Theme.fonts.base, color: Theme.colors.textPrimary, fontSize: 18, fontWeight: '600' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyText: { fontFamily: Theme.fonts.base, color: Theme.colors.textTertiary, fontSize: 16 },
    row: { justifyContent: 'space-between', marginBottom: 16 },
    card: { width: (width - 48) / 2 },
    thumbnailContainer: { width: '100%', aspectRatio: 3/4, borderRadius: 8, overflow: 'hidden', backgroundColor: Theme.colors.surfaceAlt },
    deadOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: Theme.colors.overlay, justifyContent: 'center', alignItems: 'center' },
    cardInfo: { marginTop: 8 },
    creatorName: { fontFamily: Theme.fonts.base, color: Theme.colors.textPrimary, fontSize: 14, fontWeight: '500' },
    statsRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
    statText: { fontFamily: Theme.fonts.base, color: 'rgba(255,255,255,0.6)', fontSize: 12 },
    statNumber: { fontFamily: Theme.fonts.mono },
});
