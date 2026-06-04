import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
  SectionList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, borderRadius } from '@/theme/spacing';
import { HeaderBar } from '@/components/shared/HeaderBar';
import { CoinLogo } from '@/components/ui/CoinLogo';
import {
  FALLBACK_CURRENCIES,
  fetchPaymentCurrencies,
  prefetchCurrencyLogos,
} from '@/services/api/payments';
import type { PaymentCurrency, PaymentCurrencyCategory } from '@/services/api/payments';
import { useDepositStore } from '@/stores/depositStore';

const CATEGORIES: PaymentCurrencyCategory[] = [
  'Popular Coins',
  'Stablecoins',
  'Other Currencies',
];

export default function SelectCoinScreen() {
  const router = useRouter();
  const { setSelectedCoin, clearPayment } = useDepositStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [currencies, setCurrencies] = useState<PaymentCurrency[]>(FALLBACK_CURRENCIES);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    setIsLoading(true);
    fetchPaymentCurrencies()
      .then((items) => {
        prefetchCurrencyLogos(items, 120);
        if (isMounted) setCurrencies(items);
      })
      .catch(() => {
        prefetchCurrencyLogos(FALLBACK_CURRENCIES, 120);
        if (isMounted) setCurrencies(FALLBACK_CURRENCIES);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredCoins = useMemo(
    () =>
      currencies.filter((coin) => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return true;

        return (
          coin.name.toLowerCase().includes(query) ||
          coin.symbol.toLowerCase().includes(query) ||
          coin.code.toLowerCase().includes(query) ||
          coin.id.toLowerCase().includes(query)
        );
      }),
    [currencies, searchQuery],
  );

  const sections = useMemo(
    () =>
      CATEGORIES.map((category) => ({
        title: category,
        data: filteredCoins.filter((coin) => coin.category === category),
      })).filter((section) => section.data.length > 0),
    [filteredCoins],
  );

  const handleSelectCoin = (coin: PaymentCurrency) => {
    setSelectedCoin(coin.id);
    clearPayment();
    router.back();
  };

  return (
    <View style={styles.container}>
      <HeaderBar title="Select Coin" showBack onBack={() => router.back()} />

      <View style={styles.content}>
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={18} color={colors.light.textTertiary} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search coins..."
            placeholderTextColor={colors.light.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
          />
        </View>

        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={7}
          ListHeaderComponent={
            isLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.light.primary} />
                <Text style={styles.loadingText}>Loading available coins...</Text>
              </View>
            ) : null
          }
          renderSectionHeader={({ section }) => (
            <Text style={styles.categoryTitle}>{section.title}</Text>
          )}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [
                styles.coinRow,
                pressed && styles.coinRowPressed,
              ]}
              onPress={() => handleSelectCoin(item)}
            >
              <View style={styles.coinLeft}>
                <CoinLogo symbol={item.symbol} size={32} style={styles.coinLogo} />
                <View style={styles.coinInfo}>
                  <View style={styles.symbolRow}>
                    <Text style={styles.coinSymbol}>{item.symbol}</Text>
                    {item.network ? (
                      <View
                        style={[
                          styles.networkBadge,
                          { backgroundColor: item.badgeColor || colors.light.primary },
                        ]}
                      >
                        <Text style={styles.networkText}>{item.network}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.coinName} numberOfLines={1}>
                    {item.name}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.light.textTertiary} />
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No coins found matching "{searchQuery}"</Text>
            </View>
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  content: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1.5,
    borderBottomColor: colors.light.border,
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    height: 44,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.light.textPrimary,
    paddingVertical: spacing.xs,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['3xl'],
  },
  categoryTitle: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
    fontWeight: '700',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  loadingText: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
  },
  coinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.light.borderLight,
  },
  coinRowPressed: {
    backgroundColor: colors.light.borderLight,
    opacity: 0.8,
  },
  coinLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  coinLogo: {
    marginRight: spacing.md,
  },
  coinInfo: {
    justifyContent: 'center',
  },
  symbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  coinSymbol: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.light.textPrimary,
  },
  networkBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  networkText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  coinName: {
    fontSize: 12,
    color: colors.light.textSecondary,
    marginTop: 2,
  },
  emptyState: {
    marginTop: spacing['3xl'],
    alignItems: 'center',
  },
  emptyText: {
    ...typography.bodySm,
    color: colors.light.textTertiary,
  },
});
