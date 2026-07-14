import { Stack } from 'expo-router';
import Colors from '../../../constants/colors';

const COMMITMENTS_SCREEN_OPTIONS = {
  headerShown: true,
  animation: 'slide_from_right',
  animationDuration: 200,
  headerStyle: { backgroundColor: Colors.surface },
  headerTintColor: Colors.text,
  headerTitleStyle: { fontWeight: '600', fontSize: 17 },
  headerShadowVisible: false,
  headerElevation: 0,
  headerBackTitle: 'Commitments',
};

export default function CommitmentsLayout() {
  return (
    <Stack screenOptions={COMMITMENTS_SCREEN_OPTIONS}>
      {/* Day view — no header; screen renders its own date navigator */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      {/* Create — header shows back arrow */}
      <Stack.Screen name="create" options={{ title: 'New Commitment' }} />
      {/* Detail/Edit — header shows back arrow */}
      <Stack.Screen name="[id]" options={{ title: 'Commitment' }} />
    </Stack>
  );
}