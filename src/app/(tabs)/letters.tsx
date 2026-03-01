import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Postcard from '../../components/Postcard';
import { useTranslation } from '../../lib/i18n';
import { playReceive } from '../../lib/sounds';
import { useStore } from '../../lib/store';
import { Theme } from '../../theme';

export default function LettersScreen() {
    const { fetchReceivedLetters, fetchReturnedLetters, loadUserById, markLetterOpened, currentUser } = useStore();
    const [letters, setLetters] = useState<any[]>([]);
    const [senderMap, setSenderMap] = useState<Record<string, string>>({});
    const [previousLetterIds, setPreviousLetterIds] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const router = useRouter();
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const tabBarHeight = 49 + insets.bottom; // Native tab bar height (49pt) + safe area

    const [selectedLetter, setSelectedLetter] = useState<any>(null);
    const [senderAddress, setSenderAddress] = useState<string>('');
    const postcardOpacity = useRef(new Animated.Value(0)).current;

    const openLetter = async (letter: any) => {
        setSelectedLetter(letter);

        if (letter._type === 'returned') {
            // For returned letters, the current user IS the sender.
            // "From" shows current user's address, "To" shows the failed recipient address.
            setSenderAddress(currentUser?.address || '—');
        } else {
            const sender = await loadUserById(letter.sender_id);
            setSenderAddress(sender?.address || t('letters.unknownSender'));
        }

        if (!letter.opened_at && letter._type !== 'returned') {
            markLetterOpened(letter.id).catch(console.error);
            setLetters(prev => prev.map(l =>
                l.id === letter.id
                    ? { ...l, opened_at: new Date().toISOString() }
                    : l
            ));
        }

        postcardOpacity.setValue(0);
        Animated.timing(postcardOpacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
        }).start();
    };

    const closeLetter = () => {
        Animated.timing(postcardOpacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
        }).start(() => {
            setSelectedLetter(null);
            setSenderAddress('');
        });
    };

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

            const newUnread = received.filter(l =>
                l.opened_at === null && !previousLetterIds.has(l.id)
            );
            if (newUnread.length > 0) {
                playReceive();
            }
            setPreviousLetterIds(new Set(received.map(l => l.id)));

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
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
                <TouchableOpacity
                    style={[styles.row, { opacity: 0.7 }]}
                    onPress={() => openLetter(item)}
                >
                    <View style={{ flex: 1, marginRight: 12 }}>
                        <Text style={[styles.letterFrom, { color: Theme.colors.accent }]}>
                            {t('letters.returnedTitle')}
                        </Text>
                        <Text style={styles.previewText} numberOfLines={1}>
                            {t('letters.returnedTo')} {item.recipient_address}
                        </Text>
                    </View>
                    <Text style={styles.dateText}>{date}</Text>
                </TouchableOpacity>
            );
        }

        // Regular received letter (existing code)
        const senderAddressItem = senderMap[item.sender_id] || t('letters.unknownSender');
        const preview = item.body.length > 40
            ? item.body.substring(0, 40) + '…'
            : item.body;

        return (
            <TouchableOpacity
                style={styles.row}
                onPress={() => openLetter(item)}
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
                            {senderAddressItem}
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
            <SafeAreaView edges={['top']} style={[styles.container, styles.centered]}>
                <ActivityIndicator color={Theme.colors.accent} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView edges={['top']} style={styles.container}>

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
                    contentContainerStyle={[styles.listContent, { paddingBottom: tabBarHeight + 20 }]}
                />
            )}

            {selectedLetter && (
                <Animated.View style={{
                    ...StyleSheet.absoluteFillObject,
                    opacity: postcardOpacity,
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    justifyContent: 'center',
                    alignItems: 'center',
                    paddingHorizontal: 40,
                    paddingBottom: tabBarHeight,
                }}>
                    <TouchableOpacity
                        activeOpacity={1}
                        style={StyleSheet.absoluteFillObject}
                        onPress={closeLetter}
                    />

                    <View onStartShouldSetResponder={() => true}>
                        <Postcard
                            mode="view"
                            imageUri={selectedLetter.image_url}
                            body={selectedLetter.body}
                            fromAddressUser={{ address: senderAddress } as any}
                            viewToAddress={
                                selectedLetter._type === 'returned'
                                    ? selectedLetter.recipient_address
                                    : undefined
                            }
                        />
                        <Text style={{
                            fontFamily: 'Georgia',
                            fontSize: 13,
                            color: '#FAF9F6',
                            textAlign: 'center',
                            marginTop: 16,
                            textShadowColor: 'rgba(0,0,0,0.5)',
                            textShadowOffset: { width: 0, height: 1 },
                            textShadowRadius: 3,
                        }}>
                            {new Date(selectedLetter.sent_at).toLocaleDateString(undefined, { dateStyle: 'full' })}
                        </Text>
                    </View>
                </Animated.View>
            )}
        </SafeAreaView>
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
