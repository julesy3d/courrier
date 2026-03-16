import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import DualCameraCapture from '../components/DualCameraCapture';
import { useStore } from '../lib/store';

export default function FirstPostScreen() {
    const { hasPostedFirst } = useStore();

    // DualCameraCapture handles everything:
    // capture → upload → broadcast → setHasPostedFirst
    // Root layout will detect hasPostedFirst and navigate to main

    return (
        <View style={styles.container}>
            <DualCameraCapture
                onComplete={() => {
                    // hasPostedFirst is set inside DualCameraCapture
                    // Root layout handles the navigation
                }}
                onClose={() => {
                    // Can't close during onboarding — nowhere to go back to
                    // Could show a "you need to take your first photo" message
                    // For now, just do nothing
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
});
