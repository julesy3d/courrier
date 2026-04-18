import { Stack } from 'expo-router';

export default function MainLayout() {
    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen
                name="leaderboard"
                options={{
                    animation: 'slide_from_right',
                }}
            />
            <Stack.Screen
                name="settings"
                options={{
                    presentation: 'transparentModal',
                    animation: 'fade',
                    contentStyle: { backgroundColor: 'transparent' },
                }}
            />
        </Stack>
    );
}
