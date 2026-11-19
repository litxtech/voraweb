import { Redirect, useLocalSearchParams, type Href } from 'expo-router';
import { ScreenShareSessionScreen } from '@/features/screen-share/components/ScreenShareSessionScreen';

function paramString(value?: string | string[]): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default function ScreenShareSessionRoute() {
  const params = useLocalSearchParams<{ id?: string | string[]; c?: string | string[]; code?: string | string[] }>();
  const id = paramString(params.id);
  const rawCode = paramString(params.c) ?? paramString(params.code);
  const joinCode = rawCode?.replace(/\D/g, '');

  if (!id) {
    return <Redirect href={'/screen-share' as Href} />;
  }

  return (
    <ScreenShareSessionScreen
      sessionId={id}
      inviteJoinCode={joinCode && joinCode.length === 6 ? joinCode : undefined}
    />
  );
}
