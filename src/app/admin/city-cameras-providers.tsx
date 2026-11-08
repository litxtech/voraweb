import { FeatureDisabledScreen } from '@/components/ui/FeatureDisabledScreen';

export default function AdminCityCamerasProvidersRoute() {
  return (
    <FeatureDisabledScreen
      title="Sehir kameralari yonetimi devre disi"
      description="Saglayici ve senkronizasyon ayarlari gecici olarak kapatildi."
    />
  );
}
