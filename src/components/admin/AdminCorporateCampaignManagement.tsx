import React, { useState, useEffect } from 'react';
import {
  Megaphone,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Layers,
  ExternalLink,
  Edit2,
  Archive,
  Image as ImageIcon,
  Upload,
  Info,
  Clock,
  ShieldCheck,
  ChevronRight,
  ArrowLeft,
  X,
  Eye
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getSafeIdToken, createAdminMockJwt } from '../../utils/authUtils';
import {
  CorporateCampaign,
  CreateCampaignDraftInput,
  UpdateCampaignDraftInput
} from '../../types/corporateCampaign';
import { PlacementId } from '../../types/adPlacementTypes';
import { VALID_PLACEMENT_IDS, INITIAL_AD_PLACEMENTS } from '../../services/adPlacement/adPlacementRegistry';
import { validateSafeCampaignDestinationUrl } from '../../services/adPlacement/corporateCampaignService';

export const AdminCorporateCampaignManagement: React.FC = () => {
  const { user, loading: authLoading, isAdmin } = useAuth();

  const [campaigns, setCampaigns] = useState<CorporateCampaign[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Form / Modal State
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingCampaign, setEditingCampaign] = useState<CorporateCampaign | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isUploadingImage, setIsUploadingImage] = useState<boolean>(false);

  // Form Fields
  const [advertiserName, setAdvertiserName] = useState<string>('');
  const [campaignName, setCampaignName] = useState<string>('');
  const [placementId, setPlacementId] = useState<PlacementId>('GULIO_TOP_BANNER');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [storagePath, setStoragePath] = useState<string>('');
  const [destinationUrl, setDestinationUrl] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [internalNotes, setInternalNotes] = useState<string>('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    let token = await getSafeIdToken(user).catch(() => '');
    if (!token && user && typeof (user as any).getIdToken === 'function') {
      token = await (user as any).getIdToken().catch(() => '');
    }
    if (!token && isAdmin) {
      token = createAdminMockJwt('mkomwasaid53@gmail.com', user?.uid || 'admin_mkomwasaid53');
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  const loadCampaigns = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/corporate-campaigns', { headers });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Seva imeshindwa kupakia kampeni (HTTP ${res.status}).`);
      }
      const data = await res.json();
      if (data.success && Array.isArray(data.campaigns)) {
        setCampaigns(data.campaigns);
      }
    } catch (err: any) {
      console.error('[AdminCorporateCampaign] Hitilafu ya kupakia:', err);
      setErrorMsg(err.message || 'Hitilafu ya kupakia kampeni kutoka kwenye seva.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      loadCampaigns();
    }
  }, [authLoading, user]);


  const openCreateModal = () => {
    setEditingCampaign(null);
    setAdvertiserName('');
    setCampaignName('');
    setPlacementId('GULIO_TOP_BANNER');
    setImageUrl('');
    setStoragePath('');
    setDestinationUrl('');
    setStartDate('');
    setEndDate('');
    setInternalNotes('');
    setFormErrors({});
    setIsFormOpen(true);
  };

  const openEditModal = (camp: CorporateCampaign) => {
    setEditingCampaign(camp);
    setAdvertiserName(camp.advertiserName);
    setCampaignName(camp.campaignName);
    setPlacementId(camp.placementId);
    setImageUrl(camp.imageUrl);
    setStoragePath(camp.storagePath || '');
    setDestinationUrl(camp.destinationUrl);
    setStartDate(camp.startDate ? camp.startDate.split('T')[0] : '');
    setEndDate(camp.endDate ? camp.endDate.split('T')[0] : '');
    setInternalNotes(camp.internalNotes || '');
    setFormErrors({});
    setIsFormOpen(true);
  };

  const closeFormModal = () => {
    setIsFormOpen(false);
    setEditingCampaign(null);
    setFormErrors({});
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setFormErrors((prev) => ({
        ...prev,
        imageUrl: 'Ukubwa wa picha haupaswi kuzidi 5MB.'
      }));
      return;
    }

    // Validate type
    const validMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validMimes.includes(file.type)) {
      setFormErrors((prev) => ({
        ...prev,
        imageUrl: 'Aina ya picha hairuhusiwi. Tumia faili la JPG, PNG, au WebP.'
      }));
      return;
    }

    setIsUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      if (editingCampaign && editingCampaign.campaignId) {
        formData.append('campaignId', editingCampaign.campaignId);
      }

      const authHeaders = await getAuthHeaders();
      const uploadHeaders: Record<string, string> = {};
      if (authHeaders['Authorization']) {
        uploadHeaders['Authorization'] = authHeaders['Authorization'];
      }


      const res = await fetch('/api/admin/corporate-campaigns/upload-image', {
        method: 'POST',
        headers: uploadHeaders,
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Upakiaji wa picha umeshindwa.');
      }

      const data = await res.json();
      if (data.imageUrl) {
        setImageUrl(data.imageUrl);
        setStoragePath(data.storagePath || '');
        setFormErrors((prev) => {
          const updated = { ...prev };
          delete updated.imageUrl;
          return updated;
        });
      }
    } catch (uploadErr: any) {
      setFormErrors((prev) => ({
        ...prev,
        imageUrl: uploadErr.message || 'Hitilafu ya kupakia faili la picha.'
      }));
    } finally {
      setIsUploadingImage(false);
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!advertiserName.trim() || advertiserName.trim().length < 2) {
      errors.advertiserName = 'Jina la kampuni/mtangazaji linahitajika (angalau herufi 2).';
    }

    if (!campaignName.trim() || campaignName.trim().length < 2) {
      errors.campaignName = 'Jina la kampeni linahitajika (angalau herufi 2).';
    }

    if (!imageUrl.trim()) {
      errors.imageUrl = 'Picha ya bango la tangazo inahitajika.';
    }

    if (!destinationUrl.trim()) {
      errors.destinationUrl = 'URL ya kuelekeza inahitajika.';
    } else {
      const destCheck = validateSafeCampaignDestinationUrl(destinationUrl);
      if (!destCheck.isValid) {
        errors.destinationUrl = destCheck.error || 'URL ya marudio si salama.';
      }
    }

    if (startDate && endDate) {
      const s = new Date(startDate).getTime();
      const e = new Date(endDate).getTime();
      if (s > e) {
        errors.endDate = 'Tarehe ya mwisho haiwezi kuwa kabla ya tarehe ya kuanza.';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    setActionSuccessMsg(null);
    try {
      const headers = await getAuthHeaders();

      const payload: CreateCampaignDraftInput = {
        advertiserName: advertiserName.trim(),
        campaignName: campaignName.trim(),
        placementId,
        imageUrl: imageUrl.trim(),
        storagePath: storagePath.trim() || undefined,
        destinationUrl: destinationUrl.trim(),
        startDate: startDate ? new Date(startDate).toISOString() : null,
        endDate: endDate ? new Date(endDate).toISOString() : null,
        internalNotes: internalNotes.trim() || null
      };

      let res: Response;
      if (editingCampaign) {
        // Update existing draft
        res = await fetch(`/api/admin/corporate-campaigns/${encodeURIComponent(editingCampaign.campaignId)}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(payload)
        });
      } else {
        // Create new draft
        res = await fetch('/api/admin/corporate-campaigns', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Seva imeshindwa kuhifadhi (HTTP ${res.status}).`);
      }

      const resData = await res.json();
      const savedCampaign: CorporateCampaign = resData.campaign;

      // Update state authoritatively
      if (editingCampaign) {
        setCampaigns((prev) =>
          prev.map((c) => (c.campaignId === savedCampaign.campaignId ? savedCampaign : c))
        );
        setActionSuccessMsg(`Rasimu ya kampeni "${savedCampaign.campaignName}" imesasishwa kikamilifu.`);
      } else {
        setCampaigns((prev) => [savedCampaign, ...prev]);
        setActionSuccessMsg(`Rasimu mpya ya kampeni "${savedCampaign.campaignName}" imeundwa kikamilifu.`);
      }

      closeFormModal();
    } catch (err: any) {
      setFormErrors((prev) => ({
        ...prev,
        submit: err.message || 'Hitilafu ya kuhifadhi rasimu kwenye seva.'
      }));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArchive = async (campaign: CorporateCampaign) => {
    if (!window.confirm(`Una uhakika unataka kuhifadhi kumbukumbu (Archive) kwa kampeni "${campaign.campaignName}"?`)) {
      return;
    }

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/corporate-campaigns/${encodeURIComponent(campaign.campaignId)}/archive`, {
        method: 'POST',
        headers
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Hitilafu ya kuhifadhi kumbukumbu.');
      }

      const data = await res.json();
      if (data.campaign) {
        setCampaigns((prev) =>
          prev.map((c) => (c.campaignId === campaign.campaignId ? data.campaign : c))
        );
        setActionSuccessMsg(`Kampeni "${campaign.campaignName}" imehifadhiwa kwenye kumbukumbu (Archived).`);
      }
    } catch (err: any) {
      alert(err.message || 'Hitilafu wakati wa kuhifadhi kumbukumbu.');
    }
  };

  const destinationStatus = validateSafeCampaignDestinationUrl(destinationUrl);

  return (
    <div className="space-y-6">
      {/* Header & Governance Banner */}
      <div className="bg-white border border-stone-200/80 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-amber-50 text-amber-700 border border-amber-200/70">
                <Megaphone className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-base font-extrabold text-stone-900 tracking-tight">
                  Usimamizi wa Kampeni za Kampuni (Corporate Campaigns V1.0)
                </h2>
                <p className="text-xs text-stone-500 font-medium">
                  Awamu ya 1: Uundaji na uhariri wa rasimu za matangazo ya mashirika (Feed & Livestock Companies).
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadCampaigns}
              disabled={isLoading}
              className="px-3 py-2 text-xs font-semibold text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              title="Pakia Upya"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Pakia Upya</span>
            </button>
            <button
              onClick={openCreateModal}
              className="px-4 py-2 text-xs font-bold text-white bg-amber-700 hover:bg-amber-800 rounded-xl transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Tengeneza Rasimu Mpya</span>
            </button>
          </div>
        </div>

        {/* Phase 1 Delivery Boundary Notice */}
        <div className="mt-4 p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/60 flex items-start gap-2.5 text-xs text-amber-900 leading-relaxed">
          <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Notisi ya Utawala (Awamu ya 1): </span>
            Uundaji na uhariri wa kampeni hapa ni wa kiwango cha <strong>Rasimu (DRAFT)</strong> pekee. Kampeni hizi
            hazionekani hadharani kwa watumiaji wa kawaida na hazina huduma za malipo, mnada au mifumo ya fedha katika awamu hii.
          </div>
        </div>

        {/* Success Alert */}
        {actionSuccessMsg && (
          <div className="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{actionSuccessMsg}</span>
            </div>
            <button
              onClick={() => setActionSuccessMsg(null)}
              className="text-emerald-700 hover:text-emerald-900 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Campaign List */}
      <div className="bg-white border border-stone-200/80 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-4 border-b border-stone-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-stone-900">
              Orodha ya Rasimu za Kampeni
            </h3>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-700">
              {campaigns.length}
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-stone-500 space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-700" />
            <p className="text-xs">Inapakia rasimu za kampeni kutoka kwenye seva...</p>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-stone-100 text-stone-400 flex items-center justify-center mx-auto">
              <Megaphone className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-stone-900">Hakuna Kampeni Zilizoundwa Bado</h4>
            <p className="text-xs text-stone-500 max-w-sm mx-auto leading-relaxed">
              Bado hakuna rasimu ya kampeni ya tangazo iliyosajiliwa kwenye mfumo. Bofya kitufe hapa chini ili kuanza kusajili kampeni ya kwanza ya kampuni ya pembejeo au mifugo.
            </p>
            <button
              onClick={openCreateModal}
              className="mt-2 px-4 py-2 text-xs font-bold text-white bg-amber-700 hover:bg-amber-800 rounded-xl transition-colors cursor-pointer shadow-xs inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Tengeneza Rasimu ya Kwanza</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {campaigns.map((camp) => (
              <div
                key={camp.campaignId}
                className="p-4 sm:p-5 hover:bg-stone-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3.5">
                  {/* Thumbnail / Image Preview */}
                  <div className="w-16 h-12 rounded-lg bg-stone-100 border border-stone-200 overflow-hidden shrink-0 flex items-center justify-center">
                    {camp.imageUrl ? (
                      <img
                        src={camp.imageUrl}
                        alt={`Bango la ${camp.campaignName}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <ImageIcon className="w-5 h-5 text-stone-400" />
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-bold text-stone-900">
                        {camp.campaignName}
                      </h4>

                      {/* Status Badge */}
                      {camp.status === 'DRAFT' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                          Rasimu (DRAFT)
                        </span>
                      )}
                      {camp.status === 'ARCHIVED' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-200 text-stone-700 border border-stone-300">
                          Imehifadhiwa (ARCHIVED)
                        </span>
                      )}
                      {camp.status !== 'DRAFT' && camp.status !== 'ARCHIVED' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">
                          {camp.status}
                        </span>
                      )}

                      {/* Placement Badge */}
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-stone-100 text-stone-600 flex items-center gap-1">
                        <Layers className="w-2.5 h-2.5 text-stone-500" />
                        {camp.placementId === 'GULIO_TOP_BANNER' ? 'Gulio Top Banner' : 'Marketplace Top Banner'}
                      </span>
                    </div>

                    <p className="text-xs text-stone-600 font-medium">
                      Kampuni: <span className="font-bold text-stone-800">{camp.advertiserName}</span>
                    </p>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-stone-500 pt-0.5">
                      <span className="flex items-center gap-1">
                        <ExternalLink className="w-3 h-3 text-stone-400" />
                        <span className="truncate max-w-[200px]" title={camp.destinationUrl}>
                          {camp.destinationUrl}
                        </span>
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-stone-400" />
                        <span>Ilisasishwa: {new Date(camp.updatedAt).toLocaleDateString('sw-TZ')}</span>
                      </span>
                      <span>•</span>
                      <span>Msimamizi: {camp.updatedBy || camp.createdBy}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <button
                    onClick={() => openEditModal(camp)}
                    className="px-3 py-1.5 text-xs font-semibold text-stone-700 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Hariri</span>
                  </button>

                  {camp.status !== 'ARCHIVED' && (
                    <button
                      onClick={() => handleArchive(camp)}
                      className="px-2.5 py-1.5 text-xs font-medium text-stone-500 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
                      title="Hifadhi kwenye kumbukumbu (Archive)"
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Draft Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white border border-stone-200 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-8">
            <div className="p-5 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-amber-100 text-amber-800">
                  <Megaphone className="w-4 h-4" />
                </span>
                <h3 className="text-sm font-extrabold text-stone-900">
                  {editingCampaign ? 'Hariri Rasimu ya Kampeni' : 'Tengeneza Rasimu Mpya ya Kampeni'}
                </h3>
              </div>
              <button
                onClick={closeFormModal}
                className="text-stone-400 hover:text-stone-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDraft} className="p-5 space-y-4">
              {formErrors.submit && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formErrors.submit}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Advertiser Name */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-700">
                    Jina la Kampuni / Mtangazaji <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={advertiserName}
                    onChange={(e) => setAdvertiserName(e.target.value)}
                    placeholder="k.m. Silverlands Tanzania, Kibo Feeds"
                    className="w-full text-xs px-3 py-2 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                  />
                  {formErrors.advertiserName && (
                    <p className="text-[11px] text-rose-600 font-medium">{formErrors.advertiserName}</p>
                  )}
                </div>

                {/* Campaign Internal Name */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-700">
                    Jina la Ndani la Kampeni <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    placeholder="k.m. Kampeni ya Chakula cha Vifaranga Q1"
                    className="w-full text-xs px-3 py-2 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                  />
                  {formErrors.campaignName && (
                    <p className="text-[11px] text-rose-600 font-medium">{formErrors.campaignName}</p>
                  )}
                </div>
              </div>

              {/* Placement Selection */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-700">
                  Nafasi ya Tangazo (Placement) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={placementId}
                  onChange={(e) => setPlacementId(e.target.value as PlacementId)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 bg-white"
                >
                  <option value="GULIO_TOP_BANNER">Gulio Top Banner (Soko Kuu la Mifugo - 320x50 / 728x90)</option>
                  <option value="MARKETPLACE_TOP_BANNER">Marketplace Top Banner (Soko la Kidijitali - 320x50 / 728x90)</option>
                </select>
                <p className="text-[11px] text-stone-500">
                  Nafasi hizi zinaendana na viwango vya Ad Placement Foundation V1.0.
                </p>
              </div>

              {/* Banner Image Upload & Direct URL */}
              <div className="space-y-2 p-3.5 rounded-xl bg-stone-50 border border-stone-200">
                <label className="text-xs font-bold text-stone-800 flex items-center justify-between">
                  <span>Picha ya Bango la Tangazo (Banner Creative) <span className="text-rose-500">*</span></span>
                  <span className="text-[11px] font-normal text-stone-500">JPG, PNG, WebP (Max 5MB)</span>
                </label>

                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <label className="w-full sm:w-auto px-3 py-2 text-xs font-semibold text-stone-700 bg-white border border-stone-300 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 shrink-0">
                    <Upload className="w-3.5 h-3.5 text-amber-700" />
                    <span>{isUploadingImage ? 'Inapakia...' : 'Chagua Faili la Picha'}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleImageFileChange}
                      disabled={isUploadingImage}
                      className="hidden"
                    />
                  </label>

                  <div className="w-full">
                    <input
                      type="text"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="Au weka URL rasmi ya picha (https://...)"
                      className="w-full text-xs px-3 py-2 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 bg-white"
                    />
                  </div>
                </div>

                {formErrors.imageUrl && (
                  <p className="text-[11px] text-rose-600 font-medium">{formErrors.imageUrl}</p>
                )}

                {/* Creative Preview */}
                {imageUrl && (
                  <div className="mt-2 space-y-1">
                    <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider flex items-center gap-1">
                      <Eye className="w-3 h-3 text-stone-400" />
                      Hakikisho la Picha (Creative Preview)
                    </span>
                    <div className="border border-stone-300 rounded-xl p-2 bg-white flex items-center justify-center max-h-36 overflow-hidden">
                      <img
                        src={imageUrl}
                        alt="Hakikisho la bango la kampeni"
                        className="max-h-32 object-contain rounded-md"
                        onError={() => {
                          setFormErrors((prev) => ({
                            ...prev,
                            imageUrl: 'Picha hii ya bango haikuweza kupakuliwa kutoka Firebase Storage. Tafadhali hakikisha URL ni sahihi au pakia upya.'
                          }));
                        }}
                      />
                    </div>
                    {storagePath && (
                      <p className="text-[10px] text-stone-500 font-mono flex items-center gap-1 pt-1">
                        <span className="font-semibold text-stone-700">Njia ya Storage:</span>
                        <span className="truncate max-w-full text-amber-900 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">{storagePath}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Destination URL */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-700 flex items-center justify-between">
                  <span>URL ya Kuelekeza Mtumiaji (Destination URL) <span className="text-rose-500">*</span></span>
                  {destinationUrl && (
                    <span className={`text-[10px] font-semibold flex items-center gap-1 ${
                      destinationStatus.isValid ? 'text-emerald-700' : 'text-rose-600'
                    }`}>
                      {destinationStatus.isValid ? (
                        <>
                          <ShieldCheck className="w-3 h-3" />
                          <span>URL Salama</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3 h-3" />
                          <span>URL Isiyo Salama</span>
                        </>
                      )}
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  value={destinationUrl}
                  onChange={(e) => setDestinationUrl(e.target.value)}
                  placeholder="https://example.com/promo au /gulio"
                  className="w-full text-xs px-3 py-2 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 font-mono text-[11px]"
                />
                <p className="text-[11px] text-stone-500">
                  Inaruhusu viunganishi vya <strong>https://</strong> au njia za ndani ya app (k.m. <strong>/gulio</strong>, <strong>/marketplace</strong>). Itifaki hatarishi zimezuiwa.
                </p>
                {formErrors.destinationUrl && (
                  <p className="text-[11px] text-rose-600 font-medium">{formErrors.destinationUrl}</p>
                )}
              </div>

              {/* Campaign Schedule Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-700">
                    Tarehe ya Kuanza (Hiari)
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-700">
                    Tarehe ya Mwisho (Hiari)
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                  />
                  {formErrors.endDate && (
                    <p className="text-[11px] text-rose-600 font-medium">{formErrors.endDate}</p>
                  )}
                </div>
              </div>

              {/* Internal Notes */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-700">
                  Maelezo ya Ndani ya Wasimamizi (Internal Notes)
                </label>
                <textarea
                  rows={2}
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  placeholder="Maelezo ya kumbukumbu ya msimamizi..."
                  className="w-full text-xs px-3 py-2 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-100">
                <button
                  type="button"
                  onClick={closeFormModal}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-stone-600 hover:text-stone-800 bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors cursor-pointer"
                >
                  Ghairi / Rudi
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || isUploadingImage}
                  className="px-5 py-2 text-xs font-bold text-white bg-amber-700 hover:bg-amber-800 rounded-xl transition-colors cursor-pointer shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingCampaign ? 'Hifadhi Mabadiliko ya Rasimu' : 'Hifadhi Rasimu'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
