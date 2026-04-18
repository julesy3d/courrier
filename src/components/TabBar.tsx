import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useStore } from '../lib/store';
import { Theme } from '../theme';

export const TAB_BAR_HEIGHT = 40;

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export default function TabBar() {
    const insets = useSafeAreaInsets();
    const totalHeight = TAB_BAR_HEIGHT + insets.bottom;
    const router = useRouter();
    const pathname = usePathname();
    const setShowCamera = useStore(s => s.setShowCamera);

    const navigate = (route: string) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.replace(route as any);
    };

    const openCamera = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setShowCamera(true);
    };

    return (
        <View style={[styles.bar, { height: totalHeight, paddingBottom: insets.bottom }]}>
            <TabIcon
                active={pathname === '/'}
                outline="home-outline"
                filled="home"
                onPress={() => navigate('/(main)')}
            />
            <TabIcon
                active={pathname === '/leaderboard'}
                outline="podium-outline"
                filled="podium"
                onPress={() => navigate('/(main)/leaderboard')}
            />
            <TouchableOpacity activeOpacity={0.7} onPress={openCamera} style={styles.button}>
                <Ionicons name="add" size={30} color={Theme.colors.textPrimary} />
            </TouchableOpacity>
            <TabIcon
                active={pathname === '/profile'}
                outline="person-outline"
                filled="person"
                onPress={() => navigate('/(main)/profile')}
            />
            <TabIcon
                active={pathname === '/info'}
                outline="help-circle-outline"
                filled="help-circle"
                onPress={() => navigate('/(main)/info')}
            />
        </View>
    );
}

function TabIcon({ active, outline, filled, onPress }: {
    active: boolean;
    outline: IconName;
    filled: IconName;
    onPress: () => void;
}) {
    return (
        <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={styles.button}>
            <Ionicons
                name={active ? filled : outline}
                size={24}
                color={Theme.colors.textPrimary}
            />
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    bar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: Theme.colors.surface,
        flexDirection: 'row',
        alignItems: 'center',
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: Theme.colors.buttonBorder,
        zIndex: 20,
    },
    button: {
        flex: 1,
        height: TAB_BAR_HEIGHT,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
