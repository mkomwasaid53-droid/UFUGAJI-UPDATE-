import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2, Shield, ShieldCheck, ShieldAlert, LogIn, ArrowLeft } from 'lucide-react';

interface AdminRouteProps {
  children: React.ReactNode;
}

export const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const { currentUser, role, loading, isAdmin, loginAsAdmin } = useAuth();
  const location = useLocation();
  const [isActivatingAdmin, setIsActivatingAdmin] = useState(false);

  if (loading || isActivatingAdmin) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-600 flex items-center justify-center shadow-lg shadow-amber-600/20">
            <Loader2 className="w-6 h-6 text-white animate-spin" />
          </div>
          <p className="text-stone-700 font-semibold text-sm">
            {isActivatingAdmin ? 'Inawasha mamlaka ya Msimamizi Mkuu...' : 'Inahakiki mamlaka ya msimamizi...'}
          </p>
        </div>
      </div>
    );
  }

  // If user is verified admin or is the designated admin email, grant immediate access
  const isAuthorized = isAdmin || role === 'admin' || currentUser?.email?.toLowerCase() === 'mkomwasaid53@gmail.com';

  if (isAuthorized) {
    return <>{children}</>;
  }

  const handleQuickAdminAccess = async () => {
    setIsActivatingAdmin(true);
    try {
      await loginAsAdmin();
    } catch (err) {
      console.error('Hitilafu ya kuingia kama admin:', err);
    } finally {
      setIsActivatingAdmin(false);
    }
  };

  // If user is not logged in, provide seamless 1-click admin login or standard login link
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-stone-200 space-y-6">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-600">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <h1 className="text-xl font-black text-stone-900">
              Mlango wa Usimamizi & Utayari
            </h1>
            <p className="text-xs text-stone-600 leading-relaxed">
              Dashibodi ya Utayari (<strong>Admin Readiness Dashboard V1.9B</strong>) inahitaji akaunti ya Msimamizi Mkuu (<span className="font-mono text-amber-900 font-bold">mkomwasaid53@gmail.com</span>).
            </p>
          </div>

          <div className="space-y-3">
            <button
              id="admin-gateway-instant-login-btn"
              type="button"
              onClick={handleQuickAdminAccess}
              className="w-full py-3.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all cursor-pointer"
            >
              <Shield className="w-4 h-4" />
              <span>Ingia kama Said Mkomwa (Msimamizi Mkuu)</span>
            </button>

            <Link
              to="/login"
              state={{ from: location }}
              className="w-full py-3 bg-stone-50 hover:bg-stone-100 text-stone-700 font-semibold text-xs rounded-xl flex items-center justify-center gap-2 border border-stone-300 transition-colors"
            >
              <LogIn className="w-4 h-4 text-stone-500" />
              <span>Ingia kwa Barua Pepe & Nenosiri (Standard Login)</span>
            </Link>
          </div>

          <div className="pt-2 border-t border-stone-100 text-center">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-800 font-medium"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Rudi kwenye Ukurasa Mkuu</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // If user is logged in but lacks admin role, provide 1-click role elevate to admin
  return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-stone-200 space-y-6">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-600">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-black text-stone-900">
            Mamlaka ya Msimamizi Inahitajika
          </h1>
          <p className="text-xs text-stone-600 leading-relaxed">
            Umeingia kama <strong className="text-stone-800">{currentUser.email || currentUser.displayName || 'Mtumiaji'}</strong> (Cheo cha sasa: <span className="font-semibold text-amber-800">{role || 'Mfugaji'}</span>). Ili kufungua Dashibodi ya Utayari (Readiness Dashboard), washa mamlaka ya Msimamizi Mkuu.
          </p>
        </div>

        <div className="space-y-3">
          <button
            id="admin-gateway-elevate-btn"
            type="button"
            onClick={handleQuickAdminAccess}
            className="w-full py-3.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all cursor-pointer"
          >
            <Shield className="w-4 h-4" />
            <span>Badili Kuwa Msimamizi Mkuu (Said Mkomwa)</span>
          </button>

          <Link
            to="/"
            className="w-full py-3 bg-stone-50 hover:bg-stone-100 text-stone-700 font-semibold text-xs rounded-xl flex items-center justify-center gap-2 border border-stone-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-stone-500" />
            <span>Rudi Nyumbani</span>
          </Link>
        </div>
      </div>
    </div>
  );
};
