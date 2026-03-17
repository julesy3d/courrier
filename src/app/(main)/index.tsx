import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Dimensions, Image, ImageBackground, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, { interpolate, runOnJS, SharedValue, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import PostcardInspector from '../../components/PostcardInspector';
import DualCameraCapture from '../../components/DualCameraCapture';
import { useTranslation } from '../../lib/i18n';
import { seededRandom } from '../../lib/random';
import { playReceive } from '../../lib/sounds';
import { useStore } from '../../lib/store';
import { Theme } from '../../theme';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const CARD_WIDTH = screenWidth - 40;
const CARD_HEIGHT = CARD_WIDTH / (297 / 422);
const SNAP = 260;

// ── Grid Background ─────────────────────────────────────────
const GRID_SIZE = 24;
const GRID_COLOR = 'rgba(0,0,0,0.04)';
const BG_COLOR = '#F5F2EE'; // warm off-white, like a desk surface

function GridBackground() {
    const verticalLines = Math.ceil(screenWidth / GRID_SIZE);
    const horizontalLines = Math.ceil(screenHeight / GRID_SIZE);

    return (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: BG_COLOR }]}>
            {/* Vertical lines */}
            {Array.from({ length: verticalLines + 1 }, (_, i) => (
                <View
                    key={`v${i}`}
                    style={{
                        position: 'absolute',
                        left: i * GRID_SIZE,
                        top: 0,
                        bottom: 0,
                        width: StyleSheet.hairlineWidth,
                        backgroundColor: GRID_COLOR,
                    }}
                />
            ))}
            {/* Horizontal lines */}
            {Array.from({ length: horizontalLines + 1 }, (_, i) => (
                <View
                    key={`h${i}`}
                    style={{
                        position: 'absolute',
                        top: i * GRID_SIZE,
                        left: 0,
                        right: 0,
                        height: StyleSheet.hairlineWidth,
                        backgroundColor: GRID_COLOR,
                    }}
                />
            ))}
        </View>
    );
}

const CardInPile = React.memo(function CardInPile({ delivery, post, index, scrollY, exitDirX, exitDirY, totalCards, cardWidth, cardHeight, isReturning }: {
    delivery: any;
    post: any;
    index: number;
    scrollY: SharedValue<number>;
    exitDirX: SharedValue<number>;
    exitDirY: SharedValue<number>;
    totalCards: number;
    cardWidth: number;
    cardHeight: number;
    isReturning: boolean;
}) {
    const { t } = useTranslation();
    const rand = useMemo(() => {
        const r = seededRandom(delivery.id);
        return {
            rotation: (r() - 0.5) * (delivery.opened_at === null ? 10 : 6),
            offsetX: (r() - 0.5) * 10,
            offsetY: (r() - 0.5) * 6,
            sweepDir: r() > 0.5 ? 1 : -1,
        };
    }, [delivery.id, delivery.opened_at]);

    const animatedStyle = useAnimatedStyle(() => {
        const N = totalCards;
        const scrollPos = scrollY.value / SNAP;
        const phase = ((scrollPos - index) % N + N * 100) % N;
        const screenW = cardWidth + 80;
        const screenH = cardHeight + 200;

        // Resolve exit direction: use gesture if available, fall back to seeded random
        const isHorizontal = Math.abs(exitDirX.value) >= Math.abs(exitDirY.value)
            || (exitDirX.value === 0 && exitDirY.value === 0);
        const dirX = exitDirX.value !== 0 ? exitDirX.value : rand.sweepDir;
        const dirY = exitDirY.value;

        // Exit targets
        const exitX = dirX * screenW * 0.7;
        const exitY = dirY * screenH * 0.6;

        let scale = 1;
        let translateX = 0;
        let translateY = 0;
        let opacity = 1;
        let zIndex = 0;
        let shadowBlur = 4;
        let shadowOffset = 3;
        let shadowOpacity = 0.1;

        if (phase < 0.4) {
            // Sweeping off: lift, then fly in swipe direction
            const t = phase / 0.4;

            if (isHorizontal) {
                translateX = interpolate(t, [0, 1], [rand.offsetX, exitX]);
                translateY = interpolate(t, [0, 0.3, 1], [rand.offsetY, rand.offsetY - 50, rand.offsetY - 30]);
            } else {
                translateX = interpolate(t, [0, 0.3, 1], [rand.offsetX, rand.offsetX + dirX * 10, rand.offsetX]);
                translateY = interpolate(t, [0, 0.3, 1], [rand.offsetY, rand.offsetY - 30, exitY]);
            }

            scale = interpolate(t, [0, 0.3, 1], [0.9, 1.05, 0.9]);
            opacity = interpolate(t, [0, 0.8, 1], [1, 1, 0]);
            zIndex = Math.round(interpolate(phase, [0, 0.35, 0.4], [100, 90, 50]));
            shadowBlur = interpolate(t, [0, 0.3, 1], [4, 20, 4]);
            shadowOffset = interpolate(t, [0, 0.3, 1], [3, 14, 3]);
            shadowOpacity = interpolate(t, [0, 0.3, 1], [0.1, 0.35, 0.08]);

        } else if (phase < 0.6) {
            // Off-screen hold
            translateX = isHorizontal ? exitX : rand.offsetX;
            translateY = isHorizontal ? rand.offsetY - 30 : exitY;
            scale = 0.9;
            opacity = 0;
            zIndex = 1;

        } else if (phase < 1.0) {
            // Sliding back under the pile
            const t = (phase - 0.6) / 0.4;

            if (isHorizontal) {
                translateX = interpolate(t, [0, 1], [exitX, rand.offsetX]);
                translateY = interpolate(t, [0, 1], [rand.offsetY - 30, rand.offsetY]);
            } else {
                translateX = interpolate(t, [0, 1], [rand.offsetX, rand.offsetX]);
                translateY = interpolate(t, [0, 1], [exitY, rand.offsetY]);
            }

            scale = interpolate(t, [0, 1], [0.9, 0.86]);
            opacity = interpolate(t, [0, 0.2, 1], [0, 1, 1]);
            zIndex = 1;

        } else {
            // In pile — unchanged
            const pileT = (phase - 1) / Math.max(1, N - 1);
            translateX = rand.offsetX;
            translateY = rand.offsetY;
            scale = interpolate(pileT, [0, 1], [0.86, 0.9]);
            opacity = 1;
            zIndex = Math.round(interpolate(pileT, [0, 1], [2, 30]));
            shadowBlur = 4;
            shadowOffset = 3;
            shadowOpacity = interpolate(pileT, [0, 1], [0.08, 0.1]);
        }

        return {
            opacity,
            zIndex,
            transform: [
                { translateX },
                { translateY },
                { scale },
                { rotateZ: `${rand.rotation}deg` },
            ],
            shadowColor: '#000',
            shadowOffset: { width: 0, height: shadowOffset },
            shadowOpacity,
            shadowRadius: shadowBlur,
            elevation: zIndex,
        } as any;
    }, [totalCards, index, rand, cardWidth]);

    return (
        <Reanimated.View style={[animatedStyle, { position: 'absolute', width: cardWidth, height: cardHeight }]}>
            <View style={{
                width: '100%',
                height: '100%',
                borderRadius: 4,
                overflow: 'hidden',
                backgroundColor: '#F5F0EB',
            }}>
                <ImageBackground
                    source={require('../../assets/images/postcard_recto.webp')}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                >
                    <View style={{ flex: 1, margin: 20, borderRadius: 4, overflow: 'hidden' }}>
                        {post?.recto_url ? (
                            <Image
                                source={{ uri: post.recto_url }}
                                style={{ width: '100%', height: '100%' }}
                                resizeMode="cover"
                            />
                        ) : (
                            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.04)' }} />
                        )}
                    </View>
                </ImageBackground>
                {isReturning && (
                    <View style={{
                        ...StyleSheet.absoluteFillObject,
                        backgroundColor: 'rgba(255, 0, 0, 0.15)',
                        borderRadius: 4,
                    }} />
                )}
            </View>

            {delivery.opened_at === null && (
                <View style={{
                    position: 'absolute',
                    top: 12,
                    left: 12,
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: '#007AFF',
                }} />
            )}

            {post?.score != null && post.score > 0 && (
                <View style={{
                    position: 'absolute',
                    bottom: 10,
                    right: 14,
                    backgroundColor: 'rgba(0,0,0,0.35)',
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
                        {post.score}
                    </Text>
                </View>
            )}
        </Reanimated.View>
    );
}, (prev, next) => {
    return prev.delivery.id === next.delivery.id
        && prev.post?.recto_url === next.post?.recto_url
        && prev.index === next.index
        && prev.totalCards === next.totalCards
        && prev.cardWidth === next.cardWidth
        && prev.isReturning === next.isReturning;
});

function GlassButton({ onPress, icon, size = 40, style }: {
    onPress: () => void;
    icon: string;
    size?: number;
    style?: any;
}) {
    return (
        <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={style}>
            <BlurView
                intensity={40}
                tint="light"
                style={{
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    overflow: 'hidden',
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: 'rgba(0,0,0,0.1)',
                }}
            >
                <Ionicons name={icon as any} size={size * 0.5} color="rgba(0,0,0,0.5)" />
            </BlurView>
        </TouchableOpacity>
    );
}

export default function StackScreen() {
    const { markDeliveryOpened, currentUser, cachedDeliveries: deliveries, cachedSenderMap: senderMap, cachedPosts, getPostForDelivery, syncDeliveries, repostCard, dismissCard, heartbeat } = useStore();
    const [isLoading, setIsLoading] = useState(true);
    const isMounted = useRef(true);

    useEffect(() => {
        return () => {
            isMounted.current = false;
        };
    }, []);


    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const [selectedDelivery, setSelectedDelivery] = useState<any>(null);
    const [senderName, setSenderName] = useState<string>('');
    const [showCamera, setShowCamera] = useState(false);

    useEffect(() => {
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') {
                heartbeat().catch(console.error);
                syncDeliveries().then((newDeliveries) => {
                    const newUnread = newDeliveries.filter((d: any) => d.opened_at === null);
                    if (newUnread.length > 0 && isMounted.current) {
                        playReceive();
                    }
                });
            }
        });
        return () => sub.remove();
    }, [syncDeliveries, heartbeat]);

    const openDeliveryWrapper = (idx: number) => {
        const delivery = deliveries[idx];
        if (!delivery) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        openDelivery(delivery);
    };

    const openDelivery = async (delivery: any) => {
        setSelectedDelivery(delivery);

        // Look up sender name — use source_user_id (who routed the card to you)
        const post = getPostForDelivery(delivery);
        const creatorName = post ? (senderMap[post.sender_id] || t('letters.unknownSender')) : t('letters.unknownSender');
        setSenderName(creatorName);

        if (!delivery.opened_at) {
            markDeliveryOpened(delivery.id).catch(console.error);
        }
    };

    const closeDelivery = () => {
        setSelectedDelivery(null);
        setSenderName('');
    };

    const handleRepost = async (deliveryId: string) => {
        try {
            await repostCard(deliveryId);
            closeDelivery();
        } catch (e) {
            console.error('Repost failed', e);
            Alert.alert('Error', 'Could not repost. Try again.');
        }
    };

    const handleDismissCard = async (deliveryId: string) => {
        try {
            await dismissCard(deliveryId);
            closeDelivery();
        } catch (e) {
            console.error('Dismiss failed', e);
        }
    };



    useEffect(() => {
        heartbeat().catch(console.error);
        syncDeliveries().then((newDeliveries) => {
            const newUnread = newDeliveries.filter((d: any) => d.opened_at === null);
            if (newUnread.length > 0 && isMounted.current) {
                playReceive();
            }
        }).finally(() => {
            if (isMounted.current) {
                setIsLoading(false);
            }
        });
    }, []);

    const scrollY = useSharedValue(0);
    const startScrollY = useSharedValue(0);
    const tapStart = useSharedValue({ time: 0, y: 0 });
    const exitDirX = useSharedValue(0);
    const exitDirY = useSharedValue(0);
    const lockedAxis = useSharedValue(0); // 0 = unlocked, 1 = horizontal, 2 = vertical
    const [focusedIndex, setFocusedIndex] = useState(0);

    useAnimatedReaction(
        () => Math.round(scrollY.value / SNAP),
        (idx) => {
            if (deliveries.length === 0) return;
            let wrappedIdx = idx % deliveries.length;
            if (wrappedIdx < 0) wrappedIdx += deliveries.length;
            runOnJS(setFocusedIndex)(wrappedIdx);
        },
        [deliveries.length]
    );

    const tapGesture = Gesture.Tap()
        .maxDuration(300)
        .maxDistance(25)
        .onEnd((e) => {
            'worklet';
            if (deliveries.length === 0) return;

            // Hit-test: only trigger if tap is within the card area (approximately)
            const centerX = screenWidth / 2;
            const centerY = screenHeight / 2 - 40; // account for perspective offset
            const halfW = CARD_WIDTH / 2 + 20;  // 20pt tolerance
            const halfH = CARD_HEIGHT / 2 + 20;

            const inBoundsX = e.absoluteX > centerX - halfW && e.absoluteX < centerX + halfW;
            const inBoundsY = e.absoluteY > centerY - halfH && e.absoluteY < centerY + halfH;

            if (inBoundsX && inBoundsY) {
                const rawIdx = Math.round(scrollY.value / SNAP);
                let wrappedIdx = rawIdx % deliveries.length;
                if (wrappedIdx < 0) wrappedIdx += deliveries.length;
                runOnJS(openDeliveryWrapper)(wrappedIdx);
            }
        });

    const AXIS_LOCK_THRESHOLD = 12;

    const panGesture = Gesture.Pan()
        .onStart(() => {
            startScrollY.value = scrollY.value;
            lockedAxis.value = 0;
        })
        .onUpdate((e) => {
            if (deliveries.length <= 1) return;

            // Lock to dominant axis after threshold
            if (lockedAxis.value === 0) {
                const absX = Math.abs(e.translationX);
                const absY = Math.abs(e.translationY);
                if (absX > AXIS_LOCK_THRESHOLD || absY > AXIS_LOCK_THRESHOLD) {
                    lockedAxis.value = absX > absY ? 1 : 2;
                } else {
                    return; // Below threshold, don't move yet
                }
            }

            if (lockedAxis.value === 1) {
                // Horizontal: swipe right = +1, swipe left = -1
                scrollY.value = startScrollY.value + e.translationX * 0.55;
                exitDirX.value = e.translationX > 0 ? 1 : -1;
                exitDirY.value = 0;
            } else {
                // Vertical: swipe up = +1, swipe down = -1
                scrollY.value = startScrollY.value - e.translationY * 0.55;
                exitDirX.value = 0;
                exitDirY.value = e.translationY < 0 ? -1 : 1;
            }
        })
        .onEnd((e) => {
            if (deliveries.length <= 1) return;

            // Project with velocity along the locked axis
            const velocity = lockedAxis.value === 1
                ? e.velocityX * 0.55
                : -e.velocityY * 0.55;
            const projected = scrollY.value + velocity * 0.15;
            const idx = Math.round(projected / SNAP);

            scrollY.value = withSpring(idx * SNAP, {
                damping: 40,
                stiffness: 400,
                mass: 1.2,
            });
        });

    const composedGesture = Gesture.Exclusive(panGesture, tapGesture);

    const RENDER_WINDOW = 6; // Easy to bump to 8 later if fast scrolling flashes
    const visibleCards = useMemo(() => {
        if (deliveries.length <= RENDER_WINDOW * 2) return deliveries.map((_, i) => i);
        const indices: number[] = [];
        for (let offset = -RENDER_WINDOW; offset <= RENDER_WINDOW; offset++) {
            const idx = ((focusedIndex + offset) % deliveries.length + deliveries.length) % deliveries.length;
            if (!indices.includes(idx)) indices.push(idx);
        }
        return indices;
    }, [focusedIndex, deliveries.length]);

    return (
        <View style={{ flex: 1, backgroundColor: BG_COLOR }}>
            <GridBackground />
            <SafeAreaView edges={['top']} style={{ flex: 1 }}>
                {isLoading ? (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <ActivityIndicator size="large" color="rgba(0,0,0,0.25)" />
                    </View>
                ) : deliveries.length === 0 ? (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <Text style={{
                            fontFamily: 'Avenir Next',
                            fontSize: 16,
                            color: 'rgba(0,0,0,0.3)',
                            textAlign: 'center',
                            paddingHorizontal: 40,
                        }}>
                            {t('stack.empty')}
                        </Text>
                    </View>
                ) : (
                    <GestureDetector gesture={composedGesture}>
                        <View style={{ flex: 1 }}>
                            <Reanimated.View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', transform: [{ perspective: 8000 }, { rotateX: '20deg' }] }}>
                                {visibleCards.map((index) => {
                                    const delivery = deliveries[index];
                                    const post = getPostForDelivery(delivery);
                                    // A card is "returning" if the current user created it
                                    const isReturning = post?.sender_id === currentUser?.id;
                                    return (
                                        <CardInPile
                                            key={delivery.id}
                                            delivery={delivery}
                                            post={post}
                                            index={index}
                                            scrollY={scrollY}
                                            exitDirX={exitDirX}
                                            exitDirY={exitDirY}
                                            totalCards={deliveries.length}
                                            cardWidth={CARD_WIDTH}
                                            cardHeight={CARD_HEIGHT}
                                            isReturning={!!isReturning}
                                        />
                                    );
                                })}
                            </Reanimated.View>
                            <Text style={{
                                position: 'absolute',
                                top: insets.top + 8,
                                alignSelf: 'center',
                                fontFamily: 'Avenir Next',
                                fontSize: 13,
                                color: 'rgba(0,0,0,0.2)',
                            }}>
                                {focusedIndex + 1} / {deliveries.length}
                            </Text>
                        </View>
                    </GestureDetector>
                )}

                {!selectedDelivery && (
                    <>
                        <GlassButton
                            icon="file-tray-outline"
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                router.push('/(main)/outbox' as any);
                            }}
                            style={{ position: 'absolute', top: insets.top + 12, right: 16 }}
                        />

                        <TouchableOpacity
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                setShowCamera(true);
                            }}
                            activeOpacity={0.7}
                            style={{
                                position: 'absolute',
                                bottom: insets.bottom + 20,
                                alignSelf: 'center',
                            }}
                        >
                            <BlurView
                                intensity={50}
                                tint="light"
                                style={{
                                    width: 64,
                                    height: 64,
                                    borderRadius: 32,
                                    overflow: 'hidden',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    borderWidth: StyleSheet.hairlineWidth,
                                    borderColor: 'rgba(0,0,0,0.1)',
                                }}
                            >
                                <Ionicons name="add" size={32} color="rgba(0,0,0,0.5)" />
                            </BlurView>
                        </TouchableOpacity>
                    </>
                )}

                {selectedDelivery && (
                    <PostcardInspector
                        delivery={selectedDelivery}
                        post={getPostForDelivery(selectedDelivery)}
                        senderName={senderName}
                        onDismiss={closeDelivery}
                        onRepost={() => handleRepost(selectedDelivery.id)}
                        onDismissCard={() => handleDismissCard(selectedDelivery.id)}
                    />
                )}
            </SafeAreaView>

            {showCamera && (
                <View style={StyleSheet.absoluteFill}>
                    <DualCameraCapture
                        onComplete={() => {
                            setShowCamera(false);
                            syncDeliveries().catch(console.error);
                        }}
                        onClose={() => setShowCamera(false)}
                    />
                </View>
            )}
        </View>
    );
}
