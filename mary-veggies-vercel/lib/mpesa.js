import { Redis } from '@upstash/redis';

export const products = [
  { name: 'Broccoli', price: 200 },
  { name: 'Cauliflower', price: 150 },
  { name: 'Carrot', price: 90 },
  { name: 'Cucumber', price: 160 },
  { name: 'French Beans', price: 50 },
  { name: 'Peas', price: 100 },
  { name: 'Butternut', price: 60 },
  { name: 'Okra', price: 10 },
  { name: 'Mini Pack Veggies', price: 50 },
  { name: 'Jumbo Pack Veggies', price: 100 },
];

export function getPaymentConfig() {
  const environment = process.env.MPESA_ENV || 'sandbox';
  if (!['sandbox', 'production'].includes(environment)) {
    throw new Error('MPESA_ENV must be sandbox or production.');
  }

  const required = [
    'MPESA_CONSUMER_KEY',
    'MPESA_CONSUMER_SECRET',
    'MPESA_SHORTCODE',
    'MPESA_PASSKEY',
    'MPESA_CALLBACK_URL',
  ];
  if (required.some((name) => !process.env[name] || /PASTE_|YOUR-PUBLIC/.test(process.env[name]))) {
    throw new Error('M-Pesa environment variables are incomplete.');
  }

  const callback = new URL(process.env.MPESA_CALLBACK_URL);
  if (callback.protocol !== 'https:' || !callback.pathname.endsWith('/api/mpesa/callback')) {
    throw new Error('MPESA_CALLBACK_URL must be the public HTTPS /api/mpesa/callback route.');
  }

  return {
    baseUrl: environment === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke',
    shortcode: process.env.MPESA_SHORTCODE,
    partyB: process.env.MPESA_PARTY_B || process.env.MPESA_SHORTCODE,
    passkey: process.env.MPESA_PASSKEY,
    consumerKey: process.env.MPESA_CONSUMER_KEY,
    consumerSecret: process.env.MPESA_CONSUMER_SECRET,
    callbackUrl: callback.toString(),
    transactionType: process.env.MPESA_TRANSACTION_TYPE || 'CustomerPayBillOnline',
  };
}

export function getRedis() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error('Payment status storage is not configured.');
  }
  return Redis.fromEnv();
}

export function normalizePhone(value) {
  const phone = String(value || '').replace(/[\s-]/g, '');
  const normalized = phone.startsWith('+254')
    ? phone.slice(1)
    : phone.startsWith('0')
      ? `254${phone.slice(1)}`
      : phone;
  return /^254[17]\d{8}$/.test(normalized) ? normalized : null;
}

export function getTimestamp() {
  return new Date(Date.now() + 3 * 60 * 60 * 1000)
    .toISOString()
    .replace(/[-:T.Z]/g, '')
    .slice(0, 14);
}

export async function getAccessToken(config) {
  const credentials = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString('base64');
  const response = await fetch(`${config.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) {
    throw new Error('Daraja authentication failed. Check the credentials and selected environment.');
  }
  return result.access_token;
}

export async function postDaraja(config, token, path, payload) {
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.errorMessage || result.ResponseDescription || 'Daraja rejected the request.');
  }
  return result;
}

export function sendError(res, error) {
  const message = error instanceof Error ? error.message : 'Unexpected payment error.';
  const status = /environment variables|storage is not configured|MPESA_ENV|MPESA_CALLBACK_URL/.test(message)
    ? 503
    : 502;
  console.error('M-Pesa function error:', message);
  return res.status(status).json({ success: false, message });
}