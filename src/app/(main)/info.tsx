import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TabBar, { TAB_BAR_HEIGHT } from '../../components/TabBar';
import { Theme } from '../../theme';

export default function InfoScreen() {
    const insets = useSafeAreaInsets();
    const bottomReserved = TAB_BAR_HEIGHT + insets.bottom;

    return (
        <View style={styles.container}>
            <SafeAreaView style={{ flex: 1 }} edges={['top']}>
                <ScrollView
                    contentContainerStyle={[
                        styles.scroll,
                        { paddingBottom: bottomReserved + 24 },
                    ]}
                >
                    <Text style={styles.title}>Yeet</Text>
                    <Text style={styles.body}>
                        Yeet is a daily head-to-head photo duel. Two photos face off — you swipe to
                        keep one, yeet the other. The survivor takes on a new challenger.
                    </Text>
                    <Text style={styles.body}>
                        Everyone competes on merit. There are no follows, no friends, no graph. Your
                        photo stands on its own against every other photo out there.
                    </Text>
                    <Text style={styles.body}>
                        Submit a photo anytime. The day resets at midnight UTC. Most wins today tops
                        the leaderboard.
                    </Text>
                </ScrollView>
            </SafeAreaView>

            <TabBar />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Theme.colors.background,
    },
    scroll: {
        paddingHorizontal: 24,
        paddingTop: 24,
    },
    title: {
        fontFamily: Theme.fonts.base,
        fontSize: 28,
        fontWeight: '700',
        color: Theme.colors.textPrimary,
        marginBottom: 20,
    },
    body: {
        fontFamily: Theme.fonts.base,
        fontSize: 15,
        lineHeight: 22,
        color: Theme.colors.textSecondary,
        marginBottom: 16,
    },
});
