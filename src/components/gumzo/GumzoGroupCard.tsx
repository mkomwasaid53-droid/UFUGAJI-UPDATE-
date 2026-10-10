import React from 'react';
import { Users, Lock, Globe, Shield, Clock, AlertTriangle, Archive, XCircle, ArrowRight } from 'lucide-react';
import { GumzoGroup, GumzoMembership, GUMZO_CATEGORIES } from '../../types/gumzo';

interface GumzoGroupCardProps {
  group: GumzoGroup;
  membership?: GumzoMembership | null;
  onSelectGroup: (group: GumzoGroup) => void;
}

export const GumzoGroupCard: React.FC<GumzoGroupCardProps> = ({
  group,
  membership,
  onSelectGroup,
}) => {
  const categoryDef = GUMZO_CATEGORIES.find((c) => c.categoryId === group.categoryId);
  const isFounder = membership?.role === 'FOUNDER_ADMIN';
  const isLeadership = membership?.role === 'LEADERSHIP_ADMIN';
  const isMember = membership?.role === 'MEMBER' && membership.status === 'ACTIVE';

  return (
    <div
      onClick={() => onSelectGroup(group)}
      className="bg-white rounded-2xl border border-stone-200/90 hover:border-emerald-600/70 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group overflow-hidden"
    >
      {/* Cover Image or Thematic Banner */}
      {group.coverImageUrl ? (
        <div className="h-32 sm:h-36 w-full overflow-hidden relative bg-stone-100">
          <img
            src={group.coverImageUrl}
            alt={group.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-stone-900/60 via-transparent to-transparent" />
        </div>
      ) : null}

      <div className="p-4 sm:p-5 space-y-3 flex-1 flex flex-col justify-between">
        {/* Kicker metadata line (Zero-pill unboxed typography) */}
        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-stone-600 font-medium">
            <span className="text-emerald-800 font-bold uppercase tracking-wider text-[11px]">
              {categoryDef?.nameSwahili || group.categoryId}
            </span>
            {group.livestockType && (
              <>
                <span className="text-stone-300">·</span>
                <span className="text-stone-500 text-[11px] font-semibold">{group.livestockType}</span>
              </>
            )}
          </div>

          {/* Visibility indicator */}
          <div className="flex items-center gap-1 text-[11px] text-stone-500 font-medium">
            {group.visibility === 'PUBLIC' ? (
              <>
                <Globe className="w-3 h-3 text-emerald-700" />
                <span>Umma</span>
              </>
            ) : (
              <>
                <Lock className="w-3 h-3 text-amber-700" />
                <span className="text-amber-800 font-semibold">Faragha</span>
              </>
            )}
          </div>
        </div>

        {/* Group Name & Description */}
        <div className="space-y-1.5 flex-1">
          <h3 className="text-base font-bold text-stone-900 group-hover:text-emerald-800 transition-colors line-clamp-1">
            {group.name}
          </h3>
          <p className="text-xs text-stone-600 leading-relaxed line-clamp-2">
            {group.description}
          </p>
        </div>

        {/* Footer bar */}
        <div className="pt-2.5 border-t border-stone-100 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-stone-600 font-medium">
            <Users className="w-3.5 h-3.5 text-emerald-700" />
            <span>
              <strong>{group.memberCount}</strong> {group.memberCount === 1 ? 'mwanachama' : 'wanachama'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Membership state indicator */}
            {isFounder && (
              <span className="text-[11px] font-bold text-purple-700 inline-flex items-center gap-1">
                <Shield className="w-3 h-3 text-purple-600" />
                Founder
              </span>
            )}
            {isLeadership && (
              <span className="text-[11px] font-bold text-blue-700 inline-flex items-center gap-1">
                <Shield className="w-3 h-3 text-blue-600" />
                Kiongozi
              </span>
            )}
            {isMember && !isFounder && !isLeadership && (
              <span className="text-[11px] font-semibold text-emerald-700 inline-flex items-center gap-1">
                Mwanachama
              </span>
            )}
            {membership?.status === 'PENDING' && (
              <span className="text-[11px] font-bold text-amber-700 inline-flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-600" />
                Ombi Linasubiri
              </span>
            )}
            {membership?.status === 'SUSPENDED' && (
              <span className="text-[11px] font-bold text-rose-700 inline-flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-rose-600" />
                Umesimamishwa
              </span>
            )}
            {membership?.status === 'REMOVED' && (
              <span className="text-[11px] font-bold text-stone-600 inline-flex items-center gap-1">
                <XCircle className="w-3 h-3 text-stone-400" />
                Umeondolewa
              </span>
            )}
            {membership?.status === 'LEFT' && (
              <span className="text-[11px] font-medium text-stone-500">
                Ulijiondoa
              </span>
            )}

            <span className="text-emerald-700 font-semibold inline-flex items-center gap-1 text-[11px] group-hover:translate-x-0.5 transition-transform">
              <span>Fungua</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

