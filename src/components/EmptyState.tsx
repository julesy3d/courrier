import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Theme } from '../theme';

export default function EmptyState() {
    return (
        <View style={styles.container}>
            <View style={styles.half} />
            <View style={styles.separator} />
            <View style={styles.half} />

            <View style={styles.textOverlay}>
                <Text style={styles.text}>
                    No videos available right now.{'\n'}Create a card!
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Theme.colors.background,
    },
    half: {
        flex: 1,
        backgroundColor: Theme.colors.surface,
    },
    separator: {
        height: 2,
        backgroundColor: Theme.colors.background,
    },
    textOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    text: {
        fontFamily: Theme.fonts.base,
        fontSize: 16,
        lineHeight: 22,
        color: Theme.colors.textSecondary,
        textAlign: 'center',
    },
});
