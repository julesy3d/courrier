import { useFocusEffect } from '@react-navigation/native';
import { Asset } from 'expo-asset';
import * as Haptics from 'expo-haptics';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator, Alert, Animated, Dimensions, FlatList,
    ImageBackground, Keyboard, PanResponder, ScrollView, StyleSheet, Text,
    TextInput, TouchableOpacity, View
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import AddressBuilder, { ENGLISH_TYPES, FRENCH_TYPES } from '../../components/AddressBuilder';
import { useTranslation } from '../../lib/i18n';
import { AddressBookEntry, useStore } from '../../lib/store';
import { Theme } from '../../theme';

const { height: screenHeight } = Dimensions.get('window');

export default function AddressesScreen() {
    const {
        currentUser,
        fetchAddressBook,
        addAddressBookEntry,
        deleteAddressBookEntry,
        updateAddress,
        updateLanguage,
        isAddressTaken
    } = useStore();
    const { t } = useTranslation();

    const insets = useSafeAreaInsets();
    const tabBarHeight = 49 + insets.bottom; // Native tab bar height (49pt) + safe area
    const SHEET_TOP_GAP = insets.top + 100;
    const SHEET_HEIGHT = screenHeight - SHEET_TOP_GAP;

    const [entries, setEntries] = useState<AddressBookEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const sheetAnim = useRef(new Animated.Value(0)).current;

    const sheetTranslateY = sheetAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [SHEET_HEIGHT, 0],
    });

    const [sheetTab, setSheetTab] = useState<'contacts' | 'settings'>('contacts');

    const openSheet = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Animated.spring(sheetAnim, {
            toValue: 1,
            damping: 20,
            stiffness: 150,
            useNativeDriver: true,
        }).start();
    };

    const closeSheet = () => {
        Keyboard.dismiss();
        Animated.spring(sheetAnim, {
            toValue: 0,
            damping: 20,
            stiffness: 150,
            useNativeDriver: true,
        }).start(() => {
            setShowAddForm(false);
            setShowAddressBuilder(false);
        });
    };

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 10,
            onPanResponderMove: (_, gestureState) => {
                if (gestureState.dy > 0) {
                    const progress = 1 - (gestureState.dy / SHEET_HEIGHT);
                    sheetAnim.setValue(Math.max(0, progress));
                }
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dy > 100 || gestureState.vy > 0.5) {
                    closeSheet();
                } else {
                    Animated.spring(sheetAnim, {
                        toValue: 1,
                        damping: 20,
                        stiffness: 150,
                        useNativeDriver: true,
                    }).start();
                }
            },
        })
    ).current;

    const [videoUri, setVideoUri] = useState<string | null>(null);

    useEffect(() => {
        const loadVideo = async () => {
            const asset = Asset.fromModule(require('../../assets/video/BOOK_background.mp4'));
            await asset.downloadAsync();
            setVideoUri(asset.localUri || asset.uri);
        };
        loadVideo();
    }, []);

    const player = useVideoPlayer(
        videoUri,
        (player: any) => {
            player.loop = true;
            player.muted = true;
            player.playbackRate = 0.25;
            player.play();
        }
    );

    // States for inline forms
    const [showAddForm, setShowAddForm] = useState(false);
    const [newName, setNewName] = useState('');
    const [newAddress, setNewAddress] = useState('');
    const [isSavingContact, setIsSavingContact] = useState(false);

    const [showAddressBuilder, setShowAddressBuilder] = useState(false);

    // Shared Address Builder State
    const [editLang, setEditLang] = useState<'en' | 'fr'>('en');
    const [editNumber, setEditNumber] = useState('');
    const [editName, setEditName] = useState('');
    const [editType, setEditType] = useState('');
    const [editParticle, setEditParticle] = useState('');
    const [editNameError, setEditNameError] = useState<string | null>(null);
    const [isSavingAddress, setIsSavingAddress] = useState(false);
    const [editSaveError, setEditSaveError] = useState<string | null>(null);

    const loadEntries = useCallback(async () => {
        try {
            const data = await fetchAddressBook();
            setEntries(data);
        } catch (e) {
            console.error(e);
        }
    }, [fetchAddressBook]);

    useFocusEffect(
        useCallback(() => {
            loadEntries();
            return () => {
                sheetAnim.setValue(0);
                setShowAddForm(false);
                setShowAddressBuilder(false);
                setSheetTab('contacts');
            };
        }, [loadEntries, sheetAnim])
    );

    useEffect(() => {
        setIsLoading(false);
    }, [entries]);

    // Handle Add Contact
    const saveNewContact = async () => {
        if (!newName.trim() || !newAddress.trim()) return;
        setIsSavingContact(true);
        try {
            await addAddressBookEntry(newName.trim(), newAddress.trim());
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await loadEntries();
            setShowAddForm(false);
            setNewName('');
            setNewAddress('');
        } catch (e) {
            console.error(e);
        } finally {
            setIsSavingContact(false);
        }
    };

    // Handle Delete Contact
    const confirmDelete = (entry: AddressBookEntry) => {
        Alert.alert(t('carnet.delete'), t('carnet.deleteConfirm').replace('{name}', entry.name), [
            { text: t('common.cancel'), style: 'cancel' },
            {
                text: t('carnet.delete'),
                style: 'destructive',
                onPress: async () => {
                    try {
                        await deleteAddressBookEntry(entry.id);
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        await loadEntries();
                    } catch (e) {
                        console.error(e);
                    }
                }
            }
        ]);
    };

    // Settings Change Address confirm
    const initAddressChange = () => {
        Alert.alert(
            t('settings.alert.title'),
            t('settings.alert.message'),
            [
                { text: t('settings.alert.cancel'), style: 'cancel' },
                {
                    text: t('settings.alert.confirm'),
                    style: 'destructive',
                    onPress: () => {
                        const l = currentUser?.address_lang || 'en';
                        setEditLang(l);
                        setEditNumber('');
                        setEditName('');
                        setEditType(l === 'fr' ? FRENCH_TYPES[0] : ENGLISH_TYPES[0]);
                        setEditParticle('de la');
                        setEditNameError(null);
                        setEditSaveError(null);
                        setShowAddressBuilder(true);
                    }
                }
            ]
        );
    };

    const saveNewAddress = async () => {
        const num = parseInt(editNumber, 10);
        const valid = !isNaN(num) && num >= 1 && num <= 999 && editName.trim().length >= 2 && editName.trim().length <= 20 && !editNameError;
        if (!valid) return;

        setIsSavingAddress(true);
        setEditSaveError(null);

        const assembled = editLang === 'fr'
            ? `${editNumber}, ${editType} ${editParticle === '—' ? '' : editParticle + ' '}${editName.trim()}`
            : `${editNumber}, ${editName.trim()} ${editType}`;

        try {
            const taken = await isAddressTaken(assembled);
            if (taken) {
                setEditSaveError(t('address.error.taken'));
                setIsSavingAddress(false);
                return;
            }

            await updateAddress(assembled, editLang);
            setShowAddressBuilder(false);
        } catch (e) {
            setEditSaveError(t('address.error.generic'));
        } finally {
            setIsSavingAddress(false);
        }
    };

    const renderItem = ({ item }: { item: AddressBookEntry }) => {
        const renderRightActions = () => (
            <TouchableOpacity
                style={{
                    backgroundColor: Theme.colors.accent,
                    justifyContent: 'center',
                    alignItems: 'center',
                    width: 80,
                }}
                onPress={() => confirmDelete(item)}
            >
                <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600' }}>
                    {t('carnet.delete')}
                </Text>
            </TouchableOpacity>
        );

        return (
            <Swipeable
                renderRightActions={renderRightActions}
                onSwipeableOpen={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
            >
                <View style={[styles.row, { backgroundColor: 'transparent' }]}>
                    <Text style={styles.entryName}>{item.name}</Text>
                    <Text style={styles.entryAddress}>{item.address}</Text>
                </View>
            </Swipeable>
        );
    };

    return (
        <View style={styles.container}>
            {videoUri && player && (
                <VideoView
                    player={player}
                    style={StyleSheet.absoluteFillObject}
                    nativeControls={false}
                    contentFit="cover"
                    allowsVideoFrameAnalysis={false}
                />
            )}

            <SafeAreaView edges={['top']} style={{ flex: 1 }}>

                <TouchableOpacity
                    style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
                    activeOpacity={0.8}
                    onPress={openSheet}
                >
                    <Text style={{
                        fontFamily: 'Georgia',
                        fontSize: 22,
                        color: '#FAF9F6',
                        textAlign: 'center',
                        textShadowColor: 'rgba(0,0,0,0.5)',
                        textShadowOffset: { width: 0, height: 1 },
                        textShadowRadius: 4,
                    }}>
                        {t('carnet.title')}
                    </Text>
                    <Text style={{
                        fontFamily: 'Georgia',
                        fontSize: 16,
                        color: '#FAF9F6',
                        marginTop: 40,
                        textShadowColor: 'rgba(0,0,0,0.5)',
                        textShadowOffset: { width: 0, height: 1 },
                        textShadowRadius: 4,
                        opacity: 0.7,
                    }}>
                        {t('carnet.tapToOpen')}
                    </Text>
                </TouchableOpacity>
            </SafeAreaView>

            <Animated.View style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: SHEET_HEIGHT,
                transform: [{ translateY: sheetTranslateY }],
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                overflow: 'hidden',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: -4 },
                shadowOpacity: 0.15,
                shadowRadius: 12,
                elevation: 8,
            }}>
                <ImageBackground
                    source={require('../../assets/images/lettreMAIN_rectoretouche1_0.png')}
                    style={{ flex: 1 }}
                    resizeMode="cover"
                >
                    <View
                        {...panResponder.panHandlers}
                        style={{
                            alignItems: 'center',
                            paddingVertical: 12,
                        }}
                    >
                        <View style={{
                            width: 40,
                            height: 4,
                            borderRadius: 2,
                            backgroundColor: Theme.colors.secondary,
                            opacity: 0.5,
                        }} />
                    </View>

                    <View style={{
                        flexDirection: 'row',
                        justifyContent: 'center',
                        paddingBottom: 12,
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: 'rgba(0,0,0,0.1)',
                        marginHorizontal: 24,
                        marginBottom: 16,
                    }}>
                        <TouchableOpacity
                            onPress={() => setSheetTab('contacts')}
                            style={{ marginRight: 32 }}
                        >
                            <Text style={{
                                fontSize: 15,
                                fontFamily: 'Georgia',
                                color: sheetTab === 'contacts'
                                    ? Theme.colors.text
                                    : Theme.colors.secondary,
                            }}>
                                {t('carnet.tab')}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setSheetTab('settings')}>
                            <Text style={{
                                fontSize: 15,
                                fontFamily: 'Georgia',
                                color: sheetTab === 'settings'
                                    ? Theme.colors.text
                                    : Theme.colors.secondary,
                            }}>
                                {t('settings.title')}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {showAddressBuilder ? (
                        <KeyboardAwareScrollView style={styles.modalContent} contentContainerStyle={{ paddingBottom: tabBarHeight + 40, paddingHorizontal: 24 }} bottomOffset={40}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                                <TouchableOpacity onPress={() => setShowAddressBuilder(false)}>
                                    <Text style={{ fontSize: 16, color: Theme.colors.secondary }}>{t('common.cancel')}</Text>
                                </TouchableOpacity>
                                <Text style={styles.modalTitle}>{t('address.preview')}</Text>
                                <View style={{ width: 60 }} />
                            </View>

                            <AddressBuilder
                                language={editLang}
                                setLanguage={setEditLang}
                                number={editNumber}
                                setNumber={setEditNumber}
                                name={editName}
                                setName={setEditName}
                                selectedType={editType}
                                setSelectedType={setEditType}
                                selectedParticle={editParticle}
                                setSelectedParticle={setEditParticle}
                                nameError={editNameError}
                                setNameError={setEditNameError}
                            />

                            {editSaveError && <Text style={[styles.errorText, { marginBottom: 16 }]}>{editSaveError}</Text>}

                            <TouchableOpacity
                                style={[
                                    styles.button,
                                    (isSavingAddress) && styles.buttonDisabled,
                                    { marginTop: 24 }
                                ]}
                                onPress={saveNewAddress}
                                disabled={isSavingAddress}
                            >
                                {isSavingAddress && <ActivityIndicator color="#FFFFFF" style={{ marginRight: 8 }} />}
                                <Text style={styles.buttonText}>{t('settings.saveNewAddress')}</Text>
                            </TouchableOpacity>
                        </KeyboardAwareScrollView>
                    ) : sheetTab === 'contacts' ? (
                        <FlatList
                            data={entries}
                            keyExtractor={item => item.id}
                            renderItem={renderItem}
                            contentContainerStyle={{
                                paddingHorizontal: 24,
                                paddingBottom: tabBarHeight + 20,
                            }}
                            ListHeaderComponent={
                                showAddForm ? (
                                    <View style={{ marginBottom: 24 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                            <TouchableOpacity onPress={() => setShowAddForm(false)}>
                                                <Text style={{ fontSize: 16, color: Theme.colors.secondary }}>{t('common.cancel')}</Text>
                                            </TouchableOpacity>
                                            <Text style={styles.modalTitle}>{t('carnet.newContact')}</Text>
                                            <View style={{ width: 60 }} />
                                        </View>
                                        <TextInput
                                            style={styles.modalInput}
                                            placeholder={t('carnet.name')}
                                            placeholderTextColor={Theme.colors.secondary}
                                            value={newName}
                                            onChangeText={setNewName}
                                        />
                                        <TextInput
                                            style={styles.modalInput}
                                            placeholder={t('carnet.address')}
                                            placeholderTextColor={Theme.colors.secondary}
                                            value={newAddress}
                                            onChangeText={setNewAddress}
                                            autoCorrect={false}
                                            autoCapitalize="none"
                                            autoComplete="off"
                                        />
                                        <TouchableOpacity
                                            style={[
                                                styles.button,
                                                (!newName.trim() || !newAddress.trim() || isSavingContact) && styles.buttonDisabled,
                                                { marginTop: 8 }
                                            ]}
                                            onPress={saveNewContact}
                                            disabled={!newName.trim() || !newAddress.trim() || isSavingContact}
                                        >
                                            {isSavingContact && <ActivityIndicator color="#FFFFFF" style={{ marginRight: 8 }} />}
                                            <Text style={styles.buttonText}>{t('carnet.save')}</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <View style={{ marginBottom: 16 }}>
                                        <Text style={{
                                            fontFamily: 'Georgia',
                                            fontSize: 18,
                                            color: Theme.colors.text,
                                            marginBottom: 16,
                                        }}>
                                            {t('carnet.title')}
                                        </Text>
                                        <TouchableOpacity
                                            onPress={() => setShowAddForm(true)}
                                            style={{ paddingVertical: 10 }}
                                        >
                                            <Text style={{
                                                fontSize: 15,
                                                color: Theme.colors.accent,
                                            }}>
                                                + {t('carnet.newContact')}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                )
                            }
                            ListEmptyComponent={
                                !isLoading && entries.length === 0 && !showAddForm ? (
                                    <Text style={{
                                        fontSize: 14,
                                        color: Theme.colors.secondary,
                                        textAlign: 'center',
                                        paddingTop: 40,
                                        paddingHorizontal: 20,
                                    }}>
                                        {t('carnet.empty')}
                                    </Text>
                                ) : isLoading ? (
                                    <ActivityIndicator style={{ marginTop: 40 }} color={Theme.colors.accent} />
                                ) : null
                            }
                        />
                    ) : (
                        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: tabBarHeight + 20, alignItems: 'center' }}>
                            <View style={styles.langToggleContainer}>
                                <TouchableOpacity
                                    style={styles.langOption}
                                    onPress={() => updateLanguage('en')}
                                >
                                    <Text style={[styles.langText, currentUser?.address_lang === 'en' && styles.langTextActive]}>English</Text>
                                    <View style={[styles.langUnderline, currentUser?.address_lang === 'en' && styles.langUnderlineActive]} />
                                </TouchableOpacity>
                                <View style={{ width: 40 }} />
                                <TouchableOpacity
                                    style={styles.langOption}
                                    onPress={() => updateLanguage('fr')}
                                >
                                    <Text style={[styles.langText, currentUser?.address_lang === 'fr' && styles.langTextActive]}>Français</Text>
                                    <View style={[styles.langUnderline, currentUser?.address_lang === 'fr' && styles.langUnderlineActive]} />
                                </TouchableOpacity>
                            </View>

                            <Text style={styles.settingsLabel}>{t('settings.yourAddress')}</Text>
                            <Text style={styles.settingsAddress}>{currentUser?.address || '—'}</Text>

                            <TouchableOpacity onPress={initAddressChange} style={{ marginTop: 32 }}>
                                <Text style={styles.changeAddressButton}>{t('settings.changeAddress')}</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    )}
                </ImageBackground>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(0,0,0,0.1)',
    },
    entryName: {
        fontSize: 16,
        color: Theme.colors.text,
        fontWeight: '500',
    },
    entryAddress: {
        fontSize: 15,
        color: Theme.colors.secondary,
        marginRight: 10,
        flex: 1,
        textAlign: 'right',
    },
    modalTitle: {
        fontFamily: Theme.fonts.body,
        fontSize: 18,
        color: Theme.colors.text,
        textAlign: 'center',
    },
    modalContent: {
        flex: 1,
        paddingTop: 10,
    },
    modalInput: {
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.1)',
        backgroundColor: 'rgba(255,255,255,0.7)',
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 16,
        color: Theme.colors.text,
        marginBottom: 16,
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
    settingsLabel: {
        fontSize: 13,
        color: Theme.colors.secondary,
        marginBottom: 8,
        textAlign: 'center',
    },
    settingsAddress: {
        fontFamily: Theme.fonts.body,
        fontSize: 22,
        color: Theme.colors.text,
        textAlign: 'center',
    },
    changeAddressButton: {
        fontSize: 16,
        color: Theme.colors.accent,
    },
    errorText: {
        fontSize: 13,
        color: Theme.colors.accent,
        marginTop: 4,
    },
    langToggleContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginBottom: 40,
    },
    langOption: {
        alignItems: 'center',
    },
    langText: {
        fontFamily: Theme.fonts.body,
        fontSize: 18,
        color: Theme.colors.secondary,
        marginBottom: 4,
    },
    langTextActive: {
        color: Theme.colors.accent,
    },
    langUnderline: {
        height: 2,
        width: '100%',
        backgroundColor: 'transparent',
    },
    langUnderlineActive: {
        backgroundColor: Theme.colors.accent,
    },
});
