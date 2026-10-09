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

export type GumzoPostStatus =
  | 'DRAFT'
  | 'PUBLISHED'
  | 'HIDDEN'
  | 'DELETED';

export type GumzoPostVisibility = 'VISIBLE' | 'HIDDEN';

export interface GumzoMediaItem {
  id: string;
  type: 'image' | 'video' | 'file';
  url: string;
  storagePath?: string;
  thumbnailUrl?: string;
  caption?: string;
  sizeBytes?: number;
  mimeType?: string;
}

export interface GumzoPost {
  postId: string;
  groupId: string;
  authorUserId: string;
  authorRole: 'FOUNDER_ADMIN' | 'LEADERSHIP_ADMIN';
  content: string;
  media: GumzoMediaItem[];
  status: GumzoPostStatus;
  visibility: GumzoPostVisibility;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  deletedAt?: string;
  createdBy: string;
  updatedBy: string;
  isPinned?: boolean;
  commentCount?: number;
}

export interface CreateGumzoPostInput {
  groupId: string;
  content: string;
  media?: GumzoMediaItem[];
  status?: 'DRAFT' | 'PUBLISHED';
  visibility?: GumzoPostVisibility;
}

export interface UpdateGumzoPostInput {
  content?: string;
  media?: GumzoMediaItem[];
  status?: GumzoPostStatus;
  visibility?: GumzoPostVisibility;
  isPinned?: boolean;
}

// ============================================================================
// V9.3 — GUMZO MEMBER COMMENTS DATA MODELS & TYPES
// ============================================================================

export type GumzoCommentStatus = 'PUBLISHED' | 'HIDDEN' | 'DELETED';

export interface GumzoComment {
  commentId: string;
  groupId: string;
  postId: string;
  authorUserId: string;
  authorRole: GumzoGroupRole;
  authorDisplayName?: string;
  content: string;
  media?: GumzoMediaItem[];
  status: GumzoCommentStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  deletedBy?: string;
  hiddenAt?: string;
  hiddenBy?: string;
  createdBy: string;
  updatedBy: string;
  parentCommentId?: string;
  isEdited?: boolean;
}

export interface CreateGumzoCommentInput {
  content: string;
  media?: GumzoMediaItem[];
  parentCommentId?: string;
  clientRequestId?: string;
}

export interface UpdateGumzoCommentInput {
  content?: string;
  media?: GumzoMediaItem[];
}

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

/**
 * V9.2 Post Authorization Helpers
 */

/**
 * Only FOUNDER_ADMIN and LEADERSHIP_ADMIN can create posts.
 * Platform admins acting on behalf of the platform are treated as authorized leaders.
 * Ordinary members can NEVER create posts (returns false).
 */
export function canUserCreatePost(
  userId: string | null | undefined,
  group: GumzoGroup,
  membership?: GumzoMembership | null,
  isPlatformAdmin = false
): { allowed: boolean; role?: 'FOUNDER_ADMIN' | 'LEADERSHIP_ADMIN'; reason?: string } {
  if (!userId) {
    return { allowed: false, reason: 'Tafadhali ingia kwenye mfumo kuandika post.' };
  }
  if (!group) {
    return { allowed: false, reason: 'Kikundi hakikupatikana.' };
  }

  // Suspended or archived groups do not allow new posts
  if (group.status === 'SUSPENDED') {
    return { allowed: false, reason: 'Kikundi kimesimamishwa. Machapisho mapya hayaruhusiwi.' };
  }
  if (group.status === 'ARCHIVED') {
    return { allowed: false, reason: 'Kikundi kiko kwenye kumbukumbu (Archived). Machapisho mapya hayaruhusiwi.' };
  }
  if (group.status === 'REJECTED') {
    return { allowed: false, reason: 'Kikundi hiki hakikukubaliwa.' };
  }

  if (isPlatformAdmin) {
    return { allowed: true, role: 'LEADERSHIP_ADMIN' };
  }

  // Founder Admin check
  if (isGroupFounderAdmin(userId, group)) {
    return { allowed: true, role: 'FOUNDER_ADMIN' };
  }

  // Leadership Admin check
  if (isGroupLeadershipAdmin(userId, group)) {
    return { allowed: true, role: 'LEADERSHIP_ADMIN' };
  }

  if (membership) {
    if (membership.role === 'FOUNDER_ADMIN' && membership.status === 'ACTIVE') {
      return { allowed: true, role: 'FOUNDER_ADMIN' };
    }
    if (membership.role === 'LEADERSHIP_ADMIN' && membership.status === 'ACTIVE') {
      return { allowed: true, role: 'LEADERSHIP_ADMIN' };
    }
    if (membership.role === 'MEMBER') {
      return {
        allowed: false,
        reason: 'Wanachama hawaruhusiwi kuanzisha mada au machapisho. Ni viongozi pekee (Admin) wanaoweza kuandika.',
      };
    }
  }

  return {
    allowed: false,
    reason: 'Huna mamlaka ya uongozi (Admin) katika kikundi hiki kuandika chapisho.',
  };
}

/**
 * Post editing authorization:
 * - Author can edit their own post
 * - Leadership Admin / Platform Admin can edit/moderate
 */
export function canUserEditPost(
  userId: string | null | undefined,
  post: GumzoPost,
  group: GumzoGroup,
  isPlatformAdmin = false
): boolean {
  if (!userId || !post || !group) return false;
  if (post.status === 'DELETED') return false; // Deleted posts cannot be edited
  if (isPlatformAdmin) return true;
  if (post.authorUserId === userId) return true;
  if (isGroupLeadershipAdmin(userId, group)) return true;
  return false;
}

/**
 * Post deletion/removal authorization:
 * - Author can delete/soft-delete their own post
 * - Founder admin can remove posts in their group
 * - Leadership admin / Platform admin can remove posts
 */
export function canUserDeletePost(
  userId: string | null | undefined,
  post: GumzoPost,
  group: GumzoGroup,
  isPlatformAdmin = false
): boolean {
  if (!userId || !post || !group) return false;
  if (isPlatformAdmin) return true;
  if (post.authorUserId === userId) return true;
  if (isGroupFounderAdmin(userId, group)) return true;
  if (isGroupLeadershipAdmin(userId, group)) return true;
  return false;
}

/**
 * Post visibility decision:
 * Checks both group access rules and post status/visibility rules.
 */
export function canUserViewPost(
  userId: string | null | undefined,
  post: GumzoPost,
  group: GumzoGroup,
  membership?: GumzoMembership | null,
  isPlatformAdmin = false
): boolean {
  if (!post || !group) return false;

  // Platform admin can view everything for audit/governance
  if (isPlatformAdmin) return true;

  // Deleted posts: not visible in normal feed
  if (post.status === 'DELETED') return false;

  const isAuthor = Boolean(userId && post.authorUserId === userId);
  const isLeader = Boolean(
    userId && (isGroupFounderAdmin(userId, group) || isGroupLeadershipAdmin(userId, group))
  );

  // Drafts: only author or group admin can view
  if (post.status === 'DRAFT') {
    return isAuthor || isLeader;
  }

  // Hidden: only group admins can view
  if (post.status === 'HIDDEN' || post.visibility === 'HIDDEN') {
    return isAuthor || isLeader;
  }

  // Published & Visible: must satisfy group-level access rules
  const groupAccess = canAccessGumzoGroup(userId, group, membership, isPlatformAdmin);
  return groupAccess.canViewContent;
}

// ============================================================================
// V9.3 — COMMENT PERMISSIONS & AUTHORIZATION HELPERS
// ============================================================================

export interface CommentAuthorizationDecision {
  allowed: boolean;
  reason?: string;
  userRole?: GumzoGroupRole;
}

/**
 * Checks whether user can comment on a post in a group:
 * - Allowed: ACTIVE MEMBER, FOUNDER_ADMIN, LEADERSHIP_ADMIN, Platform Admin
 * - Disallowed: Unauthenticated, Removed/Suspended members, Non-members in private groups,
 *   posts that are DRAFT/HIDDEN/DELETED, groups that are SUSPENDED/ARCHIVED/REJECTED.
 */
export function canUserCreateComment(
  userId: string | null | undefined,
  group: GumzoGroup,
  post: GumzoPost,
  membership?: GumzoMembership | null,
  isPlatformAdmin = false
): CommentAuthorizationDecision {
  if (!userId || !userId.trim()) {
    return { allowed: false, reason: 'Hujaingia kwenye mfumo (Authenticated user required).' };
  }

  if (!group || !post) {
    return { allowed: false, reason: 'Kikundi au chapisho halikupatikana.' };
  }

  // Group status check
  if (group.status === 'SUSPENDED') {
    return { allowed: false, reason: 'Kikundi kimesimamishwa. Huwezi kuweka maoni kwa sasa.' };
  }
  if (group.status === 'ARCHIVED') {
    return { allowed: false, reason: 'Kikundi kimewekwa kwenye kumbukumbu (Archived). Hakiruhusu maoni mapya.' };
  }
  if (group.status === 'REJECTED' || (group.status !== 'ACTIVE' && !isPlatformAdmin)) {
    return { allowed: false, reason: 'Kikundi hakiruhusu maoni kwa sababu ya hali yake.' };
  }

  // Post status check
  if (post.status === 'DRAFT') {
    return { allowed: false, reason: 'Huwezi kutoa maoni kwenye chapisho ambalo bado ni rasimu (Draft).' };
  }
  if (post.status === 'HIDDEN' || post.visibility === 'HIDDEN') {
    return { allowed: false, reason: 'Chapisho hili limefichwa. Haliruhusu maoni.' };
  }
  if (post.status === 'DELETED') {
    return { allowed: false, reason: 'Chapisho hili limefutwa. Haliruhusu maoni.' };
  }
  if (post.status !== 'PUBLISHED') {
    return { allowed: false, reason: 'Chapisho halijachapishwa rasmi.' };
  }

  if (isPlatformAdmin) {
    return { allowed: true, userRole: 'LEADERSHIP_ADMIN' };
  }

  // Derive role
  let role: GumzoGroupRole | null = null;
  if (group.founderAdminUserId === userId || membership?.role === 'FOUNDER_ADMIN') {
    role = 'FOUNDER_ADMIN';
  } else if (group.leadershipAdminUserId === userId || membership?.role === 'LEADERSHIP_ADMIN') {
    role = 'LEADERSHIP_ADMIN';
  } else if (membership?.role === 'MEMBER') {
    role = 'MEMBER';
  }

  if (membership) {
    if (membership.status === 'PENDING') {
      return { allowed: false, reason: 'Uanachama wako bado unasubiri idhini (Pending approval). Huwezi kuweka maoni.' };
    }
    if (membership.status === 'LEFT') {
      return { allowed: false, reason: 'Ulijiondoa kwenye kikundi hiki (Left). Huwezi kuweka maoni hadi ujiunge tena.' };
    }
    if (membership.status === 'SUSPENDED') {
      return { allowed: false, reason: 'Uanachama wako umesimamishwa kwenye kikundi hiki (Suspended).' };
    }
    if (membership.status === 'REMOVED') {
      return { allowed: false, reason: 'Uanachama wako umeondolewa kwenye kikundi hiki (Removed).' };
    }
    if (membership.status !== 'ACTIVE') {
      return { allowed: false, reason: 'Uanachama wako si amilifu katika kikundi hiki.' };
    }
  }

  // Must be active member/admin
  if (!role || !membership || membership.status !== 'ACTIVE') {
    // If founder without explicit separate membership document
    if (group.founderAdminUserId === userId) {
      return { allowed: true, userRole: 'FOUNDER_ADMIN' };
    }
    if (group.leadershipAdminUserId === userId) {
      return { allowed: true, userRole: 'LEADERSHIP_ADMIN' };
    }
    return {
      allowed: false,
      reason: 'Huna uanachama hai katika kikundi hiki kutoa maoni (Active membership required).'
    };
  }

  return { allowed: true, userRole: role };
}

/**
 * Comment editing authorization:
 * - MEMBER can edit their own comment (if comment is not deleted)
 * - FOUNDER_ADMIN, LEADERSHIP_ADMIN, Platform Admin can manage
 */
export function canUserEditComment(
  userId: string | null | undefined,
  comment: GumzoComment,
  group: GumzoGroup,
  isPlatformAdmin = false
): boolean {
  if (!userId || !comment || !group) return false;
  if (comment.status === 'DELETED') return false;
  if (isPlatformAdmin) return true;
  if (comment.authorUserId === userId) return true;
  if (isGroupFounderAdmin(userId, group)) return true;
  if (isGroupLeadershipAdmin(userId, group)) return true;
  return false;
}

/**
 * Comment deletion authorization:
 * - Member can delete their own comment
 * - Founder admin can delete comments in their group
 * - Leadership admin / Platform admin can delete comments
 */
export function canUserDeleteComment(
  userId: string | null | undefined,
  comment: GumzoComment,
  group: GumzoGroup,
  isPlatformAdmin = false
): boolean {
  if (!userId || !comment || !group) return false;
  if (isPlatformAdmin) return true;
  if (comment.authorUserId === userId) return true;
  if (isGroupFounderAdmin(userId, group)) return true;
  if (isGroupLeadershipAdmin(userId, group)) return true;
  return false;
}

/**
 * Comment hiding authorization:
 * - Only authorized admins (FOUNDER_ADMIN, LEADERSHIP_ADMIN, Platform Admin) can hide
 */
export function canUserHideComment(
  userId: string | null | undefined,
  comment: GumzoComment,
  group: GumzoGroup,
  isPlatformAdmin = false
): boolean {
  if (!userId || !comment || !group) return false;
  if (isPlatformAdmin) return true;
  if (isGroupFounderAdmin(userId, group)) return true;
  if (isGroupLeadershipAdmin(userId, group)) return true;
  return false;
}

/**
 * Comment visibility decision:
 * - DELETED comments: never in normal feed
 * - HIDDEN comments: only visible to comment author, group admins, or platform admin
 * - Inherits group and post access
 */
export function canUserViewComment(
  userId: string | null | undefined,
  comment: GumzoComment,
  group: GumzoGroup,
  post: GumzoPost,
  membership?: GumzoMembership | null,
  isPlatformAdmin = false
): boolean {
  if (!comment || !group || !post) return false;
  if (isPlatformAdmin) return true;
  if (comment.status === 'DELETED') return false;

  const isAuthor = Boolean(userId && comment.authorUserId === userId);
  const isLeader = Boolean(
    userId && (isGroupFounderAdmin(userId, group) || isGroupLeadershipAdmin(userId, group))
  );

  if (comment.status === 'HIDDEN') {
    return isAuthor || isLeader;
  }

  // Must be able to view parent post
  return canUserViewPost(userId, post, group, membership, isPlatformAdmin);
}

