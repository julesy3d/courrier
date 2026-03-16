import { Redirect } from 'expo-router';
import { useStore } from '../lib/store';

export default function Index() {
    const { currentUser } = useStore();
    if (currentUser) {
        return <Redirect href="/(main)" />;
    }
    return <Redirect href="/onboarding" />;
}
