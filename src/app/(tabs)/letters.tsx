import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from '../../lib/i18n';
import { Letter, useStore } from '../../lib/store';
import { Theme } from '../../theme';

export default function LettersScreen() {
    const { fetchReceivedLetters } = useStore();
    const [letters, setLetters] = useState<Letter[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const router = useRouter();
    const { t } = useTranslation();

    const loadLetters = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await fetchReceivedLetters();
            setLetters(data);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    }, [fetchReceivedLetters]);

    useEffect(() => {
        loadLetters();
    }, [loadLetters]);

    const onRefresh = async () => {
        setRefreshing(true);
        await loadLetters();
        setRefreshing(false);
    };

    const renderItem = ({ item }: { item: Letter }) => {
        const isUnread = item.opened_at === null;
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

            {letters.length === 0 ? (
                <View style={styles.centered}>
                    <Text style={[styles.emptyText, { textAlign: 'center', paddingHorizontal: 40 }]}>
                        {t('letters.empty')}
                    </Text>
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
