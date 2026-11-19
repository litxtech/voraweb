import { Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  buildScreenShareAndroidIntentUrl,
  buildScreenShareDeepLink,
  buildScreenSharePublicUrl,
} from '@/lib/sharing/constants';

type ShareInput = {
  sessionId: string;
  title: string;
  joinCode: string;
  hasPassword?: boolean;
  isHidden?: boolean;
};

export function buildScreenShareShareMessage(input: ShareInput): string {
  const url = buildScreenSharePublicUrl(input.sessionId, input.joinCode);
  const flags = [
    input.isHidden ? 'Gizli oda · listede görünmez' : null,
    input.hasPassword ? 'Şifreli oda' : null,
  ].filter(Boolean);
  const flagLine = flags.length ? `\n${flags.join(' · ')}` : '';
  return [
    `${input.title}`,
    'Vora sesli odaya katıl — linke dokun:',
    url,
    '',
    `Kod: ${input.joinCode}${flagLine}`,
  ].join('\n');
}

export function buildScreenShareSharePayload(input: ShareInput) {
  const publicUrl = buildScreenSharePublicUrl(input.sessionId, input.joinCode);
  const deepLink = buildScreenShareDeepLink(input.sessionId, input.joinCode);
  return {
    message: buildScreenShareShareMessage(input),
    publicUrl,
    deepLink,
    title: input.title,
  };
}

/** Link paylaşır; tıklanınca oda açılır (şifre varsa giriş sheet’i). */
export async function shareScreenShareInvite(input: ShareInput): Promise<void> {
  const { message, deepLink, publicUrl, title } = buildScreenShareSharePayload(input);
  await Clipboard.setStringAsync(publicUrl).catch(() => undefined);

  if (Platform.OS === 'ios') {
    await Share.share({ message, url: deepLink, title });
    return;
  }

  const androidUrl = buildScreenShareAndroidIntentUrl(input.sessionId, publicUrl, input.joinCode);
  try {
    await Share.share({ message, url: androidUrl, title });
  } catch {
    await Share.share({ message, url: deepLink, title });
  }
}
