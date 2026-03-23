import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '../../lib/i18n';
import { useStore } from '../../lib/store';
import { Theme } from '../../theme';

export default function SettingsScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const { currentUser, updateLanguage } = useStore();
    const insets = useSafeAreaInsets();

    return (
        <View style={{ flex: 1 }}>
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />

            <View style={{ flex: 1, paddingTop: insets.top }}>
                {/* Close */}
                <View style={{ alignItems: 'flex-end', paddingHorizontal: 16, paddingTop: 8 }}>
                    <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
                        <Ionicons name="close" size={24} color="rgba(255,255,255,0.8)" />
                    </TouchableOpacity>
                </View>

                <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
                    <Text style={styles.title}>{t('settings.title')}</Text>

                    {/* Name */}
                    <Text style={styles.label}>{t('settings.name')}</Text>
                    <Text style={styles.value}>{currentUser?.display_name || '—'}</Text>

                    {/* Language */}
                    <Text style={[styles.label, { marginTop: 32 }]}>{t('settings.language')}</Text>
                    <View style={styles.langRow}>
                        <TouchableOpacity
                            onPress={() => updateLanguage('en')}
                            style={[styles.langOption, currentUser?.lang === 'en' && styles.langActive]}
                        >
                            <Text style={[styles.langText, currentUser?.lang === 'en' && styles.langTextActive]}>
                                English
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => updateLanguage('fr')}
                            style={[styles.langOption, currentUser?.lang === 'fr' && styles.langActive]}
                        >
                            <Text style={[styles.langText, currentUser?.lang === 'fr' && styles.langTextActive]}>
                                Français
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    title: {
        fontFamily: Theme.fonts.base,
        fontSize: 22,
        color: 'rgba(255,255,255,0.9)',
        marginBottom: 32,
    },
    label: {
        fontFamily: Theme.fonts.base,
        fontSize: 13,
        color: Theme.colors.textSecondary,
        marginBottom: 8,
    },
    value: {
        fontFamily: Theme.fonts.base,
        fontSize: 18,
        color: 'rgba(255,255,255,0.9)',
    },
    langRow: {
        flexDirection: 'row',
        gap: 12,
    },
    langOption: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 10,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: Theme.colors.buttonBorder,
    },
    langActive: {
        backgroundColor: Theme.colors.inputBackground,
        borderColor: Theme.colors.sheetHandle,
    },
    langText: {
        fontFamily: Theme.fonts.base,
        fontSize: 15,
        color: Theme.colors.textSecondary,
    },
    langTextActive: {
        color: 'rgba(255,255,255,0.9)',
    },
});
