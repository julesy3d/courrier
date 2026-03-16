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
import { Comment, useStore } from '../lib/store';
import { Theme } from '../theme';

interface CommentsSheetProps {
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

export default function CommentsSheet({ postId, onClose }: CommentsSheetProps) {
    const insets = useSafeAreaInsets();
    const { fetchComments, addComment, currentUser } = useStore();

    const [comments, setComments] = useState<Comment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [inputText, setInputText] = useState('');
    const [isSending, setIsSending] = useState(false);

    const bottomSheetRef = useRef<BottomSheet>(null);
    const snapPoints = useMemo(() => ['50%', '85%'], []);

    // ── Fetch comments ──
    const loadComments = useCallback(async () => {
        try {
            const data = await fetchComments(postId);
            setComments(data);
        } catch (e) {
            console.error('Failed to load comments:', e);
        } finally {
            setIsLoading(false);
        }
    }, [postId, fetchComments]);

    useEffect(() => {
        loadComments();
    }, [loadComments]);

    // ── Post a comment ──
    const handleSend = useCallback(async () => {
        const trimmed = inputText.trim();
        if (!trimmed || isSending) return;

        setIsSending(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        try {
            const newComment = await addComment(postId, trimmed);
            setComments(prev => [...prev, newComment]);
            setInputText('');
        } catch (e) {
            console.error('Failed to post comment:', e);
        } finally {
            setIsSending(false);
        }
    }, [inputText, isSending, postId, addComment]);

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

    // ── Render a single comment ──
    const renderComment = useCallback(({ item }: { item: Comment }) => {
        const isMe = item.author_id === currentUser?.id;
        return (
            <View style={styles.commentRow}>
                <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                        <Text style={[styles.authorName, isMe && { color: '#007AFF' }]}>
                            {item.author_name || 'Unknown'}
                        </Text>
                        <Text style={styles.timestamp}>{timeAgo(item.created_at)}</Text>
                    </View>
                    <Text style={styles.commentBody}>{item.body}</Text>
                </View>
            </View>
        );
    }, [currentUser?.id]);

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
                <Text style={styles.headerTitle}>Comments</Text>
                <TouchableOpacity
                    onPress={() => bottomSheetRef.current?.close()}
                    style={{ padding: 4 }}
                >
                    <Ionicons name="close" size={22} color="rgba(255,255,255,0.8)" />
                </TouchableOpacity>
            </View>

            {/* Comments list */}
            {isLoading ? (
                <View style={{ flex: 1, justifyContent: 'center' }}>
                    <ActivityIndicator color={Theme.colors.secondary} />
                </View>
            ) : (
                <BottomSheetFlatList<Comment>
                    data={comments}
                    keyExtractor={(item: Comment) => item.id}
                    renderItem={renderComment}
                    contentContainerStyle={{
                        paddingHorizontal: 20,
                        paddingBottom: 80,
                        flexGrow: 1,
                    }}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    ListEmptyComponent={
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                            <Text style={styles.emptyText}>No comments yet. Be the first!</Text>
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
});
