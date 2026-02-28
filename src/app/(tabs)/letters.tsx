import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from '../../lib/i18n';
import { useStore } from '../../lib/store';
import { Theme } from '../../theme';

export default function LettersScreen() {
    const { fetchReceivedLetters, fetchReturnedLetters, loadUserById } = useStore();
    const [letters, setLetters] = useState<any[]>([]);
    const [senderMap, setSenderMap] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const router = useRouter();
    const { t } = useTranslation();

    const loadLetters = useCallback(async () => {
        setIsLoading(true);
        try {
            const [received, returned] = await Promise.all([
                fetchReceivedLetters(),
                fetchReturnedLetters(),
            ]);

            // Mark returned letters so we can style them differently
            const allLetters = [
                ...received.map(l => ({ ...l, _type: 'received' as const })),
                ...returned.map(l => ({ ...l, _type: 'returned' as const })),
            ].sort((a, b) =>
                new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
            );

            // Resolve sender addresses for received letters
            const senderIds = [...new Set(received.map(l => l.sender_id))];
            const newSenderMap: Record<string, string> = {};
            for (const sid of senderIds) {
                const user = await loadUserById(sid);
                if (user) newSenderMap[sid] = user.address;
            }
            setSenderMap(newSenderMap);
            setLetters(allLetters);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    }, [fetchReceivedLetters, fetchReturnedLetters, loadUserById]);

    useFocusEffect(
        useCallback(() => {
            loadLetters();
        }, [loadLetters])
    );

    const onRefresh = async () => {
        setRefreshing(true);
        await loadLetters();
        setRefreshing(false);
    };

    const renderItem = ({ item }: { item: any }) => {
        const isReturned = item._type === 'returned';
        const isUnread = !isReturned && item.opened_at === null;
        const date = new Date(isReturned ? item.returned_at : item.sent_at)
            .toLocaleDateString();

        if (isReturned) {
            const preview = item.body.length > 40
                ? item.body.substring(0, 40) + '…'
                : item.body;

            return (
                <View style={[styles.row, { opacity: 0.7 }]}>
                    <View style={{ flex: 1, marginRight: 12 }}>
                        <Text style={[styles.letterFrom, { color: Theme.colors.accent }]}>
                            {t('letters.returnedTitle')}
                        </Text>
                        <Text style={styles.previewText} numberOfLines={1}>
                            {t('letters.returnedTo')} {item.recipient_address}
                        </Text>
                    </View>
                    <Text style={styles.dateText}>{date}</Text>
                </View>
            );
        }

        // Regular received letter (existing code)
        const senderAddress = senderMap[item.sender_id] || t('letters.unknownSender');
        const preview = item.body.length > 40
            ? item.body.substring(0, 40) + '…'
            : item.body;

        return (
            <TouchableOpacity
                style={styles.row}
                onPress={() => router.push(`/letter/${item.id}` as any)}
            >
                <View style={{ flex: 1, marginRight: 12 }}>
                    <View style={styles.rowContent}>
                        {isUnread && <View style={styles.unreadDot} />}
                        <Text
                            style={[styles.letterFrom, {
                                color: isUnread ? Theme.colors.text : Theme.colors.secondary,
                                fontWeight: isUnread ? '600' : '400',
                            }]}
                            numberOfLines={1}
                        >
                            {senderAddress}
                        </Text>
                    </View>
                    <Text style={styles.previewText} numberOfLines={1}>
                        {preview}
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
    letterFrom: {
        fontSize: 16,
    },
    previewText: {
        fontSize: 13,
        color: Theme.colors.secondary,
        marginTop: 2,
        marginLeft: 16, // align with text after unread dot
    },
    dateText: {
        fontSize: 13,
        color: Theme.colors.secondary,
    },
});
