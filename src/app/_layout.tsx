import * as Notifications from 'expo-notifications';
import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useStore } from '../lib/store';
import { Theme } from '../theme';

export default function RootLayout() {
    const { currentUser, restoreSession, isLoading, hasPostedFirst } = useStore();
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
        const isFirstPostRoute = segments[0] === 'first-post';

        if (!currentUser) {
            // Not logged in -> onboarding
            if (!isAuthRoute) {
                router.replace('/onboarding');
            }
        } else if (!hasPostedFirst) {
            // Logged in but hasn't posted -> first-post
            if (!isFirstPostRoute) {
                router.replace('/first-post');
            }
        } else {
            // Logged in and posted -> main
            if (!segments[0] || isAuthRoute || isFirstPostRoute) {
                router.replace('/(main)' as any);
            }
        }
    }, [currentUser, isLoading, hasPostedFirst, segments, router]);

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
