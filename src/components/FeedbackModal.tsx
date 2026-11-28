// src/components/FeedbackModal.tsx
import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing } from '../theme/tokens';
import {
  openStoreReview,
  submitCustomerFeedback,
  FeedbackSubmission,
} from '../services/feedbackService';

interface FeedbackModalProps {
  visible: boolean;
  onClose: () => void;
}

type FeedbackCategory = 'general' | 'bug' | 'feature_request' | 'design';

export const FeedbackModal = ({ visible, onClose }: FeedbackModalProps) => {
  const { colors } = useTheme();

  const [rating, setRating] = useState<number>(0);
  const [category, setCategory] = useState<FeedbackCategory>('general');
  const [feedbackText, setFeedbackText] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);

  const resetForm = () => {
    setRating(0);
    setCategory('general');
    setFeedbackText('');
    setIsSubmitting(false);
    setIsSubmitted(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (rating === 0) return;
    setIsSubmitting(true);

    const sentiment = rating >= 4 ? 'positive' : rating === 3 ? 'neutral' : 'negative';

    const submission: FeedbackSubmission = {
      rating,
      sentiment,
      category,
      feedbackText,
      userId: null,
      userEmail: null,
    };

    await submitCustomerFeedback(submission);
    setIsSubmitting(false);
    setIsSubmitted(true);
  };

  const categories: { label: string; value: FeedbackCategory; icon: keyof typeof Ionicons.glyphMap }[] = [
    { label: 'General', value: 'general', icon: 'chatbubble-ellipses-outline' },
    { label: 'Feature Request', value: 'feature_request', icon: 'bulb-outline' },
    { label: 'Bug / Issue', value: 'bug', icon: 'bug-outline' },
    { label: 'Design & UI', value: 'design', icon: 'color-palette-outline' },
  ];

  const ratingLabels = ['', 'Needs Work', 'Fair', 'Good', 'Very Good', 'Loved It! 🎉'];

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={handleClose}
        />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.eyebrow, { color: colors.accent }]}>YOUR OPINION MATTERS</Text>
              <Text style={[styles.title, { color: colors.primaryText }]}>Rate Daymark</Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn} accessibilityLabel="Close feedback">
              <Ionicons name="close" size={22} color={colors.secondaryText} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {isSubmitted ? (
              <View style={styles.successContainer}>
                <View style={[styles.successIconCircle, { backgroundColor: `${colors.accent}20` }]}>
                  <Ionicons name="heart" size={38} color={colors.accent} />
                </View>
                <Text style={[styles.successTitle, { color: colors.primaryText }]}>Thank You!</Text>
                <Text style={[styles.successBody, { color: colors.secondaryText }]}>
                  Your feedback has been received. Your input directly helps us make Daymark more mindful and reliable with every release.
                </Text>
                {rating >= 4 && (
                  <TouchableOpacity
                    style={[styles.primaryActionBtn, { backgroundColor: colors.accent }]}
                    onPress={() => {
                      void openStoreReview();
                      handleClose();
                    }}
                  >
                    <Ionicons name="logo-google-playstore" size={18} color="#FFF" />
                    <Text style={styles.primaryActionText}>Rate 5 Stars on Google Play</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.doneBtn, { borderColor: colors.border, marginTop: 10 }]}
                  onPress={handleClose}
                >
                  <Text style={[styles.doneBtnText, { color: colors.primaryText }]}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {/* Star Rating Bar */}
                <Text style={[styles.sectionSubtitle, { color: colors.secondaryText }]}>
                  How has your experience with Daymark been so far?
                </Text>

                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <TouchableOpacity
                      key={star}
                      activeOpacity={0.7}
                      onPress={() => setRating(star)}
                      style={styles.starBtn}
                      accessibilityLabel={`Rate ${star} star`}
                    >
                      <Ionicons
                        name={star <= rating ? 'star' : 'star-outline'}
                        size={36}
                        color={star <= rating ? '#F59E0B' : colors.mutedText}
                      />
                    </TouchableOpacity>
                  ))}
                </View>

                {rating > 0 && (
                  <Text style={[styles.ratingLabelText, { color: rating >= 4 ? colors.accent : colors.secondaryText }]}>
                    {ratingLabels[rating]}
                  </Text>
                )}

                {/* Positive Flow (4 - 5 stars) */}
                {rating >= 4 && (
                  <View style={[styles.positiveBox, { backgroundColor: `${colors.accent}12`, borderColor: `${colors.accent}40` }]}>
                    <Ionicons name="sparkles" size={20} color={colors.accent} />
                    <Text style={[styles.positiveText, { color: colors.primaryText }]}>
                      We are thrilled you love Daymark! A 5-star Google Play review helps independent apps grow tremendously.
                    </Text>
                    <TouchableOpacity
                      style={[styles.primaryActionBtn, { backgroundColor: colors.accent, width: '100%', marginTop: 8 }]}
                      onPress={() => {
                        void openStoreReview();
                        void handleSubmit();
                      }}
                    >
                      <Ionicons name="logo-google-playstore" size={18} color="#FFF" />
                      <Text style={styles.primaryActionText}>Leave a Review on Play Store</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Feedback Input (Always available, highlighted for <= 3 stars) */}
                {rating > 0 && (
                  <View style={{ marginTop: spacing.md }}>
                    <Text style={[styles.inputLabel, { color: colors.secondaryText }]}>
                      {rating <= 3 ? 'What could we do better?' : 'Any additional notes for the creator? (Optional)'}
                    </Text>

                    {/* Category Selection */}
                    <View style={styles.categoryRow}>
                      {categories.map(cat => {
                        const isSelected = category === cat.value;
                        return (
                          <TouchableOpacity
                            key={cat.value}
                            onPress={() => setCategory(cat.value)}
                            style={[
                              styles.categoryChip,
                              {
                                backgroundColor: isSelected ? `${colors.accent}20` : colors.secondaryBackground,
                                borderColor: isSelected ? colors.accent : colors.border,
                              },
                            ]}
                          >
                            <Ionicons
                              name={cat.icon}
                              size={13}
                              color={isSelected ? colors.accent : colors.mutedText}
                            />
                            <Text
                              style={[
                                styles.categoryChipText,
                                { color: isSelected ? colors.accent : colors.secondaryText },
                              ]}
                            >
                              {cat.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <TextInput
                      style={[
                        styles.textInput,
                        {
                          backgroundColor: colors.secondaryBackground,
                          borderColor: colors.border,
                          color: colors.primaryText,
                        },
                      ]}
                      multiline
                      numberOfLines={4}
                      placeholder={
                        rating <= 3
                          ? 'Tell us what was confusing, broken, or what you would like improved...'
                          : 'Share your thoughts, suggestions, or features you’d love to see next...'
                      }
                      placeholderTextColor={colors.mutedText}
                      value={feedbackText}
                      onChangeText={setFeedbackText}
                      textAlignVertical="top"
                    />

                    <TouchableOpacity
                      style={[
                        styles.submitBtn,
                        {
                          backgroundColor: rating >= 4 ? colors.secondaryBackground : colors.accent,
                          borderColor: rating >= 4 ? colors.border : colors.accent,
                        },
                      ]}
                      onPress={handleSubmit}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <ActivityIndicator size="small" color="#FFF" />
                      ) : (
                        <Text
                          style={[
                            styles.submitBtnText,
                            { color: rating >= 4 ? colors.primaryText : '#FFF' },
                          ]}
                        >
                          Send Feedback Directly
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  scrollContent: {
    paddingBottom: spacing.sm,
  },
  sectionSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    marginVertical: spacing.sm,
  },
  starBtn: {
    padding: 4,
  },
  ratingLabelText: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
    marginBottom: spacing.sm,
  },
  positiveBox: {
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.md,
    marginVertical: spacing.sm,
    alignItems: 'center',
    gap: 8,
  },
  positiveText: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  primaryActionText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: spacing.sm,
    marginTop: 2,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  categoryChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  textInput: {
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.md,
    fontSize: 13,
    minHeight: 85,
    lineHeight: 18,
  },
  submitBtn: {
    borderRadius: radii.md,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  successContainer: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: 12,
  },
  successIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
  successBody: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
  },
  doneBtn: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
  },
  doneBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
