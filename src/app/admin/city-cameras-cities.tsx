import { FeatureDisabledScreen } from '@/components/ui/FeatureDisabledScreen';

export default function AdminCityCamerasCitiesRoute() {
  return (
    <FeatureDisabledScreen
      title="Sehir kameralari yonetimi devre disi"
      description="Kamera sehir/ilce ayarlari gecici olarak kapatildi."
    />
  );
}
