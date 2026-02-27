import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from '../../lib/i18n';
import { AppUser, useStore } from '../../lib/store';
import { Theme } from '../../theme';

export default function LetterDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { currentUser, fetchReceivedLetters, fetchSentLetters, markLetterOpened, loadUserById } = useStore();

    const [letter, setLetter] = useState<any>(null);
    const [contact, setContact] = useState<AppUser | null>(null);
    const [isSentByMe, setIsSentByMe] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const { t } = useTranslation();

    useEffect(() => {
        async function loadLetter() {
            try {
                // Determine context from both lists
                const received = await fetchReceivedLetters();
                const sent = await fetchSentLetters();
                const all = [...received, ...sent];

                const found = all.find(l => l.id === id);
                if (found) {
                    setLetter(found);

                    const isMine = found.sender_id === currentUser?.id;
                    setIsSentByMe(isMine);

                    if (!isMine && found.opened_at === null) {
                        markLetterOpened(found.id).catch(console.error);
                    }

                    if (isMine) {
                        // Contact is the recipient, we only have recipient_address stored in text
                    } else if (found.sender_id) {
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
    }, [id, fetchReceivedLetters, fetchSentLetters, markLetterOpened, loadUserById, currentUser]);

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

    const dateStr = new Date(letter.sent_at).toLocaleString('en-US', {
        dateStyle: 'full',
        timeStyle: 'short',
    });

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <Text style={styles.bodyText}>{letter.body}</Text>

            <View style={styles.footer}>
                <Text style={styles.senderText}>
                    {isSentByMe
                        ? `${t('letter.detail.to')} ${letter.recipient_address}`
                        : `${t('letter.detail.from')} ${contact?.address || 'Unknown'}`
                    }
                </Text>
                <Text style={styles.dateText}>{dateStr}</Text>
            </View>
        </ScrollView>
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
        padding: Theme.sizes.horizontalPadding,
        paddingTop: 24,
        paddingBottom: 40,
    },
    bodyText: {
        fontFamily: Theme.fonts.body,
        fontSize: 18,
        lineHeight: 18 + Theme.sizes.lineSpacing,
        color: Theme.colors.text,
        marginBottom: 40,
    },
    footer: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: '#E5E5E5',
        paddingTop: 16,
    },
    senderText: {
        fontSize: 13,
        color: Theme.colors.secondary,
        marginBottom: 4,
    },
    dateText: {
        fontSize: 13,
        color: Theme.colors.secondary,
    },
    errorText: {
        fontSize: 13,
        color: Theme.colors.accent,
    },
});
