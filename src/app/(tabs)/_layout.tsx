import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useTranslation } from '../../lib/i18n';
import { Theme } from '../../theme';

export default function TabsLayout() {
    const { t } = useTranslation();

    return (
        <Tabs
            initialRouteName="compose"
            screenOptions={{
                headerShown: true,
                tabBarActiveTintColor: Theme.colors.accent,
                tabBarInactiveTintColor: Theme.colors.secondary,
                headerStyle: { backgroundColor: Theme.colors.background },
                headerTitleStyle: { color: Theme.colors.text, fontFamily: Theme.fonts.body },
                tabBarStyle: { backgroundColor: Theme.colors.background, borderTopColor: '#E5E5E5' },
            }}>
            <Tabs.Screen
                name="letters"
                options={{
                    title: t('letters.tab'),
                    tabBarIcon: ({ color, size }) => <Ionicons name="mail" size={size} color={color} />,
                }}
            />
            <Tabs.Screen
                name="compose"
                options={{
                    title: t('compose.tab'),
                    tabBarIcon: ({ color, size }) => <Ionicons name="pencil" size={size} color={color} />,
                }}
            />
            <Tabs.Screen
                name="carnet"
                options={{
                    title: t('carnet.tab'),
                    tabBarIcon: ({ color, size }) => <Ionicons name="book" size={size} color={color} />,
                }}
            />
            {/* Extraneous index screen removed */}
        </Tabs>
    );
}
