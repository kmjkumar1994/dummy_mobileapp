import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/authService';
import Avatar from '../../components/Avatar';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Card from '../../components/Card';
import ErrorMessage from '../../components/ErrorMessage';
import Colors from '../../constants/colors';

export default function ProfileScreen() {
  const { user, logout, updateUser } = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [nameError, setNameError] = useState('');

  const handleSave = async () => {
    setError('');
    setNameError('');

    if (!name.trim()) {
      setNameError('Name is required');
      return;
    }
    if (name.trim().length < 2) {
      setNameError('Name must be at least 2 characters');
      return;
    }

    setLoading(true);
    try {
      const data = await authService.updateProfile(name.trim());
      updateUser(data.data.user);
      setIsEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setName(user?.name || '');
    setIsEditing(false);
    setError('');
    setNameError('');
  };

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: logout,
        },
      ]
    );
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Page Title */}
        <Text style={styles.pageTitle}>Profile</Text>

        {/* Avatar & Name */}
        <Card style={styles.avatarCard}>
          <View style={styles.avatarCenter}>
            <Avatar name={user?.name} size={80} />
            <Text style={styles.userName}>{user?.name}</Text>
            <Text style={styles.userEmail}>{user?.email}</Text>
          </View>
        </Card>

        {/* Edit Profile Section */}
        <Card style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Account Details</Text>
            {!isEditing && (
              <TouchableOpacity onPress={() => setIsEditing(true)} style={styles.editBtn}>
                <Ionicons name="pencil-outline" size={16} color={Colors.primary} />
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          <ErrorMessage message={error} />

          {isEditing ? (
            <>
              <Input
                label="Full Name"
                value={name}
                onChangeText={(v) => { setName(v); setNameError(''); }}
                placeholder="Your name"
                autoCapitalize="words"
                leftIcon="person-outline"
                error={nameError}
              />
              <Input
                label="Email"
                value={user?.email || ''}
                editable={false}
                leftIcon="mail-outline"
                inputStyle={{ color: Colors.textMuted }}
              />
              <View style={styles.editActions}>
                <Button
                  title="Cancel"
                  onPress={handleCancel}
                  variant="outline"
                  style={styles.actionBtn}
                  disabled={loading}
                />
                <Button
                  title="Save Changes"
                  onPress={handleSave}
                  loading={loading}
                  style={styles.actionBtn}
                />
              </View>
            </>
          ) : (
            <>
              <InfoRow icon="person-outline" label="Name" value={user?.name} />
              <InfoRow icon="mail-outline" label="Email" value={user?.email} />
              <InfoRow
                icon="calendar-outline"
                label="Member since"
                value={formatDate(user?.createdAt)}
                last
              />
            </>
          )}
        </Card>

        {/* Account Actions */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <Button
            title="Sign Out"
            onPress={handleLogout}
            variant="outline"
            style={styles.logoutBtn}
            textStyle={{ color: Colors.error }}
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ icon, label, value, last }) {
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <View style={styles.infoLeft}>
        <Ionicons name={icon} size={16} color={Colors.textMuted} />
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text style={styles.infoValue}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: { flex: 1 },
  container: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 16,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  avatarCard: {
    padding: 28,
  },
  avatarCenter: {
    alignItems: 'center',
    gap: 8,
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 8,
  },
  userEmail: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  section: {
    gap: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.primary + '18',
  },
  editBtnText: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '500',
  },
  editActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  actionBtn: {
    flex: 1,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
  },
  infoRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  infoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infoLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500',
    maxWidth: '55%',
    textAlign: 'right',
  },
  logoutBtn: {
    borderColor: Colors.error + '60',
    marginTop: 8,
  },
});
