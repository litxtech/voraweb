#!/usr/bin/env node
/**
 * Stripe mod kurulumu (test / canlı).
 *
 *   node scripts/stripe-mode-setup.mjs --key sk_test_... --publishable pk_test_...
 *   node scripts/stripe-mode-setup.mjs --key sk_live_... --publishable pk_live_... --write-env --push-secrets --push-eas-env
 *
 * Yaptıkları:
 *   1. Anahtarı doğrular ve modu (test/canlı) yazar.
 *   2. "Vora Premium" ürününü + aylık/yıllık TRY fiyatlarını (yoksa) oluşturur.
 *   3. `stripe-webhook` (snapshot) ve `stripe-connect-video-webhook` (thin)
 *      uç noktalarını aynı URL ile yeniden oluşturur, imza sırlarını döker.
 *   4. `.env` / `.env.local` satırlarını basar; `--write-env` ile dosyalara yazar.
 *   5. `--push-secrets` ile `supabase secrets set` komutunu çalıştırır.
 *   6. `--push-eas-env` ile EAS ortam değişkenlerini (production/preview/development)
 *      günceller. `.easignore` `.env*` dosyalarını dışladığı için mağaza
 *      derlemesindeki publishable key yalnızca EAS env'den gelir.
 *
 * Not: Stripe webhook imza sırrı yalnızca oluşturma anında döner. Bu yüzden
 * aynı URL'e sahip eski uç nokta silinip yeniden oluşturulur; kurulum sırasında
 * birkaç saniyelik teslimat boşluğu normaldir.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.stripe.com';
const V2_API_VERSION = '2026-11-18.endive';

const PREMIUM_PRODUCT_KEY = 'premium';
const PREMIUM_PRICES = [
  { plan: 'monthly', amount: 24999, interval: 'month' },
  { plan: 'yearly', amount: 199999, interval: 'year' },
];
/** KDV kapsamına girmeyen dijital hizmetler (Stripe tax code). */
const TAX_CODE = 'txcd_10000000';

const PLATFORM_EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.closed',
  'charge.dispute.funds_reinstated',
];

const CONNECT_EVENTS = [
  'v2.core.account.created',
  'v2.core.account.updated',
  'v2.core.account[requirements].updated',
  'v2.core.account[configuration.merchant].updated',
  'v2.core.account[configuration.recipient].updated',
  'v2.core.account[configuration.customer].updated',
];

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = { writeEnv: false, pushSecrets: false, pushEasEnv: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--write-env') args.writeEnv = true;
    else if (arg === '--push-secrets') args.pushSecrets = true;
    else if (arg === '--push-eas-env') args.pushEasEnv = true;
    else if (arg === '--key') args.key = argv[++i];
    else if (arg === '--publishable') args.publishable = argv[++i];
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Bilinmeyen argüman: ${arg}`);
  }
  return args;
}

function projectRef() {
  const path = resolve(rootDir, 'supabase/config.toml');
  if (!existsSync(path)) throw new Error('supabase/config.toml bulunamadı');
  const match = readFileSync(path, 'utf8').match(/^project_id\s*=\s*"([^"]+)"/m);
  if (!match) throw new Error('config.toml içinde project_id yok');
  return match[1];
}

let API_KEY = '';

async function api(path, { method = 'GET', form, json, v2 = false } = {}) {
  const headers = { Authorization: `Bearer ${API_KEY}` };
  if (v2) headers['Stripe-Version'] = V2_API_VERSION;
  let body;
  if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(form).toString();
  }
  if (json) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }
  const res = await fetch(`${API}${path}`, { method, headers, body });
  const text = await res.text();
  const parsed = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const message = parsed?.error?.message ?? `${res.status} ${res.statusText}`;
    throw new Error(`${method} ${path}: ${message}`);
  }
  return parsed;
}

async function ensurePremiumPrices() {
  const products = await api('/v1/products?limit=100&active=true');
  let product = products.data.find((item) => item.metadata?.vora_key === PREMIUM_PRODUCT_KEY);
  if (!product) {
    product = await api('/v1/products', {
      method: 'POST',
      form: {
        name: 'Vora Premium',
        description: 'Vora Premium aboneliği (aylık / yıllık)',
        tax_code: TAX_CODE,
        'metadata[vora_key]': PREMIUM_PRODUCT_KEY,
      },
    });
    console.log(`• Premium ürünü oluşturuldu: ${product.id}`);
  }

  const existing = await api(`/v1/prices?limit=100&active=true&product=${product.id}`);
  const prices = {};
  for (const spec of PREMIUM_PRICES) {
    const found = existing.data.find(
      (price) =>
        price.currency === 'try'
        && price.unit_amount === spec.amount
        && price.recurring?.interval === spec.interval,
    );
    prices[spec.plan] = found
      ?? (await api('/v1/prices', {
        method: 'POST',
        form: {
          product: product.id,
          currency: 'try',
          unit_amount: String(spec.amount),
          'recurring[interval]': spec.interval,
          nickname: spec.plan === 'monthly' ? 'Aylık' : 'Yıllık',
          'metadata[plan]': spec.plan,
        },
      }));
    console.log(`• ${spec.plan}: ${prices[spec.plan].id}`);
  }
  return prices;
}

async function recreatePlatformWebhook(url) {
  const list = await api('/v1/webhook_endpoints?limit=100');
  for (const hook of list.data.filter((item) => item.url === url)) {
    await api(`/v1/webhook_endpoints/${hook.id}`, { method: 'DELETE' });
    console.log(`• Eski platform webhook silindi: ${hook.id}`);
  }
  const form = {
    url,
    description: 'Vora platform (Supabase Edge) — checkout, abonelik, iade',
  };
  PLATFORM_EVENTS.forEach((event, index) => {
    form[`enabled_events[${index}]`] = event;
  });
  const created = await api('/v1/webhook_endpoints', { method: 'POST', form });
  console.log(`• Platform webhook oluşturuldu: ${created.id}`);
  return created.secret;
}

async function recreateConnectWebhook(url) {
  const query = '?limit=100&include[0]=webhook_endpoint.url';
  const list = await api(`/v2/core/event_destinations${query}`, { v2: true });
  for (const destination of list.data.filter((item) => item.webhook_endpoint?.url === url)) {
    await api(`/v2/core/event_destinations/${destination.id}`, { method: 'DELETE', v2: true });
    console.log(`• Eski Connect webhook silindi: ${destination.id}`);
  }
  const created = await api('/v2/core/event_destinations', {
    method: 'POST',
    v2: true,
    json: {
      name: 'Vora Connect (thin)',
      description: 'Sahne içerik üreticisi Connect hesapları',
      type: 'webhook_endpoint',
      event_payload: 'thin',
      events_from: ['@accounts'],
      enabled_events: CONNECT_EVENTS,
      webhook_endpoint: { url },
      include: ['webhook_endpoint.signing_secret'],
    },
  });
  console.log(`• Connect webhook oluşturuldu: ${created.id}`);
  return created.webhook_endpoint.signing_secret;
}

function runNpx(cliArgs) {
  const options = { stdio: 'inherit', cwd: rootDir };
  if (process.platform === 'win32') {
    // Windows'ta `npx.cmd` doğrudan spawn edilemez; cmd üzerinden çalıştırılır.
    execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `npx ${cliArgs.join(' ')}`], options);
  } else {
    execFileSync('npx', cliArgs, options);
  }
}

const EAS_ENVIRONMENTS = ['production', 'preview', 'development'];

function writeEnvFile(file, entries) {
  const path = resolve(rootDir, file);
  const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const lines = current.split(/\r?\n/);
  const next = [];
  const remaining = new Map(Object.entries(entries));
  for (const line of lines) {
    const key = line.match(/^([A-Z0-9_]+)=/)?.[1];
    if (key && remaining.has(key)) {
      next.push(`${key}=${remaining.get(key)}`);
      remaining.delete(key);
    } else {
      next.push(line);
    }
  }
  while (next.length && next[next.length - 1] === '') next.pop();
  for (const [key, value] of remaining) next.push(`${key}=${value}`);
  writeFileSync(path, `${next.join('\n')}\n`, 'utf8');
  console.log(`• ${file} güncellendi.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.key) {
    console.log('Kullanım: node scripts/stripe-mode-setup.mjs --key sk_test_... [--publishable pk_test_...] [--write-env] [--push-secrets] [--push-eas-env]');
    process.exit(args.help ? 0 : 1);
  }
  if (!/^sk_(test|live)_/.test(args.key)) throw new Error('Geçersiz secret key (sk_test_ / sk_live_ ile başlamalı)');

  API_KEY = args.key;
  const ref = projectRef();
  const account = await api('/v1/account');
  const mode = args.key.startsWith('sk_live_') ? 'canlı' : 'test';
  console.log(`Stripe hesabı: ${account.id} (${account.country}) — mod: ${mode}`);
  console.log(`Supabase projesi: ${ref}`);

  const prices = await ensurePremiumPrices();
  const platformUrl = `https://${ref}.supabase.co/functions/v1/stripe-webhook`;
  const connectUrl = `https://${ref}.supabase.co/functions/v1/stripe-connect-video-webhook`;
  const platformSecret = await recreatePlatformWebhook(platformUrl);
  const connectSecret = await recreateConnectWebhook(connectUrl);

  const clientEntries = args.publishable
    ? { EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: args.publishable }
    : {};
  const serverEntries = {
    STRIPE_SECRET_KEY: args.key,
    STRIPE_PRICE_MONTHLY: prices.monthly.id,
    STRIPE_PRICE_YEARLY: prices.yearly.id,
    STRIPE_WEBHOOK_SECRET: platformSecret,
    STRIPE_CONNECT_WEBHOOK_SECRET: connectSecret,
  };

  console.log('\n--- .env (istemci) ---');
  console.log(`EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=${args.publishable ?? 'pk_...'}`);
  console.log('\n--- .env.local (yalnızca sunucu) ---');
  for (const [key, value] of Object.entries(serverEntries)) console.log(`${key}=${value}`);

  if (args.writeEnv) {
    writeEnvFile('.env', clientEntries);
    writeEnvFile('.env.local', serverEntries);
  }

  if (args.pushSecrets) {
    // Windows'ta tek komutta çok sayıda tırnaklı `KEY=value` argümanı cmd
    // katmanında bozulup sessizce eski değerleri koruyabiliyor. Bu yüzden her
    // secret ayrı ayrı gönderilir (idempotent, birkaç saniye sürer).
    for (const [key, value] of Object.entries(serverEntries)) {
      runNpx(['supabase', 'secrets', 'set', `${key}=${value}`, '--project-ref', ref]);
      console.log(`• Supabase secret güncellendi: ${key}`);
    }
  } else {
    console.log('\nSupabase secrets için:');
    console.log(`  node scripts/stripe-mode-setup.mjs --key ${args.key.slice(0, 12)}... --push-secrets`);
  }

  if (args.pushEasEnv) {
    if (!args.publishable) throw new Error('--push-eas-env için --publishable gerekli');
    for (const environment of EAS_ENVIRONMENTS) {
      runNpx([
        'eas-cli@latest',
        'env:set',
        '--name',
        'EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY',
        '--value',
        args.publishable,
        '--environment',
        environment,
        '--visibility',
        'plaintext',
        '--non-interactive',
      ]);
      console.log(`• EAS (${environment}) güncellendi: EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`);
    }
  } else {
    console.log('\nEAS derleme değişkeni için:');
    console.log(
      `  node scripts/stripe-mode-setup.mjs --key ${args.key.slice(0, 12)}... --publishable ${args.publishable ?? 'pk_...'} --push-eas-env`,
    );
  }
}

main().catch((error) => {
  console.error(`Hata: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
