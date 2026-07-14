import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../../components/Avatar';
import Card from '../../components/Card';
import Colors from '../../constants/colors';

const FEATURES = [
  {
    icon: 'shield-checkmark-outline',
    title: 'JWT Authentication',
    description: 'Secure token-based auth with refresh support and AsyncStorage persistence.',
    color: '#6C63FF',
  },
  {
    icon: 'server-outline',
    title: 'Express REST API',
    description: 'RESTful backend with modular routes, controllers, and middleware.',
    color: '#4ADE80',
  },
  {
    icon: 'leaf-outline',
    title: 'MongoDB Atlas',
    description: 'Cloud database with Mongoose ODM, validation, and schema models.',
    color: '#60A5FA',
  },
  {
    icon: 'phone-portrait-outline',
    title: 'Expo Router',
    description: 'File-based navigation with protected routes and tab navigation.',
    color: '#FBBF24',
  },
];

export default function HomeScreen() {
  const { user } = useAuth();

  const firstName = user?.name?.split(' ')[0] || 'there';
  const timeGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{timeGreeting()},</Text>
            <Text style={styles.name}>{firstName} 👋</Text>
          </View>
          <Avatar name={user?.name} size={48} />
        </View>

        {/* Status Banner */}
        <Card style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Backend connected</Text>
          </View>
          <Text style={styles.statusEmail}>{user?.email}</Text>
        </Card>

        {/* Section Title */}
        <Text style={styles.sectionTitle}>Stack Overview</Text>

        {/* Feature Cards */}
        <View style={styles.featuresGrid}>
          {FEATURES.map((feature, index) => (
            <Card key={index} style={styles.featureCard}>
              <View style={[styles.featureIconWrap, { backgroundColor: feature.color + '22' }]}>
                <Ionicons name={feature.icon} size={22} color={feature.color} />
              </View>
              <Text style={styles.featureTitle}>{feature.title}</Text>
              <Text style={styles.featureDesc}>{feature.description}</Text>
            </Card>
          ))}
        </View>

        {/* Quick Info */}
        <Card style={styles.infoCard} elevated>
          <Text style={styles.infoTitle}>🚀 You're all set!</Text>
          <Text style={styles.infoText}>
            This is your production-ready starter. The auth system, API layer, 
            context, and navigation are all wired up and working.
          </Text>
          <View style={styles.divider} />
          <Text style={styles.infoText}>
            Start building your features from here. Check the README for 
            customization tips and deployment steps.
          </Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  greeting: {
    fontSize: 15,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  statusCard: {
    marginBottom: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  statusText: {
    fontSize: 13,
    color: Colors.success,
    fontWeight: '600',
  },
  statusEmail: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  featuresGrid: {
    gap: 12,
    marginBottom: 20,
  },
  featureCard: {
    gap: 8,
  },
  featureIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  featureDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
  },
  infoCard: {
    gap: 10,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
});
