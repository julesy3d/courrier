import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import AddressBuilder, { ENGLISH_TYPES, FRENCH_TYPES } from '../../components/AddressBuilder';
import { useTranslation } from '../../lib/i18n';
import { AddressBookEntry, useStore } from '../../lib/store';
import { Theme } from '../../theme';

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

    const [entries, setEntries] = useState<AddressBookEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Add Contact Modal State
    const [addModalVisible, setAddModalVisible] = useState(false);
    const [newName, setNewName] = useState('');
    const [newAddress, setNewAddress] = useState('');
    const [isSavingContact, setIsSavingContact] = useState(false);

    // Settings Modal State
    const [settingsModalVisible, setSettingsModalVisible] = useState(false);
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

    useEffect(() => {
        loadEntries().finally(() => setIsLoading(false));
    }, [loadEntries]);

    // Handle Add Contact
    const saveNewContact = async () => {
        if (!newName.trim() || !newAddress.trim()) return;
        setIsSavingContact(true);
        try {
            await addAddressBookEntry(newName.trim(), newAddress.trim());
            await loadEntries();
            setAddModalVisible(false);
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
        Alert.alert(t('carnet.delete'), `Are you sure you want to delete ${entry.name}?`, [
            { text: t('common.cancel'), style: 'cancel' },
            {
                text: t('carnet.delete'),
                style: 'destructive',
                onPress: async () => {
                    try {
                        await deleteAddressBookEntry(entry.id);
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
            setSettingsModalVisible(false);
        } catch (e) {
            setEditSaveError(t('address.error.generic'));
        } finally {
            setIsSavingAddress(false);
        }
    };

    const renderItem = ({ item }: { item: AddressBookEntry }) => (
        <TouchableOpacity
            style={styles.row}
            onLongPress={() => confirmDelete(item)}
            activeOpacity={0.7}
        >
            <Text style={styles.entryName}>{item.name}</Text>
            <Text style={styles.entryAddress}>{item.address}</Text>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            {/* Custom Header matching navigation styling since we need buttons */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => setSettingsModalVisible(true)} style={styles.headerButton}>
                    <Ionicons name="settings-outline" size={24} color={Theme.colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{t('carnet.tab')}</Text>
                <TouchableOpacity onPress={() => setAddModalVisible(true)} style={styles.headerButton}>
                    <Ionicons name="add" size={28} color={Theme.colors.text} />
                </TouchableOpacity>
            </View>

            {/* Main List */}
            <View style={{ flex: 1 }}>
                {isLoading ? (
                    <View style={styles.centered}>
                        <ActivityIndicator color={Theme.colors.accent} />
                    </View>
                ) : entries.length === 0 ? (
                    <View style={styles.centered}>
                        <Text style={styles.emptyText}>{t('carnet.empty')}</Text>
                    </View>
                ) : (
                    <FlatList
                        data={entries}
                        keyExtractor={item => item.id}
                        renderItem={renderItem}
                        contentContainerStyle={{ paddingVertical: 8 }}
                    />
                )}
            </View>

            {/* Add Contact Modal */}
            <Modal visible={addModalVisible} animationType="slide" presentationStyle="pageSheet">
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <TouchableOpacity onPress={() => setAddModalVisible(false)} disabled={isSavingContact}>
                            <Text style={styles.modalCancelButton}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                        <Text style={styles.modalTitle}>{t('carnet.newContact')}</Text>
                        <View style={{ width: 60 }} />
                    </View>

                    <View style={styles.modalContent}>
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
                                { marginTop: 20 }
                            ]}
                            onPress={saveNewContact}
                            disabled={!newName.trim() || !newAddress.trim() || isSavingContact}
                        >
                            {isSavingContact && <ActivityIndicator color="#FFFFFF" style={{ marginRight: 8 }} />}
                            <Text style={styles.buttonText}>{t('carnet.save')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Settings Modal */}
            <Modal visible={settingsModalVisible} animationType="slide" presentationStyle="pageSheet">
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <View style={{ width: 60 }} />
                        <Text style={styles.modalTitle}>{t('settings.title')}</Text>
                        <TouchableOpacity onPress={() => {
                            setSettingsModalVisible(false);
                            setShowAddressBuilder(false);
                        }}>
                            <Text style={styles.modalDoneButton}>{t('common.done')}</Text>
                        </TouchableOpacity>
                    </View>

                    {!showAddressBuilder ? (
                        <View style={[styles.modalContent, { alignItems: 'center', paddingTop: 60 }]}>
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

                            <TouchableOpacity onPress={initAddressChange} style={{ marginTop: 40 }}>
                                <Text style={styles.changeAddressButton}>{t('settings.changeAddress')}</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <KeyboardAwareScrollView style={styles.modalContent} contentContainerStyle={{ paddingBottom: 40 }} bottomOffset={40}>
                            <Text style={[styles.modalTitle, { marginVertical: 24 }]}>{t('address.preview')}</Text>

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
                                {isSavingAddress ? (
                                    <ActivityIndicator color="#FFFFFF" style={{ marginRight: 8 }} />
                                ) : null}
                                <Text style={styles.buttonText}>{t('settings.saveNewAddress')}</Text>
                            </TouchableOpacity>
                        </KeyboardAwareScrollView>
                    )}
                </View>
            </Modal>

        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Theme.colors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Theme.sizes.horizontalPadding,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#E5E5E5',
        backgroundColor: Theme.colors.background,
    },
    headerTitle: {
        fontFamily: Theme.fonts.body,
        fontSize: 18,
        color: Theme.colors.text,
    },
    headerButton: {
        padding: 4,
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 13,
        color: Theme.colors.secondary,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        paddingHorizontal: Theme.sizes.horizontalPadding,
    },
    entryName: {
        fontSize: 16,
        color: Theme.colors.text,
    },
    entryAddress: {
        fontSize: 15,
        color: Theme.colors.secondary,
    },
    modalContainer: {
        flex: 1,
        backgroundColor: Theme.colors.background,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Theme.sizes.horizontalPadding,
        paddingVertical: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#E5E5E5',
    },
    modalCancelButton: {
        fontSize: 16,
        color: Theme.colors.secondary,
        width: 60,
    },
    modalDoneButton: {
        fontSize: 16,
        fontWeight: '600',
        color: Theme.colors.accent,
        width: 60,
        textAlign: 'right',
    },
    modalTitle: {
        fontFamily: Theme.fonts.body,
        fontSize: 18,
        color: Theme.colors.text,
    },
    modalContent: {
        flex: 1,
        paddingHorizontal: Theme.sizes.horizontalPadding,
        paddingTop: 24,
    },
    modalInput: {
        borderWidth: 1,
        borderColor: '#E5E5E5',
        backgroundColor: '#FFFFFF',
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
        marginBottom: 60,
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
