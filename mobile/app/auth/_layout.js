import { Stack } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { Redirect } from 'expo-router';

// Static — never recreated on re-render.
const AUTH_SCREEN_OPTIONS = {
  headerShown: false,
  // Fade between login ↔ register feels intentional.
  // 'none' is also fine here — avoids any flicker on redirect.
  animation: 'fade',
  animationDuration: 180,
};

export default function AuthLayout() {
  const { isAuthenticated, isLoading } = useAuth();

  if (!isLoading && isAuthenticated) {
    return <Redirect href="/tabs/home" />;
  }

  return <Stack screenOptions={AUTH_SCREEN_OPTIONS} />;
}
