import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing } from '@/theme/spacing';

interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

const FAQS: FAQItem[] = [
  {
    id: '1',
    question: 'How long do transfers take?',
    answer: 'Oroya internal wallet-to-wallet transfers are instant and 100% free of charge.',
  },
  {
    id: '2',
    question: 'How do I add money to my wallet?',
    answer: 'Open Deposit, choose an amount and network, then send crypto from your external wallet to the generated address.',
  },
  {
    id: '3',
    question: 'Is my data secure?',
    answer: 'Yes. Sensitive actions are protected with your security PIN and, when enabled, biometric authentication.',
  },
  {
    id: '4',
    question: 'How do I upgrade my transaction limit?',
    answer: 'Navigate to Identity Verification in your Profile settings and upload your Government ID document to lift daily limit constraints.',
  },
];

export default function HelpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [expandedFAQ, setExpandedFAQ] = useState<string | null>(null);

  const toggleFAQ = (id: string) => {
    setExpandedFAQ(expandedFAQ === id ? null : id);
  };

  const handleContactSupport = () => {
    Alert.alert(
      'Contact Support',
      'Our support team can help with account, wallet, and security questions.',
      [
        {
          text: 'OK',
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* ─── Header ─── */}
      <View style={[styles.headerContainer, { paddingTop: insets.top + 12 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={colors.light.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Help & Support</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Support Options */}
        <Text style={styles.sectionLabel}>Get in Touch</Text>
        <View style={styles.card}>
          {/* Live Chat */}
          <Pressable
            style={({ pressed }) => [
              styles.row,
              pressed && { backgroundColor: colors.light.borderLight },
            ]}
            onPress={handleContactSupport}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="chatbubbles-outline" size={20} color={colors.light.textSecondary} />
              <View>
                <Text style={styles.rowTitle}>In-App Live Chat</Text>
                <Text style={styles.rowSubtitle}>Get answers in minutes</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.light.textTertiary} />
          </Pressable>

          {/* Email Support */}
          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <View style={styles.rowLeft}>
              <Ionicons name="mail-outline" size={20} color={colors.light.textSecondary} />
              <View>
                <Text style={styles.rowTitle}>Email Support</Text>
                <Text style={styles.rowSubtitle}>support@oroya.app</Text>
              </View>
            </View>
            <Text style={styles.detailText}>24h Response</Text>
          </View>
        </View>

        {/* FAQs */}
        <Text style={styles.sectionLabel}>Frequently Asked Questions</Text>
        <View style={styles.card}>
          {FAQS.map((faq, index) => {
            const isExpanded = expandedFAQ === faq.id;
            const isLast = index === FAQS.length - 1;
            return (
              <View
                key={faq.id}
                style={[
                  styles.faqRow,
                  isLast && { borderBottomWidth: 0 },
                ]}
              >
                <Pressable
                  style={styles.faqHeader}
                  onPress={() => toggleFAQ(faq.id)}
                >
                  <Text style={styles.faqQuestion}>{faq.question}</Text>
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={colors.light.textTertiary}
                  />
                </Pressable>
                {isExpanded && (
                  <View style={styles.faqAnswerContainer}>
                    <Text style={styles.faqAnswer}>{faq.answer}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },

  // ─── Header ───
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.light.background,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.light.textPrimary,
  },

  // ─── Sections ───
  sectionLabel: {
    ...typography.caption,
    color: colors.light.textTertiary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xl,
  },

  // ─── Card & Rows ───
  card: {
    backgroundColor: colors.light.surface,
    marginHorizontal: spacing.lg,
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.light.borderLight,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowTitle: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    fontWeight: '500',
  },
  rowSubtitle: {
    ...typography.caption,
    color: colors.light.textTertiary,
    marginTop: 2,
  },
  detailText: {
    ...typography.caption,
    color: colors.light.textTertiary,
  },

  // ─── FAQ Row Layout ───
  faqRow: {
    paddingVertical: 15,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.light.borderLight,
  },
  faqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  faqQuestion: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    fontWeight: '500',
    flex: 1,
    paddingRight: spacing.md,
  },
  faqAnswerContainer: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.light.borderLight,
  },
  faqAnswer: {
    ...typography.caption,
    color: colors.light.textSecondary,
    lineHeight: 18,
  },
});
