import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Shield,
  AlertTriangle,
  Ban,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  Search,
  RefreshCw,
  Plus,
  History,
  Lock,
  User,
  Store,
  ChevronRight,
  Info,
  Award,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  SellerWarning,
  SellerRestriction,
  SellerGovernanceAuditEntry,
  SellerGovernanceSummary,
  SellerWarningType,
  SellerWarningSeverity,
  SellerRestrictionType,
  SellerRestrictionScope,
  IssueWarningInput,
  ImposeRestrictionInput
} from '../../types/sellerGovernance';
import {
  getSellerGovernanceSummary,
  issueSellerWarning,
  resolveSellerWarning,
  revokeSellerWarning,
  imposeSellerRestriction,
  revokeSellerRestriction,
  fetchSellerGovernanceAuditLogs
} from '../../services/sellerGovernanceService';
import { getLocalCachedProducts } from '../../services/marketplaceService';
import {
  getSellerTrustStatus,
  updateSellerTrustStatus,
  getLocalCachedSellerProfiles
} from '../../services/sellerTrustService';
import { SellerTrustStatus, SellerProfile } from '../../types/marketplace';
import { getSafeIdToken } from '../../utils/authUtils';

export const AdminSellerGovernance: React.FC = () => {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'admin' || user?.email === 'mkomwasaid53@gmail.com';

  const [selectedSellerId, setSelectedSellerId] = useState<string>('');
  const [sellerSummary, setSellerSummary] = useState<SellerGovernanceSummary | null>(null);
  const [auditLogs, setAuditLogs] = useState<SellerGovernanceAuditEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Seller Trust state
  const [trustStatus, setTrustStatus] = useState<SellerTrustStatus>('NEW_SELLER');
  const [trustProfile, setTrustProfile] = useState<SellerProfile | null>(null);
  const [showTrustModal, setShowTrustModal] = useState(false);
  const [trustForm, setTrustForm] = useState<{
    targetStatus: SellerTrustStatus;
    reason: string;
  }>({
    targetStatus: 'TRUSTED_SELLER',
    reason: ''
  });
  const [isUpdatingTrust, setIsUpdatingTrust] = useState(false);

  // Available sellers from local marketplace data
  const [sellersList, setSellersList] = useState<{ sellerId: string; name: string; shopName?: string; productCount: number }[]>([]);

  // Modal states
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [showRestrictionModal, setShowRestrictionModal] = useState(false);
  const [showRevokeModal, setShowRevokeModal] = useState<{ type: 'WARNING' | 'RESTRICTION'; id: string } | null>(null);
  const [showResolveModal, setShowResolveModal] = useState<string | null>(null);

  // Form states for Warning
  const [warningForm, setWarningForm] = useState<{
    warningType: SellerWarningType;
    severity: SellerWarningSeverity;
    reasonCode: string;
    reasonText: string;
    internalNote: string;
    expiresInDays: number;
  }>({
    warningType: 'INVALID_CATEGORY',
    severity: 'WARNING',
    reasonCode: 'INVALID_CATEGORY',
    reasonText: 'Tangazo lako limewekwa katika kundi lisilo sahihi la bidhaa. Tafadhali chagua kundi sahihi la mifugo.',
    internalNote: '',
    expiresInDays: 30
  });

  // Form states for Restriction
  const [restrictionForm, setRestrictionForm] = useState<{
    restrictionType: SellerRestrictionType;
    scope: SellerRestrictionScope;
    reasonCode: string;
    reasonText: string;
    internalNote: string;
    expiresInDays: number;
  }>({
    restrictionType: 'LISTING_CREATE_RESTRICTED',
    scope: 'LISTING_CREATION',
    reasonCode: 'REPEATED_POLICY_VIOLATION',
    reasonText: 'Uwezo wa kuweka matangazo mapya umesitishwa kwa muda kutokana na kurudia ukiukaji wa taratibu za soko.',
    internalNote: '',
    expiresInDays: 14
  });

  const [revocationReason, setRevocationReason] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');

  // Load sellers list
  useEffect(() => {
    try {
      const products = getLocalCachedProducts();
      let shops: any[] = [];
      try {
        const raw = localStorage.getItem('ufugaji_digital_shops_cache');
        if (raw) shops = JSON.parse(raw);
      } catch {}

      const sellerMap = new Map<string, { sellerId: string; name: string; shopName?: string; productCount: number }>();

      products.forEach((p) => {
        if (!p.sellerId) return;
        const current = sellerMap.get(p.sellerId) || {
          sellerId: p.sellerId,
          name: p.sellerName || 'Mfugaji',
          shopName: undefined,
          productCount: 0
        };
        current.productCount += 1;
        sellerMap.set(p.sellerId, current);
      });

      if (Array.isArray(shops)) {
        shops.forEach((s) => {
          if (!s.sellerId) return;
          const current = sellerMap.get(s.sellerId) || {
            sellerId: s.sellerId,
            name: s.ownerName || 'Mfugaji',
            shopName: s.shopName,
            productCount: 0
          };
          current.shopName = s.shopName;
          sellerMap.set(s.sellerId, current);
        });
      }

      const sellers = Array.from(sellerMap.values());
      setSellersList(sellers);
      if (sellers.length > 0 && !selectedSellerId) {
        setSelectedSellerId(sellers[0].sellerId);
      }
    } catch {}
  }, []);

  // Load summary whenever selected seller changes
  const loadSellerData = async (sellerId: string) => {
    if (!sellerId || !isAdmin) return;
    setIsLoading(true);
    try {
      const summary = await getSellerGovernanceSummary(user?.uid || 'admin', true, sellerId);
      setSellerSummary(summary);
      const logs = await fetchSellerGovernanceAuditLogs(user?.uid || 'admin', true, sellerId);
      setAuditLogs(logs);

      // Load Authoritative Seller Trust Profile
      const profiles = getLocalCachedSellerProfiles();
      const prof = profiles.find((p) => p.uid === sellerId) || null;
      setTrustProfile(prof);
      const status = getSellerTrustStatus(sellerId, prof);
      setTrustStatus(status);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Haikuweza kupakia taarifa za usimamizi.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSellerId) {
      loadSellerData(selectedSellerId);
    }
  }, [selectedSellerId]);

  if (!isAdmin) {
    return (
      <div className="p-8 text-center bg-white rounded-2xl border border-stone-200 shadow-xs max-w-lg mx-auto">
        <Lock className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h3 className="text-base font-bold text-stone-900">Ufikiaji Umezuiwa (Access Restricted)</h3>
        <p className="text-xs text-stone-600 mt-1">
          Eneo hili linahitaji idhini rasmi ya Msimamizi Mkuu (Marketplace Governance Administrator).
        </p>
      </div>
    );
  }

  // Handle Authoritative Seller Trust Update
  const handleUpdateTrustStatus = async () => {
    if (!selectedSellerId || !user) return;
    if (!trustForm.reason.trim()) {
      setMessage({
        type: 'error',
        text: 'Tafadhali toa sababu ya kisheria na kiutawala ya kubadili hadhi ya uaminifu wa muuzaji (Mandatory Audit Reason).'
      });
      return;
    }

    try {
      setIsUpdatingTrust(true);
      const res = await updateSellerTrustStatus({
        adminUserId: user.uid,
        adminUserName: profile?.displayName || user.displayName || 'Msimamizi Mkuu',
        isAdmin: true,
        sellerId: selectedSellerId,
        newTrustStatus: trustForm.targetStatus,
        reason: trustForm.reason.trim()
      });

      // Synchronize with server-side authoritative store
      try {
        const idToken = await getSafeIdToken(user);
        await fetch(`/api/marketplace/sellers/${selectedSellerId}/trust-status`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': idToken ? `Bearer ${idToken}` : '',
            'x-user-id': user.uid,
            'x-is-admin': 'true',
            'x-user-role': 'admin'
          },
          body: JSON.stringify({
            trustStatus: trustForm.targetStatus,
            reason: trustForm.reason.trim(),
            adminUserName: profile?.displayName || user.displayName || 'Msimamizi Mkuu'
          })
        });
      } catch (srvErr) {
        console.warn('Server trust update notice:', srvErr);
      }

      setTrustProfile(res.profile);
      setTrustStatus(res.profile.trustStatus || trustForm.targetStatus);
      setMessage({
        type: 'success',
        text: `Hadhi ya uaminifu wa muuzaji ${selectedSellerId} imesasishwa kuwa '${trustForm.targetStatus}' na kurekodiwa rasmi kwenye kumbukumbu ya kiutawala.`
      });
      setShowTrustModal(false);
      setTrustForm({ targetStatus: 'TRUSTED_SELLER', reason: '' });
      await loadSellerData(selectedSellerId);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Hitilafu ya kubadilisha hadhi ya uaminifu wa muuzaji.' });
    } finally {
      setIsUpdatingTrust(false);
    }
  };

  // Action Handlers
  const handleIssueWarning = async () => {
    if (!selectedSellerId || !user) return;
    try {
      await issueSellerWarning(user.uid, profile?.displayName || user.displayName || 'Msimamizi', true, {
        targetSellerId: selectedSellerId,
        warningType: warningForm.warningType,
        severity: warningForm.severity,
        reasonCode: warningForm.reasonCode,
        reasonText: warningForm.reasonText,
        internalNote: warningForm.internalNote,
        expiresInDays: warningForm.expiresInDays > 0 ? warningForm.expiresInDays : null,
        sourceType: 'OTHER_GOVERNANCE'
      });
      setMessage({ type: 'success', text: 'Onyo rasmi limetolewa kwa muuzaji na kurekodiwa.' });
      setShowWarningModal(false);
      loadSellerData(selectedSellerId);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Hitilafu ya kutoa onyo.' });
    }
  };

  const handleImposeRestriction = async () => {
    if (!selectedSellerId || !user) return;
    try {
      await imposeSellerRestriction(user.uid, profile?.displayName || user.displayName || 'Msimamizi', true, {
        targetSellerId: selectedSellerId,
        restrictionType: restrictionForm.restrictionType,
        scope: restrictionForm.scope,
        reasonCode: restrictionForm.reasonCode,
        reasonText: restrictionForm.reasonText,
        internalNote: restrictionForm.internalNote,
        expiresInDays: restrictionForm.expiresInDays > 0 ? restrictionForm.expiresInDays : null,
        sourceType: 'OTHER_GOVERNANCE'
      });
      setMessage({ type: 'success', text: 'Kizuizi kimewekwa kwa mafanikio kulingana na upeo uliochaguliwa.' });
      setShowRestrictionModal(false);
      loadSellerData(selectedSellerId);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Hitilafu ya kuweka kizuizi.' });
    }
  };

  const handleResolveWarning = async () => {
    if (!showResolveModal || !user) return;
    try {
      await resolveSellerWarning(
        user.uid,
        profile?.displayName || user.displayName || 'Msimamizi',
        true,
        showResolveModal,
        resolutionNote
      );
      setMessage({ type: 'success', text: 'Onyo limetatuliwa kikamilifu.' });
      setShowResolveModal(null);
      setResolutionNote('');
      loadSellerData(selectedSellerId);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Hitilafu ya kutatua onyo.' });
    }
  };

  const handleRevoke = async () => {
    if (!showRevokeModal || !user || !revocationReason.trim()) return;
    try {
      if (showRevokeModal.type === 'WARNING') {
        await revokeSellerWarning(
          user.uid,
          profile?.displayName || user.displayName || 'Msimamizi',
          true,
          showRevokeModal.id,
          revocationReason
        );
        setMessage({ type: 'success', text: 'Onyo limebatilishwa na kuhifadhiwa kwenye kumbukumbu.' });
      } else {
        await revokeSellerRestriction(
          user.uid,
          profile?.displayName || user.displayName || 'Msimamizi',
          true,
          showRevokeModal.id,
          revocationReason
        );
        setMessage({ type: 'success', text: 'Kizuizi kimebatilishwa na kuhifadhiwa kwenye kumbukumbu.' });
      }
      setShowRevokeModal(null);
      setRevocationReason('');
      loadSellerData(selectedSellerId);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Hitilafu ya kubatilisha.' });
    }
  };

  const filteredSellers = sellersList.filter(
    (s) =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.sellerId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.shopName && s.shopName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-stone-200/80 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-600" />
            <h2 className="text-base font-bold text-stone-900">Usimamizi wa Maonyo na Vizuizi (Seller Governance)</h2>
            <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-900 rounded-md">V1.7E</span>
          </div>
          <p className="text-xs text-stone-600 mt-1 max-w-2xl">
            Toa maonyo yenye vielelezo rasmi na weka vizuizi vinavyodhibiti uwezo maalum wa muuzaji (Listing Creation, Editing, Selling)
            bila kubadilisha utambulisho wa muuzaji, umiliki wa duka au bei za bidhaa.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadSellerData(selectedSellerId)}
            disabled={isLoading || !selectedSellerId}
            className="p-2 text-stone-600 hover:text-emerald-700 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer border border-stone-200"
            title="Pakia Upya"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Notifications */}
      {message && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center justify-between border ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="font-bold cursor-pointer text-xs ml-2">
            ×
          </button>
        </div>
      )}

      {/* Main Grid: Seller Selector + Governance Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Sellers Directory */}
        <div className="bg-white border border-stone-200/80 rounded-2xl p-4 shadow-xs space-y-3">
          <h3 className="text-xs font-bold text-stone-900 flex items-center justify-between">
            <span>Orodha ya Wauzaji ({sellersList.length})</span>
          </h3>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-stone-400" />
            <input
              type="text"
              placeholder="Tafuta jina au ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-600"
            />
          </div>

          <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
            {filteredSellers.length === 0 ? (
              <p className="text-[11px] text-stone-500 text-center py-4">Hakuna muuzaji aliyepatikana.</p>
            ) : (
              filteredSellers.map((seller) => {
                const isSelected = seller.sellerId === selectedSellerId;
                const sTrust = getSellerTrustStatus(seller.sellerId);
                return (
                  <button
                    key={seller.sellerId}
                    onClick={() => setSelectedSellerId(seller.sellerId)}
                    className={`w-full text-left p-3 rounded-xl transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-emerald-50 border border-emerald-300 shadow-xs'
                        : 'bg-stone-50/70 hover:bg-stone-100 border border-stone-200/60'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-stone-500" />
                        {seller.name}
                      </p>
                      {seller.shopName && (
                        <p className="text-[10px] text-stone-600 flex items-center gap-1">
                          <Store className="w-3 h-3 text-stone-400" />
                          {seller.shopName}
                        </p>
                      )}
                      <p className="text-[9px] text-stone-600 font-mono">ID: {seller.sellerId.substring(0, 14)}...</p>
                      <div className="pt-0.5">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold border ${
                          sTrust === 'TRUSTED_SELLER'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : sTrust === 'RESTRICTED_SELLER'
                            ? 'bg-rose-100 text-rose-800 border-rose-300'
                            : 'bg-stone-100 text-stone-700 border-stone-200'
                        }`}>
                          {sTrust === 'TRUSTED_SELLER' ? 'TRUSTED' : sTrust === 'RESTRICTED_SELLER' ? 'RESTRICTED' : 'NEW'}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-white text-stone-700 border border-stone-200">
                        {seller.productCount} bidhaa
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-stone-400 ml-auto mt-1" />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column (2 spans): Active Governance Status, Warnings & Restrictions */}
        <div className="lg:col-span-2 space-y-6">
          {/* Authoritative Seller Trust Status Management Card */}
          {selectedSellerId && (
            <div className="bg-white border border-stone-200/80 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-stone-100">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-xl ${
                    trustStatus === 'TRUSTED_SELLER'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : trustStatus === 'RESTRICTED_SELLER'
                      ? 'bg-rose-100 text-rose-800 border border-rose-300'
                      : 'bg-amber-50 text-amber-900 border border-amber-300'
                  }`}>
                    {trustStatus === 'TRUSTED_SELLER' ? (
                      <ShieldCheck className="w-5 h-5 text-emerald-700" />
                    ) : trustStatus === 'RESTRICTED_SELLER' ? (
                      <ShieldAlert className="w-5 h-5 text-rose-700" />
                    ) : (
                      <Shield className="w-5 h-5 text-amber-700" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                      <span>Hadhi ya Uaminifu (Seller Trust):</span>
                      <span className={`px-2.5 py-0.5 rounded-lg text-xs font-bold ${
                        trustStatus === 'TRUSTED_SELLER'
                          ? 'bg-emerald-700 text-white shadow-2xs'
                          : trustStatus === 'RESTRICTED_SELLER'
                          ? 'bg-rose-700 text-white shadow-2xs'
                          : 'bg-stone-200 text-stone-800'
                      }`}>
                        {trustStatus === 'TRUSTED_SELLER'
                          ? 'TRUSTED_SELLER (Muuzaji Anayeaminika)'
                          : trustStatus === 'RESTRICTED_SELLER'
                          ? 'RESTRICTED_SELLER (Vizuizi Vinavyotumika)'
                          : 'NEW_SELLER (Muuzaji Mpya / Kawaida)'}
                      </span>
                    </h3>
                    <p className="text-[11px] text-stone-500 mt-0.5">
                      Seller ID: <span className="font-mono text-stone-700 font-semibold">{selectedSellerId}</span>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  id="admin-manage-seller-trust-btn"
                  onClick={() => {
                    setTrustForm({
                      targetStatus: trustStatus === 'TRUSTED_SELLER' ? 'NEW_SELLER' : 'TRUSTED_SELLER',
                      reason: ''
                    });
                    setShowTrustModal(true);
                  }}
                  className="px-3.5 py-2 text-xs font-bold text-white bg-amber-700 hover:bg-amber-800 active:bg-amber-900 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <Award className="w-3.5 h-3.5" />
                  <span>Badili Hadhi ya Uaminifu</span>
                </button>
              </div>

              {/* Status Explanation and Audit Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/70 space-y-1">
                  <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">Athari ya Hadhi Sokoni</span>
                  <p className="text-stone-800 leading-relaxed text-[11px]">
                    {trustStatus === 'TRUSTED_SELLER' ? (
                      'Matangazo ya muuzaji huyu yanapewa alama ya kuaminika. Kwa sasa (V1.0/V1.7), matangazo bado yanathibitishwa na wasimamizi au AI screening kabla ya kuchapishwa hadharani.'
                    ) : trustStatus === 'RESTRICTED_SELLER' ? (
                      'Muuzaji amewekewa vizuizi amilifu vya kiutawala. Vizuizi vinatangulia na kuondoa uwezo wa kuweka au kuuza matangazo sokoni.'
                    ) : (
                      'Hali ya kawaida ya mwanzo. Matangazo yote ya muuzaji mpya yanahitaji idhini rasmi ya msimamizi kabla ya kuonekana sokoni (PENDING_REVIEW).'
                    )}
                  </p>
                </div>

                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/70 space-y-1">
                  <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">Kumbukumbu ya Idhini</span>
                  {trustProfile?.trustGrantedAt ? (
                    <div className="text-[11px] text-stone-700 space-y-0.5">
                      <p>Tarehe: <span className="font-semibold">{new Date(trustProfile.trustGrantedAt).toLocaleString('sw-TZ')}</span></p>
                      <p>Msimamizi: <span className="font-semibold">{trustProfile.trustGrantedBy || 'Admin'}</span></p>
                      {trustProfile.trustReason && (
                        <p className="text-stone-600 italic">Sababu: "{trustProfile.trustReason}"</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] text-stone-500 italic">
                      Hali chaguomsingi ya kiotomatiki (Default NEW_SELLER). Hakuna uamuzi wa kipekee uliofanywa bado.
                    </p>
                  )}
                </div>
              </div>

              {/* Strict Governance Invariants Disclaimer Banner */}
              <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-[11px] text-amber-900 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <Info className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                  <span>Kanuni Zisizobadilika za Uaminifu (Non-Negotiable Trust Rules):</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-amber-800 text-[10.5px] pl-1">
                  <li>Kulipia ada au matangazo (Monetization) <strong>kamwe hakumpi</strong> muuzaji hadhi ya TRUSTED_SELLER.</li>
                  <li>Uhakiki wa nyaraka za utambulisho (NIDA/TIN) <strong>hauhusiani</strong> na TRUSTED_SELLER (Zimetenganishwa).</li>
                  <li>TRUSTED_SELLER inatolewa <strong>tu na msimamizi wa kibinadamu</strong> kwa sababu iliyoandikwa kwenye Audit Log.</li>
                  <li>Vizuizi amilifu vya kiutawala <strong>vinabatilisha</strong> hadhi yoyote ya uaminifu mara moja.</li>
                </ul>
              </div>
            </div>
          )}

          {/* Active Status Overview Card */}
          {sellerSummary && (
            <div className="bg-white border border-stone-200/80 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-stone-100">
                <div>
                  <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                    <span>Hali ya Usimamizi: {selectedSellerId}</span>
                  </h3>
                  <p className="text-[11px] text-stone-600">
                    Maonyo yanayofanya kazi: <span className="font-bold text-amber-700">{sellerSummary.activeWarningsCount}</span> | Vizuizi vinavyotumika: <span className="font-bold text-rose-700">{sellerSummary.activeRestrictions.length}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowWarningModal(true)}
                    className="px-3 py-1.5 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Toa Onyo</span>
                  </button>
                  <button
                    onClick={() => setShowRestrictionModal(true)}
                    className="px-3 py-1.5 text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>Weka Kizuizi</span>
                  </button>
                </div>
              </div>

              {/* Status Pills Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200/70">
                  <span className="text-[10px] text-stone-500 font-bold block">Listing Creation</span>
                  <span
                    className={`text-xs font-bold ${
                      sellerSummary.isListingCreateRestricted ? 'text-rose-700' : 'text-emerald-700'
                    }`}
                  >
                    {sellerSummary.isListingCreateRestricted ? 'IMEZUIWA (Blocked)' : 'INARUHUSIWA (Active)'}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200/70">
                  <span className="text-[10px] text-stone-500 font-bold block">Listing Editing</span>
                  <span
                    className={`text-xs font-bold ${
                      sellerSummary.isListingEditRestricted ? 'text-rose-700' : 'text-emerald-700'
                    }`}
                  >
                    {sellerSummary.isListingEditRestricted ? 'IMEZUIWA (Blocked)' : 'INARUHUSIWA (Active)'}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200/70">
                  <span className="text-[10px] text-stone-500 font-bold block">Marketplace Selling</span>
                  <span
                    className={`text-xs font-bold ${
                      sellerSummary.isMarketplaceSellingRestricted ? 'text-rose-700' : 'text-emerald-700'
                    }`}
                  >
                    {sellerSummary.isMarketplaceSellingRestricted ? 'IMEZUIWA (Blocked)' : 'INARUHUSIWA (Active)'}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200/70">
                  <span className="text-[10px] text-stone-500 font-bold block">Product Review</span>
                  <span
                    className={`text-xs font-bold ${
                      sellerSummary.isProductReviewRequired ? 'text-amber-700' : 'text-stone-600'
                    }`}
                  >
                    {sellerSummary.isProductReviewRequired ? 'INAHITAJIKA (Required)' : 'SI LAZIMA (Standard)'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Active Restrictions List */}
          <div className="bg-white border border-stone-200/80 rounded-2xl p-5 shadow-xs space-y-3">
            <h3 className="text-xs font-bold text-stone-900 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Ban className="w-4 h-4 text-rose-600" />
                Vizuizi Vilivyopo (Active Restrictions)
              </span>
              <span className="text-[10px] text-stone-500">
                {sellerSummary?.activeRestrictions.length || 0} vinavyofanya kazi
              </span>
            </h3>

            {!sellerSummary || sellerSummary.activeRestrictions.length === 0 ? (
              <p className="text-xs text-stone-500 italic py-2">
                Muuzaji huyu hana kizuizi chochote kinachotumika kwa sasa.
              </p>
            ) : (
              <div className="space-y-3">
                {sellerSummary.activeRestrictions.map((rst) => (
                  <div
                    key={rst.restrictionId}
                    className="p-3.5 bg-rose-50/60 border border-rose-200 rounded-xl space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-rose-200 text-rose-900 rounded-md">
                          {rst.restrictionType}
                        </span>
                        <span className="ml-2 px-2 py-0.5 text-[10px] font-bold bg-white text-stone-700 border border-stone-200 rounded-md">
                          Scope: {rst.scope}
                        </span>
                      </div>
                      <button
                        onClick={() => setShowRevokeModal({ type: 'RESTRICTION', id: rst.restrictionId })}
                        className="px-2.5 py-1 text-[11px] font-bold text-rose-800 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer border border-rose-300"
                      >
                        Batilisha Kizuizi (Revoke)
                      </button>
                    </div>

                    <p className="text-xs text-stone-800 font-medium">{rst.reasonText}</p>

                    {rst.internalNote && (
                      <div className="p-2 bg-white/80 rounded-lg text-[11px] text-stone-600 border border-rose-100">
                        <span className="font-bold text-stone-700">Ujumbe wa Ndani (Admin Note):</span> {rst.internalNote}
                      </div>
                    )}

                    <div className="flex items-center gap-4 text-[10px] text-stone-500 pt-1">
                      <span>Weka na: {rst.issuedByName}</span>
                      <span>Tarehe: {new Date(rst.issuedAt).toLocaleDateString('sw-TZ')}</span>
                      {rst.expiresAt && (
                        <span className="text-amber-700 font-bold flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Mwisho: {new Date(rst.expiresAt).toLocaleDateString('sw-TZ')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Warnings List */}
          <div className="bg-white border border-stone-200/80 rounded-2xl p-5 shadow-xs space-y-3">
            <h3 className="text-xs font-bold text-stone-900 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Kumbukumbu ya Maonyo (Seller Warnings)
              </span>
              <span className="text-[10px] text-stone-500">
                {sellerSummary?.warnings.length || 0} rekodi
              </span>
            </h3>

            {!sellerSummary || sellerSummary.warnings.length === 0 ? (
              <p className="text-xs text-stone-500 italic py-2">Hakuna onyo lililowahi kutolewa kwa muuzaji huyu.</p>
            ) : (
              <div className="space-y-3">
                {sellerSummary.warnings.map((warn) => {
                  const isWarnActive = warn.status === 'ACTIVE';
                  return (
                    <div
                      key={warn.warningId}
                      className={`p-3.5 rounded-xl border space-y-2 ${
                        isWarnActive
                          ? 'bg-amber-50/60 border-amber-200'
                          : 'bg-stone-50 border-stone-200 text-stone-600'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${
                              warn.severity === 'SERIOUS_WARNING'
                                ? 'bg-rose-100 text-rose-800'
                                : warn.severity === 'WARNING'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {warn.severity}
                          </span>
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-white text-stone-700 border border-stone-200 rounded-md">
                            {warn.status}
                          </span>
                          <span className="text-[11px] font-mono text-stone-500">{warn.warningType}</span>
                        </div>

                        {isWarnActive && (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setShowResolveModal(warn.warningId)}
                              className="px-2 py-1 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer border border-emerald-300"
                            >
                              Tatua (Resolve)
                            </button>
                            <button
                              onClick={() => setShowRevokeModal({ type: 'WARNING', id: warn.warningId })}
                              className="px-2 py-1 text-[10px] font-bold text-stone-700 hover:bg-stone-200 rounded-lg transition-colors cursor-pointer border border-stone-300"
                            >
                              Batilisha (Revoke)
                            </button>
                          </div>
                        )}
                      </div>

                      <p className="text-xs text-stone-800 font-medium">{warn.reasonText}</p>

                      {warn.internalNote && (
                        <div className="p-2 bg-white/80 rounded-lg text-[11px] text-stone-600 border border-stone-200">
                          <span className="font-bold text-stone-700">Ujumbe wa Ndani:</span> {warn.internalNote}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-3 text-[10px] text-stone-500 pt-1">
                        <span>Ilitolewa na: {warn.issuedByName}</span>
                        <span>Tarehe: {new Date(warn.issuedAt).toLocaleDateString('sw-TZ')}</span>
                        {warn.acknowledgedAt && (
                          <span className="text-emerald-700 font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Imethibitishwa na muuzaji: {new Date(warn.acknowledgedAt).toLocaleDateString('sw-TZ')}
                          </span>
                        )}
                        {warn.expiresAt && (
                          <span>Mwisho: {new Date(warn.expiresAt).toLocaleDateString('sw-TZ')}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Immutable Audit Log Table */}
          <div className="bg-white border border-stone-200/80 rounded-2xl p-5 shadow-xs space-y-3">
            <h3 className="text-xs font-bold text-stone-900 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <History className="w-4 h-4 text-stone-600" />
                Kumbukumbu ya Kudumu ya Kiutawala (Audit Trail)
              </span>
              <span className="text-[10px] text-stone-500 font-mono">{auditLogs.length} kumbukumbu</span>
            </h3>

            {auditLogs.length === 0 ? (
              <p className="text-xs text-stone-500 italic py-2">Hakuna matendo ya kiutawala yaliyorekodiwa bado.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {auditLogs.map((log) => (
                  <div
                    key={log.auditId}
                    className="p-2.5 rounded-xl bg-stone-50 border border-stone-200/70 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-stone-900 text-[11px]">{log.action}</span>
                      <span className="text-[10px] text-stone-500">
                        {new Date(log.performedAt).toLocaleString('sw-TZ')}
                      </span>
                    </div>
                    <p className="text-[11px] text-stone-600">
                      Mtekelezaji: <span className="font-semibold text-stone-800">{log.performedByName}</span> ({log.performedBy})
                    </p>
                    {log.reasonText && <p className="text-[11px] text-stone-700 italic">"{log.reasonText}"</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal: Issue Warning */}
      {showWarningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-5 max-w-lg w-full space-y-4 shadow-xl border border-stone-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Toa Onyo Rasmi kwa Muuzaji
              </h3>
              <button onClick={() => setShowWarningModal(false)} className="text-stone-400 hover:text-stone-700 font-bold text-sm cursor-pointer">
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-stone-700 block mb-1">Aina ya Onyo (Warning Type)</label>
                <select
                  value={warningForm.warningType}
                  onChange={(e) => setWarningForm({ ...warningForm, warningType: e.target.value as SellerWarningType })}
                  className="w-full text-xs p-2 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-600"
                >
                  <option value="INVALID_CATEGORY">INVALID_CATEGORY (Kundi Lisilo Sahihi)</option>
                  <option value="MISLEADING_LISTING">MISLEADING_LISTING (Taarifa Potofu)</option>
                  <option value="REPEATED_LISTING_ERRORS">REPEATED_LISTING_ERRORS (Makosa ya Mara kwa Mara)</option>
                  <option value="MISLEADING_PRICE">MISLEADING_PRICE (Bei Isiyo ya Kweli)</option>
                  <option value="MISLEADING_STOCK">MISLEADING_STOCK (Idadi Isiyo Sahihi)</option>
                  <option value="MISLEADING_LOCATION">MISLEADING_LOCATION (Eneo Lisilo Sahihi)</option>
                  <option value="DUPLICATE_LISTING">DUPLICATE_LISTING (Tangazo la Nakala/Marudio)</option>
                  <option value="NON_MARKETPLACE_CONTENT">NON_MARKETPLACE_CONTENT (Maudhui Yasio ya Sokoni)</option>
                  <option value="REPEATED_POLICY_VIOLATION">REPEATED_POLICY_VIOLATION (Kukiuka Sera)</option>
                  <option value="OTHER">OTHER (Nyinginezo)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-stone-700 block mb-1">Kiwango cha Onyo (Severity)</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['NOTICE', 'WARNING', 'SERIOUS_WARNING'] as SellerWarningSeverity[]).map((sev) => (
                    <button
                      key={sev}
                      type="button"
                      onClick={() => setWarningForm({ ...warningForm, severity: sev })}
                      className={`p-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        warningForm.severity === sev
                          ? 'bg-amber-100 border-amber-400 text-amber-900'
                          : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                      }`}
                    >
                      {sev}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-stone-700 block mb-1">
                  Maelezo kwa Muuzaji (Swahili Explanation - Seller Facing)
                </label>
                <textarea
                  rows={3}
                  value={warningForm.reasonText}
                  onChange={(e) => setWarningForm({ ...warningForm, reasonText: e.target.value })}
                  placeholder="Andika maelezo ya wazi ya taratibu zilizokiukwa na nini muuzaji anapaswa kurekebisha..."
                  className="w-full text-xs p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-600"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-stone-700 block mb-1">
                  Ujumbe wa Ndani wa Wasimamizi (Internal Note - Strictly Hidden from Seller)
                </label>
                <textarea
                  rows={2}
                  value={warningForm.internalNote}
                  onChange={(e) => setWarningForm({ ...warningForm, internalNote: e.target.value })}
                  placeholder="Kumbukumbu ya siri kwa wasimamizi wengine..."
                  className="w-full text-xs p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-600"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-stone-700 block mb-1">Muda wa Onyo (Siku)</label>
                <input
                  type="number"
                  min="0"
                  max="365"
                  value={warningForm.expiresInDays}
                  onChange={(e) => setWarningForm({ ...warningForm, expiresInDays: parseInt(e.target.value) || 0 })}
                  className="w-full text-xs p-2 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-600"
                />
                <span className="text-[10px] text-stone-500 mt-0.5 block">0 inamaanisha onyo lisilo na kikomo cha muda.</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setShowWarningModal(false)}
                className="px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
              >
                Ghairi
              </button>
              <button
                type="button"
                onClick={handleIssueWarning}
                className="px-4 py-2 text-xs font-bold text-white bg-amber-700 hover:bg-amber-800 rounded-xl transition-colors cursor-pointer"
              >
                Thibitisha Kutoa Onyo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Impose Restriction */}
      {showRestrictionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-5 max-w-lg w-full space-y-4 shadow-xl border border-stone-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                <Ban className="w-4 h-4 text-rose-600" />
                Weka Kizuizi Maalum kwa Muuzaji
              </h3>
              <button onClick={() => setShowRestrictionModal(false)} className="text-stone-400 hover:text-stone-700 font-bold text-sm cursor-pointer">
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-stone-700 block mb-1">Aina ya Kizuizi (Restriction Type)</label>
                <select
                  value={restrictionForm.restrictionType}
                  onChange={(e) => {
                    const type = e.target.value as SellerRestrictionType;
                    let sc: SellerRestrictionScope = 'LISTING_CREATION';
                    if (type === 'LISTING_EDIT_RESTRICTED') sc = 'LISTING_EDITING';
                    if (type === 'MARKETPLACE_SELLING_RESTRICTED') sc = 'MARKETPLACE_SELLING';
                    if (type === 'NEW_PRODUCT_REVIEW_REQUIRED') sc = 'PRODUCT_REVIEW';
                    setRestrictionForm({ ...restrictionForm, restrictionType: type, scope: sc });
                  }}
                  className="w-full text-xs p-2 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-600"
                >
                  <option value="LISTING_CREATE_RESTRICTED">LISTING_CREATE_RESTRICTED (Kuzuia Kuweka Matangazo Mapya)</option>
                  <option value="LISTING_EDIT_RESTRICTED">LISTING_EDIT_RESTRICTED (Kuzuia Kurekebisha Matangazo)</option>
                  <option value="MARKETPLACE_SELLING_RESTRICTED">MARKETPLACE_SELLING_RESTRICTED (Kuzuia Shughuli za Uuzaji)</option>
                  <option value="NEW_PRODUCT_REVIEW_REQUIRED">NEW_PRODUCT_REVIEW_REQUIRED (Ukaguzi wa Lazima wa Bidhaa Mpya)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-stone-700 block mb-1">
                  Maelezo kwa Muuzaji (Swahili Explanation)
                </label>
                <textarea
                  rows={3}
                  value={restrictionForm.reasonText}
                  onChange={(e) => setRestrictionForm({ ...restrictionForm, reasonText: e.target.value })}
                  placeholder="Eleza kizuizi kilichowekwa na utaratibu utakaotumika..."
                  className="w-full text-xs p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-600"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-stone-700 block mb-1">
                  Ujumbe wa Ndani wa Wasimamizi (Internal Note)
                </label>
                <textarea
                  rows={2}
                  value={restrictionForm.internalNote}
                  onChange={(e) => setRestrictionForm({ ...restrictionForm, internalNote: e.target.value })}
                  placeholder="Kumbukumbu ya kiutawala..."
                  className="w-full text-xs p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-600"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-stone-700 block mb-1">Muda wa Kizuizi (Siku)</label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={restrictionForm.expiresInDays}
                  onChange={(e) => setRestrictionForm({ ...restrictionForm, expiresInDays: parseInt(e.target.value) || 14 })}
                  className="w-full text-xs p-2 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-600"
                />
                <span className="text-[10px] text-stone-500 mt-0.5 block">Vizuizi vyote huwekewa muda na huisha kiotomatiki.</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setShowRestrictionModal(false)}
                className="px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
              >
                Ghairi
              </button>
              <button
                type="button"
                onClick={handleImposeRestriction}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 rounded-xl transition-colors cursor-pointer"
              >
                Thibitisha Kizuizi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Revoke Warning or Restriction */}
      {showRevokeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-5 max-w-md w-full space-y-4 shadow-xl border border-stone-200">
            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <XCircle className="w-4 h-4 text-rose-600" />
              Kubatilisha {showRevokeModal.type === 'WARNING' ? 'Onyo' : 'Kizuizi'}
            </h3>
            <p className="text-xs text-stone-600">
              Kubatilisha kunahitaji sababu rasmi ya kiutawala na kutahifadhiwa kwenye kumbukumbu ya kudumu ya audit.
            </p>

            <div>
              <label className="text-[11px] font-bold text-stone-700 block mb-1">Sababu ya Kubatilisha (Revocation Reason)</label>
              <textarea
                rows={3}
                value={revocationReason}
                onChange={(e) => setRevocationReason(e.target.value)}
                placeholder="Eleza kwanini hatua hii inabatilishwa..."
                className="w-full text-xs p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-600"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setShowRevokeModal(null);
                  setRevocationReason('');
                }}
                className="px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
              >
                Ghairi
              </button>
              <button
                disabled={!revocationReason.trim()}
                onClick={handleRevoke}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 disabled:opacity-50 rounded-xl transition-colors cursor-pointer"
              >
                Thibitisha Kubatilisha
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Resolve Warning */}
      {showResolveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-5 max-w-md w-full space-y-4 shadow-xl border border-stone-200">
            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Kutatua Onyo (Resolve Warning)
            </h3>
            <p className="text-xs text-stone-600">
              Onyo likitatuliwa, hali yake inakuwa RESOLVED na halitaendelea kuhesabiwa kama onyo amilifu.
            </p>

            <div>
              <label className="text-[11px] font-bold text-stone-700 block mb-1">Maelezo ya Utatuzi (Resolution Note)</label>
              <textarea
                rows={3}
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                placeholder="Muuzaji amerekebisha makosa yaliyoainishwa..."
                className="w-full text-xs p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-600"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setShowResolveModal(null);
                  setResolutionNote('');
                }}
                className="px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
              >
                Ghairi
              </button>
              <button
                onClick={handleResolveWarning}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl transition-colors cursor-pointer"
              >
                Weka Kama Limetatuliwa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Change Seller Trust Status */}
      {showTrustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-5 max-w-lg w-full space-y-4 shadow-xl border border-stone-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-600" />
                Badili Hadhi ya Uaminifu wa Muuzaji (Seller Trust Status)
              </h3>
              <button
                type="button"
                onClick={() => setShowTrustModal(false)}
                className="text-stone-400 hover:text-stone-700 font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/70 text-xs">
              <p className="text-stone-600">
                Muuzaji: <strong className="text-stone-900 font-mono">{selectedSellerId}</strong>
              </p>
              <p className="text-stone-600 mt-0.5">
                Hadhi ya Sasa: <strong className="text-amber-800">{trustStatus}</strong>
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-stone-700 block mb-1">
                  Chagua Hadhi Mpya ya Uaminifu (Target Trust Status) *
                </label>
                <div className="grid grid-cols-1 gap-2">
                  <label className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all ${
                    trustForm.targetStatus === 'TRUSTED_SELLER'
                      ? 'bg-emerald-50 border-emerald-400 ring-1 ring-emerald-400'
                      : 'bg-white border-stone-200 hover:bg-stone-50'
                  }`}>
                    <input
                      type="radio"
                      name="trustStatusOption"
                      value="TRUSTED_SELLER"
                      checked={trustForm.targetStatus === 'TRUSTED_SELLER'}
                      onChange={() => setTrustForm({ ...trustForm, targetStatus: 'TRUSTED_SELLER' })}
                      className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="text-xs font-bold text-emerald-900 block">TRUSTED_SELLER (Muuzaji Anayeaminika)</span>
                      <span className="text-[11px] text-emerald-700 block mt-0.5">
                        Hutolewa kwa uamuzi wa kiutawala baada ya muuzaji kudhihirisha uadilifu na kufuata miongozo ya soko.
                      </span>
                    </div>
                  </label>

                  <label className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all ${
                    trustForm.targetStatus === 'NEW_SELLER'
                      ? 'bg-stone-100 border-stone-400 ring-1 ring-stone-400'
                      : 'bg-white border-stone-200 hover:bg-stone-50'
                  }`}>
                    <input
                      type="radio"
                      name="trustStatusOption"
                      value="NEW_SELLER"
                      checked={trustForm.targetStatus === 'NEW_SELLER'}
                      onChange={() => setTrustForm({ ...trustForm, targetStatus: 'NEW_SELLER' })}
                      className="mt-0.5 text-stone-600 focus:ring-stone-500"
                    />
                    <div>
                      <span className="text-xs font-bold text-stone-900 block">NEW_SELLER (Muuzaji Mpya / Kawaida)</span>
                      <span className="text-[11px] text-stone-600 block mt-0.5">
                        Hali chaguomsingi. Matangazo yote yanahitaji ukaguzi na idhini kabla ya kuonekana sokoni.
                      </span>
                    </div>
                  </label>

                  <label className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all ${
                    trustForm.targetStatus === 'RESTRICTED_SELLER'
                      ? 'bg-rose-50 border-rose-400 ring-1 ring-rose-400'
                      : 'bg-white border-stone-200 hover:bg-stone-50'
                  }`}>
                    <input
                      type="radio"
                      name="trustStatusOption"
                      value="RESTRICTED_SELLER"
                      checked={trustForm.targetStatus === 'RESTRICTED_SELLER'}
                      onChange={() => setTrustForm({ ...trustForm, targetStatus: 'RESTRICTED_SELLER' })}
                      className="mt-0.5 text-rose-600 focus:ring-rose-500"
                    />
                    <div>
                      <span className="text-xs font-bold text-rose-900 block">RESTRICTED_SELLER (Vizuizi vya Kiutawala)</span>
                      <span className="text-[11px] text-rose-700 block mt-0.5">
                        Uwezo wa kuweka au kuuza matangazo umesitishwa kwa mujibu wa sera za usimamizi wa soko.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-stone-700 block mb-1">
                  Sababu ya Kiutawala (Administrative Reason - Lazima kwa Kumbukumbu ya Audit) *
                </label>
                <textarea
                  rows={3}
                  required
                  value={trustForm.reason}
                  onChange={(e) => setTrustForm({ ...trustForm, reason: e.target.value })}
                  placeholder="Eleza kwanini hadhi hii inatolewa au kubadilishwa (e.g. Uamuzi wa kiutawala baada ya ukaguzi kamili wa historia)..."
                  className="w-full text-xs p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-600"
                />
                <span className="text-[10px] text-stone-500 mt-0.5 block">
                  Uamuzi huu utarekodiwa moja kwa moja kwenye Audit Trail (aud_trust_...) ukiwa na kitambulisho chako cha msimamizi.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setShowTrustModal(false)}
                disabled={isUpdatingTrust}
                className="px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
              >
                Ghairi
              </button>
              <button
                type="button"
                id="admin-confirm-seller-trust-btn"
                disabled={isUpdatingTrust || !trustForm.reason.trim()}
                onClick={handleUpdateTrustStatus}
                className="px-4 py-2 text-xs font-bold text-white bg-amber-700 hover:bg-amber-800 disabled:opacity-50 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {isUpdatingTrust ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Inasasisha...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Thibitisha Hadhi Mpya</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
