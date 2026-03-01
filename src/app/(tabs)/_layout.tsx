import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';
import { useTranslation } from '../../lib/i18n';

export default function TabsLayout() {
    const { t } = useTranslation();

    return (
        <NativeTabs
            {...(Platform.OS === 'android' ? {
                backgroundColor: 'rgba(250, 249, 246, 0.85)',
            } : {})}
        >
            <NativeTabs.Trigger name="letters">
                <NativeTabs.Trigger.Label>{t('letters.tab')}</NativeTabs.Trigger.Label>
                <NativeTabs.Trigger.Icon
                    sf={{ default: 'envelope', selected: 'envelope.fill' }}
                    md="mail"
                />
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="compose">
                <NativeTabs.Trigger.Label>{t('compose.tab')}</NativeTabs.Trigger.Label>
                <NativeTabs.Trigger.Icon
                    sf={{ default: 'square.and.pencil', selected: 'square.and.pencil' }}
                    md="edit"
                />
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="carnet">
                <NativeTabs.Trigger.Label>{t('carnet.tab')}</NativeTabs.Trigger.Label>
                <NativeTabs.Trigger.Icon
                    sf={{ default: 'book', selected: 'book.fill' }}
                    md="menu_book"
                />
            </NativeTabs.Trigger>
        </NativeTabs>
    );
}
