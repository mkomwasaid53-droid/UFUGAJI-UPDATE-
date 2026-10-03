import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Stethoscope,
  Search,
  Filter,
  ShieldCheck,
  MapPin,
  Clock,
  Phone,
  MessageCircle,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Bot,
  UserPlus,
  RefreshCw,
  Loader2,
  X,
  SlidersHorizontal,
  ChevronDown,
  Info,
  Shield,
  ArrowRight
} from 'lucide-react';
import { ProfessionalProfile, DoctorFilterOptions } from '../types/daktari';
import { daktariService } from '../services/daktariService';
import { DoctorCard } from '../components/daktari/DoctorCard';
import { DoctorDetailModal } from '../components/daktari/DoctorDetailModal';
import { DoctorRegistrationModal } from '../components/daktari/DoctorRegistrationModal';
import {
  TANZANIA_REGIONS,
  LIVESTOCK_SPECIALTIES_OPTIONS,
  VET_SERVICES_OPTIONS
} from '../data/daktariData';

export const Daktari: React.FC = () => {
  const { currentUser, role } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Directory state
  const [doctors, setDoctors] = useState<ProfessionalProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDoctor, setSelectedDoctor] = useState<ProfessionalProfile | null>(null);
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);

  // User's own doctor profile state (if any)
  const [userDoctorProfile, setUserDoctorProfile] = useState<ProfessionalProfile | null>(null);

  // Filter States initialized from URL search params (e.g. from AI Assistant CTA)
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') || searchParams.get('query') || '');
  const [selectedRegion, setSelectedRegion] = useState(() => searchParams.get('region') || 'all');
  const [selectedDistrict, setSelectedDistrict] = useState(() => searchParams.get('district') || '');
  const [selectedSpecialty, setSelectedSpecialty] = useState(() => searchParams.get('livestock') || 'all');
  const [selectedService, setSelectedService] = useState(() => searchParams.get('service') || 'all');
  const [emergencyOnly, setEmergencyOnly] = useState(() => searchParams.get('emergency') === 'true' || searchParams.get('emergency') === '1');
  const [verifiedOnly, setVerifiedOnly] = useState(() => searchParams.get('verified') === 'true');

  // Track if opened with AI handoff params
  const hasAiHandoffParams = useMemo(() => {
    return Boolean(
      searchParams.get('region') ||
      searchParams.get('livestock') ||
      searchParams.get('service') ||
      searchParams.get('emergency') ||
      searchParams.get('district')
    );
  }, [searchParams]);

  // Synchronize state if URL query params change dynamically
  useEffect(() => {
    const reg = searchParams.get('region');
    const dist = searchParams.get('district');
    const live = searchParams.get('livestock');
    const srv = searchParams.get('service');
    const emg = searchParams.get('emergency');
    const q = searchParams.get('q') || searchParams.get('query');

    if (reg !== null && reg !== selectedRegion) setSelectedRegion(reg || 'all');
    if (dist !== null && dist !== selectedDistrict) setSelectedDistrict(dist);
    if (live !== null && live !== selectedSpecialty) setSelectedSpecialty(live || 'all');
    if (srv !== null && srv !== selectedService) setSelectedService(srv || 'all');
    if (emg !== null) setEmergencyOnly(emg === 'true' || emg === '1');
    if (q !== null && q !== searchQuery) setSearchQuery(q);
  }, [searchParams]);

  // Filter Drawer / Accordion on mobile
  const [showFiltersMobile, setShowFiltersMobile] = useState(false);

  // Load doctors from Firestore
  const fetchDoctors = async () => {
    setIsLoading(true);
    try {
      const filterOptions: DoctorFilterOptions = {
        query: searchQuery,
        region: selectedRegion !== 'all' ? selectedRegion : undefined,
        district: selectedDistrict.trim() || undefined,
        livestockType: selectedSpecialty !== 'all' ? selectedSpecialty : undefined,
        service: selectedService !== 'all' ? selectedService : undefined,
        emergencyOnly: emergencyOnly || undefined,
        verifiedOnly: verifiedOnly || undefined,
      };

      const result = await daktariService.getDoctors(filterOptions);
      setDoctors(result);

      // Also check if current user has a professional profile
      if (currentUser) {
        const userProf = await daktariService.getDoctorById(currentUser.uid);
        setUserDoctorProfile(userProf);
      }
    } catch (err) {
      console.error('Hitilafu ya kupata orodha ya madaktari:', err);
      setDoctors([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDoctors();
  }, [selectedRegion, selectedSpecialty, selectedService, emergencyOnly, verifiedOnly]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchDoctors();
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedRegion('all');
    setSelectedDistrict('');
    setSelectedSpecialty('all');
    setSelectedService('all');
    setEmergencyOnly(false);
    setVerifiedOnly(false);
    setSearchParams({});
  };

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedRegion !== 'all') count++;
    if (selectedDistrict.trim()) count++;
    if (selectedSpecialty !== 'all') count++;
    if (selectedService !== 'all') count++;
    if (emergencyOnly) count++;
    if (verifiedOnly) count++;
    if (searchQuery.trim()) count++;
    return count;
  }, [selectedRegion, selectedDistrict, selectedSpecialty, selectedService, emergencyOnly, verifiedOnly, searchQuery]);

  const isAdmin =
    role === 'admin' ||
    (currentUser && currentUser.email === 'mkomwasaid53@gmail.com');

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-16 px-1 sm:px-2">
      {/* Top Breadcrumb & Registration CTA Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex items-center space-x-2 text-xs text-stone-500">
          <span className="cursor-pointer hover:text-emerald-800" onClick={() => navigate('/')}>
            Mwanzo
          </span>
          <span>/</span>
          <span className="text-stone-900 font-semibold">Daktari Mtaani Kwako</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Admin shortcut if admin */}
          {isAdmin && (
            <button
              onClick={() => navigate('/admin')}
              className="px-3 py-1.5 rounded-xl bg-stone-900 text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs hover:bg-black transition-colors cursor-pointer"
            >
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              <span>Paneli ya Uhakiki</span>
            </button>
          )}

          {/* Professional Onboarding / Management CTA */}
          <button
            id="daktari-register-cta-btn"
            onClick={() => setShowRegistrationModal(true)}
            className="px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer min-h-[36px]"
          >
            <Stethoscope className="w-3.5 h-3.5" />
            <span>
              {userDoctorProfile ? 'Wasifu Wangu wa Kitaalamu' : 'Jisajili Kama Daktari'}
            </span>
          </button>
        </div>
      </div>

      {/* AI Assistant Handoff Context Banner */}
      {hasAiHandoffParams && (
        <div className="p-3.5 sm:p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-emerald-950 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-emerald-200/80 text-emerald-900 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold text-stone-900">
                Utafutaji Ulioongozwa na Msaidizi wa AI
              </p>
              <p className="text-[11px] text-stone-600">
                Vigezo vya utafutaji vimewekwa kulingana na mazungumzo yako ya mifugo. Unaweza kubadili au kufuta vigezo hivi wakati wowote.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClearFilters}
            className="text-[11px] font-bold text-emerald-900 bg-white hover:bg-emerald-100 border border-emerald-300 px-3 py-1.5 rounded-xl transition-colors cursor-pointer shrink-0"
          >
            Futa Vigezo
          </button>
        </div>
      )}

      {/* Hero Header Banner */}
      <header className="relative overflow-hidden bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 text-white rounded-3xl p-5 sm:p-7 shadow-md border border-emerald-700/50 space-y-3">
        <div className="relative z-10 max-w-2xl space-y-2.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-800/80 backdrop-blur-md rounded-full border border-emerald-400/30 text-emerald-200 text-[11px] font-semibold">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
            <span>Mtandao wa Wataalamu wa Mifugo Tanzania</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
            Daktari Mtaani Kwako
          </h1>

          {/* Core Product Principle / Positioning */}
          <p className="text-xs sm:text-sm text-emerald-100/90 leading-relaxed font-medium">
            "AI inakusaidia kuelewa. Daktari anakusaidia kufanya uamuzi wa kitaalamu."
          </p>

          <p className="text-xs text-emerald-200/80 leading-relaxed">
            Gundua na uwasiliane moja kwa moja na <strong>Madaktari wa Mifugo</strong>, <strong>Maafisa Afya ya Mifugo</strong>, na <strong>Maafisa Ugani</strong> walioidhinishwa katika mkoa na wilaya yako.
          </p>
        </div>

        {/* Decorative background glow */}
        <div className="absolute right-0 bottom-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      </header>

      {/* Search & Filter Bar Section */}
      <section className="bg-white rounded-3xl border border-stone-200/90 p-4 shadow-xs space-y-3">
        {/* Search input form */}
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tafuta kwa jina la daktari, mkoa, wilaya, au mifugo (mfano: Kuku, Ng'ombe)..."
              className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-200 rounded-2xl text-xs sm:text-sm text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-stone-400 hover:text-stone-600 p-0.5"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="flex-1 sm:flex-initial px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-2xl transition-colors cursor-pointer shadow-2xs min-h-[42px] flex items-center justify-center gap-1.5"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Tafuta</span>
            </button>

            <button
              type="button"
              onClick={() => setShowFiltersMobile(!showFiltersMobile)}
              className={`sm:hidden px-3.5 py-2.5 border rounded-2xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer min-h-[42px] ${
                activeFiltersCount > 0
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-stone-50 text-stone-700 border-stone-200'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Vichujio {activeFiltersCount > 0 && `(${activeFiltersCount})`}</span>
            </button>
          </div>
        </form>

        {/* Filter Controls (Desktop row, Mobile accordion) */}
        <div className={`space-y-3 pt-2 border-t border-stone-100 ${showFiltersMobile ? 'block' : 'hidden sm:block'}`}>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
            {/* Region Select */}
            <div>
              <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                Mkoa:
              </label>
              <select
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
                className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-800 focus:bg-white focus:ring-2 focus:ring-emerald-700 font-medium"
              >
                <option value="all">Mikoa Yote ya Tanzania</option>
                {TANZANIA_REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {/* Livestock Specialty Select */}
            <div>
              <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                Aina ya Mifugo:
              </label>
              <select
                value={selectedSpecialty}
                onChange={(e) => setSelectedSpecialty(e.target.value)}
                className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-800 focus:bg-white focus:ring-2 focus:ring-emerald-700 font-medium"
              >
                <option value="all">Mifugo Yote</option>
                {LIVESTOCK_SPECIALTIES_OPTIONS.map((spec) => (
                  <option key={spec} value={spec}>
                    {spec}
                  </option>
                ))}
              </select>
            </div>

            {/* Service Select */}
            <div>
              <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                Aina ya Huduma:
              </label>
              <select
                value={selectedService}
                onChange={(e) => setSelectedService(e.target.value)}
                className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-800 focus:bg-white focus:ring-2 focus:ring-emerald-700 font-medium"
              >
                <option value="all">Huduma Zote</option>
                {VET_SERVICES_OPTIONS.map((srv) => (
                  <option key={srv} value={srv}>
                    {srv}
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Toggle Checkboxes */}
            <div className="flex flex-col justify-end gap-1.5 pt-1">
              {/* Verified Only Filter */}
              <label className="flex items-center gap-2 text-xs font-semibold text-stone-800 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={verifiedOnly}
                  onChange={(e) => setVerifiedOnly(e.target.checked)}
                  className="rounded text-emerald-700 focus:ring-emerald-600 w-4 h-4 cursor-pointer"
                />
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                  Waliothibitishwa Tu
                </span>
              </label>

              {/* Emergency Only Filter */}
              <label className="flex items-center gap-2 text-xs font-semibold text-stone-800 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={emergencyOnly}
                  onChange={(e) => setEmergencyOnly(e.target.checked)}
                  className="rounded text-red-600 focus:ring-red-500 w-4 h-4 cursor-pointer"
                />
                <span className="flex items-center gap-1 text-red-700 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                  Dharura 24/7 Tu
                </span>
              </label>
            </div>
          </div>

          {/* Active filters pill & Reset */}
          {activeFiltersCount > 0 && (
            <div className="flex items-center justify-between pt-2 text-xs border-t border-stone-100">
              <span className="text-stone-500 font-medium">
                Vichujio vilivyotumika: <strong>{activeFiltersCount}</strong>
              </span>
              <button
                type="button"
                onClick={handleClearFilters}
                className="text-emerald-800 hover:text-emerald-950 font-semibold underline cursor-pointer"
              >
                Ondoa Vichujio Vyote (Onyesha Wote)
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Directory Results Heading */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-stone-900">
            Wataalamu wa Mifugo Waliosajiliwa
          </h2>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-200">
            {doctors.length}
          </span>
        </div>

        <button
          onClick={fetchDoctors}
          disabled={isLoading}
          className="text-xs text-stone-600 hover:text-stone-900 flex items-center gap-1 cursor-pointer font-medium"
          title="Onyesha upya orodha"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Sasisha</span>
        </button>
      </div>

      {/* Doctor Cards Grid or Empty State */}
      {isLoading ? (
        <div className="p-12 text-center bg-white rounded-3xl border border-stone-200 shadow-xs space-y-3">
          <Loader2 className="w-8 h-8 text-emerald-700 animate-spin mx-auto" />
          <p className="text-xs font-semibold text-stone-600">
            Inatafuta wataalamu kutoka hifadhidata ya Firestore...
          </p>
        </div>
      ) : doctors.length === 0 ? (
        /* Empty State (Strictly complying with Section 10: No dead ends, do not fabricate doctors) */
        <div className="p-8 sm:p-10 bg-white rounded-3xl border border-stone-200 text-center space-y-4 shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-800 border border-amber-200 flex items-center justify-center mx-auto shadow-2xs">
            <Stethoscope className="w-6 h-6" />
          </div>

          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="text-sm sm:text-base font-bold text-stone-900">
              Hatukumpata daktari anayelingana na utafutaji wako.
            </h3>
            <p className="text-xs text-stone-500 leading-relaxed">
              Hakuna daktari au mtaalamu wa mifugo aliyepatikana kwa vichujio au neno uliloliandika.
            </p>
          </div>

          {/* Actionable options */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <button
              onClick={handleClearFilters}
              className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
            >
              Ondoa Vichujio Vyote
            </button>

            <button
              onClick={() => {
                setSelectedRegion('all');
                setSelectedSpecialty('all');
                setSelectedService('all');
                setSearchQuery('');
              }}
              className="px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold transition-colors cursor-pointer"
            >
              Tafuta Mkoa Mwingine
            </button>

            <button
              onClick={() => navigate('/ai-assistant')}
              className="px-4 py-2 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Bot className="w-3.5 h-3.5 text-teal-700" />
              <span>Uliza AI Msaidizi kwa Mwongozo wa Awali</span>
            </button>
          </div>
        </div>
      ) : (
        /* Results Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {doctors.map((doctor) => (
            <DoctorCard
              key={doctor.uid}
              doctor={doctor}
              onViewProfile={(d) => setSelectedDoctor(d)}
            />
          ))}
        </div>
      )}

      {/* Positioning Footer Note */}
      <footer className="p-4 bg-stone-50 rounded-2xl border border-stone-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-stone-600">
        <div className="flex items-start gap-2.5">
          <Info className="w-4 h-4 text-emerald-800 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Msimamo wa Ufugaji Update:</strong> AI inakusaidia kuelewa dalili na usimamizi wa shamba. Daktari wa mifugo aliyehitimu ndiye anayefanya uamuzi na matibabu ya kitaalamu.
          </p>
        </div>

        <button
          onClick={() => navigate('/ai-assistant')}
          className="px-3.5 py-1.5 bg-white border border-stone-300 hover:bg-stone-100 text-stone-800 font-semibold rounded-xl shrink-0 transition-colors flex items-center gap-1 cursor-pointer"
        >
          <span>Pata Ushauri wa AI</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </footer>

      {/* Doctor Detail Modal */}
      {selectedDoctor && (
        <DoctorDetailModal
          doctor={selectedDoctor}
          onClose={() => setSelectedDoctor(null)}
        />
      )}

      {/* Doctor Registration / Management Modal */}
      {showRegistrationModal && (
        <DoctorRegistrationModal
          onClose={() => setShowRegistrationModal(false)}
          onProfileUpdated={() => {
            fetchDoctors();
          }}
        />
      )}
    </div>
  );
};
