import { FeatureDisabledScreen } from '@/components/ui/FeatureDisabledScreen';

export default function AdminCityCamerasIncidentsRoute() {
  return (
    <FeatureDisabledScreen
      title="Sehir kameralari yonetimi devre disi"
      description="Kamera olaylari ekrani gecici olarak kapatildi."
    />
  );
}
