import { FeatureDisabledScreen } from '@/components/ui/FeatureDisabledScreen';

export default function AdminCityCamerasRoute() {
  return (
    <FeatureDisabledScreen
      title="Sehir kameralari yonetimi devre disi"
      description="API trafigini azaltmak icin sehir kameralari modulu gecici olarak kapatildi."
    />
  );
}
