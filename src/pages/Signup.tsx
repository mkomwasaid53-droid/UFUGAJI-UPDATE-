import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Sprout, Mail, Lock, User, Phone, MapPin, Wheat, UserPlus, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';

export const Signup: React.FC = () => {
  const { signup, currentUser } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [phone, setPhone] = useState('');
  const [region, setRegion] = useState('');
  const [farmingType, setFarmingType] = useState('kuku');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If already logged in, redirect
  React.useEffect(() => {
    if (currentUser) {
      navigate('/', { replace: true });
    }
  }, [currentUser, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Tafadhali weka jina lako kamili.');
      return;
    }
    if (!email.trim() || !password) {
      setError('Tafadhali jaza barua pepe na nenosiri.');
      return;
    }
    if (password.length < 6) {
      setError('Nenosiri linapaswa kuwa na angalau herufi au namba 6.');
      return;
    }
    if (!confirmPassword) {
      setError('Tafadhali thibitisha nenosiri lako.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Nenosiri na thibitisho la nenosiri havilingani. Tafadhali hakikisha yanafanana.');
      return;
    }

    setIsSubmitting(true);
    try {
      const defaultTypesMap: Record<string, string[]> = {
        kuku: ['Kuku wa Kienyeji', 'Sasso'],
        ngombe: ['Ng\'ombe wa Maziwa', 'Ng\'ombe wa Nyama'],
        mbuzi: ['Mbuzi wa Nyama', 'Mbuzi wa Maziwa'],
        nguruwe: ['Nguruwe wa Nyama'],
        sungura: ['Sungura'],
        mchanganyiko: ['Kuku wa Kienyeji', 'Ng\'ombe wa Maziwa']
      };

      const selectedMain = [farmingType];
      const selectedTypes = defaultTypesMap[farmingType] || ['Kuku wa Kienyeji'];

      await signup(
        email.trim(),
        password,
        name.trim(),
        phone.trim(),
        region.trim(),
        selectedMain,
        selectedTypes
      );

      // Handle remember me preference
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
      console.error('Hitilafu ya usajili:', err);
      let swahiliMessage = 'Imeshindikana kusajili akaunti. Tafadhali jaribu tena.';
      if (err.code === 'auth/email-already-in-use') {
        swahiliMessage = 'Barua pepe hii tayari imesajiliwa. Tafadhali ingia au tumia barua pepe nyingine.';
      } else if (err.code === 'auth/invalid-email') {
        swahiliMessage = 'Muundo wa barua pepe si sahihi.';
      } else if (err.code === 'auth/weak-password') {
        swahiliMessage = 'Nenosiri ni dhaifu mno. Tafadhali weka nenosiri lenye angalau herufi 6.';
      } else if (err.code === 'auth/network-request-failed' || (err.message && err.message.includes('network-request-failed'))) {
        swahiliMessage = 'Hitilafu ya muunganisho wa intaneti. Tafadhali hakikisha kifaa chako kimeunganishwa kwenye mtandao kisha ujaribu tena.';
      } else if (err.code === 'auth/too-many-requests') {
        swahiliMessage = 'Mifumo ya usalama imebaini majaribio mengi kwa wakati mmoja. Tafadhali subiri sekunde chache kisha ujaribu tena.';
      }
      setError(swahiliMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const tanzaniaRegions = [
    'Arusha', 'Dar es Salaam', 'Dodoma', 'Geita', 'Iringa', 'Kagera', 'Katavi',
    'Kigoma', 'Kilimanjaro', 'Lindi', 'Manyara', 'Mara', 'Mbeya', 'Morogoro',
    'Mtwara', 'Mwanza', 'Njombe', 'Pwani', 'Rukwa', 'Ruvuma', 'Shinyanga',
    'Simiyu', 'Singida', 'Songwe', 'Tabora', 'Tanga', 'Zanzibar'
  ];

  return (
    <div className="flex-1 p-5 flex flex-col justify-center max-w-sm mx-auto w-full">
      {/* Brand Header */}
      <div className="text-center space-y-2 mb-6">
        <div className="w-14 h-14 bg-emerald-700 text-white rounded-2xl flex items-center justify-center mx-auto shadow-md shadow-emerald-700/20">
          <Sprout className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-stone-900 tracking-tight">Fungua Akaunti ya Mfugaji</h2>
        <p className="text-xs text-stone-600">
          Jiunge na mtandao wa wafugaji wa <strong className="text-emerald-800 font-semibold">UFUGAJI UPDATE</strong>
        </p>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-4 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-2 text-red-800 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Signup Form */}
      <form onSubmit={handleSubmit} className="space-y-3.5">
        {/* Name */}
        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1" htmlFor="signup-name">
            Jina Kamili <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <User className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="signup-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mfano: Juma Said Mkomwa"
              className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent min-h-[44px]"
            />
          </div>
        </div>

        {/* Email */}
        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1" htmlFor="signup-email">
            Barua Pepe (Email) <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="signup-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="juma@example.com"
              className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent min-h-[44px]"
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1" htmlFor="signup-password">
            Nenosiri (Angalau herufi 6) <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="signup-password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full pl-10 pr-11 py-2.5 bg-white border border-stone-300 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent min-h-[44px]"
            />
            <button
              type="button"
              id="signup-toggle-password"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-600 cursor-pointer"
              aria-label={showPassword ? 'Ficha nenosiri' : 'Onyesha nenosiri'}
              title={showPassword ? 'Ficha nenosiri' : 'Onyesha nenosiri'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Confirm Password */}
        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1" htmlFor="signup-confirm-password">
            Thibitisha Nenosiri (Confirm password) <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="signup-confirm-password"
              type={showConfirmPassword ? 'text' : 'password'}
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className={`w-full pl-10 pr-11 py-2.5 bg-white border rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 min-h-[44px] ${
                confirmPassword && password !== confirmPassword
                  ? 'border-red-400 focus:ring-red-500'
                  : 'border-stone-300 focus:ring-emerald-600 focus:border-transparent'
              }`}
            />
            <button
              type="button"
              id="signup-toggle-confirm-password"
              onClick={() => setShowConfirmPassword((prev) => !prev)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-600 cursor-pointer"
              aria-label={showConfirmPassword ? 'Ficha nenosiri' : 'Onyesha nenosiri'}
              title={showConfirmPassword ? 'Ficha nenosiri' : 'Onyesha nenosiri'}
            >
              {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {confirmPassword && password !== confirmPassword && (
            <p className="text-[11px] text-red-600 mt-1 pl-1">
              Nenosiri na thibitisho havilingani.
            </p>
          )}
        </div>

        {/* Show Password Option Checkbox */}
        <div className="flex items-center justify-between text-xs py-0.5">
          <label className="inline-flex items-center space-x-2 text-stone-600 cursor-pointer select-none">
            <input
              id="signup-show-all-passwords"
              type="checkbox"
              checked={showPassword && showConfirmPassword}
              onChange={(e) => {
                const checked = e.target.checked;
                setShowPassword(checked);
                setShowConfirmPassword(checked);
              }}
              className="w-4 h-4 text-emerald-700 rounded border-stone-300 focus:ring-emerald-600 cursor-pointer"
            />
            <span className="text-[12px] font-medium text-stone-700">Onyesha nenosiri (Show password)</span>
          </label>
        </div>

        {/* Phone */}
        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1" htmlFor="signup-phone">
            Namba ya Simu (Kwa mawasiliano ya soko)
          </label>
          <div className="relative">
            <Phone className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="signup-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="07XX XXX XXX"
              className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent min-h-[44px]"
            />
          </div>
        </div>

        {/* Region */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1" htmlFor="signup-region">
              Mkoa
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                id="signup-region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full pl-9 pr-2 py-2.5 bg-white border border-stone-300 rounded-xl text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 min-h-[44px]"
              >
                <option value="">Chagua Mkoa</option>
                {tanzaniaRegions.map((reg) => (
                  <option key={reg} value={reg}>{reg}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1" htmlFor="signup-farming">
              Mifugo Kuu
            </label>
            <div className="relative">
              <Wheat className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                id="signup-farming"
                value={farmingType}
                onChange={(e) => setFarmingType(e.target.value)}
                className="w-full pl-9 pr-2 py-2.5 bg-white border border-stone-300 rounded-xl text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 min-h-[44px]"
              >
                <option value="kuku">Kuku</option>
                <option value="ngombe">Ng'ombe</option>
                <option value="mbuzi">Mbuzi & Kondoo</option>
                <option value="nguruwe">Nguruwe</option>
                <option value="sungura">Sungura</option>
                <option value="mchanganyiko">Mchanganyiko</option>
              </select>
            </div>
          </div>
        </div>

        {/* Remember Me Option */}
        <div className="pt-1">
          <label
            htmlFor="signup-remember-me"
            className="flex items-center space-x-2.5 text-xs text-stone-700 font-medium cursor-pointer select-none py-1"
          >
            <input
              id="signup-remember-me"
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 text-emerald-700 rounded border-stone-300 focus:ring-emerald-600 cursor-pointer"
            />
            <span>Nikumbuke kwenye kifaa hiki (Remember me)</span>
          </label>
        </div>

        {/* Submit button */}
        <button
          id="signup-submit-button"
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 disabled:opacity-60 text-white font-semibold text-sm rounded-xl flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer min-h-[44px] mt-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Inasajili akaunti...</span>
            </>
          ) : (
            <>
              <UserPlus className="w-4 h-4" />
              <span>Kamilisha Usajili</span>
            </>
          )}
        </button>
      </form>

      {/* Note about default role */}
      <p className="text-[11px] text-stone-500 text-center mt-3">
        Kila mtumiaji mpya anapewa cheo cha msingi cha <strong className="text-stone-700">Mfugaji (farmer)</strong>.
      </p>

      {/* Switch to Login */}
      <div className="mt-4 text-center text-xs text-stone-600">
        <p>
          Tayari una akaunti?{' '}
          <Link
            to="/login"
            id="signup-to-login-link"
            className="text-emerald-700 font-bold hover:underline"
          >
            Ingia Hapa
          </Link>
        </p>
      </div>
    </div>
  );
};
