import express from 'express';
import crypto from 'crypto';
import fetch from 'node-fetch';
import { orders } from './store.js';

const router = express.Router();

const MERCHANT_ACCOUNT = process.env.WFP_MERCHANT_ACCOUNT;
const MERCHANT_DOMAIN  = process.env.WFP_DOMAIN;     // без https://
const MERCHANT_SECRET  = process.env.WFP_SECRET;
const SERVICE_URL      = process.env.WFP_SERVICE_URL;

function signMd5(secret, str) {
  return crypto.createHmac('md5', secret).update(str, 'utf8').digest('hex');
}

function buildSignatureForCreateInvoice(p) {
  const parts = [
    p.merchantAccount,
    p.merchantDomainName,
    p.orderReference,
    String(p.orderDate),
    p.amount,
    p.currency,
    ...p.productName,
    ...p.productCount,
    ...p.productPrice
  ];
  return signMd5(MERCHANT_SECRET, parts.join(';'));
}

router.post('/api/create-invoice', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });

  const orderReference = 'GAID-' + Date.now();
  const orderDate = Math.floor(Date.now() / 1000);
  const amount = 1.00;
  const currency = 'UAH';

  const productName  = ['Гайд кардіолога'];
  const productPrice = [amount];
  const productCount = [1];

  const payload = {
    transactionType: 'CREATE_INVOICE',
    merchantAccount: MERCHANT_ACCOUNT,
    merchantAuthType: 'SimpleSignature',
    merchantDomainName: MERCHANT_DOMAIN,
    apiVersion: 1,
    language: 'UA',
    serviceUrl: SERVICE_URL,      // серверний вебхук
    orderReference,
    orderDate,
    amount,
    currency,
    orderTimeout: 86400,
    productName,
    productPrice,
    productCount,
    clientEmail: email
    // за потреби можна додати returnUrl (якщо у вашому тарифі/методі)
  };
  payload.merchantSignature = buildSignatureForCreateInvoice(payload);

  try {
    const r = await fetch('https://api.wayforpay.com/api', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });
    const j = await r.json();

    if (!j.invoiceUrl) {
      console.error('WayForPay response', j);
      return res.status(502).json({ error: 'WayForPay error', details: j });
    }

    // Одноразове посилання на гайд (заміни на свій робочий другий сайт)
    const token = crypto.randomBytes(24).toString('hex');
    const downloadUrl = `https://second-site.example.com/access?token=${token}`;

    orders.set(orderReference, { email, amount, currency, downloadUrl, paid:false, token });

    // Повертаємо фронту URL інвойсу і orderReference — фронт може редіректити на /thanks?ref=...
    res.json({ invoiceUrl: j.invoiceUrl, orderReference });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'create-invoice failed' });
  }
});

export default router;
