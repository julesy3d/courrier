import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Card } from '../lib/store';
import { getVideoUri } from '../lib/videoCache';
import { Theme } from '../theme';

interface CardFaceProps {
    card: Card;
    isPlaying: boolean;
    muted?: boolean;
    onLoopComplete?: () => void;
    style?: ViewStyle;
    slot?: string;
}

export default function CardFace({ card, isPlaying, muted = true, onLoopComplete, style, slot = '?' }: CardFaceProps) {
    const videoUri = getVideoUri(card.video_url);
    const isLocal = videoUri !== card.video_url;

    // Player created ONCE per mount with the resolved URI.
    // When the card changes, the parent uses key={card.id} to remount this component.
    const player = useVideoPlayer(videoUri, p => {
        p.loop = true;
        // Prevent iOS from pausing other AVPlayers when this one starts.
        // Default 'auto' lets iOS reconfigure the audio session, which
        // intermittently pauses sibling players (the surviving card freeze).
        p.audioMixingMode = 'mixWithOthers';
        p.muted = muted;
        if (__DEV__) console.log(`[CardFace:${slot}] mount card=${card.id.slice(0, 8)} local=${isLocal} muted=${muted}`);
        if (isPlaying) {
            p.play();
        }
    });

    // ── Sync muted state when prop changes ──
    useEffect(() => {
        player.muted = muted;
        if (__DEV__) console.log(`[CardFace:${slot}] muted=${muted} card=${card.id.slice(0, 8)}`);
    }, [player, muted]);

    // ── Notify parent when one loop cycle completes (for audio alternation) ──
    useEffect(() => {
        if (!onLoopComplete) return;
        const sub = player.addListener('playToEnd', () => {
            if (__DEV__) console.log(`[CardFace:${slot}] loopComplete card=${card.id.slice(0, 8)}`);
            onLoopComplete();
        });
        return () => { sub.remove(); };
    }, [player, onLoopComplete]);

    // ── DEV-only: listen for player status changes to detect freezes ──
    useEffect(() => {
        if (!__DEV__) return;
        const sub = player.addListener('statusChange', (ev: any) => {
            console.log(`[CardFace:${slot}] status: ${ev.status}${ev.error ? ' error=' + ev.error.message : ''} card=${card.id.slice(0, 8)}`);
        });
        const sub2 = player.addListener('playingChange', (ev: any) => {
            console.log(`[CardFace:${slot}] playing=${ev.isPlaying} card=${card.id.slice(0, 8)}`);
        });
        return () => {
            if (__DEV__) console.log(`[CardFace:${slot}] unmount card=${card.id.slice(0, 8)}`);
            sub.remove();
            sub2.remove();
        };
    }, [player]);

    return (
        <View style={[styles.container, style]}>
            <VideoView
                player={player}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                showsTimecodes={false}
                nativeControls={false}
                allowsVideoFrameAnalysis={false}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Theme.colors.background,
    },
});
