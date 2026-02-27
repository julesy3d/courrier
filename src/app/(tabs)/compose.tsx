import { Tabs } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useTranslation } from '../../lib/i18n';
import { useStore } from '../../lib/store';
import { Theme } from '../../theme';

type ComposeStep = 'write' | 'envelope' | 'sending' | 'sent';

export default function ComposeScreen() {
    const { currentUser, sendLetter } = useStore();
    const { t } = useTranslation();

    const [step, setStep] = useState<ComposeStep>('write');

    const [body, setBody] = useState('');
    const [toName, setToName] = useState('');
    const [toAddress, setToAddress] = useState('');
    const [fromName, setFromName] = useState('');

    const [sendError, setSendError] = useState<string | null>(null);

    const MAX_CHARS = 300;
    const canProceedToStep2 = body.trim().length > 0;
    const canSend = body.trim().length > 0 && toAddress.trim().length > 0;

    const handleSend = async () => {
        if (!canSend || step === 'sending') return;
        setStep('sending');
        setSendError(null);
        Keyboard.dismiss();

        try {
            await sendLetter(body.trim(), toAddress.trim());
            setStep('sent');
        } catch (e) {
            setSendError(t('compose.error'));
            setStep('envelope'); // kick back to envelope editable state
        }
    };

    useEffect(() => {
        if (step === 'sent') {
            const timer = setTimeout(() => {
                setBody('');
                setToName('');
                setToAddress('');
                setFromName('');
                setStep('write');
            }, 2500);
            return () => clearTimeout(timer);
        }
    }, [step]);

    const renderStep1 = () => (
        <View style={styles.stepContainer}>
            <TextInput
                style={styles.bodyInput}
                multiline
                placeholder={t('compose.prompt')}
                placeholderTextColor={Theme.colors.secondary + '40'}
                value={body}
                onChangeText={(text) => {
                    if (text.length <= MAX_CHARS) setBody(text);
                }}
                textAlignVertical="top"
            />
            <View style={styles.step1Footer}>
                <Text style={[
                    styles.charCount,
                    { color: body.length >= 280 ? Theme.colors.accent : Theme.colors.secondary }
                ]}>
                    {body.length} / {MAX_CHARS}
                </Text>
                <TouchableOpacity
                    style={[styles.button, !canProceedToStep2 && styles.buttonDisabled, { minWidth: 100 }]}
                    onPress={() => setStep('envelope')}
                    disabled={!canProceedToStep2}
                >
                    <Text style={styles.buttonText}>{t('compose.next')}</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    const renderStep2OrSending = () => {
        const previewText = body.length > 50 ? body.substring(0, 50) + '…' : body;
        const isInteractive = step === 'envelope';

        return (
            <View style={styles.stepContainer}>
                {/* Preview */}
                <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => isInteractive && setStep('write')}
                    disabled={!isInteractive}
                >
                    <Text style={styles.previewText}>"{previewText}"</Text>
                </TouchableOpacity>

                {/* To Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionLabel}>{t('compose.to')}</Text>
                    <TextInput
                        style={styles.fieldInput}
                        placeholder={t('compose.recipientName')}
                        placeholderTextColor={Theme.colors.secondary}
                        value={toName}
                        onChangeText={setToName}
                        editable={isInteractive}
                    />
                    <TextInput
                        style={styles.fieldInput}
                        placeholder={t('compose.recipientAddress')}
                        placeholderTextColor={Theme.colors.secondary}
                        value={toAddress}
                        onChangeText={setToAddress}
                        autoCorrect={false}
                        autoCapitalize="none"
                        editable={isInteractive}
                    />
                </View>

                {/* From Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionLabel}>{t('compose.from')}</Text>
                    <TextInput
                        style={styles.fieldInput}
                        placeholder={t('compose.yourName')}
                        placeholderTextColor={Theme.colors.secondary}
                        value={fromName}
                        onChangeText={setFromName}
                        editable={isInteractive}
                    />
                    <Text style={styles.readOnlyField}>
                        {currentUser?.address || '—'}
                    </Text>
                </View>

                {sendError && <Text style={styles.errorText}>{sendError}</Text>}

                {/* Actions */}
                <View style={styles.step2Actions}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => setStep('write')}
                        disabled={!isInteractive}
                    >
                        {isInteractive && <Text style={styles.backButtonText}>{t('common.cancel')}</Text>}
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.button, (!canSend || !isInteractive) && styles.buttonDisabled, { flex: 1.5 }]}
                        onPress={handleSend}
                        disabled={!canSend || !isInteractive}
                    >
                        {step === 'sending' && <ActivityIndicator color="#FFFFFF" style={{ marginRight: 8 }} />}
                        <Text style={styles.buttonText}>
                            {step === 'sending' ? t('compose.sending') : t('compose.send')}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    if (step === 'sent') {
        return (
            <View style={[styles.sentContainer, { backgroundColor: Theme.colors.background }]}>
                <Tabs.Screen options={{ headerShown: false, tabBarStyle: { display: 'none' } }} />
                <Text style={styles.sentText}>{t('compose.sent')}</Text>
            </View>
        );
    }

    return (
        <KeyboardAwareScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
            bottomOffset={20}
        >
            <Tabs.Screen options={{ headerShown: false, tabBarStyle: { display: 'flex' } }} />
            {step === 'write' && renderStep1()}
            {(step === 'envelope' || step === 'sending') && renderStep2OrSending()}
        </KeyboardAwareScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Theme.colors.background,
    },
    content: {
        padding: Theme.sizes.horizontalPadding,
        paddingTop: 16,
        paddingBottom: 40,
        flexGrow: 1,
    },
    stepContainer: {
        flex: 1,
        display: 'flex',
    },
    bodyInput: {
        flex: 1,
        minHeight: 250,
        fontFamily: Theme.fonts.body,
        fontSize: 18,
        lineHeight: 18 + Theme.sizes.lineSpacing,
        color: Theme.colors.text,
    },
    step1Footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 24,
    },
    charCount: {
        fontSize: 13,
        color: Theme.colors.secondary,
    },
    previewText: {
        fontFamily: Theme.fonts.body,
        fontSize: 18,
        lineHeight: 18 + Theme.sizes.lineSpacing,
        color: Theme.colors.secondary,
        fontStyle: 'italic',
        marginBottom: 32,
    },
    section: {
        marginBottom: 24,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: '#E5E5E5',
        paddingTop: 16,
    },
    sectionLabel: {
        fontSize: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        color: Theme.colors.secondary,
        marginBottom: 12,
    },
    fieldInput: {
        fontFamily: Theme.fonts.body,
        fontSize: 18,
        color: Theme.colors.text,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#E5E5E5',
        paddingVertical: 8,
        marginBottom: 16,
    },
    readOnlyField: {
        fontFamily: Theme.fonts.body,
        fontSize: 18,
        color: Theme.colors.secondary,
        fontStyle: 'italic',
        paddingVertical: 8,
        marginBottom: 16,
    },
    step2Actions: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 'auto',
    },
    backButton: {
        flex: 1,
        padding: 16,
    },
    backButtonText: {
        fontSize: 16,
        color: Theme.colors.secondary,
    },
    errorText: {
        fontSize: 13,
        color: Theme.colors.accent,
        marginBottom: 16,
        textAlign: 'center',
    },
    button: {
        flexDirection: 'row',
        backgroundColor: Theme.colors.accent,
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonDisabled: {
        backgroundColor: Theme.colors.secondary,
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    sentContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sentText: {
        fontFamily: Theme.fonts.body,
        fontSize: 22,
        color: Theme.colors.accent,
        textAlign: 'center',
    },
});
