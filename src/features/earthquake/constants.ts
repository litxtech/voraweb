export const EARTHQUAKE_TITLE = '🌍 Vora Deprem';
export const EARTHQUAKE_SUBTITLE = "Turkiye'deki son depremleri takip et.";

export const EARTHQUAKE_DISCLAIMER =
  "Vora Deprem, resmi kaynaklardan yayimlanan deprem verilerini bilgilendirme amaciyla sunar. Deprem tahmini veya resmi erken uyari hizmeti degildir. Veriler ve bildirimler gecikebilir.";

export const EARTHQUAKE_MAGNITUDE_OPTIONS = [
  { label: 'Tum depremler', value: 0 },
  { label: '2.0 ve uzeri', value: 2 },
  { label: '3.0 ve uzeri', value: 3 },
  { label: '4.0 ve uzeri', value: 4 },
  { label: '5.0 ve uzeri', value: 5 },
] as const;

export const EARTHQUAKE_TIME_FILTERS = [
  { id: '24h', label: '24 Saat' },
  { id: '7d', label: '7 Gun' },
  { id: '30d', label: '30 Gun' },
  { id: '90d', label: '90 Gun' },
  { id: '1y', label: '1 Yil' },
  { id: 'year', label: 'Belirli Yil' },
  { id: 'custom', label: 'Ozel Tarih' },
] as const;

export const EARTHQUAKE_NOTIFICATION_SCOPES = [
  { id: 'selected_cities', label: 'Sectigim Sehirler' },
  { id: 'all_turkey', label: 'Tum Turkiye' },
  { id: 'disabled', label: 'Bildirimleri Kapat' },
] as const;

export function magnitudeColor(magnitude: number): string {
  if (magnitude < 3) return '#16A34A';
  if (magnitude < 4) return '#EAB308';
  if (magnitude < 5) return '#F97316';
  if (magnitude < 6) return '#DC2626';
  return '#7F1D1D';
}
