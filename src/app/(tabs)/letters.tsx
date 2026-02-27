import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from '../../lib/i18n';
import { Letter, useStore } from '../../lib/store';
import { Theme } from '../../theme';

type FilterType = 'received' | 'sent';

export default function LettersScreen() {
    const { fetchReceivedLetters, fetchSentLetters } = useStore();
    const [letters, setLetters] = useState<Letter[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState<FilterType>('received');
    const router = useRouter();
    const { t } = useTranslation();

    const loadLetters = useCallback(async () => {
        try {
            let data;
            if (filter === 'received') {
                data = await fetchReceivedLetters();
            } else {
                data = await fetchSentLetters();
            }
            setLetters(data);
        } catch (e) {
            console.error(e);
        }
    }, [fetchReceivedLetters]);

    useEffect(() => {
        loadLetters().finally(() => setIsLoading(false));
    }, [loadLetters, filter]);

    const onRefresh = async () => {
        setRefreshing(true);
        await loadLetters();
        setRefreshing(false);
    };

    const renderItem = ({ item }: { item: Letter }) => {
        const isReceivedList = filter === 'received';
        const isUnread = isReceivedList && item.opened_at === null;
        const date = new Date(item.sent_at).toLocaleDateString();

        return (
            <TouchableOpacity
                style={styles.row}
                onPress={() => router.push(`/letter/${item.id}` as any)}
            >
                <View style={styles.rowContent}>
                    {isUnread && <View style={styles.unreadDot} />}
                    <Text style={[styles.letterTitle, { color: isUnread ? Theme.colors.accent : Theme.colors.text }]}>
                        {t('letters.itemTitle')}
                    </Text>
                </View>
                <Text style={styles.dateText}>{date}</Text>
            </TouchableOpacity>
        );
    };

    if (isLoading) {
        return (
            <View style={[styles.container, styles.centered]}>
                <ActivityIndicator color={Theme.colors.accent} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.headerToggle}>
                <TouchableOpacity
                    style={[styles.toggleButton, filter === 'received' && styles.toggleActive]}
                    onPress={() => setFilter('received')}
                >
                    <Text style={[styles.toggleText, filter === 'received' && styles.toggleTextActive]}>
                        {t('letters.received')}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.toggleButton, filter === 'sent' && styles.toggleActive]}
                    onPress={() => setFilter('sent')}
                >
                    <Text style={[styles.toggleText, filter === 'sent' && styles.toggleTextActive]}>
                        {t('letters.sent')}
                    </Text>
                </TouchableOpacity>
            </View>

            {letters.length === 0 ? (
                <View style={styles.centered}>
                    <Text style={styles.emptyText}>{t('letters.empty')}</Text>
                </View>
            ) : (
                <FlatList
                    data={letters}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={Theme.colors.accent}
                        />
                    }
                    contentContainerStyle={styles.listContent}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Theme.colors.background,
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 13,
        color: Theme.colors.secondary,
    },
    headerToggle: {
        flexDirection: 'row',
        paddingHorizontal: Theme.sizes.horizontalPadding,
        paddingTop: 12,
        paddingBottom: 4,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#E5E5E5',
    },
    toggleButton: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    toggleActive: {
        borderBottomColor: Theme.colors.accent,
    },
    toggleText: {
        fontSize: 15,
        color: Theme.colors.secondary,
    },
    toggleTextActive: {
        color: Theme.colors.accent,
        fontWeight: '500',
    },
    listContent: {
        paddingVertical: 8,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        paddingHorizontal: Theme.sizes.horizontalPadding,
    },
    rowContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    unreadDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: Theme.colors.accent,
        marginRight: 8,
    },
    letterTitle: {
        fontSize: 16,
    },
    dateText: {
        fontSize: 13,
        color: Theme.colors.secondary,
    },
});
