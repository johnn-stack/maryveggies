import { randomUUID } from 'node:crypto';
import {
  getAccessToken,
  getPaymentConfig,
  getRedis,
  getTimestamp,
  normalizePhone,
  postDaraja,
  products,
  sendError,
} from '../../lib/mpesa.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, message: 'Use POST for checkout.' });
  }

  try {
    const config = getPaymentConfig();
    if (!['CustomerPayBillOnline', 'CustomerBuyGoodsOnline'].includes(config.transactionType)) {
      throw new Error('MPESA_TRANSACTION_TYPE must be CustomerPayBillOnline or CustomerBuyGoodsOnline.');
    }

    const phone = normalizePhone(req.body?.phone);
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Enter a valid Kenyan M-Pesa number.' });
    }

    const items = req.body?.items;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Your basket is empty.' });
    }

    let amount = 0;
    for (const item of items) {
      const productId = Number(item.productId);
      const quantity = Number(item.quantity);
      if (!Number.isInteger(productId) || productId < 0 || productId >= products.length ||
          !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
        return res.status(400).json({ success: false, message: 'The basket contains an invalid item.' });
      }
      amount += products[productId].price * quantity;
    }

    if (amount < 1 || amount > 150000) {
      return res.status(400).json({ success: false, message: 'The order total is outside the supported payment range.' });
    }

    const redis = getRedis();
    const token = await getAccessToken(config);
    const timestamp = getTimestamp();
    const password = Buffer.from(`${config.shortcode}${config.passkey}${timestamp}`).toString('base64');
    const stk = await postDaraja(config, token, '/mpesa/stkpush/v1/processrequest', {
      BusinessShortCode: config.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: config.transactionType,
      Amount: amount,
      PartyA: phone,
      PartyB: config.partyB,
      PhoneNumber: phone,
      CallBackURL: config.callbackUrl,
      AccountReference: `MV-${randomUUID().slice(0, 8).toUpperCase()}`,
      TransactionDesc: 'Mary Veggies order',
    });

    if (String(stk.ResponseCode) !== '0' || !stk.CheckoutRequestID || !stk.MerchantRequestID) {
      return res.status(502).json({
        success: false,
        message: stk.ResponseDescription || 'Daraja could not start the payment. Check the shortcode and STK Push setup.',
      });
    }

    const paymentKey = `mary-veggies:payment:${stk.CheckoutRequestID}`;
    await redis.hset(paymentKey, {
      status: 'pending',
      amount: String(amount),
      phone,
      checkoutRequestId: stk.CheckoutRequestID,
      merchantRequestId: stk.MerchantRequestID,
      createdAt: new Date().toISOString(),
    });
    await redis.expire(paymentKey, 86400);

    return res.status(200).json({
      success: true,
      message: stk.CustomerMessage || 'Prompt sent. Enter your M-Pesa PIN on your phone.',
      checkoutRequestId: stk.CheckoutRequestID,
    });
  } catch (error) {
    return sendError(res, error);
  }
}