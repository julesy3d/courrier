import { Stack } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import PhotoCapture from '../../components/PhotoCapture';
import { useStore } from '../../lib/store';

export default function MainLayout() {
    const showCamera = useStore(s => s.showCamera);
    const setShowCamera = useStore(s => s.setShowCamera);
    const fetchCardPool = useStore(s => s.fetchCardPool);

    const handleComplete = () => {
        setShowCamera(false);
        const pool = useStore.getState().cardPool;
        if (pool.length < 5) {
            fetchCardPool(10).catch(console.error);
        }
    };

    return (
        <View style={styles.root}>
            <Stack screenOptions={{ headerShown: false, animation: 'none' }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="leaderboard" />
                <Stack.Screen name="profile" />
                <Stack.Screen name="info" />
                <Stack.Screen
                    name="settings"
                    options={{
                        presentation: 'transparentModal',
                        animation: 'fade',
                        contentStyle: { backgroundColor: 'transparent' },
                    }}
                />
            </Stack>

            {showCamera && (
                <View style={[StyleSheet.absoluteFill, styles.cameraOverlay]}>
                    <PhotoCapture
                        onComplete={handleComplete}
                        onClose={() => setShowCamera(false)}
                    />
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    cameraOverlay: {
        zIndex: 1000,
    },
});
