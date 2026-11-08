import { FeatureDisabledScreen } from '@/components/ui/FeatureDisabledScreen';

export default function AdminCityCamerasDiscoveryRoute() {
  return (
    <FeatureDisabledScreen
      title="Sehir kameralari yonetimi devre disi"
      description="Kamera kesif ekrani gecici olarak kapatildi."
    />
  );
}
