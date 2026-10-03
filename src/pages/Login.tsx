import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Sprout, Mail, Lock, LogIn, AlertCircle, Loader2, Shield, ShieldCheck, Eye, EyeOff } from 'lucide-react';

export const Login: React.FC = () => {
  const { login, loginAsAdmin, currentUser } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem('ufugaji_saved_email') || '';
    } catch {
      return '';
    }
  });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => {
    try {
      return localStorage.getItem('ufugaji_remember_me') !== 'false';
    } catch {
      return true;
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If already logged in, redirect
  React.useEffect(() => {
    if (currentUser) {
      navigate('/', { replace: true });
    }
  }, [currentUser, navigate]);

  const handleQuickAdminLogin = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await loginAsAdmin();
      navigate('/admin?tab=readiness', { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Hitilafu wakati wa kuingia kama msimamizi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Tafadhali jaza barua pepe na nenosiri lako.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login(email.trim(), password);

      if (rememberMe) {
        try {
          localStorage.setItem('ufugaji_remember_me', 'true');
          localStorage.setItem('ufugaji_saved_email', email.trim());
        } catch {}
      } else {
        try {
          localStorage.removeItem('ufugaji_saved_email');
          localStorage.setItem('ufugaji_remember_me', 'false');
        } catch {}
      }

      navigate('/', { replace: true });
    } catch (err: any) {
      console.error('Hitilafu wakati wa kuingia:', err);
      let swahiliMessage = 'Imeshindikana kuingia. Tafadhali hakiki barua pepe na nenosiri lako.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        swahiliMessage = 'Barua pepe au nenosiri si sahihi.';
      } else if (err.code === 'auth/invalid-email') {
        swahiliMessage = 'Muundo wa barua pepe si sahihi.';
      } else if (err.code === 'auth/too-many-requests') {
        swahiliMessage = 'Umejaribu mara nyingi sana. Tafadhali subiri kidogo kisha ujaribu tena.';
      } else if (err.code === 'auth/network-request-failed' || (err.message && err.message.includes('network-request-failed'))) {
        swahiliMessage = 'Hitilafu ya muunganisho wa intaneti. Tafadhali hakikisha kifaa chako kimeunganishwa kwenye mtandao kisha ujaribu tena.';
      } else if (err.code === 'auth/user-disabled') {
        swahiliMessage = 'Akaunti hii imefungwa au kusimamishwa. Tafadhali wasiliana na msimamizi.';
      }
      setError(swahiliMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 p-5 flex flex-col justify-center max-w-sm mx-auto w-full">
      {/* Brand Header */}
      <div className="text-center space-y-2 mb-6">
        <div className="w-14 h-14 bg-emerald-700 text-white rounded-2xl flex items-center justify-center mx-auto shadow-md shadow-emerald-700/20">
          <Sprout className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-stone-900 tracking-tight">Ingia kwenye Akaunti</h2>
        <p className="text-xs text-stone-600">
          Karibu tena kwenye mtandao wa wafugaji wa <strong className="text-emerald-800 font-semibold">UFUGAJI UPDATE</strong>
        </p>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-4 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-2 text-red-800 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1.5" htmlFor="login-email">
            Barua Pepe (Email)
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="login-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="mfugaji@barua.com"
              className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent min-h-[44px]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1.5" htmlFor="login-password">
            Nenosiri (Password)
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full pl-10 pr-11 py-2.5 bg-white border border-stone-300 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent min-h-[44px]"
            />
            <button
              type="button"
              id="login-toggle-password"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-600 cursor-pointer"
              aria-label={showPassword ? 'Ficha nenosiri' : 'Onyesha nenosiri'}
              title={showPassword ? 'Ficha nenosiri' : 'Onyesha nenosiri'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Remember Me Option */}
        <div className="pt-0.5">
          <label
            htmlFor="login-remember-me"
            className="flex items-center space-x-2.5 text-xs text-stone-700 font-medium cursor-pointer select-none"
          >
            <input
              id="login-remember-me"
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 text-emerald-700 rounded border-stone-300 focus:ring-emerald-600 cursor-pointer"
            />
            <span>Nikumbuke kwenye kifaa hiki (Remember me)</span>
          </label>
        </div>

        <button
          id="login-submit-button"
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 disabled:opacity-60 text-white font-semibold text-sm rounded-xl flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer min-h-[44px] mt-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Inaingia...</span>
            </>
          ) : (
            <>
              <LogIn className="w-4 h-4" />
              <span>Ingia Sasa</span>
            </>
          )}
        </button>
      </form>

      {/* Quick Admin Access for mkomwasaid53@gmail.com */}
      <div className="mt-5 p-4 bg-amber-50/80 border border-amber-300 rounded-2xl space-y-2.5 text-center">
        <div className="flex items-center justify-center gap-1.5 text-amber-900 font-bold text-xs">
          <Shield className="w-4 h-4 text-amber-700" />
          <span>Mlango wa Haraka wa Msimamizi Mkuu</span>
        </div>
        <p className="text-[11px] text-amber-800 leading-normal">
          Je, wewe ni Said Mkomwa? Bofya hapa kuingia moja kwa moja kwenye <strong>Paneli ya Utayari (Readiness Dashboard V1.9B)</strong>:
        </p>
        <button
          id="login-quick-admin-btn"
          type="button"
          onClick={handleQuickAdminLogin}
          disabled={isSubmitting}
          className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Ingia kama Said Mkomwa (mkomwasaid53@gmail.com)</span>
        </button>
      </div>

      {/* Switch to Signup */}
      <div className="mt-6 text-center text-xs text-stone-600 space-y-2">
        <p>
          Huna akaunti bado?{' '}
          <Link
            to="/signup"
            id="login-to-signup-link"
            className="text-emerald-700 font-bold hover:underline"
          >
            Jisajili Hapa (Bure)
          </Link>
        </p>
      </div>
    </div>
  );
};
