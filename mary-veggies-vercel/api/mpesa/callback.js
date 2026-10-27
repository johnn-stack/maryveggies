import { getRedis } from '../../lib/mpesa.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ResultCode: 1, ResultDesc: 'Use POST for payment callbacks.' });
  }

  try {
    const callback = req.body?.Body?.stkCallback;
    const checkoutRequestId = String(callback?.CheckoutRequestID || '');
    const merchantRequestId = String(callback?.MerchantRequestID || '');
    if (!checkoutRequestId || !merchantRequestId || !Number.isInteger(Number(callback?.ResultCode))) {
      return res.status(400).json({ ResultCode: 1, ResultDesc: 'Invalid callback.' });
    }

    const redis = getRedis();
    const paymentKey = `mary-veggies:payment:${checkoutRequestId}`;
    const payment = await redis.hgetall(paymentKey);
    if (!payment.checkoutRequestId || payment.merchantRequestId !== merchantRequestId) {
      return res.status(404).json({ ResultCode: 1, ResultDesc: 'Payment reference not found.' });
    }

    const metadata = Object.fromEntries(
      (callback.CallbackMetadata?.Item || []).map((item) => [item.Name, item.Value]),
    );
    const resultCode = Number(callback.ResultCode);
    let status = resultCode === 0 ? 'success' : 'failed';
    let message = String(callback.ResultDesc || 'Payment was not completed.');

    if (resultCode === 0 &&
        (Number(metadata.Amount) !== Number(payment.amount) || String(metadata.PhoneNumber) !== payment.phone ||
         !metadata.MpesaReceiptNumber)) {
      status = 'review';
      message = 'Payment details need manual verification.';
    } else if (resultCode === 0) {
      message = 'Payment confirmed.';
    }

    await redis.hset(paymentKey, {
      status,
      message,
      receipt: String(metadata.MpesaReceiptNumber || ''),
      resultCode: String(resultCode),
      resultDescription: String(callback.ResultDesc || ''),
      completedAt: new Date().toISOString(),
    });
    await redis.expire(paymentKey, 86400);
    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted.' });
  } catch (error) {
    console.error('M-Pesa callback error:', error instanceof Error ? error.message : error);
    return res.status(500).json({ ResultCode: 1, ResultDesc: 'Callback could not be processed.' });
  }
}