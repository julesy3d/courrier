import * as Notifications from 'expo-notifications';
import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
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
        const subscription = Notifications.addNotificationResponseReceivedListener(response => {
            router.push('/(tabs)/letters');
        });
        return () => subscription.remove();
    }, [router]);

    useEffect(() => {
        if (isLoading) return;

        const inTabsGroup = segments[0] === '(tabs)';

        if (currentUser && !inTabsGroup) {
            router.replace('/(tabs)/compose');
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
        <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
                <Slot />
            </KeyboardProvider>
        </GestureHandlerRootView>
    );
}
