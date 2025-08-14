import express from 'express';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { orders } from './store.js';

const router = express.Router();
const MERCHANT_SECRET  = process.env.WFP_SECRET;

// SMTP (SendPulse). Якщо не заповниш — лист просто пропустимо.
const hasSMTP = process.env.SP_SMTP_HOST && process.env.SP_SMTP_USER && process.env.SP_SMTP_PASS;
const transporter = hasSMTP ? nodemailer.createTransport({
  host: process.env.SP_SMTP_HOST,
  port: Number(process.env.SP_SMTP_PORT || 465),
  secure: true,
  auth: { user: process.env.SP_SMTP_USER, pass: process.env.SP_SMTP_PASS }
}) : null;

function signMd5(secret, str) {
  return crypto.createHmac('md5', secret).update(str, 'utf8').digest('hex');
}

router.post('/api/wfp-webhook', express.json(), async (req, res) => {
  const b = req.body;
  // console.log('WFP webhook:', b); // корисно в тестах

  // 1) Перевірка підпису
  const toSign = [
    b.merchantAccount,
    b.orderReference,
    b.amount,
    b.currency,
    b.authCode,
    b.cardPan,
    b.transactionStatus,
    b.reasonCode
  ].join(';');
  const expected = signMd5(MERCHANT_SECRET, toSign);
  if (b.merchantSignature !== expected) {
    return res.status(403).json({ error: 'bad signature' });
  }

  // 2) Якщо оплата пройшла
  if (String(b.transactionStatus).toLowerCase() === 'approved') {
    const order = orders.get(b.orderReference);
    if (order && !order.paid) {
      order.paid = true;

      if (hasSMTP) {
        try {
          await transporter.sendMail({
            from: `"MI.CARDIOLOGIST" <no-reply@your-domain>`,
            to: order.email,
            subject: 'Ваш гайд — посилання на доступ',
            html: `<div style="font-family:Montserrat,Arial,sans-serif">
                     <h2>Дякуємо за оплату!</h2>
                     <p><a href="${order.downloadUrl}" target="_blank" rel="noopener">Відкрити гайд</a></p>
                   </div>`
          });
        } catch (e) {
          console.error('SMTP error:', e);
        }
      }
    }
  }

  // 3) Відповідь WayForPay
  const time = Math.floor(Date.now()/1000);
  const status = 'accept';
  const respSignature = signMd5(MERCHANT_SECRET, [b.orderReference, status, time].join(';'));
  return res.json({ orderReference: b.orderReference, status, time, signature: respSignature });
});

export default router;
