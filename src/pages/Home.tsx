import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  ClipboardList,
  Bot,
  Stethoscope,
  ShoppingBag,
  Users,
  User,
  ArrowRight,
  Sparkles,
  HelpCircle,
  ShieldCheck,
  Wheat,
  Activity,
  CheckCircle2,
  AlertTriangle,
  PhoneCall
} from 'lucide-react';
import { subscribeToModuleUnreadCounts } from '../services/notificationService';
import { ModuleBadge } from '../components/notifications/ModuleBadge';
import { ModuleUnreadCounts } from '../types/notification';

export const Home: React.FC = () => {
  const { currentUser, userProfile, role, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchQuestion, setSearchQuestion] = useState('');
  const [moduleCounts, setModuleCounts] = useState<ModuleUnreadCounts>({
    marketplace: 0,
    gumzo: 0,
    total: 0,
    byModule: {
      MARKETPLACE: 0,
      GUMZO: 0,
      ADMIN: 0,
      SYSTEM: 0,
      DAKTARI: 0,
      MY_ASSISTANT: 0
    }
  });

  useEffect(() => {
    if (!currentUser?.uid) return;
    const unsub = subscribeToModuleUnreadCounts(currentUser.uid, isAdmin, (counts) => {
      setModuleCounts(counts);
    });
    return () => unsub();
  }, [currentUser?.uid, isAdmin]);

  const userName = userProfile?.displayName || userProfile?.name || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Mfugaji';

  const handleAskAssistant = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (searchQuestion.trim()) {
      navigate(`/ai-assistant?q=${encodeURIComponent(searchQuestion.trim())}`);
    } else {
      navigate('/ai-assistant');
    }
  };

  const handlePromptClick = (question: string) => {
    navigate(`/ai-assistant?q=${encodeURIComponent(question)}`);
  };

  const samplePrompts = [
    'Ulishaji bora wa kuku wa kienyeji',
    'Dalili za ugonjwa wa sotoka (Newcastle)',
    'Jinsi ya kutunza ng\'ombe wa maziwa',
    'Ujenzi wa banda bora la nguruwe'
  ];

  return (
    <div className="flex-1 p-4 space-y-5">
      {/* Welcome Banner */}
      <section className="bg-gradient-to-br from-emerald-800 to-emerald-900 text-white rounded-2xl p-5 shadow-sm relative overflow-hidden">
        <div className="relative z-10 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-700/80 text-emerald-100 border border-emerald-500/30 inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              {role === 'admin' ? 'Akaunti ya Msimamizi' : role === 'seller' ? 'Akaunti ya Muuzaji' : 'Akaunti ya Mfugaji'}
            </span>
            <span className="text-[11px] text-emerald-200">Ufugaji Update v1.0</span>
          </div>

          <h2 className="text-xl font-bold tracking-tight text-white pt-1">
            Habari, {userName}! 👋
          </h2>
          <p className="text-xs text-emerald-100/90 leading-relaxed">
            Karibu kwenye kitovu chako cha maarifa, masoko, madaktari, na miongozo ya ufugaji bora nchini Tanzania.
          </p>
        </div>

        {/* Decorative background shape */}
        <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-emerald-700/40 rounded-full blur-2xl pointer-events-none" />
      </section>



      {/* Prominent "Uliza Msaidizi" Area */}
      <section className="bg-white rounded-2xl p-4 border border-stone-200/80 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900">Uliza Msaidizi wa Ufugaji</h3>
              <p className="text-[11px] text-stone-500">Pata majibu ya haraka ya miongozo ya kilimo & mifugo</p>
            </div>
          </div>
          <span className="text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200/60 px-2 py-0.5 rounded-md">
            Miongozo ya Jumla
          </span>
        </div>

        {/* Input Form */}
        <form onSubmit={handleAskAssistant} className="flex gap-2 pt-1">
          <input
            id="home-ask-input"
            type="text"
            value={searchQuestion}
            onChange={(e) => setSearchQuestion(e.target.value)}
            placeholder="Mfano: Dalili za ndui ya kuku..."
            className="flex-1 px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white transition-all"
          />
          <button
            id="home-ask-submit-btn"
            type="submit"
            className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-medium text-sm rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer min-h-[44px]"
          >
            <span>Uliza</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Quick Suggestion Chips */}
        <div className="space-y-1.5 pt-1">
          <p className="text-[11px] font-medium text-stone-500">Mada maarufu za kuuliza:</p>
          <div className="flex flex-wrap gap-1.5">
            {samplePrompts.map((prompt, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handlePromptClick(prompt)}
                className="text-[11px] text-stone-700 bg-stone-100 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-200 border border-stone-200/80 px-2.5 py-1 rounded-lg transition-colors text-left"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Quick Access Grid in standard order: Msaidizi Wangu, AI Assistant, Gulio, Daktari Mtaani Kwako, Gumzo */}
      <section className="space-y-2">
        <h3 className="text-xs font-bold text-stone-600 uppercase tracking-wider px-1">
          Huduma Kuu za Ufugaji
        </h3>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {/* 1. Msaidizi Wangu */}
          <button
            id="home-quick-my-assistant"
            onClick={() => navigate('/my-assistant')}
            className="p-4 bg-white hover:bg-emerald-50/40 border border-stone-200 rounded-2xl text-left space-y-2 shadow-xs transition-all group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center group-hover:scale-105 transition-transform">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-stone-900 group-hover:text-emerald-800 transition-colors">
                Msaidizi Wangu
              </h4>
              <p className="text-[11px] text-stone-500 leading-tight pt-0.5">
                Rekodi na fuatilia idadi ya mifugo yako
              </p>
            </div>
          </button>

          {/* 2. AI Assistant */}
          <button
            id="home-quick-ai"
            onClick={() => navigate('/ai-assistant')}
            className="p-4 bg-white hover:bg-emerald-50/40 border border-stone-200 rounded-2xl text-left space-y-2 shadow-xs transition-all group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-stone-900 group-hover:text-emerald-800 transition-colors">
                AI Assistant
              </h4>
              <p className="text-[11px] text-stone-500 leading-tight pt-0.5">
                Mwongozo wa ulishaji, mabanda na afya
              </p>
            </div>
          </button>

          {/* 3. Gulio */}
          <button
            id="home-quick-market"
            onClick={() => navigate('/market')}
            className="p-4 bg-white hover:bg-emerald-50/40 border border-stone-200 rounded-2xl text-left space-y-2 shadow-xs transition-all group cursor-pointer relative"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center group-hover:scale-105 transition-transform relative">
              <ShoppingBag className="w-5 h-5" />
              <ModuleBadge count={moduleCounts.marketplace} moduleName="Gulio" id="home-market-badge" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-stone-900 group-hover:text-emerald-800 transition-colors">
                Gulio
              </h4>
              <p className="text-[11px] text-stone-500 leading-tight pt-0.5">
                Nunua na uza mifugo, vyakula, na vifaa
              </p>
            </div>
          </button>

          {/* 4. Daktari Mtaani Kwako */}
          <button
            id="home-quick-daktari"
            onClick={() => navigate('/daktari')}
            className="p-4 bg-white hover:bg-teal-50/40 border border-teal-200/80 rounded-2xl text-left space-y-2 shadow-xs transition-all group cursor-pointer relative"
          >
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Stethoscope className="w-5 h-5" />
              </div>
              <span className="text-[9.5px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-md">
                Wataalamu
              </span>
            </div>
            <div>
              <h4 className="text-sm font-bold text-stone-900 group-hover:text-teal-800 transition-colors">
                Daktari Mtaani Kwako
              </h4>
              <p className="text-[11px] text-stone-500 leading-tight pt-0.5">
                Mtandao wa madaktari & maafisa ugani
              </p>
            </div>
          </button>

          {/* 5. Gumzo */}
          <button
            id="home-quick-community"
            onClick={() => navigate('/community')}
            className="p-4 bg-white hover:bg-emerald-50/40 border border-stone-200 rounded-2xl text-left space-y-2 shadow-xs transition-all group cursor-pointer relative"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center group-hover:scale-105 transition-transform relative">
              <Users className="w-5 h-5" />
              <ModuleBadge count={moduleCounts.gumzo} moduleName="Gumzo" id="home-community-badge" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-stone-900 group-hover:text-emerald-800 transition-colors">
                Gumzo
              </h4>
              <p className="text-[11px] text-stone-500 leading-tight pt-0.5">
                Mijadala, mada, na uzoefu wa shambani
              </p>
            </div>
          </button>
        </div>
      </section>

      {/* Advisory & Knowledge Card */}
      <section className="bg-emerald-50/80 border border-emerald-200/80 rounded-2xl p-4 space-y-2">
        <div className="flex items-center space-x-2 text-emerald-900">
          <Wheat className="w-4 h-4 text-emerald-700" />
          <h4 className="text-xs font-bold uppercase tracking-wider">Dokezo la Ufugaji Bora</h4>
        </div>
        <p className="text-xs text-emerald-950 font-semibold">
          Utunzaji wa Usafi wa Banda la Kuku:
        </p>
        <p className="text-xs text-emerald-800/90 leading-relaxed">
          Kuhakikisha maranda (litter) ya sakafuni ni makavu na safi kunapunguza kwa asilimia kubwa magonjwa ya mfumo wa hewa (CRD) na ugonjwa wa koksidiosis (Coccidiosis).
        </p>
        <div className="pt-1 flex items-center justify-between text-[11px] text-emerald-700">
          <span className="inline-flex items-center gap-1 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" /> Ufugaji Endelevu
          </span>
          <button
            onClick={() => handlePromptClick('Jinsi ya kuzuia magonjwa ya kuku kwa njia ya usafi')}
            className="text-emerald-900 font-semibold underline underline-offset-2 hover:text-emerald-700"
          >
            Soma Zaidi
          </button>
        </div>
      </section>

      {/* Veterinary Disclaimer Reminder */}
      <div className="p-3 bg-stone-100 rounded-xl border border-stone-200 text-stone-600 text-[11px] leading-normal flex items-start space-x-2">
        <ShieldCheck className="w-4 h-4 text-stone-500 mt-0.5 shrink-0" />
        <p>
          <strong>Kikumbusho cha Afya ya Mifugo:</strong> Msaidizi wa UFUGAJI UPDATE hutoa elimu na miongozo ya jumla. Unaweza kuwasiliana moja kwa moja na Bwana/Bibi Mifugo aliyesajiliwa kwenye ukurasa wa <button onClick={() => navigate('/daktari')} className="font-bold text-emerald-800 underline">Daktari Mtaani Kwako</button> kwa uchunguzi na matibabu ya shambani.
        </p>
      </div>
    </div>
  );
};
