/**
 * V9.1 — GUMZO GROUP FOUNDATION DATA MODELS & TYPES
 *
 * Admin-led livestock community-group platform for Ufugaji Update.
 * Model: Group -> Admins -> Members
 *
 * Strictly separates:
 * 1. Community Groups (Gumzo)
 * 2. Commercial Marketplace (Shops/Products/Listings)
 * 3. 1-on-1 Marketplace Inbox (Direct buyer-seller messaging)
 * 4. Clinical Daktari / AI Advisory
 */

export type GumzoGroupStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'ARCHIVED'
  | 'REJECTED';

export type GumzoGroupVisibility = 'PUBLIC' | 'PRIVATE';

export type GumzoGroupRole =
  | 'FOUNDER_ADMIN'
  | 'LEADERSHIP_ADMIN'
  | 'MEMBER';

export type GumzoMembershipStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'REMOVED'
  | 'LEFT';

export interface GumzoCategoryDefinition {
  categoryId: string;
  nameSwahili: string;
  livestockType: string;
  description: string;
  iconName?: string;
}

export const GUMZO_CATEGORIES: GumzoCategoryDefinition[] = [
  {
    categoryId: 'ngombe',
    nameSwahili: "Ng'ombe wa Maziwa & Nyama",
    livestockType: 'CATTLE',
    description: "Mijadala ya ufugaji wa ng'ombe wa kisasa na kienyeji, afya ya mifugo, na uzalishaji wa maziwa/nyama.",
  },
  {
    categoryId: 'kuku',
    nameSwahili: 'Kuku (Kienyeji, Chotara & Broiler)',
    livestockType: 'POULTRY',
    description: 'Mbinu za malezi ya vifaranga, utagaji bora wa mayai, magonjwa ya kuku na ujenzi wa mabanda.',
  },
  {
    categoryId: 'mbuzi_kondoo',
    nameSwahili: 'Mbuzi na Kondoo',
    livestockType: 'GOAT_SHEEP',
    description: 'Ufugaji wa mbuzi wa maziwa (Saanen, Toggenburg), mbuzi wa nyama (Boer), na kondoo.',
  },
  {
    categoryId: 'nguruwe',
    nameSwahili: 'Ufugaji wa Nguruwe',
    livestockType: 'PIG',
    description: 'Malezi ya nguruwe, ulishaji wenye tija, uzazi, na usafi wa mabanda.',
  },
  {
    categoryId: 'samaki',
    nameSwahili: 'Ufugaji wa Samaki (Aquaculture)',
    livestockType: 'FISH',
    description: 'Uchimbaji mabwawa, ubora wa maji, aina za samaki kama Perege na Kambale, na lishe ya samaki.',
  },
  {
    categoryId: 'nyuki',
    nameSwahili: 'Ufugaji wa Nyuki na Asali',
    livestockType: 'BEE',
    description: 'Uwekaji mizinga, utunzaji wa nyuki, uvunaji salama, na usindikaji wa asali na nta.',
  },
  {
    categoryId: 'sungura',
    nameSwahili: 'Ufugaji wa Sungura',
    livestockType: 'RABBIT',
    description: 'Ufugaji wa sungura wa nyama na mbolea, lishe ya majani, na huduma ya uzazi.',
  },
  {
    categoryId: 'ufugaji_wa_kisasa',
    nameSwahili: 'Teknolojia & Lishe ya Kisasa',
    livestockType: 'GENERAL_INNOVATION',
    description: 'Mbinu bunifu, uandaaji wa silaji na heyi, mashine za kukata majani, na usimamizi wa kisasa wa shamba.',
  },
  {
    categoryId: 'jamii_ya_mkoa',
    nameSwahili: 'Vikundi vya Kijamii vya Mikoa',
    livestockType: 'REGIONAL_COMMUNITY',
    description: 'Mitandao ya wafugaji wa maeneo mahususi (Arusha, Mbeya, Dodoma, Kilimanjaro, Morogoro n.k.).',
  },
];

export interface GumzoGroup {
  groupId: string;
  name: string;
  description: string;
  categoryId: string;
  livestockType: string;
  coverImageUrl?: string;
  status: GumzoGroupStatus;
  visibility: GumzoGroupVisibility;
  founderAdminUserId: string;
  leadershipAdminUserId?: string;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface GumzoMembership {
  membershipId: string; // Deterministic: `${groupId}_${userId}`
  groupId: string;
  userId: string;
  role: GumzoGroupRole;
  status: GumzoMembershipStatus;
  joinedAt: string;
  updatedAt: string;
  invitedBy?: string;
  approvedBy?: string;
}

export interface CreateGumzoGroupInput {
  name: string;
  description: string;
  categoryId: string;
  livestockType?: string;
  coverImageUrl?: string;
  visibility: GumzoGroupVisibility;
}

export interface GumzoGroupAccessDecision {
  canAccess: boolean;
  canViewContent: boolean;
  canJoin: boolean;
  membership?: GumzoMembership | null;
  role?: GumzoGroupRole | null;
  reason?: string;
}

/**
 * Server-authoritative role verification helpers
 */
export function isGroupFounderAdmin(userId: string, group: GumzoGroup): boolean {
  if (!userId || !group) return false;
  return group.founderAdminUserId === userId;
}

export function isGroupLeadershipAdmin(userId: string, group: GumzoGroup): boolean {
  if (!userId || !group) return false;
  return Boolean(group.leadershipAdminUserId && group.leadershipAdminUserId === userId);
}

export function isGroupAdmin(userId: string, group: GumzoGroup): boolean {
  return isGroupFounderAdmin(userId, group) || isGroupLeadershipAdmin(userId, group);
}

export function isGroupMember(
  userId: string,
  group: GumzoGroup,
  membership?: GumzoMembership | null
): boolean {
  if (!userId || !group) return false;
  if (isGroupAdmin(userId, group)) return true;
  return Boolean(
    membership &&
    membership.userId === userId &&
    membership.groupId === group.groupId &&
    membership.status === 'ACTIVE'
  );
}

export function canAccessGumzoGroup(
  userId: string | null | undefined,
  group: GumzoGroup,
  membership?: GumzoMembership | null,
  isPlatformAdmin = false
): GumzoGroupAccessDecision {
  if (!group) {
    return { canAccess: false, canViewContent: false, canJoin: false, reason: 'Kikundi hakipo.' };
  }

  if (isPlatformAdmin) {
    return { canAccess: true, canViewContent: true, canJoin: false, role: 'LEADERSHIP_ADMIN' };
  }

  // Suspended or Rejected groups are blocked for normal users
  if (group.status === 'SUSPENDED') {
    const isFounder = Boolean(userId && isGroupFounderAdmin(userId, group));
    return {
      canAccess: isFounder,
      canViewContent: false,
      canJoin: false,
      reason: 'Kikundi hiki kimesimamishwa kwa muda na uongozi wa jukwaa.',
    };
  }

  if (group.status === 'REJECTED') {
    const isFounder = Boolean(userId && isGroupFounderAdmin(userId, group));
    return {
      canAccess: isFounder,
      canViewContent: false,
      canJoin: false,
      reason: 'Ombi la kuanzisha kikundi hiki halikukubaliwa.',
    };
  }

  if (group.status === 'DRAFT' || group.status === 'PENDING_APPROVAL') {
    const isFounder = Boolean(userId && isGroupFounderAdmin(userId, group));
    return {
      canAccess: isFounder,
      canViewContent: isFounder,
      canJoin: false,
      role: isFounder ? 'FOUNDER_ADMIN' : null,
      reason: isFounder
        ? 'Kikundi kiko kwenye maandalizi au kinasubiri idhini ya uongozi.'
        : 'Kikundi hakijaidhinishwa bado.',
    };
  }

  // ARCHIVED groups are read-only
  if (group.status === 'ARCHIVED') {
    const isMember = Boolean(userId && membership && membership.status === 'ACTIVE');
    return {
      canAccess: group.visibility === 'PUBLIC' || isMember,
      canViewContent: isMember,
      canJoin: false,
      reason: 'Kikundi kimewekwa kwenye kumbukumbu (Archived).',
    };
  }

  // ACTIVE groups
  if (!userId) {
    return {
      canAccess: group.visibility === 'PUBLIC',
      canViewContent: false,
      canJoin: false,
      reason: group.visibility === 'PUBLIC' ? undefined : 'Hujaingia kwenye mfumo na kikundi ni cha faragha.',
    };
  }

  // Check specific membership status
  if (membership) {
    if (membership.status === 'SUSPENDED') {
      return {
        canAccess: false,
        canViewContent: false,
        canJoin: false,
        membership,
        reason: 'Uanachama wako katika kikundi hiki umesimamishwa.',
      };
    }
    if (membership.status === 'PENDING') {
      return {
        canAccess: group.visibility === 'PUBLIC',
        canViewContent: false,
        canJoin: false,
        membership,
        reason: 'Ombi lako la kujiunga linasubiri idhini.',
      };
    }
    if (membership.status === 'REMOVED' || membership.status === 'LEFT') {
      return {
        canAccess: group.visibility === 'PUBLIC',
        canViewContent: false,
        canJoin: group.visibility === 'PUBLIC',
        membership,
        reason: 'Ulijiondoa au kuondolewa kwenye kikundi hiki.',
      };
    }
  }

  const isMember = Boolean(membership && membership.status === 'ACTIVE');
  const userRole = (isMember ? membership?.role : null) || (isGroupFounderAdmin(userId, group) ? 'FOUNDER_ADMIN' : null);

  if (group.visibility === 'PUBLIC') {
    return {
      canAccess: true,
      canViewContent: isMember || Boolean(userRole),
      canJoin: !isMember,
      membership,
      role: userRole,
    };
  }

  // PRIVATE group
  return {
    canAccess: isMember || Boolean(userRole),
    canViewContent: isMember || Boolean(userRole),
    canJoin: !isMember && !membership,
    membership,
    role: userRole,
    reason: isMember || Boolean(userRole) ? undefined : 'Kikundi hiki ni cha faragha kwa wanachama pekee.',
  };
}
