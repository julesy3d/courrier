import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import * as Localization from 'expo-localization';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator, Alert, FlatList, StyleSheet, Text,
    TouchableOpacity, View
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { discoverContacts, DiscoveredContact } from '../../lib/contacts';
import { useTranslation } from '../../lib/i18n';
import { useStore } from '../../lib/store';
import { supabase } from '../../lib/supabase';
import { Theme } from '../../theme';

export default function CarnetScreen() {
    const {
        currentUser,
        carnet,
        addContacts,
        removeContact,
        toggleMute,
        syncCarnet,
        updateLanguage,
    } = useStore();

    const { t } = useTranslation();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    // --- Contact name resolution ---
    const [contactNames, setContactNames] = useState<Record<string, string>>({});
    const [isDiscovering, setIsDiscovering] = useState(false);
    const [discoveredContacts, setDiscoveredContacts] = useState<DiscoveredContact[]>([]);
    const [showDiscovery, setShowDiscovery] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const loadContactNames = useCallback(async () => {
        const ids = carnet.map(c => c.contactId);
        if (ids.length === 0) {
            setContactNames({});
            return;
        }
        const { data } = await supabase
            .from('users')
            .select('id, display_name')
            .in('id', ids);
        if (data) {
            const map: Record<string, string> = {};
            data.forEach((u: any) => { map[u.id] = u.display_name || 'Unknown'; });
            setContactNames(map);
        }
    }, [carnet]);

    useFocusEffect(
        useCallback(() => {
            loadContactNames();
            syncCarnet().catch(console.error);
        }, [loadContactNames, syncCarnet])
    );

    // --- Discovery ---
    const handleAddContacts = async () => {
        setIsDiscovering(true);
        setShowDiscovery(true);
        try {
            const regionCode = Localization.getLocales()[0]?.regionCode || 'US';
            const discovered = await discoverContacts(regionCode);
            const existingIds = new Set(carnet.map(c => c.contactId));
            const newOnly = discovered.filter(d => !existingIds.has(d.userId));
            setDiscoveredContacts(newOnly);
        } catch (e) {
            console.error('Discovery error:', e);
        } finally {
            setIsDiscovering(false);
        }
    };

    const handleConfirmAdd = async () => {
        if (selectedIds.size === 0) return;
        await addContacts(Array.from(selectedIds));
        setShowDiscovery(false);
        setSelectedIds(new Set());
        setDiscoveredContacts([]);
        await loadContactNames();
    };

    const confirmDelete = (contactId: string, name: string) => {
        Alert.alert(t('carnet.delete'), t('carnet.deleteConfirm').replace('{name}', name), [
            { text: t('common.cancel'), style: 'cancel' },
            {
                text: t('carnet.delete'),
                style: 'destructive',
                onPress: async () => {
                    try {
                        await removeContact(contactId);
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    } catch (e) {
                        console.error(e);
                    }
                }
            }
        ]);
    };

    // --- Renderers ---
    const renderCarnetItem = ({ item }: { item: any }) => {
        const name = contactNames[item.contactId] || 'Unknown';
        return (
            <View style={styles.row}>
                <Text style={styles.entryName}>{name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                    <TouchableOpacity onPress={() => toggleMute(item.contactId)}>
                        <Ionicons
                            name={item.muted ? 'volume-mute-outline' : 'volume-high-outline'}
                            size={22}
                            color={item.muted ? 'rgba(255,255,255,0.3)' : '#007AFF'}
                        />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => confirmDelete(item.contactId, name)}>
                        <Ionicons name="trash-outline" size={20} color={Theme.colors.secondary} />
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    const renderDiscoveredItem = ({ item }: { item: DiscoveredContact }) => {
        const isSelected = selectedIds.has(item.userId);
        const toggleSelection = () => {
            const newSet = new Set(selectedIds);
            if (isSelected) newSet.delete(item.userId);
            else newSet.add(item.userId);
            setSelectedIds(newSet);
        };
        return (
            <TouchableOpacity style={styles.row} onPress={toggleSelection} activeOpacity={0.7}>
                <Text style={styles.entryName}>{item.localName}</Text>
                <Ionicons
                    name={isSelected ? 'checkmark-circle' : 'checkmark-circle-outline'}
                    size={24}
                    color={isSelected ? '#007AFF' : Theme.colors.secondary}
                />
            </TouchableOpacity>
        );
    };

    // --- Layout ---
    return (
        <View style={styles.container}>
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />

            <View style={{ flex: 1, paddingTop: insets.top }}>
                {/* Close button */}
                <View style={{ alignItems: 'flex-end', paddingHorizontal: 16, paddingTop: 8 }}>
                    <TouchableOpacity
                        onPress={() => router.back()}
                        style={{ padding: 8 }}
                    >
                        <Ionicons name="close" size={24} color="rgba(255,255,255,0.8)" />
                    </TouchableOpacity>
                </View>

                {showDiscovery ? (
                    <View style={{ flex: 1 }}>
                        <View style={styles.header}>
                            <TouchableOpacity onPress={() => { setShowDiscovery(false); setSelectedIds(new Set()); setDiscoveredContacts([]); }}>
                                <Text style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)' }}>{t('common.cancel')}</Text>
                            </TouchableOpacity>
                        <Text style={styles.title}>{t('carnet.title')}</Text>
                        <TouchableOpacity 
                            onPress={handleConfirmAdd} 
                            disabled={selectedIds.size === 0}
                            style={selectedIds.size > 0 ? styles.glassButtonPrimary : styles.glassButtonDisabled}
                        >
                            <Text style={selectedIds.size > 0 ? styles.glassButtonPrimaryText : styles.glassButtonDisabledText}>
                                {t('common.done')} ({selectedIds.size})
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {isDiscovering ? (
                        <ActivityIndicator style={{ marginTop: 40 }} color="rgba(255,255,255,0.6)" />
                    ) : discoveredContacts.length === 0 ? (
                        <Text style={styles.emptyText}>{t('carnet.discoveryEmpty')}</Text>
                    ) : (
                        <FlatList
                            data={discoveredContacts}
                            keyExtractor={item => item.userId}
                            renderItem={renderDiscoveredItem}
                        />
                    )}
                </View>
            ) : (
                <View style={{ flex: 1 }}>
                    <View style={styles.header}>
                        <Text style={styles.title}>{t('carnet.title')}</Text>
                        <TouchableOpacity onPress={handleAddContacts}>
                            <Text style={{ fontSize: 15, color: '#007AFF' }}>+ {t('carnet.newContact')}</Text>
                        </TouchableOpacity>
                    </View>

                        <FlatList
                            data={carnet}
                            keyExtractor={item => item.contactId}
                            renderItem={renderCarnetItem}
                            ListEmptyComponent={
                                <Text style={styles.emptyText}>{t('carnet.empty')}</Text>
                            }
                        />
                    </View>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        // No backgroundColor — BlurView provides the background
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    title: {
        fontFamily: 'Avenir Next',
        fontSize: 18,
        color: 'rgba(255,255,255,0.9)',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    entryName: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.9)',
        fontWeight: '500',
    },
    emptyText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.5)',
        textAlign: 'center',
        paddingTop: 60,
        paddingHorizontal: 20,
    },
    glassButtonPrimary: {
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 14,
        paddingVertical: 8,
        paddingHorizontal: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    glassButtonDisabled: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 14,
        paddingVertical: 8,
        paddingHorizontal: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    glassButtonPrimaryText: {
        fontFamily: 'Avenir Next',
        fontSize: 15,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.95)',
    },
    glassButtonDisabledText: {
        fontFamily: 'Avenir Next',
        fontSize: 15,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.3)',
    },
});
