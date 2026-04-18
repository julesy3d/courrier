import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Card } from '../lib/store';
import { Theme } from '../theme';

interface CardFaceProps {
    card: Card;
    style?: ViewStyle;
}

export default function CardFace({ card, style }: CardFaceProps) {
    return (
        <View style={[styles.container, style]}>
            <Image
                source={{ uri: card.video_url }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
            />
            {card.caption ? (
                <View style={styles.captionWrap}>
                    <View style={styles.captionBar}>
                        <Text style={styles.captionText} numberOfLines={3}>{card.caption}</Text>
                    </View>
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Theme.colors.background,
    },
    captionWrap: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: '18%',
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    captionBar: {
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 4,
        maxWidth: '100%',
    },
    captionText: {
        fontFamily: Theme.fonts.base,
        fontSize: 15,
        fontWeight: '600',
        color: '#FFFFFF',
        textAlign: 'center',
    },
});
