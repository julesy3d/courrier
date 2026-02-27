import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useStore } from '../lib/store';
import { Theme } from '../theme';

export default function RootLayout() {
    const { currentUser, restoreSession, isLoading } = useStore();
    const segments = useSegments();
    const router = useRouter();

    useEffect(() => {
        restoreSession();
    }, []);

    useEffect(() => {
        if (isLoading) return;

        const inTabsGroup = segments[0] === '(tabs)';

        if (currentUser && !inTabsGroup) {
            router.replace('/(tabs)/letters');
        } else if (!currentUser && segments[0] !== 'onboarding') {
            router.replace('/onboarding');
        }
    }, [currentUser, isLoading, segments, router]);

    if (isLoading) {
        return (
            <View style={{ flex: 1, backgroundColor: Theme.colors.background, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={Theme.colors.accent} />
            </View>
        );
    }

    return (
        <KeyboardProvider>
            <Slot />
        </KeyboardProvider>
    );
}
