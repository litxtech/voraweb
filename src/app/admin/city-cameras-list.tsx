import { FeatureDisabledScreen } from '@/components/ui/FeatureDisabledScreen';

export default function AdminCityCamerasListRoute() {
  return (
    <FeatureDisabledScreen
      title="Sehir kameralari yonetimi devre disi"
      description="Kamera listesi ekrani gecici olarak kapatildi."
    />
  );
}
