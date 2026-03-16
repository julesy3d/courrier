import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import * as Localization from 'expo-localization';
import { useRouter } from 'expo-router';
import { CountryCode, getCountryCallingCode } from 'libphonenumber-js';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, Linking, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DiscoveredContact, discoverContacts, normalizeToE164, registerPhoneHash } from '../lib/contacts';
import { useTranslation } from '../lib/i18n';
import { useStore } from '../lib/store';
import { Theme } from '../theme';

type OnboardingStep = 'welcome' | 'contacts';

export default function OnboardingScreen() {
    const [step, setStep] = useState<OnboardingStep>('welcome');
    const { t } = useTranslation();
    const router = useRouter();

    // -- Step 1 State --
    const [displayName, setDisplayName] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const regionCode = (Localization.getLocales()[0]?.regionCode || 'US') as CountryCode;
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [permissionDenied, setPermissionDenied] = useState(false);

    const { signInAnonymously, createUser, addContacts } = useStore();

    // Derived values
    const trimmedName = displayName.trim();
    const isNameValid = trimmedName.length >= 2;
    const e164Preview = normalizeToE164(phoneNumber, regionCode);
    const isPhoneValid = e164Preview !== null;
    const isWelcomeValid = isNameValid && isPhoneValid;

    const callingCode = (() => {
        try {
            return `+${getCountryCallingCode(regionCode)}`;
        } catch {
            return '+1';
        }
    })();

    // -- Step 2 State --
    const [discoveredContacts, setDiscoveredContacts] = useState<DiscoveredContact[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isDiscovering, setIsDiscovering] = useState(false);

    // Re-check permission if user returns from Settings
    useEffect(() => {
        const sub = AppState.addEventListener('change', async (state) => {
            if (state === 'active' && permissionDenied) {
                const { status } = await Contacts.getPermissionsAsync();
                if (status === 'granted') {
                    setPermissionDenied(false);
                    setStep('contacts');
                }
            }
        });
        return () => sub.remove();
    }, [permissionDenied]);

    const handleWelcomeContinue = async () => {
        if (!isWelcomeValid || isSubmitting) return;
        setIsSubmitting(true);
        setSubmitError(null);

        try {
            // 1. Sign in anonymously
            await signInAnonymously();

            // 2. Detect language
            const detectedLang = Localization.getLocales()[0]?.languageCode?.startsWith('fr') ? 'fr' : 'en';

            // 3. Create user
            await createUser(trimmedName, detectedLang);

            // 4. Hash phone number and register (e164Preview is guaranteed non-null here)
            await registerPhoneHash(e164Preview!);

            // 5. Request contacts permission
            const { status } = await Contacts.requestPermissionsAsync();

            if (status === 'granted') {
                setStep('contacts');
            } else {
                setPermissionDenied(true);
            }
        } catch (e) {
            console.error('Onboarding error:', e);
            setSubmitError(e instanceof Error ? e.message : 'An error occurred');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Run discovery when entering Step 2
    useEffect(() => {
        if (step === 'contacts') {
            const runDiscovery = async () => {
                setIsDiscovering(true);
                try {
                    const discovered = await discoverContacts(regionCode);
                    setDiscoveredContacts(discovered);
                    // Pre-select all by default
                    setSelectedIds(new Set(discovered.map(c => c.userId)));
                } catch (e) {
                    console.error('Discovery error:', e);
                } finally {
                    setIsDiscovering(false);
                }
            };
            runDiscovery();
        }
    }, [step, regionCode]);

    const handleToggleAll = () => {
        if (selectedIds.size === discoveredContacts.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(discoveredContacts.map(c => c.userId)));
        }
    };

    const handleToggleContact = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        setSelectedIds(next);
    };

    const handleContactsContinue = async () => {
        if (selectedIds.size > 0) {
            await addContacts(Array.from(selectedIds));
        }
        router.replace('/first-post');
    };

    // -- Rendering --

    if (permissionDenied) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={[styles.content, { justifyContent: 'center', flex: 1 }]}>
                    <Text style={styles.title}>Contacts Access</Text>
                    <Text style={[styles.subtitle, { textAlign: 'center', marginTop: 16 }]}>
                        Postal needs your contacts to find friends who can receive your postcards.
                    </Text>
                    <TouchableOpacity
                        style={[styles.button, { marginTop: 32 }]}
                        onPress={() => Linking.openSettings()}
                    >
                        <Text style={styles.buttonText}>Open Settings</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    if (step === 'welcome') {
        return (
            <SafeAreaView style={styles.container}>
                <KeyboardAwareScrollView
                    contentContainerStyle={styles.content}
                    bottomOffset={Platform.OS === 'ios' ? 40 : 0}
                    keyboardShouldPersistTaps="handled"
                >
                    <Text style={styles.title}>Welcome to Postal!</Text>
                    <Text style={styles.subtitle}>What should we call you?</Text>

                    <TextInput
                        style={styles.input}
                        value={displayName}
                        onChangeText={setDisplayName}
                        placeholder="Your name"
                        placeholderTextColor={Theme.colors.secondary}
                        autoCapitalize="words"
                        autoCorrect={false}
                        maxLength={30}
                    />

                    <View style={{ height: 32 }} />

                    <Text style={styles.subtitle}>Your phone number</Text>
                    <View style={styles.phoneRow}>
                        <View style={styles.countryCode}>
                            <Text style={styles.countryCodeText}>{callingCode}</Text>
                        </View>
                        <TextInput
                            style={[styles.input, { flex: 1, marginTop: 0 }]}
                            value={phoneNumber}
                            onChangeText={setPhoneNumber}
                            placeholder="Phone number"
                            placeholderTextColor={Theme.colors.secondary}
                            keyboardType="phone-pad"
                        />
                    </View>

                    {phoneNumber.length > 0 && (
                        <Text style={[styles.previewText, !isPhoneValid && styles.errorText]}>
                            {isPhoneValid ? e164Preview : 'Invalid number for this region'}
                        </Text>
                    )}

                    {submitError && (
                        <Text style={[styles.errorText, { marginTop: 16 }]}>{submitError}</Text>
                    )}

                    <View style={{ flex: 1 }} />

                    <TouchableOpacity
                        style={[styles.button, (!isWelcomeValid || isSubmitting) && styles.buttonDisabled, { marginTop: 32 }]}
                        onPress={handleWelcomeContinue}
                        disabled={!isWelcomeValid || isSubmitting}
                    >
                        {isSubmitting ? (
                            <ActivityIndicator color="#FFFFFF" style={{ marginRight: 8 }} />
                        ) : null}
                        <Text style={styles.buttonText}>Continue</Text>
                    </TouchableOpacity>
                </KeyboardAwareScrollView>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Your friends on Postal</Text>
                {discoveredContacts.length > 0 && !isDiscovering && (
                    <TouchableOpacity onPress={handleToggleAll} style={styles.addAllBtn}>
                        <Text style={styles.addAllText}>
                            {selectedIds.size === discoveredContacts.length ? 'Deselect All' : 'Select All'}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>

            {isDiscovering ? (
                <View style={styles.centerSub}>
                    <ActivityIndicator color="rgba(255,255,255,0.6)" size="large" />
                    <Text style={[styles.subtitle, { marginTop: 16 }]}>Looking for friends...</Text>
                </View>
            ) : discoveredContacts.length === 0 ? (
                <View style={styles.centerSub}>
                    <Text style={[styles.subtitle, { textAlign: 'center', paddingHorizontal: 32 }]}>
                        None of your contacts are on Postal yet. You can add friends later.
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={discoveredContacts}
                    keyExtractor={(item) => item.userId}
                    contentContainerStyle={{ paddingHorizontal: Theme.sizes.horizontalPadding, paddingBottom: 100 }}
                    renderItem={({ item }) => {
                        const isSelected = selectedIds.has(item.userId);
                        return (
                            <TouchableOpacity
                                style={styles.contactRow}
                                onPress={() => handleToggleContact(item.userId)}
                            >
                                <View>
                                    <Text style={styles.contactName}>{item.localName}</Text>
                                    <Text style={styles.contactSub}>{item.displayName}</Text>
                                </View>
                                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                                    {isSelected && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
                                </View>
                            </TouchableOpacity>
                        );
                    }}
                />
            )}

            {!isDiscovering && (
                <View style={styles.footer}>
                    <TouchableOpacity
                        style={styles.button}
                        onPress={handleContactsContinue}
                    >
                        <Text style={styles.buttonText}>
                            {selectedIds.size > 0 ? `Add ${selectedIds.size} friends` : 'Skip'}
                        </Text>
                    </TouchableOpacity>
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
        flexGrow: 1,
        padding: Theme.sizes.horizontalPadding,
        paddingTop: 40,
        paddingBottom: 40,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        paddingHorizontal: Theme.sizes.horizontalPadding,
        paddingTop: 40,
        paddingBottom: 24,
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
    phoneRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        marginTop: 16,
    },
    countryCode: {
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.1)',
        paddingVertical: 12,
        paddingHorizontal: 8,
        marginRight: 12,
        backgroundColor: 'rgba(0,0,0,0.03)',
        borderRadius: 6,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
    },
    countryCodeText: {
        fontFamily: Theme.fonts.body,
        fontSize: 18,
        color: Theme.colors.text,
    },
    previewText: {
        fontFamily: Theme.fonts.body,
        fontSize: 13,
        color: Theme.colors.secondary,
        marginTop: 8,
    },
    errorText: {
        color: '#007AFF',
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
    centerSub: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    addAllBtn: {
        padding: 8,
    },
    addAllText: {
        color: '#007AFF',
        fontSize: 14,
        fontWeight: '600',
    },
    contactRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.05)',
    },
    contactName: {
        fontFamily: Theme.fonts.body,
        fontSize: 18,
        color: Theme.colors.text,
    },
    contactSub: {
        fontFamily: Theme.fonts.body,
        fontSize: 13,
        color: Theme.colors.secondary,
        marginTop: 4,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: Theme.colors.secondary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkboxSelected: {
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderColor: 'rgba(255,255,255,0.2)',
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: Theme.sizes.horizontalPadding,
        paddingBottom: Platform.OS === 'ios' ? 40 : 20,
        backgroundColor: Theme.colors.background,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.05)',
    },
});
