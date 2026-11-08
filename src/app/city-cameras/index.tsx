import { FeatureDisabledScreen } from '@/components/ui/FeatureDisabledScreen';

export default function CityCamerasRoute() {
  return (
    <FeatureDisabledScreen
      title="Sehir kameralari devre disi"
      description="Performans nedeni ile sehir kameralari ozelligi gecici olarak kapatildi."
    />
  );
}
