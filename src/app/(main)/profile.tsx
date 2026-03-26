import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useStore, EMOJI_MAP } from '../../lib/store';
import { Theme } from '../../theme';

export default function ProfileScreen() {
    const { currentUser, updateLanguage } = useStore();
    const router = useRouter();

    const toggleLanguage = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        updateLanguage(currentUser?.lang === 'en' ? 'fr' : 'en');
    };

    return (
        <View style={styles.container}>
            <SafeAreaView style={{ flex: 1 }} edges={['top']}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={28} color={Theme.colors.textPrimary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={toggleLanguage} style={styles.langButton}>
                        <Text style={styles.langText}>{currentUser?.lang.toUpperCase()}</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.profileInfo}>
                    <Text style={styles.username}>{currentUser?.display_name}</Text>
                </View>

                <View style={styles.links}>
                    <TouchableOpacity
                        style={styles.linkRow}
                        onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            router.push('/(main)/outbox' as any);
                        }}
                    >
                        <Ionicons name="paper-plane-outline" size={24} color={Theme.colors.textPrimary} />
                        <Text style={styles.linkText}>My Cards</Text>
                        <Ionicons name="chevron-forward" size={20} color={Theme.colors.textTertiary} style={{ marginLeft: 'auto' }} />
                    </TouchableOpacity>
                </View>

                <View style={styles.achievements}>
                    <Text style={styles.sectionTitle}>Achievements</Text>
                    <FlatList
                        data={currentUser?.achievements || []}
                        keyExtractor={(item, index) => `${item.type}-${index}`}
                        renderItem={({ item }) => (
                            <View style={styles.achievementRow}>
                                <Text style={styles.achievementEmoji}>{item.emoji ? (EMOJI_MAP as any)[item.emoji] || '🏆' : '🏆'}</Text>
                                <View>
                                    <Text style={styles.achievementType}>{item.type}</Text>
                                    <Text style={styles.achievementDate}>{new Date(item.awarded_at).toLocaleDateString()}</Text>
                                </View>
                            </View>
                        )}
                        ListEmptyComponent={
                            <Text style={styles.emptyText}>No achievements yet.</Text>
                        }
                    />
                </View>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Theme.colors.background },
    header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20 },
    backButton: { padding: 4 },
    langButton: { padding: 8, backgroundColor: Theme.colors.inputBackground, borderRadius: 12 },
    langText: { fontFamily: Theme.fonts.base, color: Theme.colors.textPrimary, fontWeight: 'bold' },
    profileInfo: { alignItems: 'center', marginVertical: 20 },
    username: { fontFamily: Theme.fonts.base, fontSize: 32, fontWeight: 'bold', color: Theme.colors.textPrimary },
    links: { paddingHorizontal: 20, marginBottom: 40 },
    linkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Theme.colors.inputBackground },
    linkText: { fontFamily: Theme.fonts.base, fontSize: 18, color: Theme.colors.textPrimary, marginLeft: 16 },
    achievements: { flex: 1, paddingHorizontal: 20 },
    sectionTitle: { fontFamily: Theme.fonts.base, fontSize: 14, color: Theme.colors.textSecondary, textTransform: 'uppercase', marginBottom: 16 },
    achievementRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    achievementEmoji: { fontSize: 32, marginRight: 16 },
    achievementType: { fontFamily: Theme.fonts.base, color: Theme.colors.textPrimary, fontSize: 16, fontWeight: '500' },
    achievementDate: { fontFamily: Theme.fonts.base, color: Theme.colors.textSecondary, fontSize: 12, marginTop: 4 },
    emptyText: { fontFamily: Theme.fonts.base, color: Theme.colors.textTertiary, fontStyle: 'italic' },
});
