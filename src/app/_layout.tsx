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
            router.push('/(main)' as any);
        });
        return () => subscription.remove();
    }, [router]);

    useEffect(() => {
        if (isLoading) return;

        const isAuthRoute = segments[0] === 'onboarding';

        if (!currentUser) {
            // Not logged in → onboarding
            if (!isAuthRoute) {
                router.replace('/onboarding');
            }
        } else {
            // Logged in → main
            if (!segments[0] || isAuthRoute) {
                router.replace('/(main)' as any);
            }
        }
    }, [currentUser, isLoading, segments, router]);

    if (isLoading) {
        return (
            <View style={{ flex: 1, backgroundColor: Theme.colors.background, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="rgba(255,255,255,0.6)" />
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
