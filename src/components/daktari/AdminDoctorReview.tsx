import React, { useState, useEffect } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  Eye,
  Edit3,
  Ban,
  FileText,
  MapPin,
  Phone,
  MessageCircle,
  Search,
  Filter
} from 'lucide-react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import {
  ProfessionalProfile,
  ProfessionalCredentials,
  VerificationStatus
} from '../../types/daktari';
import { daktariService } from '../../services/daktariService';

export const AdminDoctorReview: React.FC = () => {
  const [doctors, setDoctors] = useState<{ profile: ProfessionalProfile; credentials?: ProfessionalCredentials }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDoctor, setSelectedDoctor] = useState<{ profile: ProfessionalProfile; credentials?: ProfessionalCredentials } | null>(null);

  // Admin action states
  const [actionType, setActionType] = useState<'verify' | 'reject' | 'needs_correction' | 'suspend' | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; isError?: boolean } | null>(null);

  const loadAllDoctors = async () => {
    setIsLoading(true);
    setStatusMsg(null);
    try {
      // 1. Load from professionals collection
      const profCol = collection(db, 'professionals');
      const snap = await getDocs(profCol);
      const list: { profile: ProfessionalProfile; credentials?: ProfessionalCredentials }[] = [];

      for (const d of snap.docs) {
        const p = d.data() as ProfessionalProfile;
        const uid = p.uid || d.id;
        // Fetch credentials (admin is authorized)
        let creds: ProfessionalCredentials | undefined = undefined;
        try {
          const cSnap = await getDoc(doc(db, 'users', uid, 'professionalProfile', 'credentials'));
          if (cSnap.exists()) {
            creds = cSnap.data() as ProfessionalCredentials;
          }
        } catch {}

        list.push({ profile: { ...p, uid }, credentials: creds });
      }

      // Also check users collection for any user who submitted profile subcollection
      try {
        const usersSnap = await getDocs(collection(db, 'users'));
        for (const uDoc of usersSnap.docs) {
          if (!list.some((item) => item.profile.uid === uDoc.id)) {
            try {
              const pRef = doc(db, 'users', uDoc.id, 'professionalProfile', 'profile');
              const pSnap = await getDoc(pRef);
              if (pSnap.exists()) {
                const p = pSnap.data() as ProfessionalProfile;
                let creds: ProfessionalCredentials | undefined = undefined;
                try {
                  const cSnap = await getDoc(doc(db, 'users', uDoc.id, 'professionalProfile', 'credentials'));
                  if (cSnap.exists()) creds = cSnap.data() as ProfessionalCredentials;
                } catch {}
                list.push({ profile: { ...p, uid: uDoc.id }, credentials: creds });
              }
            } catch {}
          }
        }
      } catch {}

      setDoctors(list);
    } catch (err) {
      console.error('Hitilafu ya kupata madaktari kwa msimamizi:', err);
      setStatusMsg({ text: 'Haikuweza kupakia orodha ya madaktari.', isError: true });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllDoctors();
  }, []);

  const handleAdminAction = async () => {
    if (!selectedDoctor || !actionType) return;
    setIsProcessing(true);
    setStatusMsg(null);
    try {
      await daktariService.adminReviewProfile(
        selectedDoctor.profile.uid,
        actionType,
        actionNotes.trim() || undefined
      );

      setStatusMsg({
        text: `Hatua ya "${
          actionType === 'verify'
            ? 'Uhakiki Umekamilika'
            : actionType === 'needs_correction'
            ? 'Marekebisho Yameombwa'
            : actionType === 'reject'
            ? 'Ombi Limekataliwa'
            : 'Wasifu Umesitishwa'
        }" imetekelezwa kikamilifu!`,
      });

      setActionType(null);
      setActionNotes('');
      await loadAllDoctors();
      setSelectedDoctor(null);
    } catch (err: any) {
      setStatusMsg({ text: err.message || 'Hitilafu ya kutekeleza hatua.', isError: true });
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredDoctors = doctors.filter((item) => {
    const p = item.profile;
    if (filterStatus !== 'all') {
      if (filterStatus === 'pending' && p.verificationStatus !== 'pending') return false;
      if (filterStatus === 'verified' && p.verificationStatus !== 'verified') return false;
      if (filterStatus === 'needs_correction' && p.verificationStatus !== 'needs_correction') return false;
      if (filterStatus === 'rejected' && p.verificationStatus !== 'rejected') return false;
      if (filterStatus === 'suspended' && p.registrationStatus !== 'suspended') return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = (p.fullName || '').toLowerCase().includes(q);
      const matchPhone = (p.phone || '').toLowerCase().includes(q);
      const matchRegion = (p.region || '').toLowerCase().includes(q);
      const matchRegNo = (item.credentials?.professionalRegistrationNumber || '').toLowerCase().includes(q);
      if (!matchName && !matchPhone && !matchRegion && !matchRegNo) return false;
    }

    return true;
  });

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-stone-900 text-white p-4 rounded-2xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-lg bg-emerald-600 text-white">
              <ShieldCheck className="w-4 h-4" />
            </span>
            <h3 className="text-sm font-bold">Uhakiki wa Madaktari na Wataalamu</h3>
          </div>
          <p className="text-xs text-stone-300 mt-1">
            Kagua vyeti vya Bodi ya Mifugo (VCT), thibitisha au sitisha wataalamu wa Daktari Mtaani Kwako.
          </p>
        </div>

        <button
          onClick={loadAllDoctors}
          disabled={isLoading}
          className="px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-center"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Onyesha Upya</span>
        </button>
      </div>

      {/* Global Status Message */}
      {statusMsg && (
        <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
          statusMsg.isError ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-emerald-50 text-emerald-900 border border-emerald-200'
        }`}>
          {statusMsg.isError ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4 text-emerald-700" />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Filters & Search */}
      <div className="bg-white border border-stone-200 rounded-2xl p-3.5 space-y-3 shadow-2xs">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tafuta kwa jina, simu, mkoa, au namba ya usajili ya VCT..."
              className="w-full pl-9 pr-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-800 focus:bg-white focus:ring-2 focus:ring-emerald-700"
            />
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-800 font-medium"
          >
            <option value="all">Hali Zote ({doctors.length})</option>
            <option value="pending">
              ⏳ Inayosubiri Uhakiki ({doctors.filter((d) => d.profile.verificationStatus === 'pending').length})
            </option>
            <option value="verified">
              ✓ Waliothibitishwa ({doctors.filter((d) => d.profile.verificationStatus === 'verified').length})
            </option>
            <option value="needs_correction">
              ⚠️ Inayohitaji Marekebisho ({doctors.filter((d) => d.profile.verificationStatus === 'needs_correction').length})
            </option>
            <option value="rejected">
              ✕ Iliyokataliwa ({doctors.filter((d) => d.profile.verificationStatus === 'rejected').length})
            </option>
            <option value="suspended">
              🚫 Waliositishwa ({doctors.filter((d) => d.profile.registrationStatus === 'suspended').length})
            </option>
          </select>
        </div>
      </div>

      {/* Doctors List */}
      {isLoading ? (
        <div className="p-8 text-center bg-white rounded-2xl border border-stone-200 space-y-2">
          <Loader2 className="w-6 h-6 text-emerald-700 animate-spin mx-auto" />
          <p className="text-xs text-stone-500">Inapakia taarifa za wataalamu...</p>
        </div>
      ) : filteredDoctors.length === 0 ? (
        <div className="p-8 text-center bg-white rounded-2xl border border-stone-200 space-y-2">
          <ShieldAlert className="w-8 h-8 text-stone-400 mx-auto" />
          <p className="text-xs font-bold text-stone-700">Hakuna wasifu unaolingana na kichujio hiki.</p>
          <p className="text-[11px] text-stone-500">Wataalamu wakijisajili wataonekana hapa kwa ajili ya ukaguzi wa vyeti.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredDoctors.map((item) => {
            const p = item.profile;
            const c = item.credentials;
            const isVerified = p.verificationStatus === 'verified';
            const isPending = p.verificationStatus === 'pending';

            return (
              <div
                key={p.uid}
                className="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm shrink-0">
                      {p.fullName ? p.fullName.slice(0, 2).toUpperCase() : 'DK'}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-sm text-stone-900">
                          {p.professionalTitle} {p.fullName}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          isVerified
                            ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                            : isPending
                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : p.verificationStatus === 'needs_correction'
                            ? 'bg-orange-100 text-orange-900 border-orange-300'
                            : p.verificationStatus === 'rejected'
                            ? 'bg-red-100 text-red-900 border-red-300'
                            : 'bg-stone-100 text-stone-700 border-stone-200'
                        }`}>
                          {isVerified
                            ? '✓ Imethibitishwa'
                            : isPending
                            ? '⏳ Uhakiki Unasubiriwa'
                            : p.verificationStatus === 'needs_correction'
                            ? '⚠️ Inahitaji Marekebisho'
                            : p.verificationStatus === 'rejected'
                            ? '✕ Imekataliwa'
                            : 'Haijahakikiwa'}
                        </span>
                      </div>
                      <p className="text-xs text-stone-500 flex items-center gap-2 pt-0.5">
                        <span>{p.professionalType}</span>
                        <span>•</span>
                        <span className="flex items-center gap-0.5">
                          <MapPin className="w-3 h-3" />
                          {p.region}{p.district ? `, ${p.district}` : ''}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-0.5">
                          <Phone className="w-3 h-3" />
                          {p.phone}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Actions buttons */}
                  <div className="flex items-center gap-1.5 self-end sm:self-center">
                    <button
                      onClick={() => setSelectedDoctor(item)}
                      className="px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 text-stone-600" />
                      <span>Kagua Vyeti & Wasifu</span>
                    </button>
                  </div>
                </div>

                {/* Credentials summary */}
                {c && (
                  <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200/80 text-xs grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <span className="text-[10.5px] text-stone-500 font-medium">Usajili wa VCT:</span>
                      <p className="font-bold text-stone-900">{c.professionalRegistrationNumber || 'Haijawekwa'}</p>
                    </div>
                    <div>
                      <span className="text-[10.5px] text-stone-500 font-medium">Taaluma & Chuo:</span>
                      <p className="font-semibold text-stone-800">{c.professionalQualification || '-'} ({c.institution || '-'})</p>
                    </div>
                    <div>
                      <span className="text-[10.5px] text-stone-500 font-medium">Mwaka:</span>
                      <p className="font-semibold text-stone-800">{c.graduationYear || '-'}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Detail & Action Review Modal */}
      {selectedDoctor && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 space-y-4 shadow-2xl border border-stone-200">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <h3 className="text-sm font-bold text-stone-900">
                Ukaguzi wa Wasifu & Vyeti vya Daktari
              </h3>
              <button
                onClick={() => {
                  setSelectedDoctor(null);
                  setActionType(null);
                  setActionNotes('');
                }}
                className="text-stone-400 hover:text-stone-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* Profile Info */}
            <div className="space-y-2 text-xs">
              <div className="p-3 bg-stone-50 rounded-xl space-y-1">
                <p><strong>Jina:</strong> {selectedDoctor.profile.professionalTitle} {selectedDoctor.profile.fullName}</p>
                <p><strong>Taaluma:</strong> {selectedDoctor.profile.professionalType}</p>
                <p><strong>Simu / WhatsApp:</strong> {selectedDoctor.profile.phone} / {selectedDoctor.profile.whatsapp}</p>
                <p><strong>Eneo:</strong> {selectedDoctor.profile.region}, {selectedDoctor.profile.district} ({selectedDoctor.profile.wardOrArea})</p>
                <p><strong>Mifugo:</strong> {selectedDoctor.profile.livestockSpecialties?.join(', ')}</p>
                <p><strong>Huduma:</strong> {selectedDoctor.profile.services?.join(', ')}</p>
                <p><strong>Hali ya Usajili / Uhakiki:</strong> {selectedDoctor.profile.registrationStatus} / {selectedDoctor.profile.verificationStatus}</p>
              </div>

              {/* Private Credentials Review */}
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl space-y-1 text-blue-950">
                <p className="font-bold flex items-center gap-1 text-blue-900">
                  <FileText className="w-3.5 h-3.5" />
                  Vyeti vya Kitaalamu (VCT & Elimu):
                </p>
                <p><strong>Namba ya Usajili VCT:</strong> {selectedDoctor.credentials?.professionalRegistrationNumber || 'Haijawasilishwa'}</p>
                <p><strong>Kiwango cha Elimu:</strong> {selectedDoctor.credentials?.professionalQualification || '-'}</p>
                <p><strong>Chuo:</strong> {selectedDoctor.credentials?.institution || '-'}</p>
                <p><strong>Mwaka wa Kuhitimu:</strong> {selectedDoctor.credentials?.graduationYear || '-'}</p>
                {selectedDoctor.credentials?.documentNotes && (
                  <p><strong>Maelezo ya Vyeti:</strong> {selectedDoctor.credentials.documentNotes}</p>
                )}
              </div>
            </div>

            {/* Admin Action Selector */}
            <div className="space-y-3 pt-2 border-t border-stone-200">
              <span className="text-xs font-bold text-stone-900">Chagua Hatua ya Kuchukua:</span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setActionType('verify')}
                  className={`p-2.5 rounded-xl border font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    actionType === 'verify' ? 'bg-emerald-700 text-white border-emerald-800' : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Thibitisha (Verify)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActionType('needs_correction')}
                  className={`p-2.5 rounded-xl border font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    actionType === 'needs_correction' ? 'bg-orange-700 text-white border-orange-800' : 'bg-orange-50 text-orange-800 border-orange-200 hover:bg-orange-100'
                  }`}
                >
                  <Edit3 className="w-4 h-4" />
                  <span>Omba Marekebisho</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActionType('reject')}
                  className={`p-2.5 rounded-xl border font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    actionType === 'reject' ? 'bg-red-700 text-white border-red-800' : 'bg-red-50 text-red-800 border-red-200 hover:bg-red-100'
                  }`}
                >
                  <XCircle className="w-4 h-4" />
                  <span>Kataa Ombi (Reject)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActionType('suspend')}
                  className={`p-2.5 rounded-xl border font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    actionType === 'suspend' ? 'bg-stone-800 text-white border-stone-900' : 'bg-stone-100 text-stone-800 border-stone-300 hover:bg-stone-200'
                  }`}
                >
                  <Ban className="w-4 h-4" />
                  <span>Sitisha Wasifu</span>
                </button>
              </div>

              {actionType && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-stone-700">
                    Maoni / Sababu kwa ajili ya Mtaalamu:
                  </label>
                  <textarea
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    rows={2}
                    placeholder={
                      actionType === 'verify'
                        ? 'Mfano: Vyeti vya SUA na usajili wa VCT vimekaguliwa na kuthibitishwa kikamilifu.'
                        : actionType === 'needs_correction'
                        ? 'Mfano: Tafadhali sasisha namba sahihi ya usajili wa VCT na chuo ulichosomea.'
                        : 'Eleza sababu ya uamuzi huu...'
                    }
                    className="w-full p-2.5 text-xs bg-stone-50 border border-stone-300 rounded-xl"
                  />

                  <button
                    type="button"
                    onClick={handleAdminAction}
                    disabled={isProcessing}
                    className="w-full py-2.5 bg-stone-900 hover:bg-black text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Tekeleza Hatua Sasa</span>}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
