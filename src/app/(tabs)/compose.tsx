import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Animated, Dimensions, Easing, Keyboard, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Postcard from '../../components/Postcard';
import { useTranslation } from '../../lib/i18n';
import { useStore } from '../../lib/store';
import { Theme } from '../../theme';

const { height: screenHeight } = Dimensions.get('window');

type ComposeStep = 'compose' | 'sending' | 'sent';

export default function ComposeScreen() {
    const { currentUser, sendLetter } = useStore();
    const { t } = useTranslation();

    const [step, setStep] = useState<ComposeStep>('compose');
    const [cardKey, setCardKey] = useState(0);

    const [body, setBody] = useState('');
    const [toName, setToName] = useState('');
    const [toAddress, setToAddress] = useState('');
    const [fromName, setFromName] = useState('');

    const [sendError, setSendError] = useState<string | null>(null);
    const sendAnim = useRef(new Animated.Value(0)).current;

    const canSend = body.trim().length > 0 && toAddress.trim().length > 0;

    const handleSend = async () => {
        if (!canSend || step === 'sending') return;
        setSendError(null);
        Keyboard.dismiss();

        Animated.parallel([
            Animated.timing(sendAnim, {
                toValue: 1,
                duration: 800,
                easing: Easing.in(Easing.ease),
                useNativeDriver: true,
            }),
        ]).start();

        const sendStart = Date.now();
        setStep('sending');

        try {
            await sendLetter(body.trim(), toAddress.trim());

            const elapsed = Date.now() - sendStart;
            if (elapsed < 2800) {
                await new Promise(resolve => setTimeout(resolve, 2800 - elapsed));
            }

            setStep('sent');
            setTimeout(() => {
                setBody('');
                setToName('');
                setToAddress('');
                setFromName('');
                setSendError(null);
                sendAnim.setValue(0);
                setCardKey(k => k + 1); // Reset postcard internal flip side to recto
                setStep('compose');
            }, 3000);
        } catch (e) {
            Animated.timing(sendAnim, {
                toValue: 0,
                duration: 500,
                useNativeDriver: true,
            }).start();
            setSendError(t('compose.error'));
            setStep('compose');
        }
    };

    const cardTranslateY = sendAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -screenHeight],
    });
    const cardOpacity = sendAnim.interpolate({
        inputRange: [0, 0.7, 1],
        outputRange: [1, 0.5, 0],
    });

    return (
        <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: Theme.colors.background }}>
            <Tabs.Screen options={{ headerShown: false, tabBarStyle: { display: 'flex' } }} />

            <ScrollView
                style={[styles.container, (step === 'sending' || step === 'sent') && { opacity: 0 }]}
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                pointerEvents={step === 'compose' ? 'auto' : 'none'}
            >
                <Animated.View style={{
                    transform: [{ translateY: cardTranslateY }],
                    opacity: cardOpacity,
                }}>
                    <Postcard
                        key={cardKey}
                        mode="compose"
                        body={body}
                        onBodyChange={setBody}
                        toName={toName}
                        onToNameChange={setToName}
                        toAddress={toAddress}
                        onToAddressChange={setToAddress}
                        fromName={fromName}
                        onFromNameChange={setFromName}
                        fromAddressUser={currentUser}
                        onSend={handleSend}
                        canSend={canSend}
                    />
                    {sendError && <Text style={styles.errorText}>{sendError}</Text>}
                </Animated.View>
            </ScrollView>

            {step === 'sending' && (
                <View style={[StyleSheet.absoluteFill, styles.overlayCenter]}>
                    <ActivityIndicator size="large" color={Theme.colors.accent} style={{ marginBottom: 24 }} />
                    <Text style={styles.overlayText}>
                        {t('compose.sending')}
                    </Text>
                </View>
            )}

            {step === 'sent' && (
                <View style={[StyleSheet.absoluteFill, styles.overlayCenter]}>
                    <View style={styles.checkCircle}>
                        <Ionicons name="checkmark" size={36} color="#FFFFFF" />
                    </View>
                    <Text style={[styles.overlayText, { color: Theme.colors.text, fontSize: 22 }]}>
                        {t('compose.sentTitle')}
                    </Text>
                </View>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Theme.colors.background,
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
        marginBottom: 16,
        textAlign: 'center',
    },
    overlayCenter: {
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
        backgroundColor: Theme.colors.background,
        zIndex: 10,
    },
    overlayText: {
        fontFamily: 'Georgia',
        fontSize: 18,
        color: Theme.colors.secondary,
        textAlign: 'center',
    },
    checkCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: Theme.colors.accent,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
});
