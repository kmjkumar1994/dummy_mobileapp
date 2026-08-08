import { useEffect, useRef } from 'react';
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

// ─── Shared navigation helper ─────────────────────────────────────────────────

function navigateFromNotif(router, data) {
  if (!data) return;
  const { entityType, date } = data;
  if (entityType === 'dailyTask' || entityType === 'recurringTask') {
    const target = date || new Date().toISOString().slice(0, 10);
    router.push({ pathname: '/tabs/timeguardian/day', params: { date: target } });
  } else {
    // block or unknown — main TG home shows today's schedule
    router.push('/tabs/timeguardian');
  }
}

export default function RootLayout() {
  const router           = useRouter();
  const notifListenerRef = useRef(null);

  useEffect(() => {
    StatusBar.setBarStyle('light-content', true);
    StatusBar.setBackgroundColor('#0F0F0F', true);
    StatusBar.setTranslucent(false);

    import('expo-notifications')
      .then((N) => {
        // ── Cold start: app was killed, user tapped notification to open it ──
        // getLastNotificationResponseAsync returns the response that launched the app.
        N.getLastNotificationResponseAsync().then((response) => {
          if (response) {
            const data = response?.notification?.request?.content?.data;
            // Small delay so the navigator is mounted before we push
            setTimeout(() => navigateFromNotif(router, data), 300);
          }
        }).catch(() => {});

        // ── Foreground / background: app already running ──
        notifListenerRef.current = N.addNotificationResponseReceivedListener((response) => {
          const data = response?.notification?.request?.content?.data;
          navigateFromNotif(router, data);
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