import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import {
  Shield,
  Users,
  ShoppingBag,
  MessageSquare,
  BarChart3,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Edit,
  SlidersHorizontal,
  Mail,
  Calendar,
  Layers,
  Stethoscope,
  ShieldCheck,
  ShieldAlert,
  Scale,
  Bell,
  Crown,
  CreditCard,
  Settings
} from 'lucide-react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { UserProfile, UserRole } from '../types';
import { AdminDoctorReview } from '../components/daktari/AdminDoctorReview';
import { AdminSellerVerificationReview } from '../components/marketplace/AdminSellerVerificationReview';
import { AdminCategoryGovernance } from '../components/marketplace/AdminCategoryGovernance';
import { AdminListingModeration } from '../components/marketplace/AdminListingModeration';
import { AdminSellerGovernance } from '../components/marketplace/AdminSellerGovernance';
import { AdminReportsAndAppeals } from '../components/marketplace/AdminReportsAndAppeals';
import { AdminGovernanceInbox } from '../components/notifications/AdminGovernanceInbox';
import { AdminAiPremiumManagement } from '../components/admin/AdminAiPremiumManagement';
import { AdminSellerMonetization } from '../components/marketplace/AdminSellerMonetization';
import { AdminGumzoGroupManagement } from '../components/admin/AdminGumzoGroupManagement';

export const Admin: React.FC = () => {
  const { currentUser, role, isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');

  const location = useLocation();
  const isReadinessRoute = location.pathname.includes('readiness');

  const [activeTab, setActiveTab] = useState<'readiness' | 'users' | 'payment_settings' | 'ai_premium' | 'doctors' | 'sellers' | 'market' | 'community' | 'stats'>(() => {
    if (isReadinessRoute || urlTab === 'readiness' || urlTab === 'ads' || urlTab === 'compliance' || urlTab === 'ad_readiness') return 'readiness';
    if (urlTab === 'payment_settings' || urlTab === 'payments' || urlTab === 'payment') return 'payment_settings';
    if (urlTab === 'ai_premium') return 'ai_premium';
    if (urlTab === 'doctors') return 'doctors';
    if (urlTab === 'sellers') return 'sellers';
    if (urlTab === 'market') return 'market';
    if (urlTab === 'community' || urlTab === 'gumzo' || urlTab === 'groups') return 'community';
    if (urlTab === 'stats') return 'stats';
    return 'readiness'; // Default to readiness if requested or default
  });

  // Sync activeTab when urlTab or location changes
  useEffect(() => {
    if (isReadinessRoute || urlTab === 'readiness' || urlTab === 'ads' || urlTab === 'compliance' || urlTab === 'ad_readiness') {
      setActiveTab('readiness');
    } else if (urlTab === 'payment_settings' || urlTab === 'payments' || urlTab === 'payment') {
      setActiveTab('payment_settings');
    } else if (urlTab === 'ai_premium') {
      setActiveTab('ai_premium');
    } else if (urlTab === 'doctors') {
      setActiveTab('doctors');
    } else if (urlTab === 'sellers') {
      setActiveTab('sellers');
    } else if (urlTab === 'market') {
      setActiveTab('market');
    } else if (urlTab === 'community' || urlTab === 'gumzo' || urlTab === 'groups') {
      setActiveTab('community');
    } else if (urlTab === 'stats') {
      setActiveTab('stats');
    } else if (urlTab === 'users') {
      setActiveTab('users');
    }
  }, [urlTab, isReadinessRoute]);

  const handleTabSelect = (tab: 'readiness' | 'users' | 'payment_settings' | 'ai_premium' | 'doctors' | 'sellers' | 'market' | 'community' | 'stats') => {
    setActiveTab(tab);
    setSearchParams({ tab }, { replace: true });
  };
  const [marketSubTab, setMarketSubTab] = useState<'inbox' | 'moderation' | 'governance' | 'reports_appeals' | 'categories' | 'monetization'>('inbox');
  
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [userUpdateMsg, setUserUpdateMsg] = useState<{ id: string; text: string; isError?: boolean } | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  // Fetch real users from Firestore
  const loadUsers = async () => {
    setIsLoadingUsers(true);
    setUserUpdateMsg(null);
    try {
      const usersCol = collection(db, 'users');
      const snapshot = await getDocs(usersCol);
      const list: UserProfile[] = [];
      snapshot.forEach((docSnap) => {
        list.push(docSnap.data() as UserProfile);
      });
      setUsersList(list);
    } catch (err) {
      console.error('Hitilafu ya kupata watumiaji kutoka Firestore:', err);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleRoleUpdate = async (targetUid: string, newRole: UserRole) => {
    setUserUpdateMsg(null);
    try {
      const userRef = doc(db, 'users', targetUid);
      await updateDoc(userRef, {
        role: newRole,
        updatedAt: new Date().toISOString()
      });
      setUsersList((prev) =>
        prev.map((u) => (u.uid === targetUid ? { ...u, role: newRole } : u))
      );
      setUserUpdateMsg({
        id: targetUid,
        text: `Cheo kilibadilishwa kuwa ${newRole === 'admin' ? 'Msimamizi' : newRole === 'seller' ? 'Muuzaji' : 'Mfugaji'}`
      });
      setEditingUserId(null);
    } catch (err) {
      console.error('Hitilafu ya kubadili cheo:', err);
      setUserUpdateMsg({
        id: targetUid,
        text: 'Haikuweza kuhifadhi cheo. Tafadhali jaribu tena.',
        isError: true
      });
    }
  };

  const demoStats = [
    { label: 'Watumiaji Waliosajiliwa', value: `${usersList.length || 1}`, desc: 'Wafugaji & Wauzaji Halisi (Firestore)' },
    { label: 'Mikoa Inayoshiriki', value: '26', desc: 'Tanzania Bara & Zanzibar (Demo)' },
    { label: 'Maswali ya AI Yaliyojibiwa', value: '142', desc: 'Miongozo ya Mifugo (Demo)' },
    { label: 'Kiwango cha Upatikanaji', value: '99.9%', desc: 'Uendeshaji wa Mfumo (Demo)' },
  ];

  return (
    <div className="flex-1 p-4 space-y-4">
      {/* Admin Header */}
      <div className="bg-stone-900 text-white rounded-2xl p-4 shadow-sm space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 inline-flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-amber-400" /> Paneli ya Msimamizi Mkuu
          </span>
          <span className="text-[11px] text-stone-400">Admin Area</span>
        </div>
        <h2 className="text-lg font-bold">Usimamizi wa UFUGAJI UPDATE</h2>
        <p className="text-xs text-stone-300 leading-relaxed">
          Kituo kikuu cha kusimamia watumiaji wa jukwaa, udhibiti wa maudhui ya soko, mada za jamii, na tathmini ya mfumo.
        </p>
      </div>

      {/* Simplified Admin Navigation (V1.10A-Corrective-2 Section 2) */}
      <div className="space-y-2">
        {/* Level 1: Primary Operational Modules */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 bg-stone-200/60 p-1.5 rounded-2xl">
          <button
            type="button"
            onClick={() => handleTabSelect('readiness')}
            className={`p-3 rounded-xl transition-all text-left flex items-start gap-2.5 cursor-pointer ${
              activeTab === 'readiness' || activeTab === 'payment_settings' || activeTab === 'ai_premium'
                ? 'bg-white shadow-sm ring-2 ring-amber-500/80 text-stone-900'
                : 'bg-white/60 hover:bg-white text-stone-600 hover:text-stone-900'
            }`}
          >
            <div className={`p-2 rounded-lg ${
              activeTab === 'readiness' || activeTab === 'payment_settings' || activeTab === 'ai_premium'
                ? 'bg-amber-500 text-white'
                : 'bg-stone-100 text-stone-600'
            }`}>
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold block leading-tight">Utayari & Mipangilio</span>
              <span className="text-[10px] text-stone-500 block">Readiness, Malipo & AI</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleTabSelect('market')}
            className={`p-3 rounded-xl transition-all text-left flex items-start gap-2.5 cursor-pointer ${
              activeTab === 'market' || activeTab === 'sellers'
                ? 'bg-white shadow-sm ring-2 ring-amber-500/80 text-stone-900'
                : 'bg-white/60 hover:bg-white text-stone-600 hover:text-stone-900'
            }`}
          >
            <div className={`p-2 rounded-lg ${
              activeTab === 'market' || activeTab === 'sellers'
                ? 'bg-amber-600 text-white'
                : 'bg-stone-100 text-stone-600'
            }`}>
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold block leading-tight">Soko & Wauzaji</span>
              <span className="text-[10px] text-stone-500 block">Utawala, Usajili & Uhakiki</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleTabSelect('users')}
            className={`p-3 rounded-xl transition-all text-left flex items-start gap-2.5 cursor-pointer ${
              activeTab === 'users' || activeTab === 'doctors'
                ? 'bg-white shadow-sm ring-2 ring-amber-500/80 text-stone-900'
                : 'bg-white/60 hover:bg-white text-stone-600 hover:text-stone-900'
            }`}
          >
            <div className={`p-2 rounded-lg ${
              activeTab === 'users' || activeTab === 'doctors'
                ? 'bg-emerald-600 text-white'
                : 'bg-stone-100 text-stone-600'
            }`}>
              <Users className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold block leading-tight">Watumiaji & Wataalamu</span>
              <span className="text-[10px] text-stone-500 block">Watumiaji na Madaktari</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleTabSelect('community')}
            className={`p-3 rounded-xl transition-all text-left flex items-start gap-2.5 cursor-pointer ${
              activeTab === 'community' || activeTab === 'stats'
                ? 'bg-white shadow-sm ring-2 ring-amber-500/80 text-stone-900'
                : 'bg-white/60 hover:bg-white text-stone-600 hover:text-stone-900'
            }`}
          >
            <div className={`p-2 rounded-lg ${
              activeTab === 'community' || activeTab === 'stats'
                ? 'bg-blue-600 text-white'
                : 'bg-stone-100 text-stone-600'
            }`}>
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold block leading-tight">Jamii & Gumzo</span>
              <span className="text-[10px] text-stone-500 block">Idhini & Utawala wa Vikundi</span>
            </div>
          </button>
        </div>

        {/* Level 2: Focused Sub-Sections Bar */}
        <div className="flex items-center gap-1.5 p-1 bg-stone-100 border border-stone-200/80 rounded-xl overflow-x-auto no-scrollbar">
          {/* Operations sub-tabs */}
          {(activeTab === 'readiness' || activeTab === 'payment_settings' || activeTab === 'ai_premium') && (
            <>
              <button
                id="admin-tab-readiness-btn"
                onClick={() => handleTabSelect('readiness')}
                className={`py-1.5 px-3 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeTab === 'readiness'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-stone-600 hover:bg-stone-200/70 hover:text-stone-900'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Utayari (Ad Readiness)</span>
              </button>

              <button
                onClick={() => handleTabSelect('payment_settings')}
                className={`py-1.5 px-3 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeTab === 'payment_settings'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-stone-600 hover:bg-stone-200/70 hover:text-stone-900'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Mipangilio ya Malipo</span>
              </button>

              <button
                onClick={() => handleTabSelect('ai_premium')}
                className={`py-1.5 px-3 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeTab === 'ai_premium'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-stone-600 hover:bg-stone-200/70 hover:text-stone-900'
                }`}
              >
                <Crown className="w-3.5 h-3.5" />
                <span>AI Premium Grants</span>
              </button>
            </>
          )}

          {/* Market & Sellers sub-tabs */}
          {(activeTab === 'market' || activeTab === 'sellers') && (
            <>
              <button
                onClick={() => handleTabSelect('market')}
                className={`py-1.5 px-3 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeTab === 'market'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-stone-600 hover:bg-stone-200/70 hover:text-stone-900'
                }`}
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Usimamizi wa Soko & Usajili (Monetization V1.10A)</span>
              </button>

              <button
                onClick={() => handleTabSelect('sellers')}
                className={`py-1.5 px-3 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeTab === 'sellers'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-stone-600 hover:bg-stone-200/70 hover:text-stone-900'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Uhakiki wa Wauzaji (Verification)</span>
              </button>
            </>
          )}

          {/* Users & Pros sub-tabs */}
          {(activeTab === 'users' || activeTab === 'doctors') && (
            <>
              <button
                onClick={() => handleTabSelect('users')}
                className={`py-1.5 px-3 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeTab === 'users'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'text-stone-600 hover:bg-stone-200/70 hover:text-stone-900'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Watumiaji Wote</span>
              </button>

              <button
                onClick={() => handleTabSelect('doctors')}
                className={`py-1.5 px-3 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeTab === 'doctors'
                    ? 'bg-teal-700 text-white shadow-xs'
                    : 'text-stone-600 hover:bg-stone-200/70 hover:text-stone-900'
                }`}
              >
                <Stethoscope className="w-3.5 h-3.5" />
                <span>Uhakiki wa Madaktari</span>
              </button>
            </>
          )}

          {/* Stats & Community sub-tabs */}
          {(activeTab === 'stats' || activeTab === 'community') && (
            <>
              <button
                onClick={() => handleTabSelect('community')}
                className={`py-1.5 px-3 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeTab === 'community'
                    ? 'bg-blue-700 text-white shadow-xs'
                    : 'text-stone-600 hover:bg-stone-200/70 hover:text-stone-900'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Usimamizi wa Vikundi vya Gumzo (V9.1)</span>
              </button>

              <button
                onClick={() => handleTabSelect('stats')}
                className={`py-1.5 px-3 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeTab === 'stats'
                    ? 'bg-blue-700 text-white shadow-xs'
                    : 'text-stone-600 hover:bg-stone-200/70 hover:text-stone-900'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Takwimu za Mfumo</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tab Content: Ad Provider Readiness & Compliance Dashboard (V1.9B) */}
      {activeTab === 'readiness' && (
        <AdminAiPremiumManagement usersList={usersList} initialSubTab="ads" />
      )}

      {/* Tab Content: Payment Settings (Direct Top-Level Access) */}
      {activeTab === 'payment_settings' && (
        <AdminAiPremiumManagement usersList={usersList} initialSubTab="settings" />
      )}

      {/* Tab Content: AI Premium Management (V1.8C) */}
      {activeTab === 'ai_premium' && (
        <AdminAiPremiumManagement usersList={usersList} initialSubTab="grants" />
      )}

      {/* Tab Content: Doctors Review */}
      {activeTab === 'doctors' && (
        <AdminDoctorReview />
      )}

      {/* Tab Content: Sellers Verification Review (V1.6A) */}
      {activeTab === 'sellers' && (
        <AdminSellerVerificationReview />
      )}

      {/* Tab Content: Users Management */}
      {activeTab === 'users' && (
        <div className="bg-white border border-stone-200/80 rounded-2xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-stone-900">Usimamizi wa Watumiaji</h3>
              <p className="text-[11px] text-stone-500">
                Orodha ya watumiaji halisi kutoka Firestore (<code>users</code> collection)
              </p>
            </div>
            <button
              onClick={loadUsers}
              disabled={isLoadingUsers}
              className="p-2 text-stone-600 hover:text-emerald-700 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
              title="Pakia Upya"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingUsers ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {isLoadingUsers ? (
            <div className="py-8 flex flex-col items-center justify-center space-y-2 text-stone-500">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-700" />
              <p className="text-xs">Inapakia watumiaji kutoka Firestore...</p>
            </div>
          ) : usersList.length === 0 ? (
            <div className="py-6 text-center text-stone-500 text-xs">
              Hakuna watumiaji waliopatikana kwa sasa.
            </div>
          ) : (
            <div className="space-y-2.5 divide-y divide-stone-100">
              {usersList.map((user) => (
                <div key={user.uid} className="pt-2.5 first:pt-0 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                        {user.displayName || user.name || 'Bila Jina'}
                        {user.uid === currentUser?.uid && (
                          <span className="text-[10px] bg-stone-100 text-stone-600 px-1.5 py-0.2 rounded font-normal">
                            Wewe
                          </span>
                        )}
                      </h4>
                      <p className="text-[11px] text-stone-500">{user.email}</p>
                      {(user.location || user.region) && (
                        <p className="text-[10px] text-stone-400">
                          Eneo: {user.location || user.region} | Mifugo: {Array.isArray(user.mainLivestock) ? user.mainLivestock.join(', ') : user.farmingType || 'Kuku'}
                        </p>
                      )}
                    </div>

                    {/* Role badge and change trigger */}
                    <div className="text-right">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        user.role === 'admin'
                          ? 'bg-amber-100 text-amber-900 border-amber-300'
                          : user.role === 'seller'
                          ? 'bg-blue-100 text-blue-900 border-blue-300'
                          : user.role === 'pro'
                          ? 'bg-purple-100 text-purple-900 border-purple-300'
                          : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                      }`}>
                        {user.role === 'admin' ? 'Msimamizi' : user.role === 'seller' ? 'Muuzaji' : user.role === 'pro' ? 'Mtaalamu' : 'Mfugaji'}
                      </span>
                    </div>
                  </div>

                  {/* Feedback message for role change */}
                  {userUpdateMsg && userUpdateMsg.id === user.uid && (
                    <div className={`p-2 rounded-lg text-[11px] flex items-center gap-1.5 ${
                      userUpdateMsg.isError ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'
                    }`}>
                      {userUpdateMsg.isError ? <AlertCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      <span>{userUpdateMsg.text}</span>
                    </div>
                  )}

                  {/* Quick role change actions */}
                  <div className="flex items-center gap-1 text-[11px]">
                    <span className="text-[10px] text-stone-400 mr-1">Badili Cheo:</span>
                    <button
                      onClick={() => handleRoleUpdate(user.uid, 'farmer')}
                      disabled={user.role === 'farmer'}
                      className={`px-2 py-0.5 rounded text-[10px] border cursor-pointer ${
                        user.role === 'farmer' ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      Mfugaji
                    </button>
                    <button
                      onClick={() => handleRoleUpdate(user.uid, 'seller')}
                      disabled={user.role === 'seller'}
                      className={`px-2 py-0.5 rounded text-[10px] border cursor-pointer ${
                        user.role === 'seller' ? 'bg-blue-700 text-white border-blue-700' : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      Muuzaji
                    </button>
                    <button
                      onClick={() => handleRoleUpdate(user.uid, 'pro')}
                      disabled={user.role === 'pro'}
                      className={`px-2 py-0.5 rounded text-[10px] border cursor-pointer ${
                        user.role === 'pro' ? 'bg-purple-700 text-white border-purple-700' : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      Mtaalamu
                    </button>
                    <button
                      onClick={() => handleRoleUpdate(user.uid, 'admin')}
                      disabled={user.role === 'admin'}
                      className={`px-2 py-0.5 rounded text-[10px] border cursor-pointer ${
                        user.role === 'admin' ? 'bg-amber-700 text-white border-amber-700' : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      Msimamizi
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab Content: Marketplace Moderation & Category Governance (V1.7D & V1.7A) */}
      {activeTab === 'market' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-1 bg-stone-200/70 rounded-xl w-fit flex-wrap">
            <button
              onClick={() => setMarketSubTab('inbox')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                marketSubTab === 'inbox'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Bell className="w-3.5 h-3.5 text-amber-700" />
              <span>Arifa za Utawala (Inbox V1.7H)</span>
            </button>
            <button
              onClick={() => setMarketSubTab('moderation')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                marketSubTab === 'moderation'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Shield className="w-3.5 h-3.5 text-emerald-700" />
              <span>Ukaguzi wa Matangazo (Moderation)</span>
            </button>
            <button
              onClick={() => setMarketSubTab('governance')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                marketSubTab === 'governance'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 text-amber-700" />
              <span>Maonyo na Vizuizi (Seller Governance V1.7E)</span>
            </button>
            <button
              onClick={() => setMarketSubTab('reports_appeals')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                marketSubTab === 'reports_appeals'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Scale className="w-3.5 h-3.5 text-amber-700" />
              <span>Ripoti na Rufaa (Reporting & Appeals V1.7F)</span>
            </button>
            <button
              onClick={() => setMarketSubTab('categories')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                marketSubTab === 'categories'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-amber-700" />
              <span>Makundi ya Soko (Categories V1.7A)</span>
            </button>
            <button
              onClick={() => setMarketSubTab('monetization')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                marketSubTab === 'monetization'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5 text-amber-700" />
              <span>Usajili wa Wauzaji (Monetization V1.10A)</span>
            </button>
          </div>

          {marketSubTab === 'inbox' ? (
            <AdminGovernanceInbox
              adminUserId={currentUser?.uid || 'admin'}
              onSelectTab={(tab) => setMarketSubTab(tab)}
            />
          ) : marketSubTab === 'moderation' ? (
            <AdminListingModeration />
          ) : marketSubTab === 'governance' ? (
            <AdminSellerGovernance />
          ) : marketSubTab === 'reports_appeals' ? (
            <AdminReportsAndAppeals />
          ) : marketSubTab === 'categories' ? (
            <AdminCategoryGovernance />
          ) : (
            <AdminSellerMonetization />
          )}
        </div>
      )}

      {/* Tab Content: Community & Gumzo Groups Governance (V9.1) */}
      {activeTab === 'community' && (
        <AdminGumzoGroupManagement />
      )}

      {/* Tab Content: Platform Statistics (Clearly labeled as Demo Data) */}
      {activeTab === 'stats' && (
        <div className="bg-white border border-stone-200/80 rounded-2xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-stone-900">Takwimu za Mfumo</h3>
            <span className="text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full">
              Takwimu za Majaribio / Demo Data
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-1">
            {demoStats.map((stat, idx) => (
              <div key={idx} className="p-3 bg-stone-50 rounded-xl border border-stone-200/80 space-y-1">
                <p className="text-[11px] text-stone-500 leading-tight">{stat.label}</p>
                <p className="text-xl font-bold text-emerald-800">{stat.value}</p>
                <p className="text-[10px] text-stone-400">{stat.desc}</p>
              </div>
            ))}
          </div>

          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-900 leading-normal">
            <strong>Kumbuka:</strong> Isipokuwa idadi halisi ya watumiaji iliyochukuliwa moja kwa moja kutoka Firestore, takwimu nyingine ni za mfano (demo data) zinazoonyesha muundo wa ripoti za baadaye.
          </div>
        </div>
      )}
    </div>
  );
};
