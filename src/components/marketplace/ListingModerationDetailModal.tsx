/**
 * V1.7D — Listing Moderation Detail Modal
 * Phase 6: Marketplace Governance
 *
 * Displays all structured information and signals with clear source authority separation:
 * 1. Authoritative Marketplace / Governance Data
 * 2. Deterministic Listing Validation Results (V1.7B)
 * 3. Trust Signals (V1.6A–H)
 * 4. User-Generated Reports & Reviews (Claims/Allegations, NOT proof)
 * 5. Seller Free-Text Claims (Untrusted)
 * 6. AI Classification Suggestion (Guidance only)
 * 7. Moderation Audit History
 */

import React from 'react';
import {
  ModerationQueueItem,
  MODERATION_REASON_LABELS
} from '../../types/marketplaceModeration';
import {
  X,
  Shield,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  MapPin,
  Truck,
  DollarSign,
  Package,
  Layers,
  FileText,
  User,
  Store,
  ExternalLink,
  Info,
  Flag,
  MessageSquare,
  History
} from 'lucide-react';

interface ListingModerationDetailModalProps {
  item: ModerationQueueItem;
  onClose: () => void;
  onActionClick: (actionType: 'APPROVE' | 'REJECT' | 'CORRECTION' | 'HIDE' | 'SUSPEND' | 'RESTORE' | 'ESCALATE') => void;
}

export const ListingModerationDetailModal: React.FC<ListingModerationDetailModalProps> = ({
  item,
  onClose,
  onActionClick
}) => {
  const {
    product,
    moderationRecord,
    validationResult,
    priority,
    priorityReasons,
    reportCount,
    reports,
    publishedReviews,
    aiClassification,
    ownershipValidation,
    priceStockTrust,
    locationDeliveryTrust
  } = item;

  const isApproved = moderationRecord.status === 'APPROVED';
  const isSuspendedOrHidden = moderationRecord.status === 'SUSPENDED' || moderationRecord.status === 'HIDDEN';

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-stone-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-stone-200 bg-stone-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-800/80 flex items-center justify-center border border-emerald-600/40">
              <Shield className="w-4 h-4 text-emerald-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-white truncate max-w-md">
                  Ukaguzi wa Tangazo: {product.title}
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-stone-800 text-stone-300 border border-stone-700">
                  {product.productId}
                </span>
              </div>
              <p className="text-[11px] text-stone-400">
                Uchunguzi wa vigezo vya kisheria, umiliki, kundi la soko, na ripoti za watumiaji
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-stone-800">
          {/* Priority & Status Banner */}
          <div className="p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 bg-stone-50 border-stone-200">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-stone-600">Hali ya Ukaguzi:</span>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                  moderationRecord.status === 'APPROVED'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : moderationRecord.status === 'REJECTED'
                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                    : moderationRecord.status === 'SUSPENDED' || moderationRecord.status === 'HIDDEN'
                    ? 'bg-stone-200 text-stone-800 border border-stone-400'
                    : moderationRecord.status === 'UNDER_REVIEW'
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-blue-100 text-blue-800 border border-blue-300'
                }`}
              >
                {moderationRecord.status}
              </span>

              <span className="text-xs font-semibold text-stone-600 ml-2">Kipaumbele (Priority):</span>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase ${
                  priority === 'CRITICAL'
                    ? 'bg-rose-600 text-white'
                    : priority === 'HIGH'
                    ? 'bg-amber-600 text-white'
                    : priority === 'NORMAL'
                    ? 'bg-blue-600 text-white'
                    : 'bg-stone-400 text-white'
                }`}
              >
                {priority}
              </span>

              <span className="text-xs font-semibold text-stone-600 ml-2">Hali ya Tangazo:</span>
              <span className="text-xs px-2 py-0.5 rounded bg-stone-200 font-mono text-stone-800">
                {product.status}
              </span>
            </div>

            {priorityReasons.length > 0 && (
              <div className="w-full text-xs text-stone-600 pt-1 border-t border-stone-200/80">
                <span className="font-semibold text-stone-700">Sababu za kipaumbele:</span>{' '}
                {priorityReasons.join(' • ')}
              </div>
            )}
          </div>

          {/* Source Authority Hierarchy Notice */}
          <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200/80 text-[11px] text-blue-900 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Misingi ya Mamlaka ya Taarifa (Source Authority):</span>
              <p className="text-blue-800 mt-0.5 leading-relaxed">
                1. Data Rasmi ya Soko &nbsp;→&nbsp; 2. Matokeo ya Ukaguzi wa Vigezo &nbsp;→&nbsp; 3. Ishara za Uaminifu &nbsp;→&nbsp; 4. Ripoti/Maoni ya Watumiaji &nbsp;→&nbsp; 5. Maelezo ya Muuzaji &nbsp;→&nbsp; 6. Mapendekezo ya AI.
                <br />
                <span className="text-[10px] text-blue-700 font-medium">
                  Kumbuka: Ripoti si ushahidi kamili wa kosa, na maoni ya watumiaji hayathibitishi utambulisho wa muuzaji.
                </span>
              </p>
            </div>
          </div>

          {/* Two-Column Structured Inspection Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. PRODUCT & CATEGORY GOVERNANCE (V1.7A) */}
            <div className="p-4 rounded-xl border border-stone-200 bg-white space-y-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-emerald-700" /> Kundi & Taarifa za Bidhaa
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-medium border border-emerald-200">
                  V1.7A Governed
                </span>
              </div>

              <div className="space-y-1.5 text-xs">
                <div>
                  <span className="text-stone-500">Jina la Tangazo:</span>
                  <p className="font-semibold text-stone-900">{product.title}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-stone-500">Kundi Kuu (Category):</span>
                    <p className="font-medium text-stone-800">{product.category}</p>
                    <span className="text-[10px] font-mono text-stone-400">ID: {product.categoryId || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-stone-500">Kundi Dogo (Subcategory):</span>
                    <p className="font-medium text-stone-800">{product.subcategory || '—'}</p>
                    <span className="text-[10px] font-mono text-stone-400">ID: {product.subcategoryId || 'N/A'}</span>
                  </div>
                </div>
                {product.livestockLink?.type && (
                  <div>
                    <span className="text-stone-500">Mnyama/Kuku Husika:</span>
                    <p className="font-medium text-stone-800">{product.livestockLink.type}</p>
                  </div>
                )}
                <div>
                  <span className="text-stone-500">Maelezo ya Muuzaji (Seller Claims):</span>
                  <p className="text-xs text-stone-700 bg-stone-50 p-2.5 rounded-lg border border-stone-200/80 mt-1 whitespace-pre-wrap leading-relaxed">
                    {product.description || 'Hakuna maelezo yaliyotolewa.'}
                  </p>
                </div>
              </div>
            </div>

            {/* 2. SELLER IDENTITY & OWNERSHIP (V1.6A & V1.6C) */}
            <div className="p-4 rounded-xl border border-stone-200 bg-white space-y-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-blue-700" /> Umiliki & Utambulisho wa Muuzaji
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-800 font-medium border border-blue-200">
                  V1.6A / V1.6C
                </span>
              </div>

              <div className="space-y-1.5 text-xs">
                <div>
                  <span className="text-stone-500">Muuzaji (Seller):</span>
                  <p className="font-semibold text-stone-900">
                    {product.sellerName} {product.sellerBusinessName ? `(${product.sellerBusinessName})` : ''}
                  </p>
                  <p className="text-[11px] font-mono text-stone-400">UID: {product.sellerId}</p>
                </div>
                <div>
                  <span className="text-stone-500">Nambari ya Simu:</span>
                  <p className="font-mono text-stone-800">{product.sellerPhone || 'Haijawekwa'}</p>
                </div>
                <div>
                  <span className="text-stone-500">Hali ya Uhakiki wa Muuzaji (Verification Status):</span>
                  <div className="mt-0.5">
                    {product.sellerVerificationStatus === 'verified' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold text-[11px]">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" /> Muuzaji Aliyethibitishwa (Verified)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-stone-100 text-stone-700 font-medium text-[11px]">
                        <Shield className="w-3.5 h-3.5 text-stone-500" /> Hajathibitishwa (Unverified)
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-stone-400 mt-1">
                    *Kumbuka: Ukaguzi wa tangazo (Moderation) haubadili cheo hiki cha muuzaji.
                  </p>
                </div>
                <div className="pt-1 border-t border-stone-100">
                  <span className="text-stone-500">Uthibitisho wa Umiliki (Ownership Integrity):</span>
                  <p className={`text-xs font-semibold ${ownershipValidation.isValid ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {ownershipValidation.isValid ? '✓ Umiliki Umelingana (Valid Ownership)' : `✗ Utata wa Umiliki: ${ownershipValidation.errorReason || 'Inconsistent'}`}
                  </p>
                </div>
              </div>
            </div>

            {/* 3. PRICE & STOCK TRUST (V1.6D) */}
            <div className="p-4 rounded-xl border border-stone-200 bg-white space-y-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-emerald-700" /> Bei & Upatikanaji wa Akiba (Stock)
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-medium border border-emerald-200">
                  V1.6D Trust
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-stone-500">Bei Rasmi:</span>
                  <p className="text-base font-bold text-emerald-800">
                    {priceStockTrust.price.displayPrice}
                  </p>
                  <span className="text-[10px] text-stone-400">
                    Hali: {priceStockTrust.price.status}
                  </span>
                </div>
                <div>
                  <span className="text-stone-500">Idadi ya Bidhaa (Stock):</span>
                  <p className="text-base font-bold text-stone-900">
                    {priceStockTrust.stock.displayStock}
                  </p>
                  <span className="text-[10px] text-stone-400">
                    Hali: {priceStockTrust.stock.status}
                  </span>
                </div>
              </div>
              {priceStockTrust.hasDescriptionPriceConflict && (
                <div className="p-2 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Kuna mgongano kati ya bei ya tangazo na tarakimu iliyo kwenye maelezo.</span>
                </div>
              )}
            </div>

            {/* 4. LOCATION & DELIVERY TRUST (V1.6E) */}
            <div className="p-4 rounded-xl border border-stone-200 bg-white space-y-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-rose-700" /> Eneo & Usafirishaji
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-rose-50 text-rose-800 font-medium border border-rose-200">
                  V1.6E Trust
                </span>
              </div>

              <div className="space-y-1.5 text-xs">
                <div>
                  <span className="text-stone-500">Eneo lililorekodiwa:</span>
                  <p className="font-semibold text-stone-900">
                    {locationDeliveryTrust.location.displayLocation}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-stone-500">Usafirishaji (Delivery):</span>
                    <p className="font-medium text-stone-800">
                      {locationDeliveryTrust.delivery.displayDelivery}
                    </p>
                  </div>
                  <div>
                    <span className="text-stone-500">Uchukuaji (Pickup):</span>
                    <p className="font-medium text-stone-800">
                      {locationDeliveryTrust.delivery.displayPickup}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 5. V1.7B DETERMINISTIC LISTING VALIDATION RESULTS */}
          <div className="p-4 rounded-xl border border-stone-200 bg-stone-50/70 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-700" /> Matokeo ya Ukaguzi wa Vigezo (V1.7B Validation Gate)
              </span>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase ${
                  validationResult.isEligibleForActive
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-rose-100 text-rose-800 border border-rose-300'
                }`}
              >
                {validationResult.isEligibleForActive ? '✓ Ina Sifa ya Kuwa Active' : '✗ Haina Sifa ya Kuwa Active'}
              </span>
            </div>

            {validationResult.errors.length > 0 ? (
              <div className="p-3 bg-rose-50 rounded-lg border border-rose-200 space-y-1.5">
                <p className="text-xs font-bold text-rose-900 flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5 text-rose-700" /> Hitilafu Zinazozuia Tangazo:
                </p>
                <ul className="list-disc list-inside text-xs text-rose-800 space-y-0.5">
                  {validationResult.errors.map((err, i) => (
                    <li key={i}>
                      <strong className="font-mono text-[11px]">{err.checkType}:</strong> {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-emerald-800 bg-emerald-50 p-2.5 rounded-lg border border-emerald-200 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-700" /> Tangazo hili limekidhi vigezo vyote 15 vya kisheria vya mfumo.
              </p>
            )}

            {validationResult.warnings.length > 0 && (
              <div className="p-2.5 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-800 space-y-0.5">
                <span className="font-bold">Tahadhari Zisizozuia (Warnings):</span>
                {validationResult.warnings.map((w, i) => (
                  <p key={i}>• {w.message}</p>
                ))}
              </div>
            )}
          </div>

          {/* 6. AI ASSISTED CLASSIFICATION (V1.7C) — CLEARLY LABELED AS ADVISORY */}
          <div className="p-4 rounded-xl border border-amber-200/80 bg-amber-50/40 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-600" /> Pendekezo la Uainishaji wa AI (V1.7C Guidance Only)
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 font-semibold">
                Mwongozo wa Ziada — Si Uamuzi wa Mwisho
              </span>
            </div>

            {aiClassification ? (
              <div className="space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-stone-500">Hali ya Pendekezo la AI:</span>
                    <p className="font-bold text-stone-900 uppercase">{aiClassification.classificationStatus}</p>
                  </div>
                  <div>
                    <span className="text-stone-500">Kiwango cha Uhakika (AI Confidence):</span>
                    <p className="font-bold text-stone-900">{aiClassification.confidenceLevel}</p>
                  </div>
                </div>

                <div className="p-2.5 rounded bg-white border border-amber-200/60 text-xs">
                  <span className="text-stone-500">Kundi lililopendekezwa:</span>
                  <p className="font-bold text-emerald-800">
                    {aiClassification.suggestedCategoryName || 'Hakuna linalolingana moja kwa moja'}
                  </p>
                  <p className="text-stone-600 mt-1 text-[11px] leading-relaxed">
                    <strong>Ufafanuzi wa AI:</strong> {aiClassification.reason}
                  </p>
                </div>

                {aiClassification.isMismatchWithSellerCategory && (
                  <div className="p-2 bg-amber-100/70 border border-amber-300 rounded text-[11px] text-amber-900 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>
                      Tahadhari: Kundi alilochagua muuzaji linatofautiana na pendekezo la kiotomatiki la mfumo. Msimamizi anapaswa kukagua kabla ya kuamua.
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-stone-500">Hakuna uchambuzi wa AI uliorekodiwa kwa tangazo hili.</p>
            )}
          </div>

          {/* 7. REPORTS & REVIEWS (V1.6F) — CLEARLY LABELED AS ALLEGATIONS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Reports */}
            <div className="p-4 rounded-xl border border-stone-200 bg-white space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                <span className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
                  <Flag className="w-4 h-4 text-rose-600" /> Ripoti za Watumiaji ({reportCount})
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200 font-medium">
                  Madai / Allegations
                </span>
              </div>

              {reports.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {reports.map((rep, idx) => (
                    <div key={idx} className="p-2 rounded-lg bg-stone-50 border border-stone-200/80 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-rose-800 text-[11px]">{rep.reason}</span>
                        <span className="text-[10px] text-stone-400 font-mono">
                          {new Date(rep.createdAt).toLocaleDateString('sw-TZ')}
                        </span>
                      </div>
                      <p className="text-stone-700 text-[11px] italic">"{rep.description}"</p>
                    </div>
                  ))}
                  <p className="text-[10px] text-stone-400 italic">
                    *Msimamizi anakumbushwa: Ripoti moja au zaidi si uthibitisho wa kosa; fanya maamuzi kulingana na ushahidi halisi.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-stone-500 py-3 text-center">Hakuna ripoti yoyote iliyotumwa dhidi ya tangazo hili.</p>
              )}
            </div>

            {/* Reviews */}
            <div className="p-4 rounded-xl border border-stone-200 bg-white space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4 text-stone-700" /> Maoni ya Wanunuzi ({publishedReviews.length})
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-200 font-medium">
                  Uzoefu Binafsi
                </span>
              </div>

              {publishedReviews.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {publishedReviews.map((rev, idx) => (
                    <div key={idx} className="p-2 rounded-lg bg-stone-50 border border-stone-200/80 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-stone-800">{rev.authorDisplayName}</span>
                        <span className="text-amber-600 font-bold text-[11px]">★ {rev.rating}/5</span>
                      </div>
                      <p className="text-stone-700 text-[11px]">{rev.body}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-stone-500 py-3 text-center">Hakuna maoni yaliyochapishwa bado.</p>
              )}
            </div>
          </div>

          {/* 8. MODERATION HISTORY & INTERNAL NOTES */}
          {moderationRecord.lastAction && (
            <div className="p-4 rounded-xl border border-stone-200 bg-stone-50/70 space-y-2">
              <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                <History className="w-4 h-4 text-stone-600" /> Rekodi ya Ukaguzi Uliopita
              </span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-stone-500">Hatua ya Mwisho:</span>
                  <p className="font-semibold text-stone-800">{moderationRecord.lastAction}</p>
                </div>
                <div>
                  <span className="text-stone-500">Mkaguzi (Moderator):</span>
                  <p className="font-semibold text-stone-800">
                    {moderationRecord.reviewedByDisplayName || 'Msimamizi wa Mfumo'}
                  </p>
                </div>
              </div>

              {moderationRecord.publicExplanation && (
                <div className="text-xs">
                  <span className="text-stone-500 font-medium">Sababu Iliyoonekana kwa Mtumiaji:</span>
                  <p className="bg-white p-2 rounded border border-stone-200 text-stone-800 mt-0.5">
                    {moderationRecord.publicExplanation}
                  </p>
                </div>
              )}

              {moderationRecord.internalNote && (
                <div className="text-xs">
                  <span className="text-stone-500 font-medium">Kumbukumbu ya Ndani (Private Internal Note):</span>
                  <p className="bg-amber-50/60 p-2 rounded border border-amber-200 text-amber-900 mt-0.5 italic">
                    {moderationRecord.internalNote}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-5 py-3.5 border-t border-stone-200 bg-stone-50 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-stone-200 text-stone-800 hover:bg-stone-300 transition-colors cursor-pointer"
          >
            Funga
          </button>

          <div className="flex items-center gap-2 flex-wrap">
            {isSuspendedOrHidden ? (
              <button
                onClick={() => onActionClick('RESTORE')}
                className="px-3.5 py-2 text-xs font-bold rounded-xl bg-emerald-700 text-white hover:bg-emerald-800 transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" /> Rejesha Tangazo (Restore)
              </button>
            ) : (
              <>
                <button
                  onClick={() => onActionClick('CORRECTION')}
                  className="px-3 py-2 text-xs font-semibold rounded-xl bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200 transition-colors cursor-pointer"
                >
                  Omba Marekebisho
                </button>

                <button
                  onClick={() => onActionClick('HIDE')}
                  className="px-3 py-2 text-xs font-semibold rounded-xl bg-stone-200 text-stone-700 hover:bg-stone-300 transition-colors cursor-pointer"
                >
                  Ficha (Hide)
                </button>

                <button
                  onClick={() => onActionClick('SUSPEND')}
                  className="px-3 py-2 text-xs font-semibold rounded-xl bg-rose-100 text-rose-800 border border-rose-300 hover:bg-rose-200 transition-colors cursor-pointer"
                >
                  Sitisha (Suspend)
                </button>

                <button
                  onClick={() => onActionClick('REJECT')}
                  className="px-3 py-2 text-xs font-semibold rounded-xl bg-rose-700 text-white hover:bg-rose-800 transition-colors cursor-pointer shadow-xs"
                >
                  Kataa (Reject)
                </button>

                <button
                  onClick={() => onActionClick('APPROVE')}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-700 text-white hover:bg-emerald-800 transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" /> Idhinisha Tangazo (Approve)
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
