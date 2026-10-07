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
      className="bg-white rounded-2xl border border-stone-200/90 hover:border-emerald-500/70 p-4 sm:p-5 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group space-y-3.5 relative overflow-hidden"
    >
      {/* Top badges bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/80 inline-flex items-center gap-1">
          {categoryDef?.nameSwahili || group.categoryId}
        </span>

        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Visibility badge */}
          {group.visibility === 'PUBLIC' ? (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-stone-100 text-stone-600 inline-flex items-center gap-1">
              <Globe className="w-2.5 h-2.5 text-stone-500" />
              Umma (Public)
            </span>
          ) : (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center gap-1">
              <Lock className="w-2.5 h-2.5 text-amber-600" />
              Faragha (Private)
            </span>
          )}

          {/* Status badge if not ACTIVE */}
          {group.status === 'PENDING_APPROVAL' && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 inline-flex items-center gap-1">
              <Clock className="w-2.5 h-2.5 text-blue-600" />
              Inasubiri Idhini
            </span>
          )}
          {group.status === 'SUSPENDED' && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 inline-flex items-center gap-1">
              <AlertTriangle className="w-2.5 h-2.5 text-rose-600" />
              Imesimamishwa
            </span>
          )}
          {group.status === 'ARCHIVED' && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-stone-100 text-stone-600 border border-stone-200 inline-flex items-center gap-1">
              <Archive className="w-2.5 h-2.5 text-stone-500" />
              Kumbukumbu
            </span>
          )}
          {group.status === 'REJECTED' && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-stone-100 text-stone-600 border border-stone-200 inline-flex items-center gap-1">
              <XCircle className="w-2.5 h-2.5 text-stone-500" />
              Imekataliwa
            </span>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="space-y-1.5 flex-1">
        <h3 className="text-base font-bold text-stone-900 group-hover:text-emerald-800 transition-colors line-clamp-1">
          {group.name}
        </h3>
        <p className="text-xs text-stone-600 leading-relaxed line-clamp-2">
          {group.description}
        </p>
      </div>

      {/* Footer bar */}
      <div className="pt-2 border-t border-stone-100 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-stone-500 font-medium">
          <Users className="w-3.5 h-3.5 text-emerald-700" />
          <span>{group.memberCount} {group.memberCount === 1 ? 'Mwanachama' : 'Wanachama'}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* User role badge */}
          {isFounder && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-800 border border-purple-200 inline-flex items-center gap-1">
              <Shield className="w-2.5 h-2.5 text-purple-600" />
              Founder Admin
            </span>
          )}
          {isLeadership && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200 inline-flex items-center gap-1">
              <Shield className="w-2.5 h-2.5 text-blue-600" />
              Leadership Admin
            </span>
          )}
          {isMember && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-stone-100 text-stone-700">
              Mwanachama
            </span>
          )}

          <span className="text-emerald-700 font-semibold inline-flex items-center gap-1 text-[11px] group-hover:translate-x-0.5 transition-transform">
            <span>Fungua</span>
            <ArrowRight className="w-3 h-3" />
          </span>
        </div>
      </div>
    </div>
  );
};
