import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
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
                transition={200}
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
