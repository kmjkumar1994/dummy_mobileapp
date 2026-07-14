import { Stack } from 'expo-router';
import Colors from '../../../constants/colors';

// Static — defined outside the component so the reference never changes
// between renders, which prevents the Stack from re-evaluating options
// unnecessarily.
const TOOLS_SCREEN_OPTIONS = {
  headerShown: true,
  // Native slide avoids the zoom/modal feel on Android.
  animation: 'slide_from_right',
  animationDuration: 200,
  // Header styling matches the app's dark theme.
  headerStyle: { backgroundColor: Colors.surface },
  headerTintColor: Colors.text,
  headerTitleStyle: { fontWeight: '600', fontSize: 17 },
  // Removes the faint hairline shadow under the header on iOS/Android.
  headerShadowVisible: false,
  // Android: removes the elevation drop-shadow from the header.
  headerElevation: 0,
  headerBackTitle: 'Tools',
};

export default function ToolsLayout() {
  return (
    <Stack screenOptions={TOOLS_SCREEN_OPTIONS}>
      {/* Hub — no header; the screen renders its own title */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      {/* Pushed screens — header shows back arrow + title */}
      <Stack.Screen name="audio-converter" options={{ title: 'Audio Converter' }} />
      <Stack.Screen name="converted-files" options={{ title: 'Converted Files' }} />
    </Stack>
  );
}
