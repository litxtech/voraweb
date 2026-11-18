import type { FeedAuthor, FeedItem } from '@/features/feed/types';
import {
  listFeedScreenSharePromos,
  type ScreenShareFeedPromo,
} from '@/features/screen-share/services/screenShareSessionService';

const FIRST_AFTER = 3;
const EVERY = 7;
const MAX_PER_PAGE = 2;

const PROMO_LINES = [
  'Bu odada derin sohbet var — katıl, dinle, katıl.',
  'Canlı pencere açık: sessizce girip sohbete tutunabilirsin.',
  'İnsanlar burada konuşuyor. Bir bak, etkileşim yakala.',
  'Şifresiz canlı oda — kısa bir selam bile yeter.',
];

function promoToFeedItem(promo: ScreenShareFeedPromo, index: number): FeedItem {
  const author: FeedAuthor = {
    id: promo.hostUserId,
    username: promo.hostUsername ?? 'oda',
    fullName: promo.hostUsername,
    avatarUrl: promo.hostAvatarUrl,
    role: 'user',
    isVerified: false,
  };

  return {
    id: `screen-share-promo-${promo.id}`,
    sourceType: 'screen_share',
    sourceId: promo.id,
    author,
    title: promo.title,
    content: PROMO_LINES[index % PROMO_LINES.length]!,
    mediaUrls: promo.coverImageUrl ? [promo.coverImageUrl] : [],
    category: 'all',
    regionId: '',
    district: null,
    locationLabel: null,
    latitude: null,
    longitude: null,
    likeCount: 0,
    commentCount: 0,
    quoteCount: 0,
    saveCount: 0,
    viewCount: promo.participantCount,
    createdAt: promo.createdAt,
    isLiked: false,
    isSaved: false,
    isFollowing: false,
    quotedPost: null,
    screenShareJoinCode: promo.joinCode,
    screenShareParticipantCount: promo.participantCount,
  };
}

/** Şifresiz canlı odaları akışa ara sıra serpiştirir. */
export async function injectFeedScreenSharePromos(items: FeedItem[]): Promise<FeedItem[]> {
  if (items.length === 0) return items;
  if (items.some((item) => item.sourceType === 'screen_share')) return items;

  let promos: ScreenShareFeedPromo[] = [];
  try {
    promos = await listFeedScreenSharePromos(MAX_PER_PAGE + 1);
  } catch {
    return items;
  }
  if (promos.length === 0) return items;

  const result = [...items];
  let inserted = 0;
  let cursor = Math.min(FIRST_AFTER, result.length);

  while (inserted < MAX_PER_PAGE && inserted < promos.length && cursor <= result.length) {
    const promo = promos[inserted]!;
    result.splice(cursor, 0, promoToFeedItem(promo, inserted));
    inserted += 1;
    cursor += EVERY + 1;
  }

  return result;
}
