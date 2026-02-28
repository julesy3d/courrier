import { Picker } from '@react-native-picker/picker';
import React, { useCallback, useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { validateName } from '../lib/dictionary';
import { useTranslation } from '../lib/i18n';
import { Theme } from '../theme';

export const ENGLISH_TYPES = ['Road', 'Street', 'Lane', 'Path', 'Way', 'Alley', 'Passage', 'Hill', 'Square', 'Garden', 'Bridge', 'Quay'];
export const FRENCH_TYPES = ['Rue', 'Avenue', 'Allée', 'Chemin', 'Sentier', 'Impasse', 'Passage', 'Colline', 'Place', 'Jardin', 'Pont', 'Quai'];
export const FRENCH_PARTICLES = ['du', 'de la', "de l'", 'des', 'de', 'aux', '—'];

const ENGLISH_EXAMPLES = ['Flower', 'Old Cat', 'Lemon Tree', 'Morning'];
const FRENCH_EXAMPLES = ['Fleur', 'Vieux Chat', 'Citronnier', 'Brume'];

type AddressBuilderProps = {
    language: 'en' | 'fr';
    setLanguage: (lang: 'en' | 'fr') => void;
    number: string;
    setNumber: (num: string) => void;
    name: string;
    setName: (name: string) => void;
    selectedType: string;
    setSelectedType: (type: string) => void;
    selectedParticle: string;
    setSelectedParticle: (particle: string) => void;
    nameError: string | null;
    setNameError: (error: string | null) => void;
};

// A generic compact bottom sheet picker to avoid oversized inline pickers
const CompactPicker = ({
    label,
    value,
    options,
    onValueChange
}: {
    label: string;
    value: string;
    options: string[];
    onValueChange: (val: string) => void;
}) => {
    const [modalVisible, setModalVisible] = useState(false);
    const [tempValue, setTempValue] = useState(value);

    // Sync temp value when it opens
    useEffect(() => {
        if (modalVisible) {
            setTempValue(value);
        }
    }, [modalVisible, value]);

    return (
        <View style={styles.field}>
            <Text style={styles.label}>{label}</Text>
            <TouchableOpacity
                style={styles.compactPickerButton}
                onPress={() => setModalVisible(true)}
            >
                <Text style={styles.compactPickerText}>{value}</Text>
                <Text style={styles.compactPickerIcon}>▼</Text>
            </TouchableOpacity>

            <Modal transparent visible={modalVisible} animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <Text style={styles.modalCancelButton}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => { onValueChange(tempValue); setModalVisible(false); }}>
                                <Text style={styles.modalDoneButton}>Done</Text>
                            </TouchableOpacity>
                        </View>
                        <Picker
                            selectedValue={tempValue}
                            onValueChange={setTempValue}
                            style={{ paddingBottom: 20 }}
                            itemStyle={{ color: Theme.colors.text }}
                        >
                            {options.map(opt => <Picker.Item key={opt} label={opt} value={opt} />)}
                        </Picker>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

export default function AddressBuilder({
    language, setLanguage,
    number, setNumber,
    name, setName,
    selectedType, setSelectedType,
    selectedParticle, setSelectedParticle,
    nameError, setNameError
}: AddressBuilderProps) {
    const { t } = useTranslation();

    const types = language === 'fr' ? FRENCH_TYPES : ENGLISH_TYPES;

    const validateInput = useCallback(() => {
        const trimmed = name.trim();
        if (trimmed.length < 2) {
            setNameError(null);
            return;
        }
        if (validateName(trimmed, language)) {
            setNameError(null);
        } else {
            setNameError(t('address.error.invalid'));
        }
    }, [name, language, setNameError, t]);

    // Debounced validation for typing
    useEffect(() => {
        const timer = setTimeout(() => {
            validateInput();
        }, 500);
        return () => clearTimeout(timer);
    }, [name, validateInput]);

    // Immediate validation when language format flips
    useEffect(() => {
        validateInput();
    }, [language, validateInput]);

    const assembledAddress = (() => {
        const num = number === '' ? '…' : number;
        const n = name === '' ? '…' : name.trim();

        if (language === 'fr') {
            const particle = selectedParticle === '—' ? '' : `${selectedParticle} `;
            return `${num}, ${selectedType} ${particle}${n} `;
        } else {
            return `${num}, ${n} ${selectedType} `;
        }
    })();

    const handleNumberChange = (val: string) => {
        const filtered = val.replace(/[^0-9]/g, '');
        const num = parseInt(filtered, 10);
        if (!isNaN(num) && num > 999) {
            setNumber('999');
        } else {
            setNumber(filtered);
        }
    };

    const handleNameChange = (val: string) => {
        const filtered = val.replace(/[^a-zA-Z\s]/g, '');
        if (filtered.length <= 20) {
            setName(filtered);
        }
    };

    const placeholder = language === 'fr'
        ? FRENCH_EXAMPLES[Math.floor(Math.random() * FRENCH_EXAMPLES.length)]
        : ENGLISH_EXAMPLES[Math.floor(Math.random() * ENGLISH_EXAMPLES.length)];

    return (
        <View>

            <View style={styles.field}>
                <Text style={styles.label}>{t('address.number')}</Text>
                <TextInput
                    style={styles.input}
                    keyboardType="number-pad"
                    value={number}
                    onChangeText={handleNumberChange}
                    placeholder="3"
                    placeholderTextColor={Theme.colors.secondary}
                />
            </View>

            <CompactPicker
                label={t('address.type')}
                value={selectedType}
                options={types}
                onValueChange={setSelectedType}
            />

            {language === 'fr' && (
                <CompactPicker
                    label={t('address.particle')}
                    value={selectedParticle}
                    options={['du', 'de la', "de l'", 'des', 'de', 'aux', '—']}
                    onValueChange={setSelectedParticle}
                />
            )}

            <View style={styles.field}>
                <Text style={styles.label}>{t('address.name')}</Text>
                <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={handleNameChange}
                    placeholder={placeholder}
                    placeholderTextColor={Theme.colors.secondary}
                    autoCorrect={false}
                    autoCapitalize="words"
                />
                {nameError && <Text style={styles.errorText}>{nameError}</Text>}
            </View>

            <View style={styles.previewContainer}>
                <Text style={styles.label}>{t('address.preview')}</Text>
                <Text style={styles.previewText}>{assembledAddress}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    field: {
        marginBottom: 20,
    },
    label: {
        fontSize: 13,
        color: Theme.colors.secondary,
        marginBottom: 4,
    },
    input: {
        borderWidth: 1,
        borderColor: '#E5E5E5',
        backgroundColor: '#FFFFFF',
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 16,
        color: Theme.colors.text,
    },
    compactPickerButton: {
        borderWidth: 1,
        borderColor: '#E5E5E5',
        backgroundColor: '#FFFFFF',
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    compactPickerText: {
        fontSize: 16,
        color: Theme.colors.text,
    },
    compactPickerIcon: {
        fontSize: 12,
        color: Theme.colors.secondary,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: Theme.colors.background,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        paddingTop: 16,
        paddingBottom: 20, // avoid home indicator issues
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E5E5',
    },
    modalCancelButton: {
        color: Theme.colors.secondary,
        fontSize: 16,
    },
    modalDoneButton: {
        color: Theme.colors.accent,
        fontSize: 16,
        fontWeight: '600',
    },
    previewContainer: {
        marginTop: 8,
        marginBottom: 24,
    },
    previewText: {
        fontFamily: Theme.fonts.body,
        fontSize: 20,
        color: Theme.colors.text,
        marginTop: 4,
    },
    errorText: {
        fontSize: 13,
        color: Theme.colors.accent,
        marginTop: 4,
    },
});
