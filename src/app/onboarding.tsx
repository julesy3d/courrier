import { useCameraPermissions } from 'expo-camera';
import * as Localization from 'expo-localization';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Linking,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '../lib/i18n';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { Theme } from '../theme';

type OnboardingStep = 'welcome' | 'camera';

export default function OnboardingScreen() {
    const [step, setStep] = useState<OnboardingStep>('welcome');
    const { t } = useTranslation();
    const router = useRouter();

    // -- Step 1 State --
    const [displayName, setDisplayName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    // -- Step 2 State --
    const [cameraPermission, requestCameraPermission] = useCameraPermissions();

    const { signInAnonymously, createUser } = useStore();

    const trimmedName = displayName.trim();
    const isNameValid = trimmedName.length >= 2;

    const handleWelcomeContinue = async () => {
        if (!isNameValid || isSubmitting) return;
        setIsSubmitting(true);
        setSubmitError(null);

        try {
            // 1. Sign in anonymously
            await signInAnonymously();

            // 2. Detect language
            const detectedLang = Localization.getLocales()[0]?.languageCode?.startsWith('fr') ? 'fr' : 'en';

            // 3. Create user
            await createUser(trimmedName, detectedLang);

            // 4. Trigger backfill for new user's stack
            const { data: userData } = await supabase
                .from('users')
                .select('id')
                .eq('auth_id', (await supabase.auth.getSession()).data.session?.user.id)
                .single();

            if (userData) {
                const { error } = await supabase.rpc('backfill_new_user', { p_user_id: userData.id });
                if (error) console.error(error);
            }

            // 5. Move to camera permission step
            setStep('camera');
        } catch (e) {
            console.error('Onboarding error:', e);
            setSubmitError(e instanceof Error ? e.message : 'An error occurred');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCameraContinue = async () => {
        if (!cameraPermission?.granted) {
            const result = await requestCameraPermission();
            if (!result.granted) {
                // User denied — still let them proceed, they can grant later
                // when they try to take a photo
            }
        }
        // Navigate to main regardless of permission result
        router.replace('/(main)' as any);
    };

    const handleSkipCamera = () => {
        router.replace('/(main)' as any);
    };

    // ── Step 1: Welcome ──
    if (step === 'welcome') {
        return (
            <SafeAreaView style={styles.container}>
                <KeyboardAwareScrollView
                    contentContainerStyle={styles.content}
                    bottomOffset={Platform.OS === 'ios' ? 40 : 0}
                    keyboardShouldPersistTaps="handled"
                >
                    <Text style={styles.title}>
                        {t('onboarding.welcome' as any) || 'Welcome to Postcards'}
                    </Text>
                    <Text style={styles.subtitle}>
                        {t('onboarding.namePrompt' as any) || 'What should we call you?'}
                    </Text>

                    <TextInput
                        style={styles.input}
                        value={displayName}
                        onChangeText={setDisplayName}
                        placeholder={t('onboarding.namePlaceholder' as any) || 'Your name'}
                        placeholderTextColor={Theme.colors.secondary}
                        autoCapitalize="words"
                        autoCorrect={false}
                        autoFocus
                        maxLength={30}
                    />

                    {submitError && (
                        <Text style={[styles.errorText, { marginTop: 16 }]}>{submitError}</Text>
                    )}

                    <View style={{ flex: 1 }} />

                    <TouchableOpacity
                        style={[styles.button, (!isNameValid || isSubmitting) && styles.buttonDisabled, { marginTop: 32 }]}
                        onPress={handleWelcomeContinue}
                        disabled={!isNameValid || isSubmitting}
                    >
                        {isSubmitting ? (
                            <ActivityIndicator color="#FFFFFF" style={{ marginRight: 8 }} />
                        ) : null}
                        <Text style={styles.buttonText}>
                            {t('onboarding.continue' as any) || 'Continue'}
                        </Text>
                    </TouchableOpacity>
                </KeyboardAwareScrollView>
            </SafeAreaView>
        );
    }

    // ── Step 2: Camera Permission ──
    return (
        <SafeAreaView style={styles.container}>
            <View style={[styles.content, { justifyContent: 'center', flex: 1 }]}>
                <View style={{ alignItems: 'center' }}>
                    <View style={{
                        width: 80,
                        height: 80,
                        borderRadius: 40,
                        backgroundColor: 'rgba(0,0,0,0.05)',
                        justifyContent: 'center',
                        alignItems: 'center',
                        marginBottom: 24,
                    }}>
                        <Ionicons name="camera-outline" size={36} color="rgba(0,0,0,0.5)" />
                    </View>

                    <Text style={[styles.title, { textAlign: 'center' }]}>
                        {t('onboarding.cameraTitle' as any) || 'Enable Camera'}
                    </Text>
                    <Text style={[styles.subtitle, { textAlign: 'center', marginTop: 12, paddingHorizontal: 20 }]}>
                        {t('onboarding.cameraSubtitle' as any) || 'Postcards uses your camera to capture what you see and share it with the world.'}
                    </Text>
                </View>

                <View style={{ marginTop: 48 }}>
                    <TouchableOpacity
                        style={styles.button}
                        onPress={handleCameraContinue}
                    >
                        <Ionicons name="camera" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                        <Text style={styles.buttonText}>
                            {t('onboarding.allowCamera' as any) || 'Allow Camera Access'}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={{ marginTop: 16, alignItems: 'center', padding: 12 }}
                        onPress={handleSkipCamera}
                    >
                        <Text style={{
                            fontFamily: 'Avenir Next',
                            fontSize: 14,
                            color: Theme.colors.secondary,
                        }}>
                            {t('onboarding.skipCamera' as any) || 'Skip for now'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Theme.colors.background,
    },
    content: {
        flexGrow: 1,
        padding: Theme.sizes.horizontalPadding,
        paddingTop: 40,
        paddingBottom: 40,
    },
    title: {
        fontFamily: Theme.fonts.body,
        fontSize: 28,
        color: Theme.colors.text,
    },
    subtitle: {
        fontFamily: Theme.fonts.body,
        fontSize: 16,
        color: Theme.colors.secondary,
        marginTop: 8,
    },
    input: {
        fontFamily: Theme.fonts.body,
        fontSize: 18,
        color: Theme.colors.text,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.1)',
        paddingVertical: 12,
        marginTop: 16,
    },
    errorText: {
        fontFamily: Theme.fonts.body,
        fontSize: 14,
        color: '#FF4444',
    },
    button: {
        flexDirection: 'row',
        backgroundColor: 'rgba(0,0,0,0.8)',
        borderRadius: 14,
        paddingVertical: 14,
        paddingHorizontal: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonDisabled: {
        backgroundColor: 'rgba(0,0,0,0.2)',
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
        fontFamily: 'Avenir Next',
    },
});
