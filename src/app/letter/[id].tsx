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
    const { currentUser, fetchReceivedLetters, markLetterOpened, loadUserById } = useStore();

    const [letter, setLetter] = useState<any>(null);
    const [contact, setContact] = useState<AppUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const { t, locale } = useTranslation();

    useEffect(() => {
        async function loadLetter() {
            try {
                const received = await fetchReceivedLetters();

                const found = received.find(l => l.id === id);
                console.log('Detail: found letter?', !!found, 'id:', id);
                if (found) {
                    setLetter(found);

                    if (found.opened_at === null) {
                        markLetterOpened(found.id).catch(console.error);
                    }

                    if (found.sender_id) {
                        const user = await loadUserById(found.sender_id);
                        setContact(user);
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
    }, [id, fetchReceivedLetters, markLetterOpened, loadUserById, currentUser]);

    if (isLoading) {
        return (
            <View style={[styles.container, styles.centered]}>
                <ActivityIndicator color={Theme.colors.accent} />
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
                headerTintColor: Theme.colors.accent,
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
                    fromAddressUser={contact}
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
        color: Theme.colors.accent,
    },
});
