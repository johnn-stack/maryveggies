import { getRedis } from '../../lib/mpesa.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, message: 'Use GET to check payment status.' });
  }

  const checkoutRequestId = String(req.query?.checkoutRequestId || '');
  if (!/^[A-Za-z0-9_-]{6,200}$/.test(checkoutRequestId)) {
    return res.status(400).json({ success: false, message: 'Invalid payment reference.' });
  }

  try {
    const payment = await getRedis().hgetall(`mary-veggies:payment:${checkoutRequestId}`);
    if (!payment.checkoutRequestId) {
      return res.status(404).json({ success: false, message: 'Payment reference was not found.' });
    }
    return res.status(200).json({
      success: true,
      checkoutRequestId,
      status: payment.status,
      message: payment.message || 'Waiting for M-Pesa confirmation.',
      receipt: payment.receipt || '',
    });
  } catch (error) {
    console.error('M-Pesa status error:', error instanceof Error ? error.message : error);
    return res.status(503).json({ success: false, message: 'Payment status is temporarily unavailable.' });
  }
}