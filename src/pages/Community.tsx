import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, MessageSquare, Plus, Search, Tag, Sparkles, BookOpen, Clock, ShieldCheck, ArrowRight } from 'lucide-react';

export const Community: React.FC = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('all');

  const topics = [
    { id: 'all', label: 'Mada Zote' },
    { id: 'kuku', label: 'Ufugaji wa Kuku' },
    { id: 'ngombe', label: "Ng'ombe wa Maziwa" },
    { id: 'lishe', label: 'Lishe & Vyakula' },
    { id: 'magonjwa', label: 'Kinga & Chanjo' },
    { id: 'mabanda', label: 'Ujenzi wa Mabanda' },
  ];

  return (
    <div className="flex-1 p-4 max-w-4xl mx-auto space-y-4">
      {/* Header Banner - Phase 2 Coming Soon */}
      <div className="bg-gradient-to-br from-blue-900 to-indigo-950 text-blue-50 rounded-2xl p-5 shadow-sm space-y-2 relative overflow-hidden">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-800/80 text-blue-200 border border-blue-700/60 inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            Awamu ya 2 (Phase 2) — Inakuja Hivi Karibuni
          </span>
          <span className="text-[11px] text-blue-300">UFUGAJI UPDATE</span>
        </div>
        <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white pt-1">
          Jamii na Ubadilishanaji wa Uzoefu (Gumzo)
        </h2>
        <p className="text-xs text-blue-100/90 leading-relaxed max-w-xl">
          Jukwaa la wafugaji kutoka mikoa yote ya Tanzania kushirikiana uzoefu, kuuliza maswali ya vitendo, na kusaidiana kukuza uchumi wa mifugo.
        </p>

        <div className="absolute -right-8 -bottom-8 w-36 h-36 bg-blue-600/20 rounded-full blur-2xl pointer-events-none" />
      </div>

      {/* Search and Categories Preview */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tafuta mada ya ufugaji itakayojadiliwa..."
            className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-blue-600 min-h-[44px]"
          />
        </div>

        {/* Topics horizontal scroll */}
        <div className="flex overflow-x-auto pb-1 gap-1.5 no-scrollbar">
          {topics.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedTopic(t.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                selectedTopic === t.id
                  ? 'bg-blue-800 text-white shadow-xs'
                  : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Structural Status Container */}
      <div className="bg-white border border-stone-200 rounded-2xl p-6 text-center space-y-3 shadow-2xs">
        <div className="w-12 h-12 bg-blue-50 text-blue-800 rounded-2xl flex items-center justify-center mx-auto border border-blue-200">
          <MessageSquare className="w-6 h-6" />
        </div>
        <div className="space-y-1 max-w-md mx-auto">
          <h3 className="text-sm font-bold text-stone-900">
            Msingi wa Jamii ya Wafugaji Umeandaliwa
          </h3>
          <p className="text-xs text-stone-500 leading-relaxed">
            Muundo wa mada na majadiliano ya jamii unakamilishwa kwa uzinduzi wa Awamu ya 2. Kwa sasa, tumia Msaidizi wa AI kupata majibu ya haraka ya kitaalamu.
          </p>
        </div>

        <div className="pt-2 flex justify-center">
          <button
            type="button"
            onClick={() => navigate('/ai-assistant')}
            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer min-h-[44px]"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Uliza Msaidizi wa AI Maswali Yako</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Guidelines Box */}
      <div className="p-3.5 bg-stone-100 rounded-xl border border-stone-200 text-stone-600 text-xs space-y-1.5">
        <h4 className="font-bold text-stone-800 flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5 text-blue-700" /> Mwongozo wa Jamii ya Wafugaji
        </h4>
        <p className="text-[11px] leading-relaxed">
          Tunazingatia heshima, lugha safi ya Kiswahili, kubadilishana uzoefu wa kweli, na kusaidiana kukuza uchumi wa mifugo nchini Tanzania.
        </p>
      </div>
    </div>
  );
};
