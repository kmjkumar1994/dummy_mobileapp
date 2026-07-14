/**
 * app/tabs/timeguardian/_layout.js
 * Added: day route registration.
 */

import { Stack } from 'expo-router';
import { TimeGuardianProvider } from '../../../context/TimeGuardianContext';
import { TGColors } from '../../../timeguardian/theme/tokens';

const TG_SCREEN_OPTIONS = {
  headerShown        : true,
  animation          : 'slide_from_right',
  animationDuration  : 200,
  headerStyle        : { backgroundColor: TGColors.surface },
  headerTintColor    : TGColors.ink,
  headerTitleStyle   : { fontWeight: '600', fontSize: 17, color: TGColors.ink },
  headerShadowVisible: false,
  headerElevation    : 0,
};

export default function TimeGuardianLayout() {
  return (
    <TimeGuardianProvider>
      <Stack screenOptions={TG_SCREEN_OPTIONS}>
        <Stack.Screen name="index"    options={{ headerShown: false }} />
        <Stack.Screen name="day"      options={{ title: 'Day Detail' }} />
        <Stack.Screen name="ledger"   options={{ title: 'Ledger' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </TimeGuardianProvider>
  );
}
