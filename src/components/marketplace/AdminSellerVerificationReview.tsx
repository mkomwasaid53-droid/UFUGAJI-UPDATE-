import React, { useState, useEffect } from 'react';
import {
  SellerVerification,
  SellerVerificationStatus,
  getSellerVerificationDisplay,
  VERIFICATION_TYPES_CONFIG
} from '../../types/sellerVerification';
import { sellerVerificationService } from '../../services/sellerVerificationService';
import { useAuth } from '../../context/AuthContext';
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  Clock,
  AlertTriangle,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  FileText,
  Building2,
  Phone,
  MapPin,
  Eye,
  Award,
  Filter,
  UserCheck,
  X
} from 'lucide-react';

export const AdminSellerVerificationReview: React.FC = () => {
  const { user } = useAuth();
  const [verifications, setVerifications] = useState<SellerVerification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSeller, setSelectedSeller] = useState<SellerVerification | null>(null);

  // Action states
  const [actionType, setActionType] = useState<'VERIFY' | 'REJECT' | 'SUSPEND' | 'UNDER_REVIEW' | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionNotes, setActionNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadVerifications = async () => {
    setIsLoading(true);
    setFeedback(null);
    try {
      const list = await sellerVerificationService.getAllSellerVerifications(undefined, null, user?.uid);
      setVerifications(list);
    } catch (err: any) {
      console.error('Hitilafu ya kupakia maombi ya uhakiki:', err);
      setFeedback({ type: 'error', text: 'Haikuweza kupakia orodha ya maombi ya uhakiki.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadVerifications();
  }, [user?.uid]);

  const handleExecuteAction = async () => {
    if (!actionType || !selectedSeller || !user?.uid) return;

    try {
      setIsProcessing(true);
      const targetId = selectedSeller.verificationId || selectedSeller.sellerId;
      const updated = await sellerVerificationService.adminReviewSellerVerification(
        user.uid,
        targetId,
        actionType,
        {
          reason: actionReason.trim(),
          notes: actionNotes.trim()
        }
      );

      // Update local state by immutable verificationId
      setVerifications((prev) =>
        prev.map((v) =>
          (v.verificationId && updated.verificationId && v.verificationId === updated.verificationId) ||
          (!v.verificationId && v.sellerId === updated.sellerId)
            ? updated
            : v
        )
      );
      setSelectedSeller(updated);
      setActionType(null);
      setActionReason('');
      setActionNotes('');
      setFeedback({
        type: 'success',
        text: `Uamuzi wa '${actionType}' kwa ${updated.businessName || updated.displayName} umekamilika kikamilifu.`
      });
    } catch (err: any) {
      console.error('Hitilafu ya kutekeleza uamuzi wa uhakiki:', err);
      setFeedback({
        type: 'error',
        text: err.message || 'Hitilafu imetokea wakati wa kutekeleza uamuzi.'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Filtered list
  const filteredList = verifications.filter((item) => {
    if (filterStatus !== 'all' && item.status !== filterStatus) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.businessName?.toLowerCase().includes(q);
      const matchOwner = item.displayName?.toLowerCase().includes(q);
      const matchPhone = item.phone?.toLowerCase().includes(q);
      const matchLoc = item.location?.toLowerCase().includes(q);
      const matchUid = item.sellerId?.toLowerCase().includes(q) || item.sellerUserId?.toLowerCase().includes(q);
      const matchAppNum = item.applicationNumber?.toLowerCase().includes(q);
      const matchVerId = item.verificationId?.toLowerCase().includes(q);
      if (!matchName && !matchOwner && !matchPhone && !matchLoc && !matchUid && !matchAppNum && !matchVerId) {
        return false;
      }
    }
    return true;
  });

  // Count stats directly from authoritative records
  const pendingCount = verifications.filter((v) =>
    ['PENDING_VERIFICATION', 'SUBMITTED', 'PAYMENT_REQUIRED', 'PAYMENT_PENDING', 'PAYMENT_CONFIRMED'].includes(v.status)
  ).length;
  const underReviewCount = verifications.filter((v) => v.status === 'UNDER_REVIEW').length;
  const verifiedCount = verifications.filter((v) => v.status === 'VERIFIED' || v.status === 'APPROVED').length;
  const rejectedCount = verifications.filter((v) => v.status === 'REJECTED').length;
  const suspendedCount = verifications.filter((v) => v.status === 'SUSPENDED').length;

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-stone-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
              V1.6A Marketplace Trust
            </span>
            <span className="text-xs font-semibold text-stone-500">
              Registered ≠ Verified Enforced
            </span>
          </div>
          <h2 className="text-xl font-bold text-stone-900 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-amber-700" />
            <span>Uhakiki wa Wauzaji (Seller Verification Review)</span>
          </h2>
          <p className="text-xs text-stone-600 mt-1 max-w-2xl">
            Kagua na uidhinishe maombi rasmi ya utambulisho wa wauzaji, mashamba, na maduka ya pembejeo (Agrovet) kwenye Gulio la Mifugo.
          </p>
        </div>

        <button
          type="button"
          onClick={loadVerifications}
          disabled={isLoading}
          className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-xl flex items-center gap-2 transition-colors cursor-pointer shrink-0 min-h-[44px]"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-amber-700' : ''}`} />
          <span>Sasisha Orodha</span>
        </button>
      </div>

      {/* Stats Counter Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div
          onClick={() => setFilterStatus('all')}
          className={`p-3 rounded-2xl border cursor-pointer transition-all ${
            filterStatus === 'all'
              ? 'bg-amber-50 border-amber-400 ring-1 ring-amber-400'
              : 'bg-white border-stone-200 hover:bg-stone-50'
          }`}
        >
          <span className="text-[11px] font-semibold text-stone-500 block">Jumla ya Maombi</span>
          <span className="text-lg font-black text-stone-900">{verifications.length}</span>
        </div>

        <div
          onClick={() => setFilterStatus('PENDING_VERIFICATION')}
          className={`p-3 rounded-2xl border cursor-pointer transition-all ${
            filterStatus === 'PENDING_VERIFICATION'
              ? 'bg-amber-50 border-amber-400 ring-1 ring-amber-400'
              : 'bg-white border-stone-200 hover:bg-stone-50'
          }`}
        >
          <span className="text-[11px] font-semibold text-amber-800 block flex items-center gap-1">
            <Clock className="w-3 h-3 text-amber-600" /> Inasubiri
          </span>
          <span className="text-lg font-black text-amber-900">{pendingCount}</span>
        </div>

        <div
          onClick={() => setFilterStatus('UNDER_REVIEW')}
          className={`p-3 rounded-2xl border cursor-pointer transition-all ${
            filterStatus === 'UNDER_REVIEW'
              ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-400'
              : 'bg-white border-stone-200 hover:bg-stone-50'
          }`}
        >
          <span className="text-[11px] font-semibold text-blue-800 block">Inakaguliwa</span>
          <span className="text-lg font-black text-blue-900">{underReviewCount}</span>
        </div>

        <div
          onClick={() => setFilterStatus('VERIFIED')}
          className={`p-3 rounded-2xl border cursor-pointer transition-all ${
            filterStatus === 'VERIFIED'
              ? 'bg-emerald-50 border-emerald-400 ring-1 ring-emerald-400'
              : 'bg-white border-stone-200 hover:bg-stone-50'
          }`}
        >
          <span className="text-[11px] font-semibold text-emerald-800 block flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-600" /> Wamethibitishwa
          </span>
          <span className="text-lg font-black text-emerald-900">{verifiedCount}</span>
        </div>

        <div
          onClick={() => setFilterStatus('REJECTED')}
          className={`p-3 rounded-2xl border cursor-pointer transition-all ${
            filterStatus === 'REJECTED'
              ? 'bg-rose-50 border-rose-400 ring-1 ring-rose-400'
              : 'bg-white border-stone-200 hover:bg-stone-50'
          }`}
        >
          <span className="text-[11px] font-semibold text-rose-800 block">Haijakubaliwa</span>
          <span className="text-lg font-black text-rose-900">{rejectedCount}</span>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 hover:bg-black/5 rounded-md cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search & Filter Controls */}
      <div className="bg-white rounded-2xl p-4 border border-stone-200 flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tafuta kwa jina la biashara, mmiliki, simu au mkoa..."
            className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white min-h-[44px]"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full sm:w-auto px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white min-h-[44px]"
          >
            <option value="all">Hali Zote za Uhakiki</option>
            <option value="PENDING_VERIFICATION">Inasubiri Uhakiki ({pendingCount})</option>
            <option value="UNDER_REVIEW">Inakaguliwa ({underReviewCount})</option>
            <option value="VERIFIED">Wamethibitishwa ({verifiedCount})</option>
            <option value="REJECTED">Hawajakubaliwa ({rejectedCount})</option>
            <option value="SUSPENDED">Wamesitishwa ({suspendedCount})</option>
          </select>
        </div>
      </div>

      {/* Applications Table / Cards */}
      {isLoading ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-stone-200 space-y-3">
          <RefreshCw className="w-6 h-6 animate-spin text-amber-700 mx-auto" />
          <p className="text-xs text-stone-500 font-medium">Inapakia maombi ya uhakiki...</p>
        </div>
      ) : filteredList.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-stone-200 space-y-3">
          <Shield className="w-10 h-10 text-stone-300 mx-auto" />
          <h4 className="text-sm font-bold text-stone-700">Hakuna Maombi Yaliyopatikana</h4>
          <p className="text-xs text-stone-500 max-w-sm mx-auto">
            Hakuna maombi ya uhakiki yanayolingana na vigezo au vichujio vilivyochaguliwa kwa sasa.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredList.map((item) => {
            const badge = getSellerVerificationDisplay(item.status);
            const typeConfig = VERIFICATION_TYPES_CONFIG.find((t) => t.type === item.verificationType);

            return (
              <div
                key={item.verificationId || item.applicationNumber || item.sellerId}
                className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-200 hover:border-amber-400 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-200 uppercase tracking-wider">
                          {typeConfig?.labelSwahili || item.verificationType}
                        </span>
                        {item.applicationNumber && (
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                            {item.applicationNumber}
                          </span>
                        )}
                        {item.currentReviewVersion && item.currentReviewVersion > 1 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-stone-200 text-stone-700">
                            v{item.currentReviewVersion}
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm sm:text-base font-bold text-stone-900">
                        {item.businessName || item.displayName}
                      </h4>
                      <p className="text-xs text-stone-500">
                        Mmiliki: <strong>{item.displayName}</strong>
                      </p>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-full border shrink-0 inline-flex items-center gap-1 ${badge.bgClass} ${badge.colorClass} ${badge.borderClass}`}
                    >
                      {item.status === 'VERIFIED' && <ShieldCheck className="w-3 h-3 text-emerald-700" />}
                      {item.status === 'PENDING_VERIFICATION' && <Clock className="w-3 h-3 text-amber-700" />}
                      {badge.badgeLabel}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-stone-600 bg-stone-50 p-2.5 rounded-xl border border-stone-200/70">
                    <div className="flex items-center gap-1.5 truncate">
                      <Phone className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                      <span className="truncate">{item.phone || 'Hakuna simu'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 truncate">
                      <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                      <span className="truncate">{item.location} {item.district ? `(${item.district})` : ''}</span>
                    </div>
                  </div>

                  {/* References & Evidence presence indicator */}
                  <div className="flex items-center gap-2 flex-wrap text-[11px] text-stone-500">
                    {item.nationalId && (
                      <span className="px-2 py-0.5 bg-stone-100 rounded-md border border-stone-200">
                        NIDA: {item.nationalId}
                      </span>
                    )}
                    {item.tinNumber && (
                      <span className="px-2 py-0.5 bg-stone-100 rounded-md border border-stone-200">
                        TIN: {item.tinNumber}
                      </span>
                    )}
                    {item.permitReference && (
                      <span className="px-2 py-0.5 bg-stone-100 rounded-md border border-stone-200 truncate max-w-[200px]">
                        Kibali: {item.permitReference}
                      </span>
                    )}
                  </div>

                  {item.rejectionReason && (
                    <div className="p-2 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-[11px]">
                      <strong>Sababu ya kukataliwa:</strong> {item.rejectionReason}
                    </div>
                  )}

                  {item.suspensionReason && (
                    <div className="p-2 bg-stone-100 border border-stone-300 rounded-xl text-stone-800 text-[11px]">
                      <strong>Sababu ya kusitishwa:</strong> {item.suspensionReason}
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-stone-100 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-stone-400">
                    Iliwasilishwa: {item.submittedAt ? new Date(item.submittedAt).toLocaleDateString('sw-TZ') : 'Hivi karibuni'}
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSeller(item);
                      setActionType(null);
                    }}
                    className="px-3.5 py-1.5 bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer min-h-[38px]"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Kagua & Chukua Hatua</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Review Modal / Drawer */}
      {selectedSeller && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-stone-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-stone-900 via-stone-800 to-amber-950 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white leading-tight">
                    Ukaguzi wa Muuzaji: {selectedSeller.businessName || selectedSeller.displayName}
                  </h3>
                  <p className="text-xs text-amber-300">
                    Seller ID: {selectedSeller.sellerId}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedSeller(null);
                  setActionType(null);
                }}
                className="p-1.5 text-stone-400 hover:text-white bg-stone-800/80 hover:bg-stone-700 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 text-xs sm:text-sm">
              {/* Current Status Box */}
              <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-stone-500 block">Hali ya Sasa:</span>
                  <span className="font-bold text-stone-900">{selectedSeller.status}</span>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-stone-500 block">Beji Inastahili:</span>
                  <span className={`font-bold ${selectedSeller.badgeEligible ? 'text-emerald-700' : 'text-stone-600'}`}>
                    {selectedSeller.badgeEligible ? 'Ndiyo (Inaonekana Sokoni)' : 'Hapana (Haijahakikiwa)'}
                  </span>
                </div>
              </div>

              {/* Full Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/70 space-y-1">
                  <span className="text-[11px] font-semibold text-stone-500">Aina ya Uhakiki</span>
                  <p className="font-bold text-stone-900">{selectedSeller.verificationType}</p>
                </div>

                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/70 space-y-1">
                  <span className="text-[11px] font-semibold text-stone-500">Mmiliki / Msimamizi</span>
                  <p className="font-bold text-stone-900">{selectedSeller.displayName}</p>
                </div>

                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/70 space-y-1">
                  <span className="text-[11px] font-semibold text-stone-500">Simu ya Mawasiliano</span>
                  <p className="font-bold text-stone-900">{selectedSeller.phone}</p>
                </div>

                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/70 space-y-1">
                  <span className="text-[11px] font-semibold text-stone-500">Eneo / Mkoa & Wilaya</span>
                  <p className="font-bold text-stone-900">
                    {selectedSeller.location} {selectedSeller.district ? `(${selectedSeller.district})` : ''}
                  </p>
                </div>

                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/70 space-y-1">
                  <span className="text-[11px] font-semibold text-stone-500">NIDA / Kitambulisho cha Taifa</span>
                  <p className="font-bold text-stone-900">{selectedSeller.nationalId || 'Haijawekwa'}</p>
                </div>

                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/70 space-y-1">
                  <span className="text-[11px] font-semibold text-stone-500">TIN / Ushuru</span>
                  <p className="font-bold text-stone-900">{selectedSeller.tinNumber || 'Haijawekwa'}</p>
                </div>
              </div>

              {selectedSeller.permitReference && (
                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/70 space-y-1">
                  <span className="text-[11px] font-semibold text-stone-500">Kumbukumbu ya Barua / Kibali</span>
                  <p className="font-bold text-stone-900">{selectedSeller.permitReference}</p>
                </div>
              )}

              {selectedSeller.documentNotes && (
                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/70 space-y-1">
                  <span className="text-[11px] font-semibold text-stone-500">Maelezo ya Uthibitisho / Shughuli</span>
                  <p className="text-stone-800 whitespace-pre-line">{selectedSeller.documentNotes}</p>
                </div>
              )}

              {selectedSeller.notes && (
                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/70 space-y-1">
                  <span className="text-[11px] font-semibold text-stone-500">Maelezo ya Ziada kutoka kwa Muuzaji</span>
                  <p className="text-stone-800 whitespace-pre-line">{selectedSeller.notes}</p>
                </div>
              )}

              {/* Action Form */}
              <div className="pt-3 border-t border-stone-200 space-y-3">
                <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
                  Chukua Hatua ya Usimamizi (Authoritative Admin Decision)
                </h4>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setActionType('VERIFY')}
                    className={`p-2.5 rounded-xl border text-center font-bold text-xs transition-all cursor-pointer ${
                      actionType === 'VERIFY'
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                        : 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100'
                    }`}
                  >
                    Idhinisha (VERIFIED)
                  </button>

                  <button
                    type="button"
                    onClick={() => setActionType('UNDER_REVIEW')}
                    className={`p-2.5 rounded-xl border text-center font-bold text-xs transition-all cursor-pointer ${
                      actionType === 'UNDER_REVIEW'
                        ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                        : 'bg-blue-50 text-blue-900 border-blue-300 hover:bg-blue-100'
                    }`}
                  >
                    Weka Chini ya Ukaguzi
                  </button>

                  <button
                    type="button"
                    onClick={() => setActionType('REJECT')}
                    className={`p-2.5 rounded-xl border text-center font-bold text-xs transition-all cursor-pointer ${
                      actionType === 'REJECT'
                        ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                        : 'bg-rose-50 text-rose-900 border-rose-300 hover:bg-rose-100'
                    }`}
                  >
                    Kataa (REJECTED)
                  </button>

                  <button
                    type="button"
                    onClick={() => setActionType('SUSPEND')}
                    className={`p-2.5 rounded-xl border text-center font-bold text-xs transition-all cursor-pointer ${
                      actionType === 'SUSPEND'
                        ? 'bg-stone-800 text-white border-stone-900 shadow-xs'
                        : 'bg-stone-100 text-stone-800 border-stone-300 hover:bg-stone-200'
                    }`}
                  >
                    Sitisha (SUSPENDED)
                  </button>
                </div>

                {actionType && (
                  <div className="space-y-2.5 p-3.5 bg-stone-100/70 rounded-2xl border border-stone-200 animate-in fade-in">
                    {(actionType === 'REJECT' || actionType === 'SUSPEND') && (
                      <div>
                        <label className="block text-xs font-semibold text-stone-800 mb-1">
                          Sababu ya {actionType === 'REJECT' ? 'Kukataa' : 'Kusitisha'} (Itaonekana kwa Muuzaji) *
                        </label>
                        <input
                          type="text"
                          required
                          value={actionReason}
                          onChange={(e) => setActionReason(e.target.value)}
                          placeholder="Mfano: Namba ya NIDA hailingani na jina la muuzaji..."
                          className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-stone-800 mb-1">
                        Maelezo ya Ndani ya Wasimamizi (Hiari)
                      </label>
                      <input
                        type="text"
                        value={actionNotes}
                        onChange={(e) => setActionNotes(e.target.value)}
                        placeholder="Kumbukumbu ya ofisi..."
                        className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setActionType(null)}
                        disabled={isProcessing}
                        className="px-3 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                      >
                        Ghairi
                      </button>

                      <button
                        type="button"
                        onClick={handleExecuteAction}
                        disabled={isProcessing}
                        className="px-4 py-1.5 bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        {isProcessing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        <span>Thibitisha Uamuzi wa {actionType}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-stone-50 border-t border-stone-200 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => {
                  setSelectedSeller(null);
                  setActionType(null);
                }}
                className="py-2 px-5 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Funga
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
