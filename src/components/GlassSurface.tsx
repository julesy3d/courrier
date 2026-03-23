import React from 'react';
import { Platform, View, ViewStyle, StyleProp } from 'react-native';
import { GlassView } from 'expo-glass-effect';

// Reusable glass wrapper
export default function GlassSurface({ children, style, intensity = 40, tint = 'default' }: {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    intensity?: number;
    tint?: 'default' | 'light' | 'dark' | 'prominent';
}) {
    if (Platform.OS === 'ios') {
        return (
            // @ts-ignore - expo-glass-effect typings might be missing or mismatched
            <GlassView style={style} intensity={intensity} tint={tint}>
                {children}
            </GlassView>
        );
    }
    // Android fallback: semi-transparent dark background
    return (
        <View style={[style, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
            {children}
        </View>
    );
}
