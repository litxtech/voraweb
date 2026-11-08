import { FeatureDisabledScreen } from '@/components/ui/FeatureDisabledScreen';

export default function AdminEarthquakesRoute() {
  return (
    <FeatureDisabledScreen
      title="Deprem yonetimi devre disi"
      description="API trafigini azaltmak icin deprem yonetimi gecici olarak kapatildi."
    />
  );
}
