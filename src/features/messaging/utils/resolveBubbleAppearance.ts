import {
  chatBubbleById,
  contrastTextForHex,
} from '@/features/messaging/constants/chatBubbleColors';
import type { ChatTheme } from '../theme/chatTheme';

export type BubbleSide = 'own' | 'other';

/** Seçilen baloncuk id → tema override alanları */
export function resolveBubbleAppearance(
  bubbleId: string | null | undefined,
  side: BubbleSide,
  base: ChatTheme,
  fallbackText: string,
  fallbackMeta: string,
): Pick<
  ChatTheme,
  'incomingBubble' | 'outgoingBubble' | 'incomingText' | 'outgoingText' | 'metaIncoming' | 'metaOutgoing'
> {
  const color = chatBubbleById(bubbleId);
  const isOwn = side === 'own';

  if (color.id === 'default' || !color.hex) {
    return {
      incomingBubble: base.incomingBubble,
      outgoingBubble: base.outgoingBubble,
      incomingText: base.incomingText,
      outgoingText: base.outgoingText,
      metaIncoming: base.metaIncoming,
      metaOutgoing: base.metaOutgoing,
    };
  }

  if (color.id === 'transparent' || color.hex === 'transparent') {
    if (isOwn) {
      return {
        incomingBubble: base.incomingBubble,
        outgoingBubble: 'transparent',
        incomingText: base.incomingText,
        outgoingText: fallbackText,
        metaIncoming: base.metaIncoming,
        metaOutgoing: fallbackMeta,
      };
    }
    return {
      incomingBubble: 'transparent',
      outgoingBubble: base.outgoingBubble,
      incomingText: fallbackText,
      outgoingText: base.outgoingText,
      metaIncoming: fallbackMeta,
      metaOutgoing: base.metaOutgoing,
    };
  }

  const contrast = contrastTextForHex(color.hex);
  if (isOwn) {
    return {
      incomingBubble: base.incomingBubble,
      outgoingBubble: color.hex,
      incomingText: base.incomingText,
      outgoingText: contrast.text,
      metaIncoming: base.metaIncoming,
      metaOutgoing: contrast.meta,
    };
  }
  return {
    incomingBubble: color.hex,
    outgoingBubble: base.outgoingBubble,
    incomingText: contrast.text,
    outgoingText: base.outgoingText,
    metaIncoming: contrast.meta,
    metaOutgoing: base.metaOutgoing,
  };
}

export function mergeBubbleOverrides(
  base: ChatTheme,
  ownBubbleId: string,
  otherBubbleId: string,
  fallbackText: string,
  fallbackMeta: string,
): ChatTheme {
  const own = resolveBubbleAppearance(ownBubbleId, 'own', base, fallbackText, fallbackMeta);
  const other = resolveBubbleAppearance(otherBubbleId, 'other', base, fallbackText, fallbackMeta);
  return {
    ...base,
    outgoingBubble: own.outgoingBubble,
    outgoingText: own.outgoingText,
    metaOutgoing: own.metaOutgoing,
    incomingBubble: other.incomingBubble,
    incomingText: other.incomingText,
    metaIncoming: other.metaIncoming,
  };
}
