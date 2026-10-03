import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Stethoscope,
  ArrowRight,
  AlertTriangle,
  ShieldCheck,
  MapPin,
  Clock,
  Sparkles,
  Phone,
  MessageCircle,
  AlertCircle,
  Lock,
  UserCheck
} from 'lucide-react';
import { AiDoctorAction } from '../../types/aiDoctorAction';
import { DaktariAIIntelligenceResult } from '../../types/aiDaktariLoop';

interface AiDoctorActionCtaProps {
  action: AiDoctorAction;
  daktariIntelligence?: DaktariAIIntelligenceResult;
  onActionClick?: (action: AiDoctorAction) => void;
}

export const AiDoctorActionCta: React.FC<AiDoctorActionCtaProps> = ({
  action,
  daktariIntelligence,
  onActionClick
}) => {
  const navigate = useNavigate();

  if (!action || action.type !== 'FIND_DOCTOR') {
    return null;
  }

  const isEmergency =
    action.reason === 'EMERGENCY_DETECTED' ||
    action.filters?.emergency === true ||
    daktariIntelligence?.query.emergency === true ||
    daktariIntelligence?.handoff?.urgency === 'EMERGENCY';

  const topDoc = daktariIntelligence?.topRecommendation;

  const handleNavigate = () => {
    if (onActionClick) {
      onActionClick(action);
      return;
    }

    // Build URL search params safely
    const params = new URLSearchParams();
    if (action.filters?.region || daktariIntelligence?.query.region) {
      params.set('region', action.filters?.region || daktariIntelligence?.query.region || '');
    }
    if (action.filters?.district || daktariIntelligence?.query.district) {
      params.set('district', action.filters?.district || daktariIntelligence?.query.district || '');
    }
    if (action.filters?.livestockType || daktariIntelligence?.query.livestockType) {
      params.set('livestock', action.filters?.livestockType || daktariIntelligence?.query.livestockType || '');
    }
    if (action.filters?.service || daktariIntelligence?.query.service) {
      params.set('service', action.filters?.service || daktariIntelligence?.query.service || '');
    }
    if (isEmergency) {
      params.set('emergency', 'true');
    }

    const queryStr = params.toString();
    navigate(queryStr ? `/daktari?${queryStr}` : '/daktari');
  };

  return (
    <div
      className={`mt-3 p-3.5 sm:p-4 rounded-2xl border transition-all ${
        isEmergency
          ? 'bg-red-50/70 border-red-200/90 text-red-950 shadow-2xs'
          : 'bg-emerald-50/60 border-emerald-200/90 text-emerald-950 shadow-2xs'
      }`}
    >
      {/* Header section */}
      <div className="flex items-start justify-between gap-2 pb-2">
        <div className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
              isEmergency
                ? 'bg-red-100 text-red-700'
                : 'bg-emerald-100 text-emerald-800'
            }`}
          >
            {isEmergency ? (
              <AlertTriangle className="w-4 h-4 text-red-600" />
            ) : (
              <Stethoscope className="w-4 h-4 text-emerald-700" />
            )}
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-bold leading-tight flex items-center gap-1.5">
              <span>{isEmergency ? 'Hali ya Dharura ya Mifugo' : 'Daktari Mtaani Kwako'}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-stone-200 text-stone-600 font-semibold">
                Huduma Rasmi
              </span>
            </h4>
            <p className="text-[11px] text-stone-600 leading-tight pt-0.5">
              {daktariIntelligence?.handoff?.explanatoryNoteSwahili ||
                (isEmergency
                  ? 'Msaada wa haraka wa daktari wa mifugo unapendekezwa.'
                  : 'AI inakusaidia kuelewa. Daktari anakusaidia kufanya uamuzi wa kitaalamu.')}
            </p>
          </div>
        </div>

        {/* Urgency Badge */}
        <span
          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border shrink-0 ${
            isEmergency
              ? 'bg-red-100 text-red-800 border-red-300'
              : 'bg-emerald-100 text-emerald-800 border-emerald-300'
          }`}
        >
          {isEmergency ? 'Dharura' : 'Mtaalamu'}
        </span>
      </div>

      {/* Recommended Doctor Profile Card (if available from V1.5G Daktari intelligence) */}
      {topDoc && (
        <div className="my-2 p-3 bg-white border border-stone-200/90 rounded-xl shadow-2xs space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-xs sm:text-sm text-stone-900">
                  {topDoc.fullName}
                </span>
                {topDoc.verificationStatus === 'VERIFIED' ? (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-800 font-semibold px-1.5 py-0.5 rounded-full border border-emerald-300">
                    <ShieldCheck className="w-3 h-3 text-emerald-600" />
                    Aliyehakikiwa
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-amber-50 text-amber-800 font-medium px-1.5 py-0.5 rounded-full border border-amber-300">
                    <AlertCircle className="w-3 h-3 text-amber-600" />
                    Amesajiliwa
                  </span>
                )}
              </div>
              <p className="text-[11px] text-stone-500 font-medium">
                {topDoc.professionalTitle} {topDoc.specialty ? `• ${topDoc.specialty}` : ''}
              </p>
            </div>

            <div className="text-[11px] text-stone-600 text-right shrink-0 flex items-center gap-1">
              <MapPin className="w-3 h-3 text-emerald-700" />
              <span>{topDoc.district ? `${topDoc.district}, ${topDoc.region}` : topDoc.region}</span>
            </div>
          </div>

          {/* Livestock tags */}
          {topDoc.livestockTypes && topDoc.livestockTypes.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 pt-0.5">
              <span className="text-[10px] text-stone-500">Mifugo:</span>
              {topDoc.livestockTypes.slice(0, 4).map((lt, idx) => (
                <span key={idx} className="text-[10px] bg-stone-100 text-stone-700 px-1.5 py-0.2 rounded font-medium">
                  {lt}
                </span>
              ))}
            </div>
          )}

          {/* Farmer-Initiated Direct Contact Buttons (ZERO AUTOMATIC CONTACT ENFORCED) */}
          <div className="pt-1.5 border-t border-stone-100 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {topDoc.phone && (
                <a
                  href={`tel:${topDoc.phone}`}
                  className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Phone className="w-3 h-3 text-emerald-700" />
                  <span>Piga Simu</span>
                </a>
              )}
              {topDoc.whatsapp && (
                <a
                  href={`https://wa.me/${topDoc.whatsapp.replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 bg-green-50 hover:bg-green-100 text-green-800 border border-green-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <MessageCircle className="w-3 h-3 text-green-700" />
                  <span>WhatsApp</span>
                </a>
              )}
            </div>

            <span className="text-[10px] text-stone-500 italic">
              *Mawasiliano ya hiari yako moja kwa moja
            </span>
          </div>
        </div>
      )}

      {/* Applied Filters preview if no top doc */}
      {!topDoc && (action.filters?.livestockType || action.filters?.region || action.filters?.emergency) && (
        <div className="flex flex-wrap items-center gap-1.5 py-1.5 text-[11px] text-stone-600">
          <span className="font-semibold text-stone-700">Vigezo vilivyotambuliwa:</span>
          {action.filters.livestockType && (
            <span className="px-2 py-0.5 bg-white border border-stone-200 rounded-md font-medium text-stone-800">
              Mifugo: <strong>{action.filters.livestockType}</strong>
            </span>
          )}
          {action.filters.region && (
            <span className="px-2 py-0.5 bg-white border border-stone-200 rounded-md font-medium text-stone-800 flex items-center gap-1">
              <MapPin className="w-3 h-3 text-emerald-700" />
              {action.filters.region}
            </span>
          )}
          {action.filters.emergency && (
            <span className="px-2 py-0.5 bg-red-100/80 border border-red-200 text-red-700 rounded-md font-medium flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Dharura 24/7
            </span>
          )}
        </div>
      )}

      {/* Action CTA Button & Privacy Guarantee */}
      <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleNavigate}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-2xs transition-colors cursor-pointer min-h-[40px] ${
            isEmergency
              ? 'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white'
              : 'bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white'
          }`}
        >
          <Stethoscope className="w-3.5 h-3.5" />
          <span>
            {action.label || (daktariIntelligence?.totalMatched ? `Tazama Madaktari (${daktariIntelligence.totalMatched})` : 'Tafuta Daktari')}
          </span>
          <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
        </button>

        <div className="flex items-center gap-1 text-[10px] text-stone-500 justify-center sm:justify-end">
          <Lock className="w-3 h-3 text-stone-400 shrink-0" />
          <span>Faragha ya Mashauriano: Mawasiliano ya moja kwa moja hayarekodiwi na AI.</span>
        </div>
      </div>

      {/* Registration ≠ Verification rule notice */}
      <div className="mt-2 pt-1.5 border-t border-stone-200/60 text-[10px] text-stone-500 leading-tight flex items-center justify-between">
        <span>Usajili siyo uthibitisho (Registration ≠ Verification).</span>
        <span className="text-stone-400">V1.5G Professional Directory</span>
      </div>
    </div>
  );
};
