import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    FlatList,
    Image,
    ImageBackground,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PostcardInspector from '../../components/PostcardInspector';
import { useTranslation } from '../../lib/i18n';
import { useStore } from '../../lib/store';
import type { Post } from '../../lib/store';

const { width: screenWidth } = Dimensions.get('window');
const GRID_COLUMNS = 2;
const CARD_GAP = 12;
const CARD_PADDING = 20;
const THUMB_WIDTH = (screenWidth - CARD_PADDING * 2 - CARD_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
const THUMB_HEIGHT = THUMB_WIDTH / (297 / 422); // same aspect ratio as postcards

export default function OutboxScreen() {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { cachedOutbox, fetchOutbox, currentUser, cachedSenderMap } = useStore();
    const [isLoading, setIsLoading] = useState(true);
    const [selectedPost, setSelectedPost] = useState<Post | null>(null);

    useEffect(() => {
        fetchOutbox()
            .catch(console.error)
            .finally(() => setIsLoading(false));
    }, []);

    const handleCardPress = useCallback((post: Post) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setSelectedPost(post);
    }, []);

    const handleCloseInspector = useCallback(() => {
        setSelectedPost(null);
    }, []);

    const renderCard = useCallback(({ item }: { item: Post }) => (
        <TouchableOpacity
            onPress={() => handleCardPress(item)}
            activeOpacity={0.7}
            style={{
                width: THUMB_WIDTH,
                height: THUMB_HEIGHT,
                marginBottom: CARD_GAP,
                borderRadius: 4,
                overflow: 'hidden',
                backgroundColor: '#F5F0EB',
            }}
        >
            <ImageBackground
                source={require('../../assets/images/postcard_recto.webp')}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
            >
                <View style={{ flex: 1, margin: 8, borderRadius: 3, overflow: 'hidden' }}>
                    {item.recto_url ? (
                        <Image
                            source={{ uri: item.recto_url }}
                            style={{ width: '100%', height: '100%' }}
                            resizeMode="cover"
                        />
                    ) : item.body ? (
                        <View style={{
                            flex: 1,
                            backgroundColor: 'rgba(0,0,0,0.04)',
                            justifyContent: 'center',
                            alignItems: 'center',
                            padding: 8,
                        }}>
                            <Text
                                style={{
                                    fontFamily: 'Avenir Next',
                                    fontSize: 10,
                                    color: 'rgba(0,0,0,0.5)',
                                    textAlign: 'center',
                                }}
                                numberOfLines={4}
                            >
                                {item.body}
                            </Text>
                        </View>
                    ) : (
                        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.04)' }} />
                    )}
                </View>
            </ImageBackground>

            {/* Score badge */}
            <View style={{
                position: 'absolute',
                bottom: 6,
                right: 8,
                backgroundColor: 'rgba(0,0,0,0.4)',
                borderRadius: 8,
                paddingHorizontal: 6,
                paddingVertical: 2,
            }}>
                <Text style={{
                    fontFamily: 'Avenir Next',
                    fontSize: 11,
                    fontWeight: '600',
                    color: 'white',
                }}>
                    {item.score}
                </Text>
            </View>
        </TouchableOpacity>
    ), [handleCardPress]);

    const senderName = currentUser?.display_name || '';

    return (
        <View style={{ flex: 1, backgroundColor: '#F5F2EE' }}>
            {/* Header */}
            <View style={{
                paddingTop: insets.top + 12,
                paddingHorizontal: CARD_PADDING,
                paddingBottom: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
            }}>
                <TouchableOpacity
                    onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.back();
                    }}
                    style={{ padding: 4 }}
                >
                    <Ionicons name="chevron-back" size={24} color="rgba(0,0,0,0.5)" />
                </TouchableOpacity>

                <Text style={{
                    fontFamily: 'Avenir Next',
                    fontSize: 17,
                    fontWeight: '600',
                    color: 'rgba(0,0,0,0.7)',
                }}>
                    {t('outbox.title' as any) || 'Outbox'}
                </Text>

                {/* Settings button */}
                <TouchableOpacity
                    onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.push('/(main)/settings' as any);
                    }}
                    style={{ padding: 4 }}
                >
                    <Ionicons name="settings-outline" size={22} color="rgba(0,0,0,0.4)" />
                </TouchableOpacity>
            </View>

            {/* Content */}
            {isLoading ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color="rgba(0,0,0,0.25)" />
                </View>
            ) : cachedOutbox.length === 0 ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{
                        fontFamily: 'Avenir Next',
                        fontSize: 16,
                        color: 'rgba(0,0,0,0.3)',
                        textAlign: 'center',
                        paddingHorizontal: 40,
                    }}>
                        {t('outbox.empty' as any) || 'Your postcards will appear here'}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={cachedOutbox}
                    renderItem={renderCard}
                    keyExtractor={(item) => item.id}
                    numColumns={GRID_COLUMNS}
                    columnWrapperStyle={{
                        paddingHorizontal: CARD_PADDING,
                        justifyContent: 'space-between',
                    }}
                    contentContainerStyle={{
                        paddingBottom: insets.bottom + 20,
                    }}
                    showsVerticalScrollIndicator={false}
                />
            )}

            {/* Inspector overlay for selected card */}
            {selectedPost && (
                <PostcardInspector
                    delivery={null}
                    post={selectedPost}
                    senderName={senderName}
                    onDismiss={handleCloseInspector}
                    mode="outbox"
                />
            )}
        </View>
    );
}
