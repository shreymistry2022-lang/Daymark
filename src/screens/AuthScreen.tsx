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
  const {
    signIn,
    signUp,
    sendPasswordRecovery,
    updatePassword,
    signInWithProvider,
    passwordRecoveryRequested,
  } = useAuth();

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
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      Alert.alert('Reset Password', 'Please enter your email address in the field below first.');
      return;
    }
    Alert.alert(
      'Reset Password',
      `Send a password recovery email to ${trimmedEmail}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Reset Link',
          onPress: async () => {
            setIsSubmitting(true);
            try {
              const res = await sendPasswordRecovery(trimmedEmail);
              if (res.error) {
                setErrorMessage(res.error);
              } else {
                Alert.alert(
                  'Recovery Email Sent',
                  `Check your inbox at ${trimmedEmail} for password recovery instructions.`
                );
              }
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const handleSocialSignIn = async (provider: 'google' | 'apple') => {
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const res = await signInWithProvider(provider);
      if (res.error) {
        setErrorMessage(res.error);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdatePassword = async () => {
    setErrorMessage(null);
    const trimmedPass = password.trim();
    if (trimmedPass.length < 6) {
      setErrorMessage('New password must be at least 6 characters.');
      return;
    }
    if (trimmedPass !== confirmPassword.trim()) {
      setErrorMessage('Passwords do not match.');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await updatePassword(trimmedPass);
      if (res.error) {
        setErrorMessage(res.error);
      } else {
        Alert.alert('Success', 'Your password has been successfully updated.');
      }
    } finally {
      setIsSubmitting(false);
    }
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
              {authMode === 'signin' ? 'Welcome Back' : 'Create Free Account'}
            </Text>
            <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
              {authMode === 'signin'
                ? 'Sign in to access your recorded habits and streak history.'
                : 'Create a free account to track habits, protect your streaks, and keep your data backed up.'}
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
                Create Free Account
              </Text>
            </TouchableOpacity>
          </View>

          {/* Error Banner */}
          {errorMessage && (
            <View style={[styles.errorBanner, { backgroundColor: `${colors.error}15`, borderColor: `${colors.error}40` }]}>
              <Ionicons name="alert-circle" size={18} color={colors.error} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.errorText, { color: colors.error }]}>{errorMessage}</Text>
                {authMode === 'signup' ? (
                  <TouchableOpacity
                    onPress={() => {
                      setAuthMode('signin');
                      setErrorMessage(null);
                    }}
                    style={{ marginTop: 8 }}
                  >
                    <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13, textDecorationLine: 'underline' }}>
                      Already have an account? Sign In
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8 }}>
                    <TouchableOpacity
                      onPress={() => {
                        setAuthMode('signup');
                        setErrorMessage(null);
                      }}
                    >
                      <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13, textDecorationLine: 'underline' }}>
                        Create Free Account
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleForgotPassword}>
                      <Text style={{ color: colors.secondaryText, fontWeight: '700', fontSize: 13, textDecorationLine: 'underline' }}>
                        Forgot Password?
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Auth Card with Inputs */}
          {passwordRecoveryRequested ? (
            <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.inputLabel, { color: colors.accent, marginBottom: spacing.xs }]}>RECOVER ACCOUNT</Text>
              <Text style={[styles.title, { color: colors.primaryText, fontSize: 22, marginBottom: spacing.sm }]}>Set New Password</Text>
              <Text style={[styles.freeNoticeSub, { color: colors.secondaryText, marginBottom: spacing.md }]}>
                Enter a new secure password for your Daymark account.
              </Text>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.secondaryText }]}>NEW PASSWORD</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}>
                  <Ionicons name="lock-closed-outline" size={18} color={colors.mutedText} />
                  <TextInput
                    style={[styles.input, { color: colors.primaryText }]}
                    placeholder="Enter at least 6 characters"
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

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.secondaryText }]}>CONFIRM NEW PASSWORD</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={colors.mutedText} />
                  <TextInput
                    style={[styles.input, { color: colors.primaryText }]}
                    placeholder="Repeat your new password"
                    placeholderTextColor={colors.mutedText}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.accent }]}
                onPress={handleUpdatePassword}
                disabled={isSubmitting}
                activeOpacity={0.8}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={20} color="#000" />
                    <Text style={styles.primaryBtnText}>Save New Password</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : (
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
                      {authMode === 'signin' ? 'Sign In to Daymark' : 'Create Free Account'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Social Sign-in Option */}
          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.mutedText }]}>OR SIGN IN WITH</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          <View style={styles.socialRow}>
            <TouchableOpacity
              style={[styles.socialBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => handleSocialSignIn('google')}
              disabled={isSubmitting}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Sign in with Google"
            >
              <Ionicons name="logo-google" size={18} color={colors.primaryText} />
              <Text style={[styles.socialBtnText, { color: colors.primaryText }]}>Google</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.socialBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => handleSocialSignIn('apple')}
              disabled={isSubmitting}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Sign in with Apple"
            >
              <Ionicons name="logo-apple" size={18} color={colors.primaryText} />
              <Text style={[styles.socialBtnText, { color: colors.primaryText }]}>Apple</Text>
            </TouchableOpacity>
          </View>

          {/* Free Tier Info Badge */}
          <View style={[styles.freeNoticeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.freeNoticeHeader}>
              <Ionicons name="shield-checkmark" size={16} color={colors.accent} />
              <Text style={[styles.freeNoticeTitle, { color: colors.primaryText }]}>Free Account Included</Text>
            </View>
            <Text style={[styles.freeNoticeSub, { color: colors.secondaryText }]}>
              Signing up is 100% free. It secures your habit streaks, syncs your daily progress, and keeps your data safely backed up.
            </Text>
          </View>
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
  socialRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  socialBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  socialBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  freeNoticeCard: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    marginTop: spacing.xl,
  },
  freeNoticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  freeNoticeTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  freeNoticeSub: {
    fontSize: 12,
    lineHeight: 17,
  },
});

