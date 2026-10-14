import React, { useState } from 'react';
import {
  X,
  AlertTriangle,
  Flag,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Loader2
} from 'lucide-react';
import {
  GumzoReportReason,
  GUMZO_REPORT_REASONS,
  GumzoReportRecord
} from '../../types/gumzo';
import { gumzoEnforcementService } from '../../services/gumzoEnforcementService';
import { useAuth } from '../../context/AuthContext';

interface GumzoReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  targetType: 'POST' | 'COMMENT';
  targetId: string;
  postId?: string;
  targetAuthorDisplayName?: string;
  onReportSubmitted?: (report: GumzoReportRecord) => void;
}

export const GumzoReportModal: React.FC<GumzoReportModalProps> = ({
  isOpen,
  onClose,
  groupId,
  targetType,
  targetId,
  postId,
  targetAuthorDisplayName,
  onReportSubmitted
}) => {
  const { user } = useAuth();
  const [selectedReason, setSelectedReason] = useState<GumzoReportReason>('MISLEADING_INFORMATION');
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentUserId = user?.uid;
  const targetLabel = targetType === 'POST' ? 'chapisho' : 'maoni';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!currentUserId) {
      setErrorMsg('Tafadhali ingia kwenye akaunti yako ili kuwasilisha ripoti hii.');
      return;
    }

    const trimmed = details.trim();
    if (trimmed.length > 0 && trimmed.length < 5) {
      setErrorMsg('Tafadhali toa maelezo ya kutosha (angalau herufi 5) au uache wazi.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Browser API call with fallback to direct service
      let report: GumzoReportRecord;
      try {
        const token = user ? await user.getIdToken().catch(() => null) : null;
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'x-user-id': currentUserId,
          'x-user-name': user.displayName || 'Mfugaji'
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('/api/gumzo/reports', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            groupId,
            targetType,
            targetId,
            postId,
            reason: selectedReason,
            details: trimmed || undefined
          })
        });

        if (res.ok) {
          report = await res.json();
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Imeshindwa kuwasilisha ripoti.');
        }
      } catch (networkErr: any) {
        // Fallback to local enforcement service
        report = await gumzoEnforcementService.submitReport({
          input: {
            groupId,
            targetType,
            targetId,
            postId,
            reason: selectedReason,
            details: trimmed || undefined
          },
          reporterUserId: currentUserId,
          reporterDisplayName: user.displayName || 'Mwanachama wa Jamii'
        });
      }

      setSuccessMsg('Ripoti yako imepokelewa salama. Timu ya usimamizi na viongozi wa kikundi wataipitia kwa haki.');
      if (onReportSubmitted) {
        onReportSubmitted(report);
      }

      setTimeout(() => {
        onClose();
        setSuccessMsg(null);
        setDetails('');
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Hitilafu wakati wa kuwasilisha ripoti.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-stone-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
              <Flag className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <h3 className="font-bold text-stone-900 text-base">
                Ripoti Maudhui ya Jamii
              </h3>
              <p className="text-xs text-stone-500">
                Ripoti {targetLabel} {targetAuthorDisplayName ? `cha ${targetAuthorDisplayName}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content & Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs sm:text-sm">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <span className="font-medium">{successMsg}</span>
            </div>
          )}

          {/* Privacy badge */}
          <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-xl flex items-center gap-2 text-emerald-900">
            <Lock className="w-4 h-4 text-emerald-700 shrink-0" />
            <span className="text-xs">
              <strong>Faragha Yako Imelindwa:</strong> Jina lako na taarifa zako hazitaonyeshwa kwa mwandishi wa maudhui haya.
            </span>
          </div>

          {/* Reason Selection */}
          <div className="space-y-2">
            <label className="block font-bold text-stone-800">
              Chagua Sababu ya Ripoti:
            </label>
            <div className="space-y-2">
              {GUMZO_REPORT_REASONS.map((r) => {
                const isSelected = selectedReason === r.code;
                return (
                  <label
                    key={r.code}
                    className={`block p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-amber-600 bg-amber-50/60 ring-1 ring-amber-600'
                        : 'border-stone-200 bg-white hover:bg-stone-50'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <input
                        type="radio"
                        name="gumzoReportReason"
                        value={r.code}
                        checked={isSelected}
                        onChange={() => setSelectedReason(r.code)}
                        className="mt-0.5 text-amber-600 focus:ring-amber-500"
                      />
                      <div className="space-y-0.5">
                        <span className="font-bold text-stone-900 text-xs sm:text-sm block">
                          {r.labelSwahili}
                        </span>
                        <p className="text-[11px] text-stone-500 leading-relaxed">
                          {r.description}
                        </p>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Additional details */}
          <div className="space-y-1.5 pt-1">
            <label className="block font-bold text-stone-800 text-xs sm:text-sm">
              Maelezo ya Ziada (Hiari):
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Eleza kwa nini maudhui haya yanakiuka maadili au miongozo ya jamii..."
              rows={3}
              maxLength={1000}
              className="w-full text-xs sm:text-sm border border-stone-300 focus:border-amber-600 rounded-xl p-3 outline-hidden transition-all resize-none"
            />
            <span className="text-[10px] text-stone-400 block text-right">
              {details.length}/1000
            </span>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-stone-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-stone-300 rounded-xl text-stone-700 hover:bg-stone-100 font-semibold text-xs sm:text-sm transition-colors cursor-pointer"
            >
              Ghairi
            </button>
            <button
              type="submit"
              disabled={isSubmitting || Boolean(successMsg)}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs sm:text-sm transition-colors flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Inawasilisha...</span>
                </>
              ) : (
                <>
                  <Flag className="w-4 h-4" />
                  <span>Wasilisha Ripoti</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
