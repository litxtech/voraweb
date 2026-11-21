import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  vvFormatMoney,
  vvFormatPeriod,
  vvFormatWatchTime,
  vvProgressPercent,
  vvTipPreview,
} from '@/features/vora-video/services/format';

test('%30/%70 komisyon ön izlemesi sunucuyla aynı sonucu verir', () => {
  const result = vvTipPreview(10_000, 3000);
  assert.equal(result.commissionMinor, 3000);
  assert.equal(result.creatorMinor, 7000);
});

test('kuruş kaybı olmadan pay dağıtılır', () => {
  const result = vvTipPreview(333, 3000);
  assert.equal(result.commissionMinor, 99);
  assert.equal(result.creatorMinor, 234);
  assert.equal(result.commissionMinor + result.creatorMinor, 333);
});

test('geçersiz komisyon aralığı güvenli sınırlara çekilir', () => {
  const negative = vvTipPreview(5000, -10);
  assert.equal(negative.commissionMinor, 0);
  assert.equal(negative.creatorMinor, 5000);

  const overflow = vvTipPreview(5000, 20_000);
  assert.equal(overflow.commissionMinor, 5000);
  assert.equal(overflow.creatorMinor, 0);
});

test('para birimi biçimi Türkçe ondalık ayırıcı kullanır', () => {
  assert.match(vvFormatMoney(10_000, 'TRY'), /100,00/);
  assert.match(vvFormatMoney(333, 'TRY'), /3,33/);
});

test('15 günlük dönem etiketi gün aralığını gösterir', () => {
  assert.equal(vvFormatPeriod('2026-11-01', '2026-11-15'), '1–15 Kasım 2026');
  assert.equal(vvFormatPeriod('2026-11-16', '2026-11-30'), '16–30 Kasım 2026');
  assert.equal(vvFormatPeriod('bozuk', '2026-11-30'), '—');
});

test('izlenme süresi sa/dk biçiminde gösterilir', () => {
  assert.equal(vvFormatWatchTime(45), '45 sn');
  assert.equal(vvFormatWatchTime(125), '2 dk');
  assert.equal(vvFormatWatchTime(3 * 3600 + 12 * 60), '3 sa 12 dk');
});

test('ilerleme yüzdesi 0-100 aralığında kalır', () => {
  assert.equal(vvProgressPercent(30, 60), 50);
  assert.equal(vvProgressPercent(120, 60), 100);
  assert.equal(vvProgressPercent(null, 60), 0);
  assert.equal(vvProgressPercent(10, 0), 0);
});
