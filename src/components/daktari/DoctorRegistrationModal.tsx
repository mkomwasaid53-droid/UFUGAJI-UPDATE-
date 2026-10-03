import React, { useState, useEffect } from 'react';
import {
  X,
  Stethoscope,
  ShieldCheck,
  ShieldAlert,
  Clock,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  CreditCard,
  Building2,
  FileText,
  MapPin,
  Send,
  Loader2,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  ProfessionalProfile,
  ProfessionalCredentials,
  ProfessionalType,
  VerificationStatus,
  RegistrationStatus
} from '../../types/daktari';
import { daktariService } from '../../services/daktariService';
import {
  TANZANIA_REGIONS,
  LIVESTOCK_SPECIALTIES_OPTIONS,
  VET_SERVICES_OPTIONS,
  PROFESSIONAL_TYPES_OPTIONS
} from '../../data/daktariData';

interface DoctorRegistrationModalProps {
  onClose: () => void;
  onProfileUpdated?: () => void;
}

export const DoctorRegistrationModal: React.FC<DoctorRegistrationModalProps> = ({
  onClose,
  onProfileUpdated
}) => {
  const { currentUser, userProfile } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4>(1);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; isError?: boolean } | null>(null);

  // Form states: Personal & Contact
  const [fullName, setFullName] = useState('');
  const [professionalTitle, setProfessionalTitle] = useState('Dkt.');
  const [professionalType, setProfessionalType] = useState<ProfessionalType>('Veterinarian');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');

  // Location
  const [region, setRegion] = useState('Morogoro');
  const [district, setDistrict] = useState('');
  const [wardOrArea, setWardOrArea] = useState('');
  const [locationDescription, setLocationDescription] = useState('');

  // Specialties & Services
  const [livestockSpecialties, setLivestockSpecialties] = useState<string[]>(['Kuku & Ndege wa Kienyeji']);
  const [customSpecialty, setCustomSpecialty] = useState('');
  const [services, setServices] = useState<string[]>(['Ziara ya Shamba (Farm Visit)', 'Ushauri wa Afya & Tiba ya Magonjwa']);
  const [customService, setCustomService] = useState('');
  const [availability, setAvailability] = useState('available_today');
  const [emergencyAvailable, setEmergencyAvailable] = useState(true);
  const [bio, setBio] = useState('');

  // Credentials
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [qualification, setQualification] = useState('');
  const [institution, setInstitution] = useState('');
  const [graduationYear, setGraduationYear] = useState('');
  const [documentNotes, setDocumentNotes] = useState('');

  // Existing profile reference
  const [existingProfile, setExistingProfile] = useState<ProfessionalProfile | null>(null);
  const [existingCredentials, setExistingCredentials] = useState<ProfessionalCredentials | null>(null);

  // Load existing profile if any
  useEffect(() => {
    const loadData = async () => {
      if (!currentUser) {
        setIsLoading(false);
        return;
      }

      try {
        const { profile, credentials } = await daktariService.getUserProfessionalData(currentUser.uid);

        if (profile) {
          setExistingProfile(profile);
          setFullName(profile.fullName || userProfile?.displayName || '');
          setProfessionalTitle(profile.professionalTitle || 'Dkt.');
          setProfessionalType(profile.professionalType || 'Veterinarian');
          setPhone(profile.phone || userProfile?.phone || '');
          setWhatsapp(profile.whatsapp || profile.phone || '');
          setRegion(profile.region || userProfile?.location || 'Morogoro');
          setDistrict(profile.district || '');
          setWardOrArea(profile.wardOrArea || '');
          setLocationDescription(profile.locationDescription || '');
          if (profile.livestockSpecialties && profile.livestockSpecialties.length > 0) {
            setLivestockSpecialties(profile.livestockSpecialties);
          }
          if (profile.services && profile.services.length > 0) {
            setServices(profile.services);
          }
          setAvailability(profile.availability || 'available_today');
          setEmergencyAvailable(profile.emergencyAvailable ?? true);
          setBio(profile.bio || '');
        } else {
          // Pre-populate with farmer's existing details
          setFullName(userProfile?.displayName || currentUser.displayName || '');
          setPhone(userProfile?.phone || '');
          setWhatsapp(userProfile?.phone || '');
          setRegion(userProfile?.location || 'Morogoro');
        }

        if (credentials) {
          setExistingCredentials(credentials);
          setRegistrationNumber(credentials.professionalRegistrationNumber || '');
          setQualification(credentials.professionalQualification || '');
          setInstitution(credentials.institution || '');
          setGraduationYear(String(credentials.graduationYear || ''));
          setDocumentNotes(credentials.documentNotes || '');
        }
      } catch (err) {
        console.error('Hitilafu ya kupakia wasifu wa mtaalamu:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [currentUser, userProfile]);

  const toggleSpecialty = (spec: string) => {
    setLivestockSpecialties((prev) =>
      prev.includes(spec) ? prev.filter((s) => s !== spec) : [...prev, spec]
    );
  };

  const addCustomSpecialty = () => {
    if (customSpecialty.trim() && !livestockSpecialties.includes(customSpecialty.trim())) {
      setLivestockSpecialties((prev) => [...prev, customSpecialty.trim()]);
      setCustomSpecialty('');
    }
  };

  const toggleService = (srv: string) => {
    setServices((prev) =>
      prev.includes(srv) ? prev.filter((s) => s !== srv) : [...prev, srv]
    );
  };

  const addCustomService = () => {
    if (customService.trim() && !services.includes(customService.trim())) {
      setServices((prev) => [...prev, customService.trim()]);
      setCustomService('');
    }
  };

  // Save profile draft
  const handleSaveDraft = async () => {
    if (!currentUser) return;
    if (!fullName.trim() || !phone.trim()) {
      setFeedbackMsg({ text: 'Tafadhali jaza Jina Kamili na Namba ya Simu.', isError: true });
      return;
    }

    setIsSaving(true);
    setFeedbackMsg(null);
    try {
      const updated = await daktariService.saveProfessionalProfile(
        currentUser.uid,
        {
          fullName,
          professionalTitle,
          professionalType,
          phone,
          whatsapp: whatsapp || phone,
          region,
          district,
          wardOrArea,
          locationDescription,
          livestockSpecialties,
          services,
          availability,
          emergencyAvailable,
          bio,
          registrationStatus: existingProfile?.registrationStatus || 'registered',
        },
        {
          professionalRegistrationNumber: registrationNumber,
          professionalQualification: qualification,
          institution,
          graduationYear,
          documentNotes,
        }
      );

      setExistingProfile(updated);
      setFeedbackMsg({ text: 'Wasifu umehifadhiwa kikamilifu kama rasimu.' });
      if (onProfileUpdated) onProfileUpdated();
    } catch (err: any) {
      setFeedbackMsg({ text: err.message || 'Hitilafu ya kuhifadhi wasifu.', isError: true });
    } finally {
      setIsSaving(false);
    }
  };

  // Submit profile for verification
  const handleSubmitForVerification = async () => {
    if (!currentUser) return;
    if (!fullName.trim() || !phone.trim() || !registrationNumber.trim() || !qualification.trim()) {
      setFeedbackMsg({
        text: 'Tafadhali jaza jina, simu, namba ya usajili, na kiwango cha elimu kabla ya kuwasilisha.',
        isError: true,
      });
      return;
    }

    setIsSaving(true);
    setFeedbackMsg(null);
    try {
      // 1. Save all fields first
      await daktariService.saveProfessionalProfile(
        currentUser.uid,
        {
          fullName,
          professionalTitle,
          professionalType,
          phone,
          whatsapp: whatsapp || phone,
          region,
          district,
          wardOrArea,
          locationDescription,
          livestockSpecialties,
          services,
          availability,
          emergencyAvailable,
          bio,
        },
        {
          professionalRegistrationNumber: registrationNumber,
          professionalQualification: qualification,
          institution,
          graduationYear,
          documentNotes,
        }
      );

      // 2. Submit for verification
      await daktariService.submitForVerification(currentUser.uid);

      const refreshed = await daktariService.getDoctorById(currentUser.uid);
      setExistingProfile(refreshed);
      setFeedbackMsg({
        text: 'Wasifu na vyeti vyako vimewasilishwa kikamilifu kwa wasimamizi kwa ajili ya uhakiki! Utajulishwa punde mapitio yatakapokamilika.',
      });
      if (onProfileUpdated) onProfileUpdated();
    } catch (err: any) {
      setFeedbackMsg({
        text: err.message || 'Haikuweza kuwasilisha ombi. Tafadhali jaribu tena.',
        isError: true,
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-emerald-700 animate-spin" />
          <p className="text-xs text-stone-600 font-medium">Inapakia taarifa za kitaalamu...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
    >
      <div
        className="bg-white w-full max-w-xl max-h-[92vh] sm:rounded-3xl rounded-t-3xl overflow-hidden flex flex-col shadow-2xl border border-stone-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-200 bg-stone-50/90 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-700 text-white flex items-center justify-center shadow-xs">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-stone-900">
                {existingProfile ? 'Usimamizi wa Wasifu wa Daktari' : 'Usajili wa Daktari / Mtaalamu wa Mifugo'}
              </h2>
              <p className="text-[11px] text-stone-500">Daktari Mtaani Kwako • Ufugaji Update</p>
            </div>
          </div>
          <button
            id="doctor-registration-close-btn"
            onClick={onClose}
            className="p-1.5 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Status Banners (CRITICAL: Registration is NOT Verification) */}
          {existingProfile && (
            <div className="space-y-2">
              <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200/90 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-700">Hali ya Akaunti:</span>
                  <div className="flex items-center gap-1.5">
                    {/* Registration Status */}
                    <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-md bg-stone-200 text-stone-800">
                      Usajili: {existingProfile.registrationStatus === 'submitted' ? 'Imewasilishwa' : existingProfile.registrationStatus === 'active' ? 'Hai' : 'Umesajiliwa'}
                    </span>

                    {/* Verification Status */}
                    <span className={`text-[10.5px] font-bold px-2.5 py-0.5 rounded-full border ${
                      existingProfile.verificationStatus === 'verified'
                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                        : existingProfile.verificationStatus === 'pending'
                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                        : existingProfile.verificationStatus === 'needs_correction'
                        ? 'bg-orange-100 text-orange-900 border-orange-300'
                        : existingProfile.verificationStatus === 'rejected'
                        ? 'bg-red-100 text-red-900 border-red-300'
                        : 'bg-stone-100 text-stone-700 border-stone-200'
                    }`}>
                      {existingProfile.verificationStatus === 'verified'
                        ? '✓ Imethibitishwa'
                        : existingProfile.verificationStatus === 'pending'
                        ? '⏳ Uhakiki Unasubiriwa'
                        : existingProfile.verificationStatus === 'needs_correction'
                        ? '⚠️ Marekebisho Yanahitajika'
                        : existingProfile.verificationStatus === 'rejected'
                        ? '✕ Imekataliwa'
                        : 'Haijahakikiwa'}
                    </span>
                  </div>
                </div>

                {/* Admin notes if needs correction or rejected */}
                {existingProfile.adminVerificationNotes && (
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-0.5">
                    <span className="font-bold flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-700" />
                      Maoni kutoka kwa Wasimamizi:
                    </span>
                    <p className="text-[11.5px] leading-relaxed">
                      {existingProfile.adminVerificationNotes}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Stepper Tabs */}
          <div className="grid grid-cols-4 gap-1 bg-stone-100 p-1 rounded-xl text-center text-xs font-semibold">
            <button
              onClick={() => setActiveStep(1)}
              className={`py-1.5 px-1 rounded-lg transition-colors cursor-pointer ${
                activeStep === 1 ? 'bg-white text-emerald-800 shadow-2xs font-bold' : 'text-stone-600'
              }`}
            >
              1. Taarifa
            </button>
            <button
              onClick={() => setActiveStep(2)}
              className={`py-1.5 px-1 rounded-lg transition-colors cursor-pointer ${
                activeStep === 2 ? 'bg-white text-emerald-800 shadow-2xs font-bold' : 'text-stone-600'
              }`}
            >
              2. Eneo
            </button>
            <button
              onClick={() => setActiveStep(3)}
              className={`py-1.5 px-1 rounded-lg transition-colors cursor-pointer ${
                activeStep === 3 ? 'bg-white text-emerald-800 shadow-2xs font-bold' : 'text-stone-600'
              }`}
            >
              3. Taaluma
            </button>
            <button
              onClick={() => setActiveStep(4)}
              className={`py-1.5 px-1 rounded-lg transition-colors cursor-pointer ${
                activeStep === 4 ? 'bg-white text-emerald-800 shadow-2xs font-bold' : 'text-stone-600'
              }`}
            >
              4. Malipo & Uhakiki
            </button>
          </div>

          {/* Feedback message */}
          {feedbackMsg && (
            <div className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
              feedbackMsg.isError ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-emerald-50 text-emerald-900 border border-emerald-200'
            }`}>
              {feedbackMsg.isError ? <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> : <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-700" />}
              <span className="leading-relaxed">{feedbackMsg.text}</span>
            </div>
          )}

          {/* STEP 1: Personal & Contact Information */}
          {activeStep === 1 && (
            <div className="space-y-3.5">
              <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wide">
                Taarifa za Kibinafsi & Mawasiliano
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                    Cheo / Kifupi
                  </label>
                  <select
                    value={professionalTitle}
                    onChange={(e) => setProfessionalTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:bg-white focus:ring-2 focus:ring-emerald-600"
                  >
                    <option value="Dkt.">Dkt.</option>
                    <option value="Dr.">Dr.</option>
                    <option value="Afisa Ugani">Afisa Ugani</option>
                    <option value="Afisa Mifugo">Afisa Mifugo</option>
                    <option value="Mtaalamu">Mtaalamu</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                    Jina Kamili la Kitaalamu *
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Mfano: Juma Ally Mwinyi"
                    className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:bg-white focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                  Kategoria ya Kitaalamu (Professional Type) *
                </label>
                <select
                  value={professionalType}
                  onChange={(e) => setProfessionalType(e.target.value as ProfessionalType)}
                  className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:bg-white focus:ring-2 focus:ring-emerald-600"
                >
                  {PROFESSIONAL_TYPES_OPTIONS.map((pt) => (
                    <option key={pt.value} value={pt.value}>
                      {pt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                    Namba ya Simu (Kupigiwa) *
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Mfano: 0712345678"
                    className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:bg-white focus:ring-2 focus:ring-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                    Namba ya WhatsApp
                  </label>
                  <input
                    type="tel"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="Mfano: 0712345678"
                    className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:bg-white focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setActiveStep(2)}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs rounded-xl cursor-pointer"
                >
                  Endelea na Eneo →
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Location & Services */}
          {activeStep === 2 && (
            <div className="space-y-3.5">
              <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wide">
                Eneo la Kazi & Huduma
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                    Mkoa Unaopatikana *
                  </label>
                  <select
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:bg-white focus:ring-2 focus:ring-emerald-600"
                  >
                    {TANZANIA_REGIONS.map((reg) => (
                      <option key={reg} value={reg}>
                        {reg}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                    Wilaya
                  </label>
                  <input
                    type="text"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    placeholder="Mfano: Kilosa, Ilala, Moshi Mjini"
                    className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:bg-white focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                    Kata au Mtaa / Eneo Maalum
                  </label>
                  <input
                    type="text"
                    value={wardOrArea}
                    onChange={(e) => setWardOrArea(e.target.value)}
                    placeholder="Mfano: Kimara, Msamvu, Kijenge"
                    className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:bg-white focus:ring-2 focus:ring-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                    Upatikanaji
                  </label>
                  <select
                    value={availability}
                    onChange={(e) => setAvailability(e.target.value)}
                    className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:bg-white focus:ring-2 focus:ring-emerald-600"
                  >
                    <option value="available_today">Anapatikana Leo</option>
                    <option value="weekdays">Jumatatu hadi Ijumaa</option>
                    <option value="by_appointment">Kwa Miadi Tu</option>
                    <option value="always">Muda Wote</option>
                  </select>
                </div>
              </div>

              {/* Emergency switch */}
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-stone-800">Upatikanaji wa Dharura (24/7)</span>
                  <p className="text-[11px] text-stone-500">Je, unaweza kupokea simu za dharura usiku au wikendi?</p>
                </div>
                <input
                  type="checkbox"
                  checked={emergencyAvailable}
                  onChange={(e) => setEmergencyAvailable(e.target.checked)}
                  className="w-4.5 h-4.5 text-emerald-700 rounded-md focus:ring-emerald-600 cursor-pointer"
                />
              </div>

              {/* Livestock Specialties */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold text-stone-600">
                  Mifugo Unayohudumia (Chagua):
                </label>
                <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto p-2 bg-stone-50 rounded-xl border border-stone-200">
                  {LIVESTOCK_SPECIALTIES_OPTIONS.map((spec) => (
                    <label key={spec} className="flex items-center gap-2 text-[11.5px] text-stone-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={livestockSpecialties.includes(spec)}
                        onChange={() => toggleSpecialty(spec)}
                        className="rounded text-emerald-700 focus:ring-emerald-600"
                      />
                      <span className="truncate">{spec}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Services offered */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold text-stone-600">
                  Huduma Unazotoa (Chagua):
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto p-2 bg-stone-50 rounded-xl border border-stone-200">
                  {VET_SERVICES_OPTIONS.map((srv) => (
                    <label key={srv} className="flex items-center gap-2 text-[11.5px] text-stone-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={services.includes(srv)}
                        onChange={() => toggleService(srv)}
                        className="rounded text-emerald-700 focus:ring-emerald-600"
                      />
                      <span className="truncate">{srv}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                  Wasifu Mfupi na Uzoefu (Bio)
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={2}
                  placeholder="Eleza kwa ufupi uzoefu wako, vituo unavyofanyia kazi, au msisitizo wako wa kitaalamu..."
                  className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:bg-white focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="pt-2 flex justify-between">
                <button
                  type="button"
                  onClick={() => setActiveStep(1)}
                  className="px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900 cursor-pointer font-medium"
                >
                  ← Rudi Nyuma
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStep(3)}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs rounded-xl cursor-pointer"
                >
                  Endelea na Taaluma →
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Professional Credentials (Private, Admin Review Only) */}
          {activeStep === 3 && (
            <div className="space-y-3.5">
              <div className="p-3 bg-blue-50 rounded-2xl border border-blue-200 text-xs text-blue-900 space-y-1">
                <span className="font-bold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-blue-700" />
                  Vyeti na Taarifa za Usajili wa Kitaalamu
                </span>
                <p className="text-[11px] text-blue-800 leading-relaxed">
                  Taarifa hizi zitatumika na bodi ya wasimamizi wa Ufugaji Update ili kuhakiki na kukupa beji ya <strong>Waliothibitishwa</strong>. Vyeti na namba yako ya usajili havitawekwa hadharani kwa wafugaji.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                    Namba ya Usajili wa Bodi ya Mifugo (VCT / Baraza la Mifugo) *
                  </label>
                  <input
                    type="text"
                    value={registrationNumber}
                    onChange={(e) => setRegistrationNumber(e.target.value)}
                    placeholder="Mfano: VCT/REG/2021/489 au namba ya cheti"
                    className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:bg-white focus:ring-2 focus:ring-emerald-600"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                      Kiwango cha Elimu / Shahada *
                    </label>
                    <input
                      type="text"
                      value={qualification}
                      onChange={(e) => setQualification(e.target.value)}
                      placeholder="Mfano: Bachelor of Veterinary Medicine (BVM)"
                      className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:bg-white focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                      Chuo Ulichosomea *
                    </label>
                    <input
                      type="text"
                      value={institution}
                      onChange={(e) => setInstitution(e.target.value)}
                      placeholder="Mfano: Sokoine University of Agriculture (SUA)"
                      className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:bg-white focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                      Mwaka wa Kuhitimu
                    </label>
                    <input
                      type="number"
                      value={graduationYear}
                      onChange={(e) => setGraduationYear(e.target.value)}
                      placeholder="Mfano: 2020"
                      className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:bg-white focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                      Maelezo ya Ziada kuhusu Cheti
                    </label>
                    <input
                      type="text"
                      value={documentNotes}
                      onChange={(e) => setDocumentNotes(e.target.value)}
                      placeholder="Mfano: Cheti cha VCT namba..."
                      className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:bg-white focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-between">
                <button
                  type="button"
                  onClick={() => setActiveStep(2)}
                  className="px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900 cursor-pointer font-medium"
                >
                  ← Rudi Nyuma
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStep(4)}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs rounded-xl cursor-pointer"
                >
                  Endelea na Malipo & Uhakiki →
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Monetization Architecture & Submission */}
          {activeStep === 4 && (
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wide">
                Mpango wa Usajili & Uhakiki
              </h3>

              {/* Monetization Pricing Breakdown (Section 11, 12) */}
              <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/90 space-y-3">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-700" />
                  <span className="text-xs font-bold text-stone-900">Gharama za Jukwaa kwa Wataalamu</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 bg-white rounded-xl border border-stone-200 space-y-0.5">
                    <span className="text-[10.5px] text-stone-500 font-medium">Ada ya Usajili wa Daktari</span>
                    <p className="text-sm font-bold text-emerald-800">Tsh 5,000</p>
                    <p className="text-[10px] text-stone-400">Inajumuisha mwezi 1 wa majaribio ya bure</p>
                  </div>

                  <div className="p-2.5 bg-white rounded-xl border border-stone-200 space-y-0.5">
                    <span className="text-[10.5px] text-stone-500 font-medium">Usajili wa Huduma (Kila Miezi 3)</span>
                    <p className="text-sm font-bold text-stone-800">Tsh 10,000 / Miezi 3</p>
                    <p className="text-[10px] text-stone-400">Huanza baada ya kumalizika kwa mwezi wa bure</p>
                  </div>
                </div>

                {/* Critical Product Rule: Registration is NOT Verification */}
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200/80 text-[11px] text-amber-900 space-y-1">
                  <p className="font-bold flex items-center gap-1 text-amber-800">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    Kumbuka Muhimu kuhusu Uhakiki (Verification):
                  </p>
                  <p className="leading-relaxed text-[10.5px]">
                    Kulipa ada ya usajili au usajili wa kila mwezi <strong>hakukupi beji ya Uhakiki kiotomatiki</strong>. Uhakiki hufanywa na bodi ya wasimamizi wa Ufugaji Update baada ya kukagua uhalisi wa vyeti na namba yako ya usajili ya VCT.
                  </p>
                </div>
              </div>

              {/* Payment Procedure Placeholder (Realistic, Non-Fake) */}
              <div className="p-3 bg-stone-100 rounded-xl border border-stone-200 text-xs space-y-1">
                <span className="font-semibold text-stone-800">Utaratibu wa Malipo (M-Pesa / Tigo Pesa):</span>
                <p className="text-[11px] text-stone-600 leading-relaxed">
                  Lipa Namba ya Ufugaji Update itatumwa kwenye simu yako punde wasifu wako utakapopitishwa na wasimamizi. Unaweza kuanza kwa mwezi 1 wa majaribio bure mara tu baada ya kupitishwa.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  id="doctor-submit-verification-btn"
                  onClick={handleSubmitForVerification}
                  disabled={isSaving}
                  className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 disabled:bg-stone-300 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer min-h-[44px]"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Inawasilisha...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Wasilisha Wasifu kwa Uhakiki wa Wasimamizi</span>
                    </>
                  )}
                </button>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => setActiveStep(3)}
                    className="px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900 cursor-pointer font-medium"
                  >
                    ← Rudi Nyuma
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={isSaving}
                    className="px-4 py-1.5 text-xs font-semibold text-stone-700 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 rounded-lg cursor-pointer"
                  >
                    Hifadhi Kama Rasimu
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
