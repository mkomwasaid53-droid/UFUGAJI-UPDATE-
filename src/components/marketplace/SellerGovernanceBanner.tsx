import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Info,
  Scale,
  Hourglass
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { SellerWarning, SellerRestriction } from '../../types/sellerGovernance';
import {
  fetchSellerWarnings,
  fetchSellerRestrictions,
  acknowledgeSellerWarning
} from '../../services/sellerGovernanceService';
import {
  fetchSellerAppeals
} from '../../services/marketplaceReportAndAppealService';
import { MarketplaceAppealRecord, AppealTargetType } from '../../types/marketplaceReportAndAppeal';
import { AppealModal } from './AppealModal';

interface SellerGovernanceBannerProps {
  sellerId?: string;
  onUpdate?: () => void;
}

export const SellerGovernanceBanner: React.FC<SellerGovernanceBannerProps> = ({
  sellerId,
  onUpdate
}) => {
  const { user } = useAuth();
  const targetId = sellerId || user?.uid;

  const [warnings, setWarnings] = useState<SellerWarning[]>([]);
  const [restrictions, setRestrictions] = useState<SellerRestriction[]>([]);
  const [appeals, setAppeals] = useState<MarketplaceAppealRecord[]>([]);
  const [isAcknowledging, setIsAcknowledging] = useState<string | null>(null);

  // Appeal Modal state
  const [appealModalData, setAppealModalData] = useState<{
    isOpen: boolean;
    targetType: AppealTargetType;
    targetId: string;
    targetTitle?: string;
    originalReasonText?: string;
  } | null>(null);

  const loadData = async () => {
    if (!targetId) return;
    try {
      const w = await fetchSellerWarnings(targetId, false, targetId);
      setWarnings(w);
      const r = await fetchSellerRestrictions(targetId, false, targetId);
      setRestrictions(r);
      const a = await fetchSellerAppeals(targetId, false);
      setAppeals(a);
    } catch {}
  };

  useEffect(() => {
    loadData();
  }, [targetId]);

  const activeWarnings = warnings.filter((w) => w.status === 'ACTIVE');
  const activeRestrictions = restrictions.filter((r) => r.status === 'ACTIVE');

  if (activeWarnings.length === 0 && activeRestrictions.length === 0) {
    return null;
  }

  const handleAcknowledge = async (warningId: string) => {
    if (!user?.uid) return;
    setIsAcknowledging(warningId);
    try {
      await acknowledgeSellerWarning(user.uid, warningId);
      await loadData();
      if (onUpdate) onUpdate();
    } catch (err) {
      console.error('Hitilafu ya kuthibitisha onyo:', err);
    } finally {
      setIsAcknowledging(null);
    }
  };

  const getActiveAppealForTarget = (tid: string) => {
    return appeals.find(
      (a) => a.targetId === tid && (a.status === 'SUBMITTED' || a.status === 'UNDER_REVIEW')
    );
  };

  return (
    <div className="space-y-3 mb-4">
      {/* Active Restrictions Alert */}
      {activeRestrictions.map((rst) => {
        const activeAppeal = getActiveAppealForTarget(rst.restrictionId);
        return (
          <div
            key={rst.restrictionId}
            className="p-4 bg-rose-50 border border-rose-200 rounded-2xl shadow-xs space-y-2"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 bg-rose-100 rounded-xl text-rose-700 shrink-0">
                <Ban className="w-5 h-5" />
              </div>
              <div className="space-y-1 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-bold text-rose-950 uppercase tracking-wide">
                    Kizuizi cha Usimamizi wa Soko: {rst.scope}
                  </h4>
                  <div className="flex items-center gap-2">
                    {rst.expiresAt && (
                      <span className="text-[11px] font-bold text-rose-800 bg-rose-100 px-2.5 py-0.5 rounded-md flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Hadi: {new Date(rst.expiresAt).toLocaleDateString('sw-TZ')}
                      </span>
                    )}
                    {activeAppeal ? (
                      <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-md flex items-center gap-1 border border-amber-300">
                        <Hourglass className="w-3 h-3 text-amber-700 animate-spin" />
                        Rufaa Inakaguliwa
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setAppealModalData({
                            isOpen: true,
                            targetType: 'SELLER_RESTRICTION',
                            targetId: rst.restrictionId,
                            targetTitle: `Kizuizi: ${rst.scope}`,
                            originalReasonText: rst.reasonText
                          })
                        }
                        className="text-[11px] font-bold text-rose-800 hover:text-rose-950 bg-rose-100/90 hover:bg-rose-200/90 border border-rose-300 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Scale className="w-3 h-3" />
                        <span>Wasilisha Rufaa</span>
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-rose-900 leading-relaxed">{rst.reasonText}</p>
                <div className="text-[11px] text-rose-700 pt-1 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5" />
                  <span>
                    Kizuizi hiki kimefungwa kwenye upeo husika pekee. Bidhaa zako zilizopo na duka lako vinaendelea kuwa salama.
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Active Warnings Alert */}
      {activeWarnings.map((warn) => {
        const isAcknowledged = !!warn.acknowledgedAt;
        const activeAppeal = getActiveAppealForTarget(warn.warningId);
        return (
          <div
            key={warn.warningId}
            className="p-4 bg-amber-50 border border-amber-200 rounded-2xl shadow-xs space-y-2.5"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-100 rounded-xl text-amber-800 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1.5 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                    Onyo la Sera ya Soko ({warn.severity})
                  </h4>
                  <span className="text-[10px] text-amber-800 font-medium">
                    Tarehe: {new Date(warn.issuedAt).toLocaleDateString('sw-TZ')}
                  </span>
                </div>
                <p className="text-xs text-amber-900 leading-relaxed">{warn.reasonText}</p>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-amber-200/60">
                  <p className="text-[11px] text-amber-800">
                    Tafadhali zingatia miongozo ya sokoni ili kuepuka vikwazo zaidi kwenye duka lako.
                  </p>

                  <div className="flex items-center gap-2">
                    {activeAppeal ? (
                      <span className="text-[11px] font-bold text-amber-900 bg-amber-100/90 border border-amber-300 px-2.5 py-1 rounded-lg flex items-center gap-1">
                        <Hourglass className="w-3 h-3 text-amber-700 animate-spin" />
                        Rufaa Inakaguliwa
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setAppealModalData({
                            isOpen: true,
                            targetType: 'SELLER_WARNING',
                            targetId: warn.warningId,
                            targetTitle: `Onyo: ${warn.severity}`,
                            originalReasonText: warn.reasonText
                          })
                        }
                        className="px-3 py-1 text-xs font-bold text-amber-900 hover:text-amber-950 bg-amber-100/80 hover:bg-amber-200/80 border border-amber-300 rounded-xl transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <Scale className="w-3.5 h-3.5" />
                        <span>Wasilisha Rufaa</span>
                      </button>
                    )}

                    {!isAcknowledged ? (
                      <button
                        onClick={() => handleAcknowledge(warn.warningId)}
                        disabled={isAcknowledging === warn.warningId}
                        className="px-3.5 py-1.5 text-xs font-bold bg-amber-700 hover:bg-amber-800 text-white rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{isAcknowledging === warn.warningId ? 'Inathibitisha...' : 'Nimesoma na Kuelewa'}</span>
                      </button>
                    ) : (
                      <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100/80 px-2.5 py-1 rounded-lg flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                        Imethibitishwa
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Appeal Submission Modal */}
      {appealModalData && user?.uid && (
        <AppealModal
          isOpen={appealModalData.isOpen}
          onClose={() => setAppealModalData(null)}
          targetType={appealModalData.targetType}
          targetId={appealModalData.targetId}
          targetTitle={appealModalData.targetTitle}
          originalReasonText={appealModalData.originalReasonText}
          sellerId={user.uid}
          onAppealSubmitted={() => {
            loadData();
            if (onUpdate) onUpdate();
          }}
        />
      )}
    </div>
  );
};
