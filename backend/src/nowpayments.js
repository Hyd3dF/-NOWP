const { config } = require('./config');
const { HttpError } = require('./http');

class NowPaymentsClient {
  constructor() {
    this.baseUrl = config.nowPayments.apiUrl;
    this.apiKey = config.nowPayments.apiKey;
  }

  assertConfigured() {
    if (!this.apiKey) {
      throw new HttpError(500, 'NOWPayments API key is not configured.');
    }
  }

  async request(path, options = {}) {
    this.assertConfigured();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.NOWPAYMENTS_TIMEOUT_MS || 10000));

    let response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: options.method || 'GET',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new HttpError(504, 'NOWPayments request timed out.', {
          code: 'nowpayments_timeout',
        });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!response.ok) {
      const message = data?.message || data?.msg || `NOWPayments request failed with ${response.status}`;
      throw new HttpError(response.status, message, data);
    }

    return data;
  }

  async createPayment({ amount, currency, network, referenceId }) {
    const body = {
      price_amount: String(amount),
      price_currency: currency.toLowerCase(),
      pay_currency: network.toLowerCase(),
      order_id: referenceId,
      order_description: `Oroya deposit ${referenceId}`,
    };

    if (config.nowPayments.ipnCallbackUrl) {
      body.ipn_callback_url = config.nowPayments.ipnCallbackUrl;
    }

    const payment = await this.request('/payment', {
      method: 'POST',
      body,
    });

    return normalizePayment(payment);
  }

  async getMerchantCurrencies() {
    const data = await this.request('/merchant/coins');
    const selectedCurrencies = Array.isArray(data?.selectedCurrencies)
      ? data.selectedCurrencies
      : [];

    if (selectedCurrencies.length > 0) {
      return normalizeCurrencyList(selectedCurrencies);
    }

    const fallback = await this.request('/currencies');
    return normalizeCurrencyList(fallback?.currencies || []);
  }

  async getMinimumAmount({ currencyFrom, currencyTo }) {
    const params = new URLSearchParams({
      currency_from: currencyFrom.toLowerCase(),
      currency_to: currencyTo.toLowerCase(),
    });
    const data = await this.request(`/min-amount?${params.toString()}`);
    const minimum = Number(data?.min_amount);
    return Number.isFinite(minimum) && minimum > 0 ? minimum : 0;
  }

  async getPaymentStatus(paymentId) {
    const cleanId = String(paymentId || '').trim();
    if (!cleanId) {
      throw new HttpError(400, 'payment_id is required.');
    }
    const data = await this.request(`/payment/${encodeURIComponent(cleanId)}`);
    return normalizePayment(data);
  }
}

const STABLE_SYMBOLS = new Set([
  'busd',
  'dai',
  'eurc',
  'eurcv',
  'eurs',
  'fdusd',
  'gusd',
  'pyusd',
  'tusd',
  'usdc',
  'usdd',
  'usde',
  'usdp',
  'usdr',
  'usds',
  'usdt',
  'usn',
  'usv',
]);

const POPULAR_ORDER = [
  'btc',
  'eth',
  'usdterc20',
  'usdttrc20',
  'usdtbsc',
  'usdtmatic',
  'usdc',
  'usdcbsc',
  'usdcsol',
  'usdcbase',
  'bnbbsc',
  'trx',
  'ton',
  'sol',
  'ltc',
  'doge',
  'dogecoin',
  'xrp',
  'ada',
  'matic',
  'avax',
];

const SYMBOL_NAMES = {
  ada: 'Cardano',
  algo: 'Algorand',
  avax: 'Avalanche',
  bch: 'Bitcoin Cash',
  bnb: 'BNB',
  btc: 'Bitcoin',
  busd: 'Binance USD',
  dai: 'Dai',
  doge: 'Dogecoin',
  eth: 'Ethereum',
  fdusd: 'First Digital USD',
  gusd: 'Gemini Dollar',
  ltc: 'Litecoin',
  matic: 'Polygon',
  sol: 'Solana',
  ton: 'Toncoin',
  trx: 'TRON',
  tusd: 'TrueUSD',
  usdc: 'USD Coin',
  usdd: 'USDD',
  usde: 'Ethena USDe',
  usdp: 'Pax Dollar',
  usdr: 'Real USD',
  usds: 'USDS',
  usdt: 'Tether USD',
  xlm: 'Stellar',
  xmr: 'Monero',
  xrp: 'XRP',
};

const NETWORK_SUFFIXES = [
  ['mainnet', 'MAINNET'],
  ['erc20', 'ETH'],
  ['trc20', 'TRX'],
  ['bep20', 'BSC'],
  ['bsc', 'BSC'],
  ['matic', 'POLYGON'],
  ['polygon', 'POLYGON'],
  ['sol', 'SOL'],
  ['ton', 'TON'],
  ['base', 'BASE'],
  ['arb', 'ARB'],
  ['op', 'OP'],
  ['algo', 'ALGO'],
  ['xlm', 'XLM'],
  ['arc20', 'AVAX C'],
  ['kava', 'KAVA'],
  ['kcc', 'KCC'],
  ['celo', 'CELO'],
  ['xtz', 'XTZ'],
  ['avax', 'AVAX'],
  ['avaxc', 'AVAX C-CHAIN'],
  ['near', 'NEAR'],
];

function normalizeCurrencyList(currencies) {
  const seen = new Set();
  return currencies
    .map((value) => normalizeCurrency(String(value || '')))
    .filter((currency) => {
      if (!currency || seen.has(currency.id)) return false;
      seen.add(currency.id);
      return true;
    })
    .sort(sortCurrencies);
}

function normalizeCurrency(value) {
  const id = value.trim().toLowerCase();
  if (!/^[a-z0-9]{2,40}$/.test(id)) return null;

  const symbol = getCurrencySymbol(id);
  const network = getCurrencyNetwork(id, symbol);
  const isStable = STABLE_SYMBOLS.has(symbol.toLowerCase());
  const popularIndex = POPULAR_ORDER.indexOf(id);

  return {
    id,
    code: id.toUpperCase(),
    symbol,
    name: getCurrencyName(symbol, network),
    network,
    category: isStable
      ? 'Stablecoins'
      : popularIndex >= 0
        ? 'Popular Coins'
        : 'Other Currencies',
    badgeColor: getNetworkColor(network),
    popular_rank: popularIndex >= 0 ? popularIndex : 9999,
  };
}

function getCurrencySymbol(id) {
  if (id === 'dogecoin') return 'DOGE';
  if (id === 'bnbbsc') return 'BNB';

  for (const [suffix] of NETWORK_SUFFIXES) {
    if (id.endsWith(suffix) && id.length > suffix.length + 1) {
      return id.slice(0, -suffix.length).toUpperCase();
    }
  }

  return id.toUpperCase();
}

function getCurrencyNetwork(id, symbol) {
  if (id === symbol.toLowerCase()) return '';

  for (const [suffix, network] of NETWORK_SUFFIXES) {
    if (id.endsWith(suffix) && id.length > suffix.length + 1) {
      return network;
    }
  }

  return '';
}

function getCurrencyName(symbol, network) {
  const normalizedSymbol = symbol.toLowerCase();
  const baseName = SYMBOL_NAMES[normalizedSymbol] || symbol;
  return network ? `${baseName} (${network})` : baseName;
}

function getNetworkColor(network) {
  const colors = {
    ARB: '#28A0F0',
    BASE: '#0052FF',
    BSC: '#F3BA2F',
    ETH: '#627EEA',
    OP: '#FF0420',
    POLYGON: '#8247E5',
    SOL: '#14F195',
    TON: '#0098EA',
    TRX: '#E93B3E',
  };

  return colors[network] || '';
}

function sortCurrencies(a, b) {
  if (a.popular_rank !== b.popular_rank) {
    return a.popular_rank - b.popular_rank;
  }

  if (a.category !== b.category) {
    return a.category.localeCompare(b.category);
  }

  return a.code.localeCompare(b.code);
}

function normalizePayment(payment) {
  return {
    paymentId: String(payment.payment_id || payment.id || ''),
    paymentAddress: payment.pay_address || payment.payment_address || '',
    paymentUrl: payment.payment_url || payment.invoice_url || '',
    status: mapStatus(payment.payment_status || payment.status || 'waiting'),
    expiresAt: payment.expiration_estimate_date || payment.expires_at || '',
  };
}

function mapStatus(status) {
  const normalized = String(status || '').toLowerCase();
  const statusMap = {
    waiting: 'waiting',
    confirming: 'confirming',
    confirmed: 'confirmed',
    finished: 'completed',
    completed: 'completed',
    failed: 'failed',
    expired: 'expired',
    cancelled: 'cancelled',
    canceled: 'cancelled',
  };

  return statusMap[normalized] || 'pending';
}

const nowPayments = new NowPaymentsClient();

module.exports = {
  nowPayments,
};
