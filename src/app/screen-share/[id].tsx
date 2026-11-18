import { Redirect, useLocalSearchParams, type Href } from 'expo-router';
import { ScreenShareSessionScreen } from '@/features/screen-share/components/ScreenShareSessionScreen';

export default function ScreenShareSessionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id || typeof id !== 'string') {
    return <Redirect href={'/screen-share' as Href} />;
  }
  return <ScreenShareSessionScreen sessionId={id} />;
}
