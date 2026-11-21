import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import { openUrl } from '@/lib/linking/openUrl';
import type {
  VvTipHistoryRow,
  VvTipSummary,
  VvTipDirection,
} from '../types';
import { VV_TIP_STATUS_LABELS } from '../constants';
import { vvFormatDate, vvFormatDateTime, vvFormatMoney } from './format';

type VvTipReportInput = {
  role: VvTipDirection;
  rows: VvTipHistoryRow[];
  summary: VvTipSummary;
  ownerName: string;
};

export type VvPdfArtifact = {
  uri: string | null;
  filename: string;
  html: string;
  error: string | null;
};

const PDF_MIME = 'application/pdf';
const PDF_UTI = 'com.adobe.pdf';

function escapeHtml(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanName(value: string | null | undefined, fallback: string): string {
  const clean = String(value ?? '').replace(/\s+/g, ' ').trim();
  return clean || fallback;
}

function fileStem(value: string): string {
  const cleaned = value
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
  return cleaned || 'Sahne-Bahsis';
}

function statusLabel(status: string): string {
  return VV_TIP_STATUS_LABELS[status] ?? status;
}

function statusClass(status: string): string {
  if (status === 'succeeded') return 'ok';
  if (status === 'failed' || status === 'disputed') return 'bad';
  if (status === 'refunded' || status === 'partially_refunded') return 'muted';
  return 'wait';
}

function counterpartName(tip: VvTipHistoryRow, role: VvTipDirection): string {
  if (role === 'received') {
    if (tip.anonymous) return 'Anonim destekçi';
    return cleanName(
      tip.sender_full_name ?? tip.sender_username,
      'İzleyici',
    );
  }
  return cleanName(tip.creator_full_name ?? tip.creator_username, 'İçerik üreticisi');
}

function receiptNo(tip: VvTipHistoryRow): string {
  const date = new Date(tip.created_at);
  const stamp = Number.isNaN(date.getTime())
    ? '0000'
    : `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  return `SHN-${stamp}-${tip.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

const BASE_STYLES = `
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @page { size: A4; margin: 16mm 13mm; }
  body {
    margin: 0;
    color: #16161a;
    background: #ffffff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-size: 11px;
    line-height: 1.45;
  }
  .brand { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 2px solid #E53935; padding-bottom: 12px; }
  .brand-left { display: flex; align-items: center; gap: 10px; }
  .mark {
    width: 34px; height: 34px; border-radius: 10px; background: #E53935; color: #fff;
    display: flex; align-items: center; justify-content: center; font-size: 19px; font-weight: 700;
  }
  .brand-title { font-size: 17px; font-weight: 800; letter-spacing: -0.2px; }
  .brand-sub { font-size: 9.5px; color: #6c6c75; }
  .brand-meta { text-align: right; font-size: 9.5px; color: #6c6c75; }
  h1 { font-size: 20px; margin: 22px 0 4px; letter-spacing: -0.3px; }
  .lede { font-size: 11px; color: #55555f; margin: 0 0 18px; }
  .summary { display: flex; gap: 10px; margin: 0 0 20px; }
  .summary .cell {
    flex: 1; border: 1px solid #e4e4ea; border-radius: 8px; padding: 10px 12px; background: #fafafb;
  }
  .summary .label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.6px; color: #7a7a85; }
  .summary .value { font-size: 15px; font-weight: 700; margin-top: 3px; }
  .summary .value.accent { color: #E53935; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  thead { display: table-header-group; }
  th {
    text-align: left; font-size: 8.5px; letter-spacing: 0.5px; text-transform: uppercase;
    color: #6c6c75; border-bottom: 1px solid #d8d8e0; padding: 7px 6px;
  }
  td { border-bottom: 1px solid #ededf2; padding: 8px 6px; vertical-align: top; font-size: 10.5px; }
  tr { page-break-inside: avoid; }
  td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .sub { color: #7a7a85; font-size: 9px; margin-top: 2px; }
  .pill {
    display: inline-block; border-radius: 99px; padding: 2px 7px; font-size: 8.5px;
    font-weight: 700; border: 1px solid transparent; white-space: nowrap;
  }
  .pill.ok { color: #1b7f3b; background: #eaf7ef; border-color: #bfe6cb; }
  .pill.wait { color: #946200; background: #fff6e1; border-color: #f0dcae; }
  .pill.bad { color: #b3261e; background: #fdeceb; border-color: #f5c6c2; }
  .pill.muted { color: #5f5f6b; background: #f0f0f4; border-color: #dcdce4; }
  .empty { border: 1px dashed #d8d8e0; border-radius: 8px; padding: 18px; text-align: center; color: #7a7a85; }
  .receipt { border: 1px solid #e4e4ea; border-radius: 10px; padding: 16px 18px; margin-top: 18px; }
  .receipt-row { display: flex; justify-content: space-between; gap: 14px; padding: 7px 0; border-bottom: 1px solid #f0f0f4; }
  .receipt-row:last-child { border-bottom: none; }
  .receipt-row .k { color: #6c6c75; font-size: 10px; }
  .receipt-row .v { font-size: 10.5px; font-weight: 600; text-align: right; }
  .receipt-total { background: #fafafb; border-radius: 8px; padding: 12px 14px; margin-top: 14px; display: flex; justify-content: space-between; align-items: center; }
  .receipt-total .big { font-size: 18px; font-weight: 800; color: #E53935; }
  .foot {
    margin-top: 22px; padding-top: 10px; border-top: 1px solid #e4e4ea;
    font-size: 8.5px; color: #8a8a94; line-height: 1.5;
  }
`;

function pageShell(title: string, body: string, generatedAt: string): string {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>${BASE_STYLES}</style>
</head>
<body>
  <div class="brand">
    <div class="brand-left">
      <div class="mark">S</div>
      <div>
        <div class="brand-title">Sahne</div>
        <div class="brand-sub">Uzun videolar ve içerik üreticisi destekleri</div>
      </div>
    </div>
    <div class="brand-meta">
      Belge tarihi<br />
      <strong>${escapeHtml(generatedAt)}</strong>
    </div>
  </div>
  ${body}
  <div class="foot">
    Bu belge Sahne üzerinden gerçekleşen gönüllü bahşiş hareketlerinin bilgilendirme dökümüdür;
    resmi mali belge veya fatura yerine geçmez. Tutarlar Stripe üzerinden işlenir.
    Sahne — vora.app
  </div>
</body>
</html>`;
}

export function buildVvTipReportHtml(input: VvTipReportInput): string {
  const generatedAt = vvFormatDateTime(new Date().toISOString());
  const isReceived = input.role === 'received';
  const title = isReceived ? 'Aldığım Bahşişler' : 'Gönderdiğim Bahşişler';
  const totalMinor = isReceived ? input.summary.creator_net_minor : input.summary.gross_minor;
  const totalLabel = isReceived ? 'Net kazanç' : 'Toplam ödenen';

  const rowsHtml = input.rows.length === 0
    ? '<tr><td colspan="5"><div class="empty">Bu dönemde bahşiş kaydı bulunmuyor.</div></td></tr>'
    : input.rows
      .map((tip) => {
        const subtitle = tip.video_title
          ? escapeHtml(tip.video_title)
          : '<span class="sub">Video bağlantısı kaldırıldı</span>';
        const amount = isReceived
          ? vvFormatMoney(tip.creator_net_minor, tip.currency)
          : vvFormatMoney(tip.gross_minor, tip.currency);
        return `<tr>
          <td>${escapeHtml(vvFormatDate(tip.created_at))}<div class="sub">${escapeHtml(receiptNo(tip))}</div></td>
          <td>${escapeHtml(counterpartName(tip, input.role))}</td>
          <td>${subtitle}${tip.message ? `<div class="sub">“${escapeHtml(tip.message.slice(0, 120))}”</div>` : ''}</td>
          <td class="num">${escapeHtml(amount)}</td>
          <td class="num"><span class="pill ${statusClass(tip.status)}">${escapeHtml(statusLabel(tip.status))}</span></td>
        </tr>`;
      })
      .join('');

  const body = `
    <h1>${escapeHtml(title)}</h1>
    <p class="lede">${escapeHtml(input.ownerName)} · ${escapeHtml(
      isReceived
        ? 'İzleyicilerden gelen destekler'
        : 'İçerik üreticilerine gönderdiğin destekler',
    )}</p>
    <div class="summary">
      <div class="cell">
        <div class="label">${escapeHtml(totalLabel)}</div>
        <div class="value accent">${escapeHtml(vvFormatMoney(totalMinor, input.summary.currency))}</div>
      </div>
      <div class="cell">
        <div class="label">Tamamlanan bahşiş</div>
        <div class="value">${input.summary.succeeded_count}</div>
      </div>
      <div class="cell">
        <div class="label">Bekleyen</div>
        <div class="value">${input.summary.pending_count}</div>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th style="width: 22%">Tarih</th>
          <th style="width: 22%">${isReceived ? 'Gönderen' : 'İçerik üreticisi'}</th>
          <th>${isReceived ? 'Video / mesaj' : 'Video / not'}</th>
          <th style="width: 15%; text-align: right">Tutar</th>
          <th style="width: 16%; text-align: right">Durum</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;

  return pageShell(`Sahne — ${title}`, body, generatedAt);
}

export function buildVvTipReceiptHtml(tip: VvTipHistoryRow, role: VvTipDirection): string {
  const generatedAt = vvFormatDateTime(new Date().toISOString());
  const isReceived = role === 'received';
  const sender = tip.anonymous ? 'Anonim destekçi' : cleanName(tip.sender_full_name ?? tip.sender_username, 'İzleyici');
  const creator = cleanName(tip.creator_full_name ?? tip.creator_username, 'İçerik üreticisi');
  const amountMinor = isReceived ? tip.creator_net_minor : tip.gross_minor;

  const body = `
    <h1>Bahşiş Makbuzu</h1>
    <p class="lede">Makbuz No: <strong>${escapeHtml(receiptNo(tip))}</strong></p>
    <div class="receipt">
      <div class="receipt-row"><span class="k">Tarih</span><span class="v">${escapeHtml(vvFormatDateTime(tip.created_at))}</span></div>
      <div class="receipt-row"><span class="k">Gönderen</span><span class="v">${escapeHtml(sender)}</span></div>
      <div class="receipt-row"><span class="k">İçerik üreticisi</span><span class="v">${escapeHtml(creator)}</span></div>
      <div class="receipt-row"><span class="k">Video</span><span class="v">${escapeHtml(tip.video_title ?? 'Profil üzerinden destek')}</span></div>
      <div class="receipt-row"><span class="k">Durum</span><span class="v"><span class="pill ${statusClass(tip.status)}">${escapeHtml(statusLabel(tip.status))}</span></span></div>
      ${tip.message ? `<div class="receipt-row"><span class="k">Mesaj</span><span class="v">“${escapeHtml(tip.message)}”</span></div>` : ''}
      <div class="receipt-row"><span class="k">Brüt tutar</span><span class="v">${escapeHtml(vvFormatMoney(tip.gross_minor, tip.currency))}</span></div>
      <div class="receipt-row"><span class="k">Platform komisyonu</span><span class="v">${escapeHtml(vvFormatMoney(tip.commission_minor, tip.currency))}</span></div>
      <div class="receipt-row"><span class="k">İçerik üreticisi payı</span><span class="v">${escapeHtml(vvFormatMoney(tip.creator_net_minor, tip.currency))}</span></div>
      <div class="receipt-total">
        <span class="k">${isReceived ? 'Bu bahşişten net kazancın' : 'Bu bahşiş için ödediğin'}</span>
        <span class="big">${escapeHtml(vvFormatMoney(amountMinor, tip.currency))}</span>
      </div>
    </div>
  `;

  return pageShell('Sahne — Bahşiş Makbuzu', body, generatedAt);
}

async function moveToNamedFile(sourceUri: string, filename: string): Promise<string> {
  const root = FileSystem.cacheDirectory;
  if (!root) return sourceUri;
  const dir = `${root}sahne-pdf`;
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    // klasör zaten var
  }
  const dest = `${dir}/${filename}`;
  try {
    await FileSystem.deleteAsync(dest, { idempotent: true });
    await FileSystem.moveAsync({ from: sourceUri, to: dest });
    return dest;
  } catch {
    return sourceUri;
  }
}

async function renderPdf(html: string, filename: string): Promise<VvPdfArtifact> {
  if (Platform.OS === 'web') {
    // Web'de dosya sistemi yok: yazdırma penceresi "PDF olarak kaydet" sunar.
    return { uri: null, filename, html, error: null };
  }
  try {
    const result = await Print.printToFileAsync({ html, base64: false });
    const uri = await moveToNamedFile(result.uri, filename);
    return { uri, filename, html, error: null };
  } catch (error) {
    console.error('tip pdf render failed:', error);
    return {
      uri: null,
      filename,
      html,
      error: 'PDF oluşturulamadı. Lütfen tekrar dene.',
    };
  }
}

export async function createVvTipReportPdf(input: VvTipReportInput): Promise<VvPdfArtifact> {
  const filename = fileStem(
    input.role === 'received' ? 'Sahne-Aldigim-Bahsisler' : 'Sahne-Gonderdigim-Bahsisler',
  ) + `-${new Date().toISOString().slice(0, 10)}.pdf`;
  return renderPdf(buildVvTipReportHtml(input), filename);
}

export async function createVvTipReceiptPdf(
  tip: VvTipHistoryRow,
  role: VvTipDirection,
): Promise<VvPdfArtifact> {
  const filename = `${fileStem(`Sahne-Bahsis-Makbuzu-${receiptNo(tip)}`)}.pdf`;
  return renderPdf(buildVvTipReceiptHtml(tip, role), filename);
}

function isShareCancel(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /cancel|dismiss|did not share|user did not|abort/i.test(message);
}

export function vvTipReportWhatsAppText(input: VvTipReportInput): string {
  const isReceived = input.role === 'received';
  const total = vvFormatMoney(
    isReceived ? input.summary.creator_net_minor : input.summary.gross_minor,
    input.summary.currency,
  );
  return [
    `Sahne — ${isReceived ? 'aldığım bahşişler' : 'gönderdiğim bahşişler'}`,
    `Toplam: ${total} · ${input.summary.succeeded_count} bahşiş`,
    'Detaylı döküm PDF olarak ekte.',
  ].join('\n');
}

export function vvTipReceiptWhatsAppText(tip: VvTipHistoryRow, role: VvTipDirection): string {
  const isReceived = role === 'received';
  return [
    `Sahne bahşiş makbuzu`,
    `Makbuz: ${receiptNo(tip)}`,
    `Gönderen: ${tip.anonymous ? 'Anonim destekçi' : cleanName(tip.sender_full_name ?? tip.sender_username, 'İzleyici')}`,
    `İçerik üreticisi: ${cleanName(tip.creator_full_name ?? tip.creator_username, 'İçerik üreticisi')}`,
    `Tutar: ${vvFormatMoney(isReceived ? tip.creator_net_minor : tip.gross_minor, tip.currency)}`,
    'PDF ekte.',
  ].join('\n');
}

/** PDF'yi WhatsApp dahil sistem paylaşım sayfasıyla gönderir. */
export async function shareVvPdfOnWhatsApp(
  artifact: VvPdfArtifact,
  fallbackText: string,
): Promise<{ error: string | null }> {
  if (Platform.OS === 'web' || !artifact.uri) {
    try {
      await openUrl(`https://wa.me/?text=${encodeURIComponent(fallbackText)}`);
      return { error: null };
    } catch {
      return { error: 'WhatsApp açılamadı.' };
    }
  }

  try {
    const Sharing = await import('expo-sharing');
    if (!(await Sharing.isAvailableAsync())) {
      return { error: 'Paylaşım bu cihazda açılamadı.' };
    }
    await Sharing.shareAsync(artifact.uri, {
      mimeType: PDF_MIME,
      UTI: PDF_UTI,
      dialogTitle: 'WhatsApp ile paylaş',
    });
    return { error: null };
  } catch (error) {
    if (isShareCancel(error)) return { error: null };
    return { error: 'PDF paylaşılamadı. Lütfen tekrar dene.' };
  }
}

/** PDF'yi cihaza indirir; Android'de klasör seçtirir, iOS'ta Dosyalar sayfasını açar. */
export async function downloadVvPdf(artifact: VvPdfArtifact): Promise<{
  error: string | null;
  savedTo: 'folder' | 'sheet' | 'web' | null;
}> {
  if (Platform.OS === 'web') {
    try {
      await Print.printAsync({ html: artifact.html });
      return { error: null, savedTo: 'web' };
    } catch {
      return { error: 'PDF indirilemedi.', savedTo: null };
    }
  }

  if (!artifact.uri) {
    return { error: artifact.error ?? 'PDF oluşturulamadı.', savedTo: null };
  }

  if (Platform.OS === 'android') {
    try {
      const permission =
        await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (permission.granted) {
        const base64 = await FileSystem.readAsStringAsync(artifact.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const destination = await FileSystem.StorageAccessFramework.createFileAsync(
          permission.directoryUri,
          artifact.filename,
          PDF_MIME,
        );
        await FileSystem.writeAsStringAsync(destination, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return { error: null, savedTo: 'folder' };
      }
    } catch (error) {
      console.error('tip pdf saf save failed:', error);
    }
  }

  try {
    const Sharing = await import('expo-sharing');
    if (!(await Sharing.isAvailableAsync())) {
      return { error: 'PDF kaydedilemedi.', savedTo: null };
    }
    await Sharing.shareAsync(artifact.uri, {
      mimeType: PDF_MIME,
      UTI: PDF_UTI,
      dialogTitle: 'PDF olarak kaydet',
    });
    return { error: null, savedTo: 'sheet' };
  } catch (error) {
    if (isShareCancel(error)) return { error: null, savedTo: null };
    return { error: 'PDF kaydedilemedi.', savedTo: null };
  }
}
