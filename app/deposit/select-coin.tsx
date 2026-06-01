import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
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
import { Input } from '@/components/ui/Input';
import { CoinLogo } from '@/components/ui/CoinLogo';
import {
  FALLBACK_CURRENCIES,
  fetchPaymentCurrencies,
  prefetchCurrencyLogos,
} from '@/services/api/payments';
import type { PaymentCurrency, PaymentCurrencyCategory } from '@/services/api/payments';

const CATEGORIES: PaymentCurrencyCategory[] = [
  'Popular Coins',
  'Stablecoins',
  'Other Currencies',
];

function chunkRows(items: PaymentCurrency[]) {
  const rows: PaymentCurrency[][] = [];
  for (let index = 0; index < items.length; index += 2) {
    rows.push(items.slice(index, index + 2));
  }
  return rows;
}

export default function SelectCoinScreen() {
  const router = useRouter();
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
        data: chunkRows(filteredCoins.filter((coin) => coin.category === category)),
      })).filter((section) => section.data.length > 0),
    [filteredCoins],
  );

  const handleSelectCoin = (coin: PaymentCurrency) => {
    router.replace({ pathname: '/deposit', params: { selectedCoin: coin.id } });
  };

  return (
    <View style={styles.container}>
      <HeaderBar title="Select Coin" showBack onBack={() => router.back()} />

      <View style={styles.content}>
        <View style={styles.searchContainer}>
          <Input
            placeholder="Search coins..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            icon={<Ionicons name="search-outline" size={20} color={colors.light.textTertiary} />}
          />
        </View>

        <SectionList
          sections={sections}
          keyExtractor={(row, index) => `${row.map((coin) => coin.id).join('-')}-${index}`}
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          initialNumToRender={10}
          maxToRenderPerBatch={8}
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
            <View style={styles.coinRow}>
              {item.map((coin) => (
                <Pressable
                  key={coin.id}
                  style={({ pressed }) => [
                    styles.coinCard,
                    pressed && styles.coinCardPressed,
                  ]}
                  onPress={() => handleSelectCoin(coin)}
                >
                  <CoinLogo symbol={coin.symbol} size={32} style={styles.coinLogo} />
                  <View style={styles.coinInfo}>
                    <View style={styles.symbolRow}>
                      <Text style={styles.coinSymbol}>{coin.symbol}</Text>
                      {coin.network ? (
                        <View
                          style={[
                            styles.networkBadge,
                            { backgroundColor: coin.badgeColor || colors.light.primary },
                          ]}
                        >
                          <Text style={styles.networkText}>{coin.network}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.coinName} numberOfLines={1}>
                      {coin.name}
                    </Text>
                  </View>
                </Pressable>
              ))}
              {item.length === 1 ? <View style={styles.coinCardSpacer} /> : null}
            </View>
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
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.light.borderLight,
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
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  coinCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    backgroundColor: colors.light.surface,
    borderWidth: 1,
    borderColor: colors.light.borderLight,
    borderRadius: borderRadius.md,
  },
  coinCardPressed: {
    backgroundColor: colors.light.borderLight,
    borderColor: colors.light.border,
  },
  coinCardSpacer: {
    flex: 1,
  },
  coinLogo: {
    marginRight: spacing.sm,
  },
  coinInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  symbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  coinSymbol: {
    ...typography.bodySm,
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
    ...typography.caption,
    color: colors.light.textTertiary,
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
