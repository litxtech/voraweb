import { FeatureDisabledScreen } from '@/components/ui/FeatureDisabledScreen';

export default function CityCameraWatchRoute() {
  return (
    <FeatureDisabledScreen
      title="Sehir kameralari devre disi"
      description="Canli kamera izleme performans nedeni ile gecici olarak kapatildi."
    />
  );
}
