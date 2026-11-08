import { FeatureDisabledScreen } from '@/components/ui/FeatureDisabledScreen';

export default function EarthquakeRoute() {
  return (
    <FeatureDisabledScreen
      title="Deprem ozelligi devre disi"
      description="Performans nedeni ile deprem modulu gecici olarak kapatildi."
    />
  );
}
