// src/screens/AuthScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, radii } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useAuth } from '../services/AuthProvider';

export const AuthScreen = () => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { signIn, signUp, continueAsGuest } = useAuth();

  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    const trimmedPass = password.trim();

    if (!trimmedEmail) {
      setErrorMessage('Please enter your email address.');
      return;
    }

    if (!trimmedPass) {
      setErrorMessage('Please enter your password.');
      return;
    }

    if (authMode === 'signup') {
      if (trimmedPass.length < 6) {
        setErrorMessage('Password must be at least 6 characters.');
        return;
      }
      if (trimmedPass !== confirmPassword.trim()) {
        setErrorMessage('Passwords do not match.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (authMode === 'signin') {
        const res = await signIn(trimmedEmail, trimmedPass);
        if (res.error) {
          setErrorMessage(res.error);
        }
      } else {
        const res = await signUp(trimmedEmail, trimmedPass, fullName);
        if (res.error) {
          setErrorMessage(res.error);
        }
      }
    } catch {
      setErrorMessage('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = () => {
    Alert.alert(
      'Reset Password',
      'If your account is connected to cloud sync, a password reset link will be sent to your email.',
      [
        {
          text: 'Send Reset Link',
          onPress: () => {
            if (!email.trim()) {
              Alert.alert('Notice', 'Please type your email address first.');
            } else {
              Alert.alert('Email Sent', `Check inbox at ${email.trim()} for instructions.`);
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 30 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Brand */}
          <View style={styles.brandHeader}>
            <View style={[styles.brandIconBox, { backgroundColor: `${colors.accent}18`, borderColor: `${colors.accent}40` }]}>
              <Ionicons name="flame" size={30} color={colors.accent} />
            </View>
            <Text style={[styles.eyebrow, { color: colors.accent }]}>DAYMARK • HABIT SYSTEM</Text>
            <Text style={[styles.title, { color: colors.primaryText }]}>
              {authMode === 'signin' ? 'Welcome Back' : 'Create Account'}
            </Text>
            <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
              {authMode === 'signin'
                ? 'Sign in to access your recorded habits and streak history.'
                : 'Join Daymark to record your rituals and build unbreakable streaks.'}
            </Text>
          </View>

          {/* Segmented Mode Tabs */}
          <View style={[styles.tabContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TouchableOpacity
              style={[
                styles.tabBtn,
                authMode === 'signin' && [styles.tabBtnActive, { backgroundColor: colors.secondaryBackground }],
              ]}
              onPress={() => {
                setAuthMode('signin');
                setErrorMessage(null);
              }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: authMode === 'signin' ? colors.primaryText : colors.secondaryText },
                  authMode === 'signin' && styles.tabTextActive,
                ]}
              >
                Sign In
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tabBtn,
                authMode === 'signup' && [styles.tabBtnActive, { backgroundColor: colors.secondaryBackground }],
              ]}
              onPress={() => {
                setAuthMode('signup');
                setErrorMessage(null);
              }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: authMode === 'signup' ? colors.primaryText : colors.secondaryText },
                  authMode === 'signup' && styles.tabTextActive,
                ]}
              >
                Create Account
              </Text>
            </TouchableOpacity>
          </View>

          {/* Error Banner */}
          {errorMessage && (
            <View style={[styles.errorBanner, { backgroundColor: `${colors.error}15`, borderColor: `${colors.error}40` }]}>
              <Ionicons name="alert-circle" size={18} color={colors.error} />
              <Text style={[styles.errorText, { color: colors.error }]}>{errorMessage}</Text>
            </View>
          )}

          {/* Auth Card with Inputs */}
          <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {authMode === 'signup' && (
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.secondaryText }]}>FULL NAME</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}>
                  <Ionicons name="person-outline" size={18} color={colors.mutedText} />
                  <TextInput
                    style={[styles.input, { color: colors.primaryText }]}
                    placeholder="e.g. Alex Mercer"
                    placeholderTextColor={colors.mutedText}
                    value={fullName}
                    onChangeText={setFullName}
                    autoCapitalize="words"
                  />
                </View>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.secondaryText }]}>EMAIL ADDRESS</Text>
              <View style={[styles.inputWrap, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}>
                <Ionicons name="mail-outline" size={18} color={colors.mutedText} />
                <TextInput
                  style={[styles.input, { color: colors.primaryText }]}
                  placeholder="name@example.com"
                  placeholderTextColor={colors.mutedText}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={[styles.inputLabel, { color: colors.secondaryText }]}>PASSWORD</Text>
                {authMode === 'signin' && (
                  <TouchableOpacity onPress={handleForgotPassword}>
                    <Text style={[styles.forgotLink, { color: colors.accent }]}>Forgot?</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={[styles.inputWrap, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.mutedText} />
                <TextInput
                  style={[styles.input, { color: colors.primaryText }]}
                  placeholder="Enter your password"
                  placeholderTextColor={colors.mutedText}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setShowPassword(prev => !prev)} style={styles.eyeBtn}>
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={colors.mutedText}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {authMode === 'signup' && (
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.secondaryText }]}>CONFIRM PASSWORD</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={colors.mutedText} />
                  <TextInput
                    style={[styles.input, { color: colors.primaryText }]}
                    placeholder="Repeat your password"
                    placeholderTextColor={colors.mutedText}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                </View>
              </View>
            )}

            {/* Primary Action Button */}
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.accent }]}
              onPress={handleSubmit}
              disabled={isSubmitting}
              activeOpacity={0.8}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <>
                  <Ionicons
                    name={authMode === 'signin' ? 'log-in-outline' : 'person-add-outline'}
                    size={20}
                    color="#000"
                  />
                  <Text style={styles.primaryBtnText}>
                    {authMode === 'signin' ? 'Sign In to Daymark' : 'Create Daymark Account'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Quick Guest / Demo Option */}
          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.mutedText }]}>OR EXPLORE INSTANTLY</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          <TouchableOpacity
            style={[styles.guestBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={continueAsGuest}
            activeOpacity={0.7}
          >
            <Ionicons name="flash-outline" size={18} color={colors.accent} />
            <View style={styles.guestTextCol}>
              <Text style={[styles.guestBtnTitle, { color: colors.primaryText }]}>
                Continue as Guest (Local Offline)
              </Text>
              <Text style={[styles.guestBtnSub, { color: colors.secondaryText }]}>
                No signup needed. All data persists securely on this device.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedText} />
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  brandHeader: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.sm,
  },
  brandIconBox: {
    width: 64,
    height: 64,
    borderRadius: radii.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 6,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    borderRadius: radii.md,
    padding: 4,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radii.sm,
    alignItems: 'center',
  },
  tabBtnActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    fontWeight: '700',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  formCard: {
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  inputGroup: {
    marginBottom: spacing.md,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    marginBottom: 6,
  },
  forgotLink: {
    fontSize: 12,
    fontWeight: '600',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    height: 48,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 15,
    height: '100%',
  },
  eyeBtn: {
    padding: 6,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    borderRadius: radii.md,
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#000',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.md,
    gap: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  guestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
  },
  guestTextCol: {
    flex: 1,
  },
  guestBtnTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  guestBtnSub: {
    fontSize: 12,
    lineHeight: 16,
  },
});

