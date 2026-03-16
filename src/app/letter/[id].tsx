import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Postcard from '../../components/Postcard';
import { useTranslation } from '../../lib/i18n';
import { AppUser, useStore } from '../../lib/store';
import { Theme } from '../../theme';

export default function LetterDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    console.log('Letter detail opened, id:', id);
    const { currentUser, cachedLetters, markLetterOpened } = useStore();

    const [letter, setLetter] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);

    const { t, locale } = useTranslation();

    useEffect(() => {
        function loadLetter() {
            try {
                const found = cachedLetters.find((l: any) => l.id === id);
                console.log('Detail: found letter?', !!found, 'id:', id);
                if (found) {
                    setLetter(found);

                    if (found.opened_at === null) {
                        markLetterOpened(found.id).catch(console.error);
                    }
                }
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoading(false);
            }
        }
        if (id && currentUser) {
            loadLetter();
        }
    }, [id, cachedLetters, markLetterOpened, currentUser]);

    if (isLoading) {
        return (
            <View style={[styles.container, styles.centered]}>
                <ActivityIndicator color="rgba(255,255,255,0.6)" />
                <Text style={{ marginTop: 16, color: Theme.colors.secondary }}>{t('common.loading')}</Text>
            </View>
        );
    }

    if (!letter) {
        return (
            <View style={[styles.container, styles.centered]}>
                <Text style={styles.errorText}>{t('letter.detail.notFound')}</Text>
            </View>
        );
    }

    const dateStr = new Date(letter.sent_at).toLocaleDateString(locale, {
        dateStyle: 'full',
    });

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <Stack.Screen options={{
                headerShown: true,
                headerTitle: '',
                headerBackTitle: t('letters.tab'),
                headerStyle: { backgroundColor: Theme.colors.background },
                headerShadowVisible: false,
                headerTintColor: '#007AFF',
            }} />
            <ScrollView
                style={styles.container}
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <Postcard
                    mode="view"
                    body={letter.body}
                    dateStr={dateStr}
                />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Theme.colors.background,
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        paddingTop: 40,
        paddingBottom: 60,
        paddingHorizontal: 40,
        flexGrow: 1,
        alignItems: 'center',
    },
    errorText: {
        fontSize: 13,
        color: '#007AFF',
    },
});
