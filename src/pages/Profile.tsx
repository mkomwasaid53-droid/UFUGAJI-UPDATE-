import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  User,
  Mail,
  Phone,
  MapPin,
  Wheat,
  Shield,
  LogOut,
  Calendar,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  Edit3,
  Plus,
  X,
  RefreshCw,
  Layers,
  Award,
  Store,
  ExternalLink,
  ShieldCheck,
  SlidersHorizontal
} from 'lucide-react';
import { UserRole } from '../types';
import { SellerProfileModal } from '../components/marketplace/SellerProfileModal';
import { SellerProfile } from '../types/marketplace';

export const Profile: React.FC = () => {
  const {
    currentUser,
    userProfile,
    role,
    isAdmin,
    logout,
    saveProfile,
    updateUserRole,
    refreshProfile,
    sellerProfile,
    hasSellerCapability,
    saveSellerProfileState
  } = useAuth();
  const navigate = useNavigate();

  // Form State
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [mainLivestock, setMainLivestock] = useState<string[]>(['kuku']);
  const [livestockTypes, setLivestockTypes] = useState<string[]>(['Kuku wa Kienyeji']);
  const [customTypeInput, setCustomTypeInput] = useState('');

  // Seller Capability Modal State
  const [isSellerModalOpen, setIsSellerModalOpen] = useState(false);
  const [sellerModalSuccess, setSellerModalSuccess] = useState<string | null>(null);

  // Status & Feedback
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Role Switcher Feedback
  const [roleChangeSuccess, setRoleChangeSuccess] = useState<string | null>(null);
  const [roleChangeError, setRoleChangeError] = useState<string | null>(null);
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  // Populate form with user profile from Firestore
  useEffect(() => {
    if (userProfile) {
      setDisplayName(userProfile.displayName || userProfile.name || currentUser?.displayName || '');
      setPhone(userProfile.phone || '');
      setLocation(userProfile.location || userProfile.region || '');
      setMainLivestock(
        Array.isArray(userProfile.mainLivestock) && userProfile.mainLivestock.length > 0
          ? userProfile.mainLivestock
          : userProfile.farmingType
            ? [userProfile.farmingType]
            : ['kuku']
      );
      setLivestockTypes(
        Array.isArray(userProfile.livestockTypes) && userProfile.livestockTypes.length > 0
          ? userProfile.livestockTypes
          : ['Kuku wa Kienyeji']
      );
    }
  }, [userProfile, currentUser]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      console.error('Hitilafu wakati wa kutoka:', err);
    }
  };

  const handleRoleChange = async (newRole: UserRole) => {
    setRoleChangeError(null);
    setRoleChangeSuccess(null);
    setIsUpdatingRole(true);
    try {
      await updateUserRole(newRole);
      setRoleChangeSuccess(`Cheo chako kimebadilishwa kuwa "${newRole === 'admin' ? 'Msimamizi' : newRole === 'seller' ? 'Muuzaji' : newRole === 'pro' ? 'Mtaalamu' : 'Mfugaji'}"`);
    } catch (err: any) {
      console.error('Hitilafu ya kubadili cheo:', err);
      setRoleChangeError('Haikuweza kubadili cheo. Tafadhali jaribu tena.');
    } finally {
      setIsUpdatingRole(false);
    }
  };

  const toggleMainLivestock = (key: string) => {
    if (mainLivestock.includes(key)) {
      if (mainLivestock.length === 1) return; // keep at least one
      setMainLivestock(mainLivestock.filter((item) => item !== key));
    } else {
      setMainLivestock([...mainLivestock, key]);
    }
  };

  const toggleLivestockType = (type: string) => {
    if (livestockTypes.includes(type)) {
      if (livestockTypes.length === 1) return; // keep at least one
      setLivestockTypes(livestockTypes.filter((t) => t !== type));
    } else {
      setLivestockTypes([...livestockTypes, type]);
    }
  };

  const handleAddCustomType = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTypeInput.trim()) return;
    const clean = customTypeInput.trim();
    if (!livestockTypes.includes(clean)) {
      setLivestockTypes([...livestockTypes, clean]);
    }
    setCustomTypeInput('');
  };

  const handleRemoveType = (type: string) => {
    if (livestockTypes.length <= 1) return;
    setLivestockTypes(livestockTypes.filter((t) => t !== type));
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(null);

    if (!displayName.trim()) {
      setSaveError('Tafadhali jaza Jina Kamili.');
      return;
    }

    setIsSaving(true);
    try {
      await saveProfile({
        displayName: displayName.trim(),
        name: displayName.trim(),
        phone: phone.trim(),
        location: location.trim(),
        region: location.trim(),
        mainLivestock,
        livestockTypes,
        farmingType: mainLivestock[0] || 'kuku'
      });
      setSaveSuccess('Taarifa za wasifu zimehifadhiwa kikamilifu!');
      setIsEditing(false);
    } catch (err: any) {
      console.error('Hitilafu ya kuhifadhi wasifu:', err);
      setSaveError('Imeshindikana kuhifadhi taarifa za wasifu. Tafadhali jaribu tena.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveSellerProfile = async (profileData: Partial<SellerProfile>) => {
    try {
      await saveSellerProfileState(profileData);
      setSellerModalSuccess('Wasifu wa muuzaji umehifadhiwa kikamilifu!');
      setIsSellerModalOpen(false);
      setTimeout(() => setSellerModalSuccess(null), 4000);
    } catch (err: any) {
      console.error('Hitilafu ya kuhifadhi wasifu wa muuzaji:', err);
      throw err;
    }
  };

  const tanzaniaRegions = [
    'Arusha', 'Dar es Salaam', 'Dodoma', 'Geita', 'Iringa', 'Kagera', 'Katavi',
    'Kigoma', 'Kilimanjaro', 'Lindi', 'Manyara', 'Mara', 'Mbeya', 'Morogoro',
    'Mtwara', 'Mwanza', 'Njombe', 'Pwani', 'Rukwa', 'Ruvuma', 'Shinyanga',
    'Simiyu', 'Singida', 'Songwe', 'Tabora', 'Tanga', 'Zanzibar'
  ];

  const mainLivestockOptions = [
    { key: 'kuku', label: 'Kuku (Poultry)', icon: '🐔' },
    { key: 'ngombe', label: "Ng'ombe (Cattle)", icon: '🐄' },
    { key: 'mbuzi', label: 'Mbuzi (Goats)', icon: '🐐' },
    { key: 'kondoo', label: 'Kondoo (Sheep)', icon: '🐑' },
    { key: 'nguruwe', label: 'Nguruwe (Pigs)', icon: '🐖' },
    { key: 'sungura', label: 'Sungura (Rabbits)', icon: '🐇' },
    { key: 'samaki', label: 'Samaki (Fish)', icon: '🐟' },
    { key: 'nyuki', label: 'Nyuki (Beekeeping)', icon: '🐝' },
  ];

  const commonLivestockTypes = [
    'Kuku wa Kienyeji',
    'Kuku wa Nyama (Broiler)',
    'Kuku wa Mayai (Layers)',
    'Sasso',
    'Kuroiler',
    "Ng'ombe wa Maziwa (Friesian)",
    "Ng'ombe wa Maziwa (Ayrshire)",
    "Ng'ombe wa Nyama (Boran)",
    'Mbuzi wa Maziwa (Toggenburg)',
    'Mbuzi wa Nyama (Boer)',
    'Nguruwe wa Nyama (Landrace)',
    'Sungura wa Nyama (New Zealand White)'
  ];

  const getRoleBadge = () => {
    if (role === 'admin') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
          <Shield className="w-3.5 h-3.5 text-amber-700" /> Msimamizi (Admin)
        </span>
      );
    }
    if (role === 'seller') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-blue-900 border border-blue-300">
          Muuzaji (Seller)
        </span>
      );
    }
    if (role === 'pro') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-100 text-purple-900 border border-purple-300">
          <Award className="w-3.5 h-3.5 text-purple-700" /> Mtaalamu (Pro)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">
        Mfugaji (Farmer)
      </span>
    );
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return 'Leo';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('sw-TZ', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return isoString;
    }
  };

  const activeLivestockLabels = (userProfile?.mainLivestock || mainLivestock).map((key) => {
    const found = mainLivestockOptions.find((m) => m.key === key);
    return found ? `${found.icon} ${found.label.split(' ')[0]}` : key;
  });

  return (
    <div className="flex-1 p-4 space-y-4 max-w-lg mx-auto w-full pb-20">
      {/* Profile Header Card */}
      <div className="bg-white border border-stone-200/80 rounded-2xl p-5 shadow-xs space-y-4 text-center relative overflow-hidden">
        <div className="w-20 h-20 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center mx-auto text-2xl font-bold border-2 border-emerald-600/30 shadow-xs">
          {displayName?.charAt(0).toUpperCase() || userProfile?.displayName?.charAt(0).toUpperCase() || userProfile?.name?.charAt(0).toUpperCase() || 'M'}
        </div>

        <div className="space-y-1">
          <h2 className="text-xl font-bold text-stone-900">
            {userProfile?.displayName || userProfile?.name || displayName || 'Mfugaji'}
          </h2>
          <p className="text-xs text-stone-500">{currentUser?.email}</p>
          <div className="pt-1 flex items-center justify-center gap-2">
            {getRoleBadge()}
          </div>
        </div>

        <div className="pt-2 flex items-center justify-center gap-2">
          <button
            type="button"
            id="profile-toggle-edit-button"
            onClick={() => {
              setIsEditing(!isEditing);
              setSaveSuccess(null);
              setSaveError(null);
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              isEditing
                ? 'bg-stone-800 text-white border-stone-800 shadow-xs'
                : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
            }`}
          >
            {isEditing ? (
              <>
                <X className="w-3.5 h-3.5" /> Funga Kuhariri
              </>
            ) : (
              <>
                <Edit3 className="w-3.5 h-3.5" /> Hariri Wasifu (Edit Profile)
              </>
            )}
          </button>
        </div>
      </div>

      {/* Success Notification Banner */}
      {saveSuccess && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-start gap-2.5 text-emerald-900 text-xs shadow-xs animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold">{saveSuccess}</p>
            <p className="text-[11px] text-emerald-800">Taarifa zimehifadhiwa katika Firestore kwenye akaunti yako ({currentUser?.uid}).</p>
          </div>
        </div>
      )}

      {/* Error Notification Banner */}
      {saveError && (
        <div className="p-3.5 bg-red-50 border border-red-300 rounded-2xl flex items-start gap-2.5 text-red-900 text-xs shadow-xs animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
          <span>{saveError}</span>
        </div>
      )}

      {/* EDITING FORM */}
      {isEditing ? (
        <form onSubmit={handleSaveProfile} className="bg-white border border-emerald-600/30 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-emerald-700" /> Hariri Taarifa za Wasifu
            </h3>
            <span className="text-[11px] text-emerald-700 font-medium">Firestore Synced</span>
          </div>

          {/* Jina kamili */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1" htmlFor="profile-displayName">
              Jina Kamili <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="profile-displayName"
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Mfano: Juma Said Mkomwa"
                className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent min-h-[44px]"
              />
            </div>
          </div>

          {/* Barua pepe (Read-only) */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1" htmlFor="profile-email-readonly">
              Barua Pepe (Email)
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="profile-email-readonly"
                type="email"
                disabled
                value={currentUser?.email || ''}
                className="w-full pl-10 pr-3.5 py-2.5 bg-stone-100 border border-stone-200 rounded-xl text-sm text-stone-600 min-h-[44px] cursor-not-allowed"
              />
            </div>
            <p className="text-[10px] text-stone-400 mt-1">Barua pepe imefungwa na akaunti yako ya usajili.</p>
          </div>

          {/* Namba ya simu */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1" htmlFor="profile-phone">
              Namba ya Simu
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="profile-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07XX XXX XXX au +255..."
                className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent min-h-[44px]"
              />
            </div>
          </div>

          {/* Mahali unapoishi */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1" htmlFor="profile-location">
              Mahali Unapoishi (Mkoa / Eneo)
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="profile-location"
                type="text"
                list="regions-list"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Chagua mkoa au andika eneo lako (mf. Morogoro Mjini)"
                className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent min-h-[44px]"
              />
              <datalist id="regions-list">
                {tanzaniaRegions.map((reg) => (
                  <option key={reg} value={reg} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Mifugo kuu (Multi-Select Pills) */}
          <div className="space-y-2 pt-1">
            <label className="block text-xs font-semibold text-stone-700">
              Mifugo Kuu (Chagua unayofuga)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {mainLivestockOptions.map((opt) => {
                const isSelected = mainLivestock.includes(opt.key);
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => toggleMainLivestock(opt.key)}
                    className={`flex items-center gap-2 p-2 rounded-xl text-xs font-medium border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-50 text-emerald-900 border-emerald-500 font-semibold shadow-2xs'
                        : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                    }`}
                  >
                    <span className="text-base">{opt.icon}</span>
                    <span className="truncate">{opt.label.split(' ')[0]}</span>
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 ml-auto" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Aina za mifugo (Breeds & Types) */}
          <div className="space-y-2 pt-1">
            <label className="block text-xs font-semibold text-stone-700">
              Aina za Mifugo (Breeds & Varieties)
            </label>
            <p className="text-[11px] text-stone-500">
              Chagua aina unazofuga au ongeza maalum ili msaidizi aweze kutoa ushauri unaolingana na mifugo yako:
            </p>

            {/* Currently Selected Badges */}
            <div className="flex flex-wrap gap-1.5 p-2.5 bg-stone-50 border border-stone-200 rounded-xl min-h-[44px]">
              {livestockTypes.map((type) => (
                <span
                  key={type}
                  className="inline-flex items-center gap-1 text-xs font-semibold bg-white text-emerald-900 border border-emerald-300 px-2.5 py-1 rounded-lg shadow-2xs"
                >
                  {type}
                  <button
                    type="button"
                    onClick={() => handleRemoveType(type)}
                    className="text-stone-400 hover:text-red-500 ml-0.5 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>

            {/* Common Suggestion Tags */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {commonLivestockTypes.map((type) => {
                const isSelected = livestockTypes.includes(type);
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggleLivestockType(type)}
                    className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-700 text-white border-emerald-700 font-semibold'
                        : 'bg-white text-stone-600 border-stone-300 hover:bg-stone-100'
                    }`}
                  >
                    + {type}
                  </button>
                );
              })}
            </div>

            {/* Add Custom Type Field */}
            <div className="flex gap-2 pt-1">
              <input
                type="text"
                value={customTypeInput}
                onChange={(e) => setCustomTypeInput(e.target.value)}
                placeholder="Andika aina nyingine (mf. Kuchi, Kuchi wa Pemba)..."
                className="flex-1 px-3 py-2 bg-white border border-stone-300 rounded-xl text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 min-h-[40px]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomType(e);
                  }
                }}
              />
              <button
                type="button"
                onClick={handleAddCustomType}
                className="px-3.5 py-2 bg-stone-800 hover:bg-stone-900 text-white text-xs font-semibold rounded-xl flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Ongeza
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 flex gap-2">
            <button
              id="profile-save-button"
              type="submit"
              disabled={isSaving}
              className="flex-1 py-3 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 disabled:opacity-60 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer min-h-[44px]"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Inahifadhi Taarifa...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Hifadhi Taarifa (Save)</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
                setSaveError(null);
              }}
              className="px-4 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Ghairi
            </button>
          </div>
        </form>
      ) : (
        /* VIEW MODE - PROFILE DETAILS */
        <div className="bg-white border border-stone-200/80 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <h3 className="text-xs font-bold text-stone-600 uppercase tracking-wider flex items-center gap-2">
              <User className="w-4 h-4 text-emerald-700" /> Taarifa za Mfugaji
            </h3>
            <span className="text-[11px] text-stone-400">
              Imesasishwa: {formatDate(userProfile?.updatedAt)}
            </span>
          </div>

          <div className="divide-y divide-stone-100 text-xs">
            {/* Jina kamili */}
            <div className="py-3 flex items-center justify-between">
              <span className="text-stone-500 flex items-center gap-2">
                <User className="w-4 h-4 text-stone-400" /> Jina Kamili
              </span>
              <span className="font-semibold text-stone-900 text-right">
                {userProfile?.displayName || userProfile?.name || 'Mfugaji'}
              </span>
            </div>

            {/* Barua pepe */}
            <div className="py-3 flex items-center justify-between">
              <span className="text-stone-500 flex items-center gap-2">
                <Mail className="w-4 h-4 text-stone-400" /> Barua Pepe
              </span>
              <span className="font-semibold text-stone-800 text-right">{currentUser?.email}</span>
            </div>

            {/* Namba ya simu */}
            <div className="py-3 flex items-center justify-between">
              <span className="text-stone-500 flex items-center gap-2">
                <Phone className="w-4 h-4 text-stone-400" /> Namba ya Simu
              </span>
              <span className="font-semibold text-stone-800 text-right">
                {userProfile?.phone || <span className="text-stone-400 italic">Haijawekwa</span>}
              </span>
            </div>

            {/* Mahali unapoishi */}
            <div className="py-3 flex items-center justify-between">
              <span className="text-stone-500 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-stone-400" /> Mahali Unapoishi
              </span>
              <span className="font-semibold text-stone-800 text-right">
                {userProfile?.location || userProfile?.region || 'Tanzania'}
              </span>
            </div>

            {/* Mifugo kuu */}
            <div className="py-3 space-y-1.5">
              <span className="text-stone-500 flex items-center gap-2">
                <Wheat className="w-4 h-4 text-stone-400" /> Mifugo Kuu
              </span>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {activeLivestockLabels.length > 0 ? (
                  activeLivestockLabels.map((lbl, idx) => (
                    <span
                      key={idx}
                      className="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-lg"
                    >
                      {lbl}
                    </span>
                  ))
                ) : (
                  <span className="text-stone-400 italic">Kuku</span>
                )}
              </div>
            </div>

            {/* Aina za mifugo */}
            <div className="py-3 space-y-1.5">
              <span className="text-stone-500 flex items-center gap-2">
                <Layers className="w-4 h-4 text-stone-400" /> Aina za Mifugo (Breeds)
              </span>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {(userProfile?.livestockTypes || livestockTypes).length > 0 ? (
                  (userProfile?.livestockTypes || livestockTypes).map((type, idx) => (
                    <span
                      key={idx}
                      className="text-xs font-medium px-2.5 py-1 bg-stone-100 text-stone-800 border border-stone-200 rounded-lg"
                    >
                      {type}
                    </span>
                  ))
                ) : (
                  <span className="text-stone-400 italic">Kuku wa Kienyeji</span>
                )}
              </div>
            </div>

            {/* Tarehe ya Kujiunga */}
            <div className="py-3 flex items-center justify-between">
              <span className="text-stone-500 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-stone-400" /> Tarehe ya Kujiunga
              </span>
              <span className="font-semibold text-stone-800">
                {formatDate(userProfile?.createdAt)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Seller Capability & Store Profile Section */}
      <div className="bg-amber-50/70 border border-amber-200/90 rounded-2xl p-4 sm:p-5 space-y-3.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center space-x-2 text-amber-950">
            <div className="w-8 h-8 rounded-xl bg-amber-200 text-amber-900 flex items-center justify-center font-bold">
              <Store className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold">Uwezo wa Kuuza (Seller Capability)</h4>
              <p className="text-[11px] text-amber-800">
                Gulio la Mifugo & Pembejeo UFUGAJI UPDATE
              </p>
            </div>
          </div>

          <div>
            {hasSellerCapability ? (
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300 inline-flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" /> Muuzaji Hai (Active Seller)
              </span>
            ) : (
              <span className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-stone-100 text-stone-700 border border-stone-300">
                Mfugaji Pekee (Haijaamilishwa)
              </span>
            )}
          </div>
        </div>

        {sellerModalSuccess && (
          <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700" />
            <span>{sellerModalSuccess}</span>
          </div>
        )}

        {hasSellerCapability && sellerProfile ? (
          <div className="bg-white rounded-xl p-3.5 border border-amber-200/80 space-y-2 text-xs text-stone-700">
            <div className="flex items-center justify-between border-b border-stone-100 pb-2">
              <span className="text-stone-500">Jina la Shamba / Duka:</span>
              <strong className="text-stone-900 font-bold">{sellerProfile.businessName}</strong>
            </div>
            <div className="flex items-center justify-between border-b border-stone-100 pb-2">
              <span className="text-stone-500">Simu ya Wateja:</span>
              <span className="font-semibold text-stone-900">{sellerProfile.phone || 'Haijawekwa'}</span>
            </div>
            <div className="flex items-center justify-between border-b border-stone-100 pb-2">
              <span className="text-stone-500">Mkoa / Eneo:</span>
              <span className="font-semibold text-stone-900">{sellerProfile.location || sellerProfile.region}</span>
            </div>
            {sellerProfile.description && (
              <div className="pt-1 text-[11px] text-stone-600 italic">
                "{sellerProfile.description}"
              </div>
            )}

            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsSellerModalOpen(true)}
                className="flex-1 py-2 px-3 bg-amber-100 hover:bg-amber-200 text-amber-900 font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Hariri Wasifu wa Muuzaji</span>
              </button>

              <Link
                to="/market"
                className="py-2 px-3 bg-stone-100 hover:bg-stone-200 text-stone-800 font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors"
              >
                <span>Fungua Sokoni</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-amber-900 leading-relaxed">
              Kama mfugaji, unaweza kujiunga na kuwa muuzaji kwenye Gulio la UFUGAJI UPDATE wakati wowote ili kuuza mifugo yako, vifaranga, vyakula vya mifugo, au pembejeo moja kwa moja kwa wanunuzi nchini kote bila kupoteza rekodi wala utambulisho wako wa ufugaji.
            </p>

            <button
              type="button"
              onClick={() => setIsSellerModalOpen(true)}
              className="py-2.5 px-4 bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer w-full min-h-[44px]"
            >
              <Store className="w-4 h-4" />
              <span>Jiunge kama Muuzaji (Activate Seller Capability)</span>
            </button>
          </div>
        )}
      </div>

      {/* Admin Panel Quick Link if Admin */}
      {isAdmin && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
          <div className="flex items-center space-x-2 text-amber-900">
            <Shield className="w-5 h-5 text-amber-700" />
            <h4 className="text-sm font-bold">Paneli ya Msimamizi (Admin)</h4>
          </div>
          <p className="text-xs text-amber-800">
            Una mamlaka ya msimamizi. Unaweza kusimamia watumiaji, bidhaa za soko, na mada za jamii.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <Link
              to="/admin?tab=readiness"
              id="profile-to-readiness-link"
              className="inline-flex items-center justify-center py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors gap-1.5"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Dashibodi ya Utayari (Readiness)</span>
            </Link>
            <Link
              to="/admin"
              id="profile-to-admin-link"
              className="inline-flex items-center justify-center py-2.5 bg-stone-800 hover:bg-stone-900 text-white font-medium text-xs rounded-xl shadow-xs transition-colors"
            >
              Paneli Yote ya Msimamizi
            </Link>
          </div>
        </div>
      )}

      {/* Role Management / Testing Module for Developer & Demo Review */}
      <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 space-y-3">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-emerald-700" />
          <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
            Cheo cha Mtumiaji (Role Access)
          </h4>
        </div>
        <p className="text-[11px] text-stone-600 leading-relaxed">
          Cheo cha akaunti hii kwenye Firestore ni <strong>{role || 'farmer'}</strong>. Unaweza kubadili cheo hiki kwa urahisi:
        </p>

        {roleChangeSuccess && (
          <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{roleChangeSuccess}</span>
          </div>
        )}

        {roleChangeError && (
          <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{roleChangeError}</span>
          </div>
        )}

        <div className="grid grid-cols-4 gap-1.5 pt-1">
          <button
            type="button"
            disabled={isUpdatingRole || role === 'farmer'}
            onClick={() => handleRoleChange('farmer')}
            className={`py-2 px-1 text-center rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              role === 'farmer'
                ? 'bg-emerald-700 text-white border-emerald-700'
                : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
            }`}
          >
            Mfugaji
          </button>
          <button
            type="button"
            disabled={isUpdatingRole || role === 'seller'}
            onClick={() => handleRoleChange('seller')}
            className={`py-2 px-1 text-center rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              role === 'seller'
                ? 'bg-blue-700 text-white border-blue-700'
                : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
            }`}
          >
            Muuzaji
          </button>
          <button
            type="button"
            disabled={isUpdatingRole || role === 'pro'}
            onClick={() => handleRoleChange('pro')}
            className={`py-2 px-1 text-center rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              role === 'pro'
                ? 'bg-purple-700 text-white border-purple-700'
                : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
            }`}
          >
            Mtaalamu
          </button>
          <button
            type="button"
            disabled={isUpdatingRole || role === 'admin'}
            onClick={() => handleRoleChange('admin')}
            className={`py-2 px-1 text-center rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              role === 'admin'
                ? 'bg-amber-700 text-white border-amber-700'
                : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
            }`}
          >
            Msimamizi
          </button>
        </div>
      </div>

      {/* Logout button */}
      <button
        id="profile-logout-button"
        onClick={handleLogout}
        className="w-full py-3 bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-700 border border-red-200 font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer min-h-[44px]"
      >
        <LogOut className="w-4 h-4" />
        <span>Toka kwenye Akaunti (Logout)</span>
      </button>

      {/* Seller Profile Modal */}
      {isSellerModalOpen && (
        <SellerProfileModal
          initialProfile={sellerProfile}
          defaultDisplayName={userProfile?.displayName || userProfile?.name || currentUser?.displayName || 'Mfugaji'}
          defaultPhone={userProfile?.phone || ''}
          defaultLocation={userProfile?.location || userProfile?.region || 'Dar es Salaam'}
          onClose={() => setIsSellerModalOpen(false)}
          onSave={handleSaveSellerProfile}
        />
      )}
    </div>
  );
};
