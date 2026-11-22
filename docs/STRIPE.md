# Stripe — canlı (live) mod

**Canlı mod aktif.** Canlı hesap `acct_1SRbY1A8xdy6RRiQ` (LITXTECH, GB, varsayılan
para birimi EUR). Fiyatlar TRY olarak tanımlı: aylık 249,99 ₺ / yıllık 1.999,99 ₺.
Test moduna dönmek için aynı script `sk_test_…` anahtarıyla çalıştırılır.

## Nerede ne duruyor

| Değer | Yer | İstemciye gider mi |
|-------|-----|--------------------|
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`pk_live_…`) | `.env` + **EAS ortam değişkeni** → `app.config.ts` → `env.stripe.publishableKey` | Evet (Stripe SDK) |
| `STRIPE_SECRET_KEY` (`sk_live_…`) | Supabase Edge Function secret | **Hayır** |
| `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_YEARLY` | Supabase secret | **Hayır** |
| `STRIPE_WEBHOOK_SECRET` | Supabase secret | **Hayır** |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Supabase secret | **Hayır** |

Kurallar:

- `sk_…` ve `whsec_…` hiçbir zaman `EXPO_PUBLIC_*` olmaz; istemci paketine girmez.
- `.env` ve `.env.local` commit edilmez (`.gitignore`'da). `.env.local` yalnızca
  yerel referans + `supabase secrets set` kaynağıdır.
- Sunucudaki gerçek değerler `supabase secrets list` ile yalnızca SHA-256
  özeti olarak görünür (değer okunamaz).

## Kurulum / mod değiştirme

```bash
# Test modu (mevcut durum)
node scripts/stripe-mode-setup.mjs \
  --key sk_test_... --publishable pk_test_... \
  --write-env --push-secrets

# Canlı mod (canlı anahtarlar gelince)
node scripts/stripe-mode-setup.mjs \
  --key sk_live_... --publishable pk_live_... \
  --write-env --push-secrets --push-eas-env
```

Script sırasıyla:

1. Anahtarı doğrular ve modu (`test` / `canlı`) yazar.
2. `Vora Premium` ürününü ve TRY fiyatlarını (aylık 249,99 ₺ / yıllık 1.999,99 ₺)
   yoksa oluşturur, varsa yeniden kullanır (idempotent).
3. `stripe-webhook` ve `stripe-connect-video-webhook` uç noktalarını aynı URL ile
   yeniden oluşturur. **Webhook imza sırrı yalnızca oluşturma anında döndüğü için
   eski uç nokta silinir**; kurulum sırasında birkaç saniyelik teslimat boşluğu
   normaldir.
4. `.env` / `.env.local` satırlarını günceller (`--write-env`).
5. `supabase secrets set` çalıştırır (`--push-secrets`).
6. EAS ortam değişkenlerini günceller (`--push-eas-env`, publishable key).

`--push-secrets` için `SUPABASE_ACCESS_TOKEN` gerekir (`.env` içinde mevcut).

## EAS derlemeleri (önemli)

`.easignore` `.env` / `.env.*` dosyalarını dışlar. Bu yüzden mağaza derlemesine
giden `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` **yalnızca EAS ortam değişkeninden**
gelir; yerel `.env` değişikliği yayındaki uygulamayı değiştirmez.

```bash
# Tüm ortamları tek seferde günceller (production / preview / development)
node scripts/stripe-mode-setup.mjs \
  --key sk_live_... --publishable pk_live_... --push-eas-env

# Kontrol
npx eas-cli@latest env:list --environment production
```

Değişiklikten sonra yeni bir production derlemesi gerekir (`EXPO_PUBLIC_*`
değerleri derleme anında pakete gömülür).

## Webhook uç noktaları

| Fonksiyon | URL | Tip |
|-----------|-----|-----|
| `stripe-webhook` | `https://<proje>.supabase.co/functions/v1/stripe-webhook` | snapshot (v1) |
| `stripe-connect-video-webhook` | `https://<proje>.supabase.co/functions/v1/stripe-connect-video-webhook` | thin (v2, `events_from: @accounts`) |

Platform olayları: `checkout.session.completed`,
`checkout.session.async_payment_succeeded|failed`, `payment_intent.succeeded|failed`,
`customer.subscription.updated|deleted`, `charge.refunded`,
`charge.dispute.created|closed|funds_reinstated`.

Connect olayları: `v2.core.account.created|updated`, `[requirements].updated`,
`[configuration.merchant|recipient|customer].updated`.

Liste `scripts/stripe-mode-setup.mjs` içinde `PLATFORM_EVENTS` / `CONNECT_EVENTS`
sabitlerinde tutulur; yeni bir olay dinlenecekse oraya eklenip script tekrar
çalıştırılır.

## Managed Payments notu

Sandbox hesabında **Managed Payments varsayılan açık**. Bu katman açıkken Stripe,
inline `price_data` ürünlerini "product tax code missing" hatasıyla reddediyor
(bahşiş, canlar bağışı, bilet, marketplace vb. hepsi bu yolu kullanıyor).

Çözüm: `supabase/functions/_shared/stripe.ts` içindeki `voraManagedPaymentsOff`
nesnesi tüm Checkout oturumlarına yayılıyor.

> Yeni bir `stripe.checkout.sessions.create({ … })` çağrısı eklerken
> `...voraManagedPaymentsOff` satırını unutma.

Abonelik ürünü (`Vora Premium`) ayrıca `txcd_10000000` tax code'u ile oluşturulur.

## Dönüş adresleri (success_url / cancel_url)

Stripe Checkout yalnızca `http(s)` dönüş adresi kabul eder. Uygulama derin
bağlantıları (`vora://...`) doğrudan verilirse Stripe `url_invalid`
("Not a valid URL") döner ve kullanıcı "Ödeme sağlayıcısına ulaşılamıyor"
mesajı görür.

Bu yüzden tüm checkout fonksiyonları `_shared/stripe.ts` içindeki
`stripeCheckoutReturnUrl()` yardımcısını kullanır:

- Gelen adres zaten `http(s)` ise olduğu gibi geçer (web akışı).
- `vora://` gibi özel şemalar `https://vora.app/checkout/return?next=...`
  köprüsüne sarılır; köprü sayfası uygulamayı açar.

> Yeni bir `checkout.sessions.create({ … })` çağrısı eklerken `success_url`
> ve `cancel_url` için asla ham `vora://` verme; yardımcıyı kullan.

## Sahne Connect durumu

Canlı hesapta **Connect / Accounts v2 erişimi açık** (`/v2/core/accounts`
çağrısı 200 dönüyor, bağlı hesap sayısı 0). Bu yüzden canlıda:

- Bahşiş, Premium, bilet, marketplace gibi tahsilat akışları çalışır.
- Sahne içerik üreticisi onboarding/payout (`stripe-connect-video-creator`,
  `stripe-process-video-payouts`) canlıda çalışabilir.

Sandbox hesabında (`acct_1UduSnI4WPR6Wsi9`) Connect kapalıydı; test moduna
dönersen sahne payout akışları `non_connect_platform_accounts_v2_access_blocked`
hatası verir. Test hesabında açmak için:

1. https://dashboard.stripe.com/acct_1UduSnI4WPR6Wsi9/settings/connect/platform-setup
2. Platform profilini doldur (iş modeli: platform/pazar yeri).
3. Accounts v2'yi aç: https://docs.stripe.com/accounts-v2/use-accounts-as-customers
4. `node scripts/stripe-mode-setup.mjs …` komutunu tekrar çalıştır; Connect
   webhook'u zaten `events_from: @accounts` ile hazır.

## Canlıya geçiş kontrol listesi

1. Stripe canlı hesabını aktive et (şirket bilgileri, IBAN, vergi).
2. Canlı anahtarlarla script'i çalıştır
   (`--write-env --push-secrets --push-eas-env`).
3. Supabase secrets'ları doğrula:
   `npx supabase secrets list --project-ref <proje>` (5 Stripe anahtarı güncel tarihli olmalı).
4. EAS production ortamında `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` değerinin
   `pk_live_...` olduğunu doğrula (`npx eas-cli@latest env:list --environment production`).
5. Yeni production derlemesi al ve yayınla. (`EXPO_PUBLIC_*` derleme anında
   pakete gömülür; eski derleme test anahtarını taşır. `.env` EAS'a gitmez.)
6. Yerelde denemek için: `npx expo start --clear`.
7. Canlı webhook uç noktalarını Stripe Dashboard > Developers > Webhooks altında
   doğrula, test ödemesi yap, `stripe-webhook` loglarına bak.
8. Sahne/Connect için canlı hesapta Connect ayarlarını aç; gerekirse
   `VV_CONNECT_BASE_URL`, `VV_CONNECT_RETURN_URL`, `VV_CONNECT_REFRESH_URL`
   secret'larını tanımla (varsayılan `https://vora.app`).

## Test kartları (yalnızca test modunda)

| Kart | Sonuç |
|------|-------|
| `4242 4242 4242 4242` | Başarılı |
| `4000 0000 0000 9995` | Yetersiz bakiye |
| `4000 0025 0000 3155` | 3D Secure doğrulama |

Son kullanma: gelecekte herhangi bir tarih, CVC: herhangi 3 hane.
Canlı modda gerçek kart gerekir; gerçek tahsilat yapılır.

## Doğrulama komutları

```bash
# Anahtar + ürün + webhook'ları doğrula (hiçbir şeyi değiştirmeden)
curl -s https://api.stripe.com/v1/account -u "sk_live_...:"

# Fiyatlar (TRY) ve webhook uç noktaları
curl -s "https://api.stripe.com/v1/prices?limit=5" -u "sk_live_...:"
curl -s https://api.stripe.com/v1/webhook_endpoints -u "sk_live_...:"

# Uygulanan secret'ların özetleri (SHA-256)
npx supabase secrets list --project-ref <proje>
```
