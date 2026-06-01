import { api } from './client';
import { Image } from 'react-native';

export type PaymentCurrencyCategory = 'Popular Coins' | 'Stablecoins' | 'Other Currencies';

export interface PaymentCurrency {
  id: string;
  code: string;
  symbol: string;
  name: string;
  category: PaymentCurrencyCategory;
  network?: string;
  badgeColor?: string;
}

interface PaymentCurrenciesResponse {
  success: boolean;
  currencies: PaymentCurrency[];
}

export const getLogoUrl = (symbol: string) =>
  `https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@master/128/color/${symbol.toLowerCase()}.png`;

export function prefetchCurrencyLogos(currencies: PaymentCurrency[], limit = 80) {
  const symbols = Array.from(new Set(currencies.map((currency) => currency.symbol.toLowerCase())))
    .filter(Boolean)
    .slice(0, limit);

  symbols.forEach((symbol) => {
    Image.prefetch(getLogoUrl(symbol)).catch(() => {});
  });
}

export const FALLBACK_CURRENCIES: PaymentCurrency[] = [
  { id: 'btc', code: 'BTC', symbol: 'BTC', name: 'Bitcoin', category: 'Popular Coins' },
  { id: 'eth', code: 'ETH', symbol: 'ETH', name: 'Ethereum', category: 'Popular Coins' },
  { id: 'usdterc20', code: 'USDTERC20', symbol: 'USDT', name: 'Tether USD (ETH)', category: 'Stablecoins', network: 'ETH', badgeColor: '#627EEA' },
  { id: 'usdttrc20', code: 'USDTTRC20', symbol: 'USDT', name: 'Tether USD (TRX)', category: 'Stablecoins', network: 'TRX', badgeColor: '#E93B3E' },
  { id: 'usdtbsc', code: 'USDTBSC', symbol: 'USDT', name: 'Tether USD (BSC)', category: 'Stablecoins', network: 'BSC', badgeColor: '#F3BA2F' },
  { id: 'usdtmatic', code: 'USDTMATIC', symbol: 'USDT', name: 'Tether USD (POLYGON)', category: 'Stablecoins', network: 'POLYGON', badgeColor: '#8247E5' },
  { id: 'usdc', code: 'USDC', symbol: 'USDC', name: 'USD Coin', category: 'Stablecoins' },
  { id: 'usdcbsc', code: 'USDCBSC', symbol: 'USDC', name: 'USD Coin (BSC)', category: 'Stablecoins', network: 'BSC', badgeColor: '#F3BA2F' },
  { id: 'usdcsol', code: 'USDCSOL', symbol: 'USDC', name: 'USD Coin (SOL)', category: 'Stablecoins', network: 'SOL', badgeColor: '#14F195' },
  { id: 'bnbbsc', code: 'BNBBSC', symbol: 'BNB', name: 'BNB (BSC)', category: 'Popular Coins', network: 'BSC', badgeColor: '#F3BA2F' },
  { id: 'trx', code: 'TRX', symbol: 'TRX', name: 'TRON', category: 'Popular Coins' },
  { id: 'ton', code: 'TON', symbol: 'TON', name: 'Toncoin', category: 'Popular Coins', badgeColor: '#0098EA' },
  { id: 'sol', code: 'SOL', symbol: 'SOL', name: 'Solana', category: 'Popular Coins', badgeColor: '#14F195' },
  { id: 'ltc', code: 'LTC', symbol: 'LTC', name: 'Litecoin', category: 'Popular Coins' },
  { id: 'doge', code: 'DOGE', symbol: 'DOGE', name: 'Dogecoin', category: 'Popular Coins' },
];

export async function fetchPaymentCurrencies() {
  const response = await api.get<PaymentCurrenciesResponse>('/payments/currencies');
  return response.currencies.length ? response.currencies : FALLBACK_CURRENCIES;
}
