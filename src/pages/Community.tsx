import React from 'react';
import { Link } from 'react-router-dom';
import {
  MessageSquare,
  Sparkles,
  ShoppingBag,
  Bot,
  Stethoscope,
  ClipboardList,
  ArrowRight
} from 'lucide-react';

/**
 * UFUGAJI UPDATE — GUMZO RETIREMENT V1.0
 * Professional Swahili placeholder for temporarily retired Gumzo community feature.
 * Does not render group discovery, lists, posts, comments, or creation forms.
 */
export const Community: React.FC = () => {
  return (
    <div className="min-h-[75vh] flex flex-col items-center justify-center px-4 py-8 max-w-lg mx-auto text-center">
      {/* Decorative Branding Icon */}
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-emerald-100 via-emerald-50 to-amber-50 border border-emerald-200 shadow-sm flex items-center justify-center text-emerald-800">
          <MessageSquare className="w-10 h-10 text-emerald-700" />
        </div>
        <div className="absolute -top-1.5 -right-1.5 w-7 h-7 rounded-full bg-amber-400 border-2 border-white flex items-center justify-center text-stone-900 shadow-xs">
          <Sparkles className="w-4 h-4 text-stone-950" />
        </div>
      </div>

      {/* Status Pill */}
      <div className="mb-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold tracking-wide">
        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
        <span>Maboresho ya Huduma</span>
      </div>

      {/* Authoritative Title */}
      <h1
        id="gumzo-placeholder-title"
        className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight mb-3"
      >
        Gumzo linakuja hivi karibuni!
      </h1>

      {/* Authoritative Message */}
      <p
        id="gumzo-placeholder-message"
        className="text-sm sm:text-base text-stone-600 leading-relaxed mb-8 max-w-md"
      >
        Tunafanyia sehemu hii maboresho ili kukuletea huduma bora zaidi. Tafadhali endelea kutumia huduma nyingine za Ufugaji Update.
      </p>

      {/* Alternative Active Services Navigation Card */}
      <div className="w-full bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3 text-left">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-bold text-stone-500 uppercase tracking-wider">
            Huduma Zinazopatikana Sasa
          </h2>
          <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            Zinafanya Kazi
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          {/* 1. Msaidizi Wangu */}
          <Link
            to="/my-assistant"
            id="retired-gumzo-link-my-assistant"
            className="flex items-center justify-between p-3 rounded-xl border border-stone-200/80 hover:border-emerald-300 hover:bg-emerald-50/50 transition-all group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <ClipboardList className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-bold text-stone-900 group-hover:text-emerald-800 truncate">
                  Msaidizi Wangu
                </h3>
                <p className="text-[10px] text-stone-500 truncate">Daftari la mifugo</p>
              </div>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-stone-400 group-hover:text-emerald-700 transition-colors shrink-0 ml-1" />
          </Link>

          {/* 2. Gulio */}
          <Link
            to="/market"
            id="retired-gumzo-link-market"
            className="flex items-center justify-between p-3 rounded-xl border border-stone-200/80 hover:border-emerald-300 hover:bg-emerald-50/50 transition-all group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-bold text-stone-900 group-hover:text-emerald-800 truncate">
                  Gulio
                </h3>
                <p className="text-[10px] text-stone-500 truncate">Soko la mifugo na bidhaa</p>
              </div>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-stone-400 group-hover:text-emerald-700 transition-colors shrink-0 ml-1" />
          </Link>

          {/* 3. AI Assistant */}
          <Link
            to="/ai-assistant"
            id="retired-gumzo-link-ai-assistant"
            className="flex items-center justify-between p-3 rounded-xl border border-stone-200/80 hover:border-purple-300 hover:bg-purple-50/50 transition-all group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-800 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Bot className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-bold text-stone-900 group-hover:text-purple-800 truncate">
                  AI Assistant
                </h3>
                <p className="text-[10px] text-stone-500 truncate">Elimu na majibu ya kilimo</p>
              </div>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-stone-400 group-hover:text-purple-700 transition-colors shrink-0 ml-1" />
          </Link>

          {/* 4. Daktari Mtaani Kwako */}
          <Link
            to="/daktari"
            id="retired-gumzo-link-daktari"
            className="flex items-center justify-between p-3 rounded-xl border border-stone-200/80 hover:border-amber-300 hover:bg-amber-50/50 transition-all group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Stethoscope className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-bold text-stone-900 group-hover:text-amber-800 truncate">
                  Daktari Mtaani Kwako
                </h3>
                <p className="text-[10px] text-stone-500 truncate">Wataalamu wa mifugo</p>
              </div>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-stone-400 group-hover:text-amber-700 transition-colors shrink-0 ml-1" />
          </Link>
        </div>
      </div>
    </div>
  );
};
