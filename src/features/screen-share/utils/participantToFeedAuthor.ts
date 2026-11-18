import type { FeedAuthor } from '@/features/feed/types';
import type { ScreenShareParticipant } from '@/features/screen-share/types';
import type { PublicProfile } from '@/features/profile/types';

export function screenShareParticipantToFeedAuthor(
  participant: ScreenShareParticipant,
  profile?: PublicProfile | null,
): FeedAuthor {
  return {
    id: participant.userId,
    username: profile?.username ?? participant.username,
    fullName: profile?.fullName ?? profile?.displayName ?? participant.fullName,
    avatarUrl: profile?.avatarUrl ?? participant.avatarUrl,
    role: profile?.role ?? 'user',
    isVerified: profile?.isVerified ?? false,
    isBusinessVerified: profile?.isBusinessVerified,
    businessId: profile?.businessId ?? null,
    accountType: profile?.accountType ?? 'personal',
    isPlatformCharm: profile?.isPlatformCharm ?? false,
    isPioneer: profile?.isPioneer ?? false,
    isPlatformSupporter: profile?.isPlatformSupporter ?? false,
    gender: profile?.gender ?? null,
    accountStatus: profile?.accountStatus ?? 'active',
    hiddenBadges: profile?.hiddenBadges,
  };
}
