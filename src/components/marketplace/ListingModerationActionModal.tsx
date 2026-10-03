/**
 * V1.7D — Listing Moderation Action Modal
 * Phase 6: Marketplace Governance
 *
 * Action Safety Guarantees:
 * - Requires explicit moderator confirmation for every status change
 * - Enforces structured reason selection for REJECT and REQUEST_CORRECTION
 * - Clearly specifies the boundary of approval (NOT seller verification, NOT medical certification)
 * - Keeps internal notes separate from user-facing explanations
 * - Revalidates before RESTORE
 */

import React, { useState } from 'react';
import {
  ModerationAction,
  ModerationReasonCode,
  MODERATION_REASON_LABELS,
  ModerationQueueItem
} from '../../types/marketplaceModeration';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Lock,
  EyeOff,
  RefreshCw,
  X
} from 'lucide-react';

interface ListingModerationActionModalProps {
  item: ModerationQueueItem;
  actionType: 'APPROVE' | 'REJECT' | 'CORRECTION' | 'HIDE' | 'SUSPEND' | 'RESTORE' | 'ESCALATE';
  onClose: () => void;
  onSubmit: (params: {
    action: ModerationAction;
    reasonCode?: ModerationReasonCode;
    reasonText?: string;
    internalNote?: string;
    publicExplanation?: string;
    correctionInstructions?: string;
  }) => Promise<void>;
  isProcessing: boolean;
}

export const ListingModerationActionModal: React.FC<ListingModerationActionModalProps> = ({
  item,
  actionType,
  onClose,
  onSubmit,
  isProcessing
}) => {
  const { product, validationResult } = item;

  const [reasonCode, setReasonCode] = useState<ModerationReasonCode>('INVALID_CATEGORY');
  const [reasonText, setReasonText] = useState('');
  const [publicExplanation, setPublicExplanation] = useState('');
  const [correctionInstructions, setCorrectionInstructions] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Map actionType to actual ModerationAction
  const getAction = (): ModerationAction => {
    switch (actionType) {
      case 'APPROVE':
        return 'APPROVE_LISTING';
      case 'REJECT':
        return 'REJECT_LISTING';
      case 'CORRECTION':
        return 'REQUEST_CORRECTION';
      case 'HIDE':
        return 'HIDE_LISTING';
      case 'SUSPEND':
        return 'SUSPEND_LISTING';
      case 'RESTORE':
        return 'RESTORE_LISTING';
      case 'ESCALATE':
        return 'ESCALATE';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const action = getAction();

    // Rejection validation
    if (action === 'REJECT_LISTING') {
      if (!reasonCode) {
        setFormError('Tafadhali chagua sababu ya kisheria (Reason Code) ya kukataa tangazo.');
        return;
      }
    }

    // Correction validation
    if (action === 'REQUEST_CORRECTION') {
      if (!correctionInstructions.trim()) {
        setFormError('Tafadhali andika maelekezo ya marekebisho kwa muuzaji.');
        return;
      }
    }

    // Approval gate check: cannot approve if validation failed
    if (action === 'APPROVE_LISTING' && !validationResult.isEligibleForActive) {
      setFormError('Tangazo hili haliwezi kuidhinishwa kwa sababu linashindwa vigezo vya lazima vya usajili (Listing Validation). Lazima liweze kukidhi vigezo kwanza.');
      return;
    }

    try {
      await onSubmit({
        action,
        reasonCode: action === 'REJECT_LISTING' || action === 'REQUEST_CORRECTION' ? reasonCode : undefined,
        reasonText: reasonText.trim() || undefined,
        internalNote: internalNote.trim() || undefined,
        publicExplanation: publicExplanation.trim() || undefined,
        correctionInstructions: correctionInstructions.trim() || undefined
      });
    } catch (err: any) {
      setFormError(err.message || 'Hitilafu wakati wa kutekeleza hatua ya ukaguzi.');
    }
  };

  return (
    <div className="fixed inset-0 z-60 bg-stone-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-stone-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-200 bg-stone-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-400" />
            <h3 className="font-bold text-sm">
              {actionType === 'APPROVE' && 'Idhinisha Tangazo (Listing Approval)'}
              {actionType === 'REJECT' && 'Kataa Tangazo (Reject Listing)'}
              {actionType === 'CORRECTION' && 'Omba Marekebisho (Request Correction)'}
              {actionType === 'HIDE' && 'Ficha Tangazo (Hide Listing)'}
              {actionType === 'SUSPEND' && 'Sitisha Tangazo (Suspend Listing)'}
              {actionType === 'RESTORE' && 'Rejesha Tangazo (Restore Listing)'}
              {actionType === 'ESCALATE' && 'Peleka Rufaa / Ngazi ya Juu (Escalate)'}
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-1 rounded text-stone-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content & Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {formError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{formError}</span>
            </div>
          )}

          {/* APPROVAL VIEW */}
          {actionType === 'APPROVE' && (
            <div className="space-y-3">
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900 space-y-1.5">
                <div className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" /> Ufafanuzi wa Idhini ya Msimamizi
                </div>
                <p className="text-[11px] leading-relaxed text-emerald-800">
                  Kuidhinisha tangazo hili kunamaanisha kuwa msimamizi amelipitia na linakidhi miongozo ya mfumo wa soko (Marketplace Governance).
                </p>
                <div className="pt-1.5 border-t border-emerald-200/80 text-[10px] text-emerald-800 font-medium">
                  <strong>Muhimu:</strong> Hatua hii <u>haitambui</u> muuzaji kama aliyethibitishwa (Seller Verified), haitoi uthibitisho wa kisheria wa uhalisi wa bidhaa (Product Authenticity), na haitoi cheti cha usalama wa dawa (Medical Approval).
                </div>
              </div>

              {!validationResult.isEligibleForActive && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 space-y-1">
                  <span className="font-bold flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5 text-rose-600" /> Ukaguzi wa Vigezo Umezuia Idhini:
                  </span>
                  <p className="text-[11px]">Tangazo hili lina makosa ya lazima yafuatayo:</p>
                  <ul className="list-disc list-inside text-[11px] space-y-0.5 text-rose-700">
                    {validationResult.errors.map((e, i) => (
                      <li key={i}>{e.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <label className="block text-stone-600 font-semibold mb-1">
                  Kumbukumbu ya Ndani (Internal Note - Haionekani kwa Muuzaji):
                </label>
                <textarea
                  value={internalNote}
                  onChange={(e) => setInternalNote(e.target.value)}
                  rows={2}
                  className="w-full p-2 rounded-lg border border-stone-300 focus:outline-emerald-600 font-normal"
                  placeholder="Mfano: Picha zimekaguliwa na bei ipo sawa."
                />
              </div>
            </div>
          )}

          {/* REJECT VIEW */}
          {actionType === 'REJECT' && (
            <div className="space-y-3">
              <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-rose-900 text-[11px] leading-relaxed">
                Kukataa tangazo kutalifanya lisionekane hadharani kwenye soko (hali itakuwa <code>inactive</code>). Rekodi ya tangazo na ukaguzi havitafutwa bali vitahifadhiwa kwa ukaguzi wa baadaye.
              </div>

              <div>
                <label className="block text-stone-700 font-bold mb-1">
                  Sababu ya Kisheria (Reason Code) <span className="text-rose-600">*</span>:
                </label>
                <select
                  value={reasonCode}
                  onChange={(e) => {
                    const code = e.target.value as ModerationReasonCode;
                    setReasonCode(code);
                    setPublicExplanation(MODERATION_REASON_LABELS[code]?.sw || '');
                  }}
                  className="w-full p-2.5 rounded-lg border border-stone-300 font-medium bg-white focus:outline-rose-600"
                >
                  {Object.entries(MODERATION_REASON_LABELS).map(([code, labels]) => (
                    <option key={code} value={code}>
                      {labels.sw} ({code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-stone-700 font-semibold mb-1">
                  Ufafanuzi Salama kwa Muuzaji (Public Explanation):
                </label>
                <textarea
                  value={publicExplanation}
                  onChange={(e) => setPublicExplanation(e.target.value)}
                  rows={2}
                  className="w-full p-2 rounded-lg border border-stone-300 focus:outline-rose-600 font-normal"
                  placeholder="Ufafanuzi unaoonekana kwa muuzaji kueleza sababu..."
                />
                <p className="text-[10px] text-stone-400 mt-0.5">
                  Ufafanuzi huu unaonekana kwa muuzaji; usijumuishe majina ya waliotuma ripoti au maelezo ya kiusalama.
                </p>
              </div>

              <div>
                <label className="block text-stone-700 font-semibold mb-1">
                  Kumbukumbu ya Ndani (Private Internal Note):
                </label>
                <textarea
                  value={internalNote}
                  onChange={(e) => setInternalNote(e.target.value)}
                  rows={2}
                  className="w-full p-2 rounded-lg border border-stone-300 focus:outline-rose-600 font-normal"
                  placeholder="Kumbukumbu ya siri ya kiutawala kwa wasimamizi wenzako..."
                />
              </div>
            </div>
          )}

          {/* REQUEST CORRECTION VIEW */}
          {actionType === 'CORRECTION' && (
            <div className="space-y-3">
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-[11px] leading-relaxed">
                Tangazo litarejeshwa kwenye hali ya <code>draft</code> ili muuzaji afanye marekebisho yanayohitajika kulingana na maelekezo yako.
              </div>

              <div>
                <label className="block text-stone-700 font-bold mb-1">
                  Sababu Kuu ya Marekebisho <span className="text-rose-600">*</span>:
                </label>
                <select
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value as ModerationReasonCode)}
                  className="w-full p-2.5 rounded-lg border border-stone-300 font-medium bg-white focus:outline-amber-600"
                >
                  {Object.entries(MODERATION_REASON_LABELS).map(([code, labels]) => (
                    <option key={code} value={code}>
                      {labels.sw}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-stone-700 font-bold mb-1">
                  Maelekezo ya Marekebisho kwa Muuzaji <span className="text-rose-600">*</span>:
                </label>
                <textarea
                  value={correctionInstructions}
                  onChange={(e) => setCorrectionInstructions(e.target.value)}
                  rows={3}
                  className="w-full p-2.5 rounded-lg border border-stone-300 focus:outline-amber-600 font-normal"
                  placeholder="Mfano: Kundi ulilochagua si sahihi. Tafadhali chagua 'Chakula cha Kuku' badala ya 'Mifugo Hai' ili tangazo lako liidhinishwe."
                />
              </div>

              <div>
                <label className="block text-stone-700 font-semibold mb-1">
                  Kumbukumbu ya Ndani (Private Internal Note):
                </label>
                <textarea
                  value={internalNote}
                  onChange={(e) => setInternalNote(e.target.value)}
                  rows={2}
                  className="w-full p-2 rounded-lg border border-stone-300 focus:outline-amber-600 font-normal"
                  placeholder="Maelezo ya ndani..."
                />
              </div>
            </div>
          )}

          {/* HIDE / SUSPEND VIEW */}
          {(actionType === 'HIDE' || actionType === 'SUSPEND') && (
            <div className="space-y-3">
              <div className="p-3 bg-stone-100 rounded-xl border border-stone-300 text-stone-800 text-[11px] leading-relaxed">
                Tangazo hili litafichwa mara moja kutoka kwenye soko. Rekodi na kumbukumbu za tangazo zinabaki salama na zinaweza kurejeshwa baada ya utatuzi.
              </div>

              <div>
                <label className="block text-stone-700 font-semibold mb-1">
                  Sababu ya Kuficha/Kusitisha:
                </label>
                <select
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value as ModerationReasonCode)}
                  className="w-full p-2.5 rounded-lg border border-stone-300 font-medium bg-white"
                >
                  {Object.entries(MODERATION_REASON_LABELS).map(([code, labels]) => (
                    <option key={code} value={code}>
                      {labels.sw}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-stone-700 font-semibold mb-1">
                  Kumbukumbu ya Ndani:
                </label>
                <textarea
                  value={internalNote}
                  onChange={(e) => setInternalNote(e.target.value)}
                  rows={2}
                  className="w-full p-2 rounded-lg border border-stone-300 font-normal"
                  placeholder="Sababu ya kiutawala ya kusitisha..."
                />
              </div>
            </div>
          )}

          {/* RESTORE VIEW */}
          {actionType === 'RESTORE' && (
            <div className="space-y-3">
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900 text-[11px] leading-relaxed">
                Kurejesha tangazo kutathibitisha upya vigezo vyote vya lazima vya usajili (Listing Validation) na kundi husika. Ikiwa kundi limesitishwa au tangazo linashindwa vigezo, mfumo utazuia urejeshaji kiotomatiki.
              </div>

              <div>
                <label className="block text-stone-700 font-semibold mb-1">
                  Kumbukumbu ya Urejeshaji (Internal Note):
                </label>
                <textarea
                  value={internalNote}
                  onChange={(e) => setInternalNote(e.target.value)}
                  rows={2}
                  className="w-full p-2 rounded-lg border border-stone-300 font-normal"
                  placeholder="Mfano: Muuzaji amesuluhisha utata, tangazo limerejeshwa sokoni."
                />
              </div>
            </div>
          )}

          {/* ESCALATE VIEW */}
          {actionType === 'ESCALATE' && (
            <div className="space-y-3">
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-[11px] leading-relaxed">
                Kupeleka rufaa (Escalate) kutatenga tangazo hili kwa ajili ya usimamizi mkuu au uchunguzi wa ziada.
              </div>

              <div>
                <label className="block text-stone-700 font-semibold mb-1">
                  Maelezo ya Rufaa / Sababu:
                </label>
                <textarea
                  value={internalNote}
                  onChange={(e) => setInternalNote(e.target.value)}
                  rows={3}
                  className="w-full p-2.5 rounded-lg border border-stone-300 font-normal"
                  placeholder="Eleza kinachohitaji usimamizi wa juu..."
                  required
                />
              </div>
            </div>
          )}

          {/* Footer buttons */}
          <div className="pt-3 border-t border-stone-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-stone-100 text-stone-700 hover:bg-stone-200 transition-colors cursor-pointer"
            >
              Ghairi
            </button>
            <button
              type="submit"
              disabled={isProcessing || (actionType === 'APPROVE' && !validationResult.isEligibleForActive)}
              className={`px-5 py-2 text-xs font-bold rounded-xl text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs ${
                actionType === 'APPROVE' || actionType === 'RESTORE'
                  ? 'bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50'
                  : actionType === 'REJECT'
                  ? 'bg-rose-700 hover:bg-rose-800'
                  : 'bg-stone-900 hover:bg-stone-800'
              }`}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Inatekeleza...
                </>
              ) : (
                'Thibitisha Hatua'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
