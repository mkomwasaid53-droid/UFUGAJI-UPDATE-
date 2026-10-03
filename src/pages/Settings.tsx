import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  User,
  Palette,
  Headphones,
  Bell,
  Sparkles,
  Globe,
  LogOut,
  ChevronRight,
  ArrowLeft,
  Loader2,
  ShieldAlert
} from 'lucide-react';

export const Settings: React.FC = () => {
  const { currentUser, userProfile, logout } = useAuth();
  const navigate = useNavigate();

  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [isPremiumActive, setIsPremiumActive] = useState<boolean>(false);
  const [isLoadingPremiumStatus, setIsLoadingPremiumStatus] = useState<boolean>(true);

  // Authoritative check for Premium status
  useEffect(() => {
    let isMounted = true;
    const checkPremium = async () => {
      const targetUid = currentUser?.uid;
      if (!targetUid) {
        setIsLoadingPremiumStatus(false);
        return;
      }

      try {
        const res = await fetch(`/api/ai/premium-status/${encodeURIComponent(targetUid)}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data?.isPremiumActive) {
            setIsPremiumActive(true);
          }
        }
      } catch (err) {
        // Fallback silently if offline
      } finally {
        if (isMounted) {
          setIsLoadingPremiumStatus(false);
        }
      }
    };

    checkPremium();
    return () => {
      isMounted = false;
    };
  }, [currentUser?.uid]);

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      setLogoutError(null);
      await logout();
      navigate('/login', { replace: true });
    } catch (err) {
      console.error('Hitilafu wakati wa kutoka:', err);
      setLogoutError('Imeshindikana kutoka kwenye mfumo. Tafadhali jaribu tena.');
      setIsLoggingOut(false);
    }
  };

  const displayName = userProfile?.displayName || userProfile?.name || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Mfugaji';
  const displayEmail = currentUser?.email || userProfile?.email || '';

  return (
    <div className="min-h-screen bg-stone-50 pb-20">
      {/* Settings Top Bar */}
      <div className="bg-white border-b border-stone-200 sticky top-0 z-20 shadow-2xs">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="p-2 -ml-2 rounded-xl text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors cursor-pointer min-w-[40px] min-h-[40px] flex items-center justify-center"
              aria-label="Rudi nyuma"
              title="Rudi nyuma"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-base font-bold text-stone-900 leading-tight">Mipangilio</h1>
              <p className="text-xs text-stone-500">Settings & Akaunti</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        {/* Error notification if logout fails */}
        {logoutError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-red-600" />
            <span>{logoutError}</span>
          </div>
        )}

        {/* User Summary Card (Quick Header) */}
        <div className="bg-white rounded-2xl border border-stone-200 p-4 flex items-center justify-between shadow-2xs">
          <div className="flex items-center space-x-3.5 min-w-0">
            <div className="w-12 h-12 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-800 font-bold text-base shrink-0">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-stone-900 truncate">{displayName}</h2>
              <p className="text-xs text-stone-500 truncate">{displayEmail}</p>
              {isPremiumActive && (
                <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold border border-amber-300">
                  <Sparkles className="w-3 h-3 text-amber-600" />
                  Premium Imewashwa
                </span>
              )}
            </div>
          </div>
          <Link
            to="/profile"
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 px-3 py-1.5 rounded-lg hover:bg-emerald-50 transition-colors"
          >
            Angalia
          </Link>
        </div>

        {/* Settings Navigation List - Strict Ordering:
            1. Wasifu
            2. Mandhari (Themes)
            3. Msaada kwa Wateja (Customer Support)
            4. Usimamizi wa Arifa (Notification Manager)
            5. Upgrade to Premium (only while Free)
            6. Lugha (Language)
            7. Logout (Toka)
        */}
        <div className="bg-white rounded-2xl border border-stone-200 divide-y divide-stone-100 overflow-hidden shadow-2xs">
          
          {/* 1. Wasifu (Active) */}
          <button
            id="settings-wasifu-btn"
            type="button"
            onClick={() => navigate('/profile')}
            className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-stone-50 active:bg-stone-100 transition-colors cursor-pointer text-left group min-h-[52px]"
          >
            <div className="flex items-center space-x-3.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
                <User className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-stone-900 group-hover:text-emerald-800 transition-colors">Wasifu</p>
                <p className="text-xs text-stone-500">Taarifa zako binafsi na mifugo</p>
              </div>
            </div>
            <div className="flex items-center space-x-2 text-stone-400">
              <span className="text-xs text-stone-400 hidden sm:inline">Badili taarifa</span>
              <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-emerald-700 group-hover:translate-x-0.5 transition-all" />
            </div>
          </button>

          {/* 2. Themes / Mandhari (Inactive) */}
          <div
            id="settings-mandhari-item"
            className="w-full px-4 py-3.5 flex items-center justify-between opacity-80 cursor-not-allowed text-left min-h-[52px]"
            title="Kipengele hiki kinakuja hivi karibuni"
          >
            <div className="flex items-center space-x-3.5">
              <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-200">
                <Palette className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-stone-800">Mandhari</p>
                <p className="text-xs text-stone-500">Mwangaza au giza (Light / Dark mode)</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200">
                Inakuja hivi karibuni
              </span>
              <ChevronRight className="w-4 h-4 text-stone-300" />
            </div>
          </div>

          {/* 3. Customer Support / Msaada kwa Wateja (Inactive) */}
          <div
            id="settings-msaada-item"
            className="w-full px-4 py-3.5 flex items-center justify-between opacity-80 cursor-not-allowed text-left min-h-[52px]"
            title="Kipengele hiki kinakuja hivi karibuni"
          >
            <div className="flex items-center space-x-3.5">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-200">
                <Headphones className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-stone-800">Msaada kwa Wateja</p>
                <p className="text-xs text-stone-500">Wasiliana na timu ya msaada</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200">
                Inakuja hivi karibuni
              </span>
              <ChevronRight className="w-4 h-4 text-stone-300" />
            </div>
          </div>

          {/* 4. Notification Manager / Usimamizi wa Arifa (Inactive) */}
          <div
            id="settings-arifa-item"
            className="w-full px-4 py-3.5 flex items-center justify-between opacity-80 cursor-not-allowed text-left min-h-[52px]"
            title="Kipengele hiki kinakuja hivi karibuni"
          >
            <div className="flex items-center space-x-3.5">
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-stone-800">Usimamizi wa Arifa</p>
                <p className="text-xs text-stone-500">Mpangilio wa arifa na ujumbe</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200">
                Inakuja hivi karibuni
              </span>
              <ChevronRight className="w-4 h-4 text-stone-300" />
            </div>
          </div>

          {/* 5. Upgrade to Premium (Conditional: Only while Free) */}
          {!isPremiumActive && !isLoadingPremiumStatus && (
            <div
              id="settings-upgrade-premium-item"
              className="w-full px-4 py-3.5 flex items-center justify-between opacity-80 cursor-not-allowed text-left min-h-[52px]"
              title="Kipengele hiki kinakuja hivi karibuni"
            >
              <div className="flex items-center space-x-3.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-stone-800">Upgrade to Premium</p>
                  <p className="text-xs text-stone-500">Fungua huduma na vipengele vyote</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                  Inakuja hivi karibuni
                </span>
                <ChevronRight className="w-4 h-4 text-stone-300" />
              </div>
            </div>
          )}

          {/* 6. Language / Lugha (Inactive) */}
          <div
            id="settings-lugha-item"
            className="w-full px-4 py-3.5 flex items-center justify-between opacity-80 cursor-not-allowed text-left min-h-[52px]"
            title="Lugha ya sasa ni Kiswahili"
          >
            <div className="flex items-center space-x-3.5">
              <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-200">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-stone-800">Lugha</p>
                <p className="text-xs text-stone-500">Kiswahili (Chaguo kuu)</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200">
                Inakuja hivi karibuni
              </span>
              <ChevronRight className="w-4 h-4 text-stone-300" />
            </div>
          </div>
        </div>

        {/* 7. Logout / Toka Section */}
        <div className="bg-white rounded-2xl border border-stone-200 p-2 shadow-2xs">
          <button
            id="settings-logout-btn"
            type="button"
            disabled={isLoggingOut}
            onClick={handleLogout}
            className="w-full px-4 py-3 rounded-xl flex items-center justify-center space-x-2.5 bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-700 font-semibold text-sm transition-colors cursor-pointer disabled:opacity-60 min-h-[48px]"
            aria-label="Toka kwenye mfumo"
          >
            {isLoggingOut ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-red-600" />
                <span>Inatoka...</span>
              </>
            ) : (
              <>
                <LogOut className="w-4 h-4 text-red-600" />
                <span>Toka</span>
              </>
            )}
          </button>
        </div>

        {/* App Version Info */}
        <div className="text-center pt-2">
          <p className="text-xs text-stone-400 font-medium">Ufugaji Update v1.9C</p>
          <p className="text-[10px] text-stone-400">Jukwaa la Wafugaji Tanzania</p>
        </div>
      </div>
    </div>
  );
};
