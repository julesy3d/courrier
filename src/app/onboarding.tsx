import React, { useState, useCallback } from 'react';
import {
    ActivityIndicator,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCameraPermissions } from 'expo-camera';
import * as Localization from 'expo-localization';
import { useRouter } from 'expo-router';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import GlassSurface from '../components/GlassSurface';
import { Theme } from '../theme';

type Step = 'username' | 'camera';

export default function OnboardingScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { signInAnonymously, createUser } = useStore();

    const [step, setStep] = useState<Step>('username');
    const [username, setUsername] = useState('');
    const [isChecking, setIsChecking] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [cameraPermission, requestCameraPermission] = useCameraPermissions();

    const trimmed = username.trim().toLowerCase();
    const isValid = /^[a-z0-9_]{3,20}$/.test(trimmed);

    // Debounced uniqueness check
    const checkRef = React.useRef<NodeJS.Timeout | null>(null);

    const handleUsernameChange = useCallback((text: string) => {
        // Force lowercase, strip spaces
        const clean = text.toLowerCase().replace(/[^a-z0-9_]/g, '');
        setUsername(clean);
        setError(null);

        if (checkRef.current) clearTimeout(checkRef.current);

        const trimmedInput = clean.trim();
        if (trimmedInput.length < 3) return;

        setIsChecking(true);
        checkRef.current = setTimeout(async () => {
            try {
                const { count, error: queryError } = await supabase
                    .from('users')
                    .select('id', { count: 'exact', head: true })
                    .eq('display_name', trimmedInput);

                if (queryError) throw queryError;
                if ((count || 0) > 0) {
                    setError('taken');
                }
            } catch (e) {
                console.error('Username check failed:', e);
            } finally {
                setIsChecking(false);
            }
        }, 500);
    }, []);

    const handleContinue = async () => {
        if (!isValid || isSubmitting || error === 'taken') return;
        setIsSubmitting(true);
        setError(null);

        try {
            await signInAnonymously();
            const lang = Localization.getLocales()[0]?.languageCode?.startsWith('fr') ? 'fr' : 'en';
            await createUser(trimmed, lang);

            // Backfill matchups for new user
            const { data: userData } = await supabase
                .from('users')
                .select('id')
                .eq('auth_id', (await supabase.auth.getSession()).data.session?.user.id)
                .single();

            if (userData) {
                await supabase.rpc('backfill_new_user_v2', { p_user_id: userData.id }).then(null, console.error);
            }

            setStep('camera');
        } catch (e) {
            console.error('Onboarding error:', e);
            setError(e instanceof Error ? e.message : 'Something went wrong');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCameraPermission = async () => {
        if (!cameraPermission?.granted) {
            await requestCameraPermission();
        }
        router.replace('/(main)' as any);
    };

    // ── Step 1: Username ──
    if (step === 'username') {
        return (
            <View style={styles.container}>
                <KeyboardAwareScrollView
                    contentContainerStyle={[
                        styles.content,
                        { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 }
                    ]}
                    bottomOffset={Platform.OS === 'ios' ? 40 : 0}
                    keyboardShouldPersistTaps="handled"
                >
                    <Text style={styles.title}>pick a username</Text>
                    <Text style={styles.subtitle}>this is how others will see you</Text>

                    <View style={styles.inputRow}>
                        <Text style={styles.atSign}>@</Text>
                        <TextInput
                            style={styles.input}
                            value={username}
                            onChangeText={handleUsernameChange}
                            placeholder="username"
                            placeholderTextColor={Theme.colors.textTertiary}
                            autoCapitalize="none"
                            autoCorrect={false}
                            autoFocus
                            maxLength={20}
                            keyboardAppearance="dark"
                        />
                        {isChecking && (
                            <ActivityIndicator size="small" color={Theme.colors.textTertiary} />
                        )}
                    </View>

                    {/* Validation feedback */}
                    <View style={styles.feedback}>
                        {error === 'taken' && (
                            <Text style={styles.errorText}>already taken</Text>
                        )}
                        {error && error !== 'taken' && (
                            <Text style={styles.errorText}>{error}</Text>
                        )}
                        {!error && trimmed.length >= 3 && !isChecking && (
                            <Text style={styles.availableText}>available</Text>
                        )}
                        {trimmed.length > 0 && trimmed.length < 3 && (
                            <Text style={styles.hintTextOnboarding}>3 characters minimum</Text>
                        )}
                    </View>

                    <View style={{ flex: 1 }} />

                    <TouchableOpacity
                        style={[
                            styles.button,
                            (!isValid || isSubmitting || error === 'taken') && styles.buttonDisabled
                        ]}
                        onPress={handleContinue}
                        disabled={!isValid || isSubmitting || error === 'taken'}
                        activeOpacity={0.8}
                    >
                        {isSubmitting ? (
                            <ActivityIndicator color={Theme.colors.textOnAccent} />
                        ) : (
                            <Text style={styles.buttonText}>continue</Text>
                        )}
                    </TouchableOpacity>
                </KeyboardAwareScrollView>
            </View>
        );
    }

    // ── Step 2: Camera Permission ──
    return (
        <View style={styles.container}>
            <View style={[styles.content, {
                paddingTop: insets.top + 60,
                paddingBottom: insets.bottom + 40,
                justifyContent: 'center',
                flex: 1,
            }]}>
                <View style={styles.cameraPrompt}>
                    <Text style={styles.cameraIcon}>📷</Text>
                    <Text style={[styles.title, { textAlign: 'center', marginTop: 16 }]}>
                        enable camera
                    </Text>
                    <Text style={[styles.subtitle, { textAlign: 'center', marginTop: 8 }]}>
                        you'll need it to create cards
                    </Text>
                </View>

                <View style={{ marginTop: 48 }}>
                    <TouchableOpacity
                        style={styles.button}
                        onPress={handleCameraPermission}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.buttonText}>allow camera</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.skipButton}
                        onPress={() => router.replace('/(main)' as any)}
                    >
                        <Text style={styles.skipText}>skip for now</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Theme.colors.background,
    },
    content: {
        flexGrow: 1,
        paddingHorizontal: 32,
    },
    title: {
        fontFamily: Theme.fonts.base,
        fontSize: 28,
        fontWeight: '700',
        color: Theme.colors.textPrimary,
        letterSpacing: -0.5,
    },
    subtitle: {
        fontFamily: Theme.fonts.base,
        fontSize: 16,
        fontWeight: '400',
        color: Theme.colors.textTertiary,
        marginTop: 8,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 40,
        borderBottomWidth: 1,
        borderBottomColor: Theme.colors.buttonBorder,
        paddingBottom: 12,
    },
    atSign: {
        fontFamily: Theme.fonts.base,
        fontSize: 22,
        fontWeight: '600',
        color: Theme.colors.sheetHandle,
        marginRight: 4,
    },
    input: {
        flex: 1,
        fontFamily: Theme.fonts.base,
        fontSize: 22,
        fontWeight: '600',
        color: Theme.colors.textPrimary,
        padding: 0, // remove default padding
    },
    feedback: {
        marginTop: 12,
        height: 20, // fixed height to prevent layout jumps
    },
    errorText: {
        fontFamily: Theme.fonts.base,
        fontSize: 13,
        color: Theme.colors.danger,
    },
    availableText: {
        fontFamily: Theme.fonts.base,
        fontSize: 13,
        color: Theme.colors.success,
    },
    hintTextOnboarding: {
        fontFamily: Theme.fonts.base,
        fontSize: 13,
        color: Theme.colors.textTertiary,
    },
    button: {
        backgroundColor: Theme.colors.accent,
        borderRadius: 14,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonDisabled: {
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    buttonText: {
        fontFamily: Theme.fonts.base,
        fontSize: 16,
        fontWeight: '600',
        color: Theme.colors.textOnAccent,
        letterSpacing: -0.3,
    },
    skipButton: {
        marginTop: 16,
        alignItems: 'center',
        padding: 12,
    },
    skipText: {
        fontFamily: Theme.fonts.base,
        fontSize: 14,
        color: Theme.colors.sheetHandle,
    },
    cameraPrompt: {
        alignItems: 'center',
    },
    cameraIcon: {
        fontSize: 48,
    },
});
