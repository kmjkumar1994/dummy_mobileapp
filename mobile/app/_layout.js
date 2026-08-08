import { useEffect, useRef } from 'react';
import { StatusBar } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../context/AuthContext';
import { ShareIntentProvider } from '../context/ShareIntentContext';
import { CommitmentProvider } from '../context/CommitmentContext';
import ShareIntentHandler from '../components/ShareIntentHandler';

const ROOT_SCREEN_OPTIONS = {
  headerShown: false,
  animation: 'slide_from_right',
  animationDuration: 200,
};

export default function RootLayout() {
  const router = useRouter();
  const notifListenerRef = useRef(null);

  useEffect(() => {
    StatusBar.setBarStyle('light-content', true);
    StatusBar.setBackgroundColor('#0F0F0F', true);
    StatusBar.setTranslucent(false);

    // Wire notification tap handler — navigates to the relevant TG screen
    let Notifications;
    import('expo-notifications')
      .then((N) => {
        Notifications = N;
        notifListenerRef.current = N.addNotificationResponseReceivedListener((response) => {
          const data = response?.notification?.request?.content?.data;
          if (!data) return;

          const { entityType, date } = data;

          if (entityType === 'dailyTask' || entityType === 'recurringTask') {
            // Navigate to the day detail screen for that date
            const target = date || new Date().toISOString().slice(0, 10);
            router.push({ pathname: '/tabs/timeguardian/day', params: { date: target } });
          } else {
            // Block or unknown — open the TG home (today's schedule is visible there)
            router.push('/tabs/timeguardian');
          }
        });
      })
      .catch(() => {
        // expo-notifications not available (Expo Go) — silent no-op
      });

    return () => {
      notifListenerRef.current?.remove();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ShareIntentProvider>
          <CommitmentProvider>
            <ShareIntentHandler />
            <Stack screenOptions={ROOT_SCREEN_OPTIONS}>
              <Stack.Screen name="index" />
              <Stack.Screen name="auth" />
              <Stack.Screen name="tabs" />
            </Stack>
          </CommitmentProvider>
        </ShareIntentProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}