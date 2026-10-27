# MARY VEGGIES on Vercel

This folder contains the shop page and its Vercel serverless payment endpoints:

- `POST /api/mpesa/stkpush` starts an STK Push.
- `POST /api/mpesa/callback` receives Safaricom's result.
- `GET /api/mpesa/status` lets the checkout page check the saved result.

## Deploy

1. Create a Git repository containing this folder and import it into Vercel. Set the Vercel project root to `mary-veggies-vercel` if the repository contains its parent folder.
2. Add an Upstash Redis database to the Vercel project. The integration must provide `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
3. In Vercel Project Settings > Environment Variables, add the Daraja variables shown in `.env.example`. Keep `MPESA_ENV` set to `sandbox` while testing.
4. Deploy the project and note its stable production domain, such as `mary-veggies.vercel.app`.
5. Set `MPESA_CALLBACK_URL` to `https://YOUR-PRODUCTION-DOMAIN/api/mpesa/callback`, using your actual Vercel production domain. Redeploy after changing environment variables.
6. Open the production URL, place a small sandbox test order, and confirm the callback updates the payment status.

For a PayBill, use `MPESA_TRANSACTION_TYPE=CustomerPayBillOnline`. For a Buy Goods Till, use `CustomerBuyGoodsOnline` and set `MPESA_PARTY_B` to the Till number. Use the matching Daraja sandbox credentials and shortcode for sandbox tests.

Never commit `.env` or put secrets in `index.html`. Add the same product prices to `api/mpesa/stkpush.js` and `index.html` when changing the catalog. The callback checks the checkout reference, merchant reference, amount, phone number, and receipt; mismatches are held for manual review. Confirm payments through the Daraja transaction records before fulfilling real orders.