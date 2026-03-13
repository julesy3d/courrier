import { Asset } from 'expo-asset';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Dimensions, Image, ImageBackground, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, { interpolate, runOnJS, SharedValue, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import PostcardInspector from '../../components/PostcardInspector';
import { useTranslation } from '../../lib/i18n';
import { seededRandom } from '../../lib/random';
import { playReceive } from '../../lib/sounds';
import { useStore } from '../../lib/store';
import { Theme } from '../../theme';

const { width: screenWidth } = Dimensions.get('window');
const CARD_WIDTH = (screenWidth - 80) * 0.7;
const CARD_HEIGHT = CARD_WIDTH / (297 / 422);
const SNAP = 260;

const CardInPile = React.memo(function CardInPile({ letter, index, scrollY, exitDirX, exitDirY, totalCards, cardWidth, cardHeight }: {
    letter: any;
    index: number;
    scrollY: SharedValue<number>;
    exitDirX: SharedValue<number>;
    exitDirY: SharedValue<number>;
    totalCards: number;
    cardWidth: number;
    cardHeight: number;
}) {
    const { t } = useTranslation();
    const rand = useMemo(() => {
        const r = seededRandom(letter.id);
        return {
            rotation: (r() - 0.5) * (letter.opened_at === null && letter._type !== 'returned' ? 10 : 6),
            offsetX: (r() - 0.5) * 10,
            offsetY: (r() - 0.5) * 6,
            sweepDir: r() > 0.5 ? 1 : -1,
        };
    }, [letter.id, letter.opened_at, letter._type]);

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
                        {letter.image_url ? (
                            <Image
                                source={{ uri: letter.image_url }}
                                style={{ width: '100%', height: '100%' }}
                                resizeMode="cover"
                            />
                        ) : (
                            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.04)' }} />
                        )}
                    </View>
                </ImageBackground>
            </View>

            {letter.opened_at === null && letter._type !== 'returned' && (
                <View style={{
                    position: 'absolute',
                    top: 12,
                    left: 12,
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: Theme.colors.accent,
                }} />
            )}

            {letter._type === 'returned' && (
                <View style={{
                    position: 'absolute',
                    top: 16,
                    left: 16,
                    backgroundColor: 'rgba(196,101,74,0.85)',
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 3,
                    transform: [{ rotate: '-5deg' }],
                }}>
                    <Text style={{
                        fontFamily: 'Georgia',
                        fontSize: 10,
                        color: '#FFFFFF',
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                    }}>
                        {t('letters.returnedTitle')}
                    </Text>
                </View>
            )}
        </Reanimated.View>
    );
}, (prev, next) => {
    return prev.letter.id === next.letter.id
        && prev.index === next.index
        && prev.totalCards === next.totalCards
        && prev.cardWidth === next.cardWidth;
});

export default function LettersScreen() {
    const { loadUserById, markLetterOpened, currentUser, setComposePrefill, cachedLetters: letters, cachedSenderMap: senderMap, syncLetters } = useStore();
    const [isLoading, setIsLoading] = useState(true);
    const isMounted = useRef(true);

    useEffect(() => {
        return () => {
            isMounted.current = false;
        };
    }, []);

    const router = useRouter();
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const tabBarHeight = 49 + insets.bottom;

    const [selectedLetter, setSelectedLetter] = useState<any>(null);
    const [senderAddress, setSenderAddress] = useState<string>('');
    const [viewFromName, setViewFromName] = useState<string>('');
    const [viewToName, setViewToName] = useState<string>('');

    const [videoUri, setVideoUri] = useState<string | null>(null);

    useEffect(() => {
        const loadVideo = async () => {
            try {
                const asset = Asset.fromModule(require('../../assets/video/LETTERS_background.mp4'));
                await asset.downloadAsync();
                setVideoUri(asset.localUri || asset.uri);
            } catch (e) {
                console.error('Failed to load video background', e);
            }
        };
        loadVideo();
    }, []);

    const player = useVideoPlayer(videoUri, (player: any) => {
        player.loop = true;
        player.muted = true;
        player.playbackRate = 0.25;
        player.play();
    });

    useEffect(() => {
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') {
                if (player) player.play();
                syncLetters().then((newLetters) => {
                    const newUnread = newLetters.filter((l: any) =>
                        l._type === 'received' && l.opened_at === null
                    );
                    if (newUnread.length > 0 && isMounted.current) {
                        playReceive();
                    }
                });
            }
        });
        return () => sub.remove();
    }, [player, syncLetters]);

    const openLetterWrapper = (idx: number) => {
        const letter = letters[idx];
        if (!letter) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        openLetter(letter);
    };

    const openLetter = async (letter: any) => {
        setSelectedLetter(letter);

        if (letter._type === 'returned') {
            setSenderAddress(currentUser?.address || '—');
        } else {
            if (senderMap[letter.sender_id]) {
                setSenderAddress(senderMap[letter.sender_id]);
            } else {
                const sender = await loadUserById(letter.sender_id);
                setSenderAddress(sender?.address || t('letters.unknownSender'));
            }
        }

        setViewFromName(letter.from_name || '');
        setViewToName(letter.to_name || '');

        if (!letter.opened_at && letter._type !== 'returned') {
            markLetterOpened(letter.id).catch(console.error);
        }
    };

    const closeLetter = () => {
        setSelectedLetter(null);
        setSenderAddress('');
        setViewFromName('');
        setViewToName('');
    };

    const handleReply = () => {
        if (!senderAddress || senderAddress === t('letters.unknownSender')) return;

        setComposePrefill({
            toAddress: senderAddress,
        });

        closeLetter();

        setTimeout(() => {
            router.navigate('/(tabs)/compose');
        }, 350);
    };

    useEffect(() => {
        syncLetters().then((newLetters) => {
            const newUnread = newLetters.filter((l: any) =>
                l._type === 'received' && l.opened_at === null
            );
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
            if (letters.length === 0) return;
            let wrappedIdx = idx % letters.length;
            if (wrappedIdx < 0) wrappedIdx += letters.length;
            runOnJS(setFocusedIndex)(wrappedIdx);
        },
        [letters.length]
    );

    const tapGesture = Gesture.Tap()
        .maxDuration(300)
        .maxDistance(25)
        .onEnd(() => {
            if (letters.length > 0) {
                const rawIdx = Math.round(scrollY.value / SNAP);
                let wrappedIdx = rawIdx % letters.length;
                if (wrappedIdx < 0) wrappedIdx += letters.length;
                runOnJS(openLetterWrapper)(wrappedIdx);
            }
        });

    const AXIS_LOCK_THRESHOLD = 12;

    const panGesture = Gesture.Pan()
        .onStart(() => {
            startScrollY.value = scrollY.value;
            lockedAxis.value = 0;
        })
        .onUpdate((e) => {
            if (letters.length <= 1) return;

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
            if (letters.length <= 1) return;

            // Project with velocity along the locked axis
            const velocity = lockedAxis.value === 1
                ? e.velocityX * 0.55
                : -e.velocityY * 0.55;
            const projected = scrollY.value + velocity * 0.15;
            const idx = Math.round(projected / SNAP);

            scrollY.value = withSpring(idx * SNAP, {
                damping: 260,
                stiffness: 300,
                mass: 4,
            });
        });

    const composedGesture = Gesture.Exclusive(panGesture, tapGesture);

    const RENDER_WINDOW = 6; // Easy to bump to 8 later if fast scrolling flashes
    const visibleCards = useMemo(() => {
        if (letters.length <= RENDER_WINDOW * 2) return letters.map((_, i) => i);
        const indices: number[] = [];
        for (let offset = -RENDER_WINDOW; offset <= RENDER_WINDOW; offset++) {
            const idx = ((focusedIndex + offset) % letters.length + letters.length) % letters.length;
            if (!indices.includes(idx)) indices.push(idx);
        }
        return indices;
    }, [focusedIndex, letters.length]);

    return (
        <View style={{ flex: 1, backgroundColor: '#000' }}>
            {videoUri && (
                <VideoView
                    player={player}
                    style={StyleSheet.absoluteFillObject}
                    contentFit="cover"
                />
            )}

            <SafeAreaView edges={['top']} style={{ flex: 1 }}>
                {isLoading ? (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <ActivityIndicator size="large" color="rgba(250,249,246,0.6)" />
                    </View>
                ) : letters.length === 0 ? (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <Text style={{
                            fontFamily: 'Georgia',
                            fontSize: 16,
                            color: 'rgba(250,249,246,0.6)',
                            textAlign: 'center',
                            paddingHorizontal: 40,
                            textShadowColor: 'rgba(0,0,0,0.5)',
                            textShadowOffset: { width: 0, height: 1 },
                            textShadowRadius: 3,
                        }}>
                            {t('letters.empty')}
                        </Text>
                    </View>
                ) : (
                    <GestureDetector gesture={composedGesture}>
                        <View style={{ flex: 1 }}>
                            <Reanimated.View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', transform: [{ perspective: 8000 }, { rotateX: '20deg' }] }}>
                                {visibleCards.map((index) => (
                                    <CardInPile
                                        key={letters[index].id}
                                        letter={letters[index]}
                                        index={index}
                                        scrollY={scrollY}
                                        exitDirX={exitDirX}
                                        exitDirY={exitDirY}
                                        totalCards={letters.length}
                                        cardWidth={CARD_WIDTH}
                                        cardHeight={CARD_HEIGHT}
                                    />
                                ))}
                            </Reanimated.View>
                            <Text style={{
                                position: 'absolute',
                                top: insets.top + 8,
                                alignSelf: 'center',
                                fontFamily: 'Georgia',
                                fontSize: 13,
                                color: 'rgba(250,249,246,0.35)',
                                textShadowColor: 'rgba(0,0,0,0.5)',
                                textShadowOffset: { width: 0, height: 1 },
                                textShadowRadius: 3,
                            }}>
                                {focusedIndex + 1} / {letters.length}
                            </Text>
                        </View>
                    </GestureDetector>
                )}

                {selectedLetter && (
                    <PostcardInspector
                        letter={selectedLetter}
                        senderAddress={senderAddress}
                        fromName={viewFromName}
                        toName={viewToName}
                        isReturned={selectedLetter._type === 'returned'}
                        recipientAddress={
                            selectedLetter._type === 'returned'
                                ? selectedLetter.recipient_address
                                : undefined
                        }
                        onDismiss={closeLetter}
                        onReply={handleReply}
                    />
                )}
            </SafeAreaView>
        </View>
    );
}