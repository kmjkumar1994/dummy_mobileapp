import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import LoadingScreen from '../components/LoadingScreen';

export default function Index() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen message="Starting up..." />;
  }

  if (isAuthenticated) {
    return <Redirect href="/tabs/home" />;
  }

  return <Redirect href="/auth/login" />;
}
