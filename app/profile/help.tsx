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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, borderRadius } from '@/theme/spacing';
import { HeaderBar } from '@/components/shared/HeaderBar';
import { Card } from '@/components/ui/Card';

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
    <SafeAreaView style={styles.container} edges={['top']}>
      <HeaderBar title="Help & Support" showBack onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Support Card Options */}
        <Text style={styles.sectionTitle}>Get in Touch</Text>
        <Card variant="default" style={styles.card}>
          <Pressable style={styles.supportRow} onPress={handleContactSupport}>
            <View style={styles.supportLeft}>
              <View style={[styles.iconBg, { backgroundColor: '#F0EDFF' }]}>
                <Ionicons name="chatbubbles-outline" size={22} color={colors.light.primary} />
              </View>
              <View>
                <Text style={styles.supportTitle}>In-App Live Chat</Text>
                <Text style={styles.supportSubtitle}>Get answers in minutes</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.light.textTertiary} />
          </Pressable>
          <View style={styles.divider} />

          <View style={styles.supportRow}>
            <View style={styles.supportLeft}>
              <View style={[styles.iconBg, { backgroundColor: '#E0FFFE' }]}>
                <Ionicons name="mail-outline" size={22} color={colors.light.secondary} />
              </View>
              <View>
                <Text style={styles.supportTitle}>Email Support</Text>
                <Text style={styles.supportSubtitle}>support@oroya.app</Text>
              </View>
            </View>
            <Text style={styles.detailText}>24h Response</Text>
          </View>
        </Card>

        {/* FAQs */}
        <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
        {FAQS.map((faq) => {
          const isExpanded = expandedFAQ === faq.id;
          return (
            <Card key={faq.id} variant="default" style={styles.faqCard}>
              <Pressable style={styles.faqHeader} onPress={() => toggleFAQ(faq.id)}>
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
            </Card>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.light.textPrimary,
    fontWeight: '700',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  card: {
    paddingHorizontal: spacing.md,
  },
  supportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
  },
  supportLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconBg: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportTitle: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    fontWeight: '600',
  },
  supportSubtitle: {
    ...typography.caption,
    color: colors.light.textTertiary,
    marginTop: 2,
  },
  detailText: {
    ...typography.caption,
    color: colors.light.textTertiary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.light.borderLight,
  },
  faqCard: {
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  faqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  faqQuestion: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    fontWeight: '600',
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
