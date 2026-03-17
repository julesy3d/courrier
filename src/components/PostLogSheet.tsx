import BottomSheet, {
    BottomSheetBackdrop,
    BottomSheetFlatList,
    BottomSheetTextInput,
    BottomSheetFooter,
    type BottomSheetFooterProps,
} from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LogEntry, useStore } from '../lib/store';
import { useTranslation } from '../lib/i18n';
import { Theme } from '../theme';

type GroupedRepost = {
    type: 'repost_group';
    id: string;
    entries: LogEntry[];
    created_at: string; // timestamp of the most recent entry in the group
};

type DisplayEntry = LogEntry | GroupedRepost;

function groupConsecutiveReposts(entries: LogEntry[]): DisplayEntry[] {
    const result: DisplayEntry[] = [];
    let currentGroup: LogEntry[] = [];

    const flushGroup = () => {
        if (currentGroup.length === 0) return;
        if (currentGroup.length <= 2) {
            // Don't collapse 1-2 reposts, show them individually
            result.push(...currentGroup);
        } else {
            result.push({
                type: 'repost_group',
                id: `group-${currentGroup[0].id}`,
                entries: currentGroup,
                created_at: currentGroup[currentGroup.length - 1].created_at,
            });
        }
        currentGroup = [];
    };

    for (const entry of entries) {
        if (entry.type === 'repost') {
            currentGroup.push(entry);
        } else {
            flushGroup();
            result.push(entry);
        }
    }
    flushGroup();

    return result;
}

interface PostLogSheetProps {
    postId: string;
    onClose: () => void;
}

function timeAgo(dateString: string): string {
    const now = Date.now();
    const then = new Date(dateString).getTime();
    const seconds = Math.floor((now - then) / 1000);

    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    const weeks = Math.floor(days / 7);
    return `${weeks}w`;
}

export default function PostLogSheet({ postId, onClose }: PostLogSheetProps) {
    const insets = useSafeAreaInsets();
    const { t } = useTranslation();
    const { fetchPostLog, addComment, currentUser } = useStore();

    const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [inputText, setInputText] = useState('');
    const [isSending, setIsSending] = useState(false);

    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    const toggleGroup = useCallback((groupId: string) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupId)) {
                next.delete(groupId);
            } else {
                next.add(groupId);
            }
            return next;
        });
    }, []);

    const displayEntries = useMemo(() => groupConsecutiveReposts(logEntries), [logEntries]);

    const bottomSheetRef = useRef<BottomSheet>(null);
    const snapPoints = useMemo(() => ['50%', '85%'], []);

    // ── Fetch log ──
    const loadLog = useCallback(async () => {
        try {
            const data = await fetchPostLog(postId);
            setLogEntries(data);
        } catch (e) {
            console.error('Failed to load post log:', e);
        } finally {
            setIsLoading(false);
        }
    }, [postId, fetchPostLog]);

    useEffect(() => {
        loadLog();
    }, [loadLog]);

    // ── Post a comment ──
    const handleSend = useCallback(async () => {
        const trimmed = inputText.trim();
        if (!trimmed || isSending) return;

        setIsSending(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        try {
            await addComment(postId, trimmed);
            setInputText('');
            await loadLog(); // reload full log
        } catch (e) {
            console.error('Failed to post comment:', e);
        } finally {
            setIsSending(false);
        }
    }, [inputText, isSending, postId, addComment, loadLog]);

    // ── Sheet dismissed → notify parent ──
    const handleSheetChanges = useCallback((index: number) => {
        if (index === -1) onClose();
    }, [onClose]);

    // ── Backdrop ──
    const renderBackdrop = useCallback((props: any) => (
        <BottomSheetBackdrop
            {...props}
            disappearsOnIndex={-1}
            appearsOnIndex={0}
            opacity={0.5}
            pressBehavior="close"
        />
    ), []);

    // ── Footer (input bar) — pinned by Gorhom ──
    const renderFooter = useCallback((props: BottomSheetFooterProps) => (
        <BottomSheetFooter {...props}>
            <View style={{
                flexDirection: 'row',
                alignItems: 'flex-end',
                paddingHorizontal: 16,
                paddingTop: 10,
                paddingBottom: insets.bottom || 12,
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: 'rgba(255,255,255,0.1)',
                backgroundColor: 'rgba(30,30,30,0.98)',
            }}>
                <BottomSheetTextInput
                    style={styles.input}
                    value={inputText}
                    onChangeText={setInputText}
                    placeholder="Add a comment..."
                    placeholderTextColor="rgba(255,255,255,0.5)"
                    maxLength={400}
                    returnKeyType="send"
                    onSubmitEditing={handleSend}
                    blurOnSubmit
                />
                <TouchableOpacity
                    onPress={handleSend}
                    disabled={!inputText.trim() || isSending}
                    style={styles.sendButton}
                >
                    {isSending ? (
                        <ActivityIndicator size="small" color="#007AFF" />
                    ) : (
                        <Ionicons
                            name="arrow-up-circle"
                            size={32}
                            color={inputText.trim() ? '#007AFF' : 'rgba(255,255,255,0.3)'}
                        />
                    )}
                </TouchableOpacity>
            </View>
        </BottomSheetFooter>
    ), [inputText, isSending, insets.bottom, handleSend]);

    // ── Render a single log entry ──
    const renderDisplayEntry = useCallback(({ item }: { item: DisplayEntry }) => {
        if (item.type === 'repost_group') {
            const group = item as GroupedRepost;
            const isExpanded = expandedGroups.has(group.id);

            if (isExpanded) {
                // Show all entries individually
                return (
                    <View>
                        {group.entries.map((entry) => (
                            <View key={entry.id} style={styles.repostRow}>
                                <Ionicons name="arrow-redo" size={14} color="rgba(255,255,255,0.35)" />
                                <Text style={styles.repostText}>
                                    <Text style={[styles.repostName, entry.user_id === currentUser?.id && { color: '#007AFF' }]}>
                                        {entry.user_name}
                                    </Text>
                                    {' '}{t('log.reposted' as any) || 'reposted'}
                                </Text>
                                <Text style={styles.timestamp}>{timeAgo(entry.created_at)}</Text>
                            </View>
                        ))}
                        <TouchableOpacity
                            onPress={() => toggleGroup(group.id)}
                            style={styles.collapseButton}
                        >
                            <Text style={styles.collapseText}>Show less</Text>
                        </TouchableOpacity>
                    </View>
                );
            }

            // Collapsed view
            const firstTwo = group.entries.slice(0, 2);
            const remaining = group.entries.length - 2;
            const names = firstTwo.map(e => e.user_name).join(', ');
            const summary = remaining > 0
                ? `${names}, and ${remaining} ${remaining === 1 ? 'other' : 'others'}`
                : names;

            return (
                <TouchableOpacity
                    onPress={() => toggleGroup(group.id)}
                    activeOpacity={0.7}
                    style={styles.repostRow}
                >
                    <Ionicons name="arrow-redo" size={14} color="rgba(255,255,255,0.35)" />
                    <Text style={styles.repostText}>
                        <Text style={styles.repostName}>{summary}</Text>
                        {' '}{t('log.reposted' as any) || 'reposted'}
                    </Text>
                    <Text style={styles.timestamp}>{timeAgo(group.created_at)}</Text>
                </TouchableOpacity>
            );
        }

        if (item.type === 'repost') {
            const isMe = item.user_id === currentUser?.id;
            return (
                <View style={styles.repostRow}>
                    <Ionicons name="arrow-redo" size={14} color="rgba(255,255,255,0.35)" />
                    <Text style={styles.repostText}>
                        <Text style={[styles.repostName, isMe && { color: '#007AFF' }]}>
                            {item.user_name}
                        </Text>
                        {' '}{t('log.reposted' as any) || 'reposted'}
                    </Text>
                    <Text style={styles.timestamp}>{timeAgo(item.created_at)}</Text>
                </View>
            );
        }

        // Comment
        const isMe = item.user_id === currentUser?.id;
        return (
            <View style={styles.commentRow}>
                <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                        <Text style={[styles.authorName, isMe && { color: '#007AFF' }]}>
                            {item.user_name}
                        </Text>
                        <Text style={styles.timestamp}>{timeAgo(item.created_at)}</Text>
                    </View>
                    <Text style={styles.commentBody}>{item.body}</Text>
                </View>
            </View>
        );
    }, [currentUser?.id, t, expandedGroups, toggleGroup]);

    return (
        <BottomSheet
            ref={bottomSheetRef}
            index={0}
            snapPoints={snapPoints}
            enablePanDownToClose
            enableDynamicSizing={false}
            keyboardBehavior="fillParent"
            keyboardBlurBehavior="restore"
            android_keyboardInputMode="adjustResize"
            onChange={handleSheetChanges}
            backdropComponent={renderBackdrop}
            footerComponent={renderFooter}
            backgroundStyle={styles.background}
            handleIndicatorStyle={{ backgroundColor: 'rgba(255,255,255,0.3)', width: 40 }}
            handleStyle={{ paddingVertical: 12 }}
        >
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>{t('log.title' as any) || 'Log'}</Text>
                <TouchableOpacity
                    onPress={() => bottomSheetRef.current?.close()}
                    style={{ padding: 4 }}
                >
                    <Ionicons name="close" size={22} color="rgba(255,255,255,0.8)" />
                </TouchableOpacity>
            </View>

            {/* Log list */}
            {isLoading ? (
                <View style={{ flex: 1, justifyContent: 'center' }}>
                    <ActivityIndicator color={Theme.colors.secondary} />
                </View>
            ) : (
                <BottomSheetFlatList<DisplayEntry>
                    data={displayEntries}
                    keyExtractor={(item: DisplayEntry) => item.id}
                    renderItem={renderDisplayEntry}
                    contentContainerStyle={{
                        paddingHorizontal: 20,
                        paddingBottom: 80,
                        flexGrow: 1,
                    }}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    ListEmptyComponent={
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                            <Text style={styles.emptyText}>{t('log.empty' as any) || 'No activity yet.'}</Text>
                        </View>
                    }
                />
            )}
        </BottomSheet>
    );
}

const styles = StyleSheet.create({
    background: {
        backgroundColor: 'rgba(30,30,30,0.95)',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    headerTitle: {
        fontFamily: 'Avenir Next',
        fontSize: 17,
        color: 'rgba(255,255,255,0.9)',
        fontWeight: '600',
    },
    commentRow: {
        flexDirection: 'row',
        paddingVertical: 10,
    },
    authorName: {
        fontFamily: 'Avenir Next',
        fontSize: 14,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.9)',
        marginRight: 8,
    },
    timestamp: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.5)',
    },
    commentBody: {
        fontFamily: 'Avenir Next',
        fontSize: 14,
        color: 'rgba(255,255,255,0.9)',
        marginTop: 2,
        lineHeight: 20,
    },
    emptyText: {
        fontFamily: 'Avenir Next',
        fontSize: 14,
        color: 'rgba(255,255,255,0.5)',
        textAlign: 'center',
    },
    input: {
        flex: 1,
        fontFamily: 'Avenir Next',
        fontSize: 15,
        color: 'rgba(255,255,255,0.9)',
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 10,
        paddingRight: 12,
        maxHeight: 100,
    },
    sendButton: {
        marginLeft: 8,
        marginBottom: 2,
        justifyContent: 'center',
        alignItems: 'center',
    },
    repostRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        gap: 8,
    },
    repostText: {
        flex: 1,
        fontFamily: 'Avenir Next',
        fontSize: 13,
        color: 'rgba(255,255,255,0.5)',
        fontStyle: 'italic',
    },
    repostName: {
        fontWeight: '600',
        fontStyle: 'normal',
        color: 'rgba(255,255,255,0.7)',
    },
    collapseButton: {
        paddingVertical: 6,
        paddingLeft: 22, // align with the repost text (icon width + gap)
    },
    collapseText: {
        fontFamily: 'Avenir Next',
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
    },
});
