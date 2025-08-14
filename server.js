import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import payRoutes from './pay.js';
import wfpWebhook from './wfp-webhook.js';
import { orders } from './store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Парсимо JSON для всіх API
app.use(express.json());

// Віддавати фронт (public)
app.use(express.static(path.join(__dirname, 'public')));

// API
app.use(payRoutes);
app.use(wfpWebhook);

// Перевірка статусу замовлення (для відображення посилання на сайті)
app.get('/api/order-status', (req, res) => {
  const ref = String(req.query.ref || '');
  const order = orders.get(ref);
  if (!order) return res.json({ exists: false });
  if (order.paid) return res.json({ exists: true, paid: true, downloadUrl: order.downloadUrl });
  return res.json({ exists: true, paid: false });
});

// опційна сторінка "дякуємо"
app.get('/thanks', (req, res) => {
  res.type('html').send(`
    <!doctype html><meta charset="utf-8" />
    <title>Дякуємо!</title>
    <div style="font-family:sans-serif;max-width:640px;margin:40px auto">
      <h2>Дякуємо за оплату!</h2>
      <p>Як тільки оплата підтвердиться, тут з'явиться кнопка з доступом.</p>
      <div id="status"></div>
      <script>
        // Очікуємо orderReference у ?ref=...
        const params = new URLSearchParams(location.search);
        const ref = params.get('ref');
        const box = document.getElementById('status');

        async function tick() {
          if (!ref) { box.innerHTML = '<p>Не знайдено номера замовлення.</p>'; return; }
          const r = await fetch('/api/order-status?ref=' + encodeURIComponent(ref));
          const j = await r.json();
          if (!j.exists) {
            box.innerHTML = '<p>Замовлення не знайдене.</p>';
            return;
          }
          if (j.paid && j.downloadUrl) {
            box.innerHTML = '<p><a href="'+j.downloadUrl+'" target="_blank" rel="noopener" style="display:inline-block;padding:10px 16px;border:1px solid #ccc;border-radius:8px;text-decoration:none">Відкрити гайд</a></p>';
            clearInterval(timer);
          } else {
            box.innerHTML = '<p>Очікуємо підтвердження оплати...</p>';
          }
        }
        const timer = setInterval(tick, 3000);
        tick();
      </script>
    </div>
  `);
});

const PORT = process.env.PORT || 3000;

