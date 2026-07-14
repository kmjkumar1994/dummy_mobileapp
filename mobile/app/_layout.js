import { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { Stack } from 'expo-router';
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
  useEffect(() => {
    StatusBar.setBarStyle('light-content', true);
    StatusBar.setBackgroundColor('#0F0F0F', true);
    StatusBar.setTranslucent(false);
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