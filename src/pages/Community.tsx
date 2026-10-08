import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Search,
  Plus,
  Compass,
  UserCheck,
  RefreshCw,
  AlertCircle,
  Sparkles,
  Info,
  ShieldCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { GumzoGroup, GumzoMembership, GUMZO_CATEGORIES } from '../types/gumzo';
import { gumzoGroupService } from '../services/gumzoGroupService';
import { GumzoGroupCard } from '../components/gumzo/GumzoGroupCard';
import { GumzoGroupDetail } from '../components/gumzo/GumzoGroupDetail';
import { CreateGumzoGroupModal } from '../components/gumzo/CreateGumzoGroupModal';

export const Community: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const currentUserId = user?.uid || '';

  const [activeTab, setActiveTab] = useState<'MY_GROUPS' | 'DISCOVER'>('DISCOVER');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [discoverGroups, setDiscoverGroups] = useState<GumzoGroup[]>([]);
  const [myGroups, setMyGroups] = useState<GumzoGroup[]>([]);
  const [membershipsMap, setMembershipsMap] = useState<Record<string, GumzoMembership>>({});

  const [selectedGroup, setSelectedGroup] = useState<GumzoGroup | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setErrorMsg(null);

      // 1. Load discoverable public groups
      const discover = await gumzoGroupService.fetchBrowserGroups(
        selectedCategory === 'all' ? undefined : selectedCategory,
        currentUserId
      );
      setDiscoverGroups(discover);

      // 2. If logged in, load user's memberships and my groups
      if (currentUserId) {
        const userMemList = gumzoGroupService.getUserMemberships(currentUserId);
        const map: Record<string, GumzoMembership> = {};
        userMemList.forEach((m) => {
          map[m.groupId] = m;
        });
        setMembershipsMap(map);

        const mine = gumzoGroupService.getUserGroups(currentUserId);
        setMyGroups(mine);
      } else {
        setMyGroups([]);
        setMembershipsMap({});
      }
    } catch (err: any) {
      console.error('Hitilafu ya kupakia vikundi vya Gumzo:', err);
      setErrorMsg('Imeshindwa kupakia vikundi vya Gumzo kwa sasa.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUserId, selectedCategory]);

  // Filter groups by search query
  const displayedGroups = (activeTab === 'MY_GROUPS' ? myGroups : discoverGroups).filter((g) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      g.name.toLowerCase().includes(query) ||
      g.description.toLowerCase().includes(query) ||
      g.categoryId.toLowerCase().includes(query)
    );
  });

  return (
    <div className="flex-1 p-3 sm:p-4 md:p-6 max-w-5xl mx-auto space-y-5 pb-24">
      {/* Detail View Mode */}
      {selectedGroup ? (
        <GumzoGroupDetail
          group={selectedGroup}
          currentUserId={currentUserId}
          initialMembership={membershipsMap[selectedGroup.groupId]}
          onBack={() => {
            setSelectedGroup(null);
            loadData();
          }}
          onGroupUpdated={(updated) => {
            setSelectedGroup(updated);
            loadData();
          }}
        />
      ) : (
        <>
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-stone-900 via-stone-800 to-emerald-950 text-white rounded-3xl p-5 sm:p-6 shadow-sm space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-emerald-200 inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Jamii ya Wafugaji — Gumzo (V9.1)
              </span>
              <span className="text-[11px] font-semibold text-stone-300">UFUGAJI UPDATE</span>
            </div>

            <div className="max-w-xl space-y-1.5">
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
                Vikundi vya Wafugaji (Gumzo)
              </h1>
              <p className="text-xs sm:text-sm text-stone-300 leading-relaxed">
                Jiunge na wafugaji wenzako kulingana na aina ya mifugo, eneo, au mbinu za kisasa za ufugaji ili kubadilishana maarifa na uzoefu.
              </p>
            </div>

            <div className="pt-2 flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  if (!currentUserId) {
                    alert('Tafadhali ingia kwenye mfumo ili kuanzisha kikundi.');
                    return;
                  }
                  setIsCreateModalOpen(true);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer min-h-[40px]"
              >
                <Plus className="w-4 h-4" />
                <span>Anzisha Kikundi Kipya</span>
              </button>

              {isAdmin && (
                <Link
                  to="/admin?tab=community"
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer min-h-[40px]"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Usimamizi wa Vikundi (Admin Panel)</span>
                </Link>
              )}
            </div>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex items-center justify-between gap-3 border-b border-stone-200 pb-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('DISCOVER')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'DISCOVER'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                <span>Gundua Vikundi (Discover)</span>
                <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">
                  {discoverGroups.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('MY_GROUPS')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'MY_GROUPS'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Vikundi Vyangu (My Groups)</span>
                {myGroups.length > 0 && (
                  <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-200 text-emerald-900 font-extrabold">
                    {myGroups.length}
                  </span>
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={loadData}
              disabled={isLoading}
              title="Pakia Upya"
              className="p-2 text-stone-500 hover:text-stone-800 rounded-xl hover:bg-stone-100 border border-stone-200 bg-white transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Search bar & Category filters */}
          <div className="space-y-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tafuta kikundi kwa jina, maelezo au mifugo..."
                className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-700 min-h-[44px]"
              />
            </div>

            {/* Category horizontal pills */}
            <div className="flex overflow-x-auto pb-1 gap-1.5 no-scrollbar">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  selectedCategory === 'all'
                    ? 'bg-stone-900 text-white shadow-xs'
                    : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
                }`}
              >
                Mada Zote
              </button>

              {GUMZO_CATEGORIES.map((cat) => (
                <button
                  key={cat.categoryId}
                  type="button"
                  onClick={() => setSelectedCategory(cat.categoryId)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    selectedCategory === cat.categoryId
                      ? 'bg-stone-900 text-white shadow-xs'
                      : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
                  }`}
                >
                  {cat.nameSwahili}
                </button>
              ))}
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Group Cards Grid or Honest Empty States */}
          {isLoading ? (
            <div className="py-12 text-center text-xs text-stone-400 flex flex-col items-center justify-center space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin text-emerald-700" />
              <span>Inapakia vikundi vya Gumzo...</span>
            </div>
          ) : displayedGroups.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
              {displayedGroups.map((group) => (
                <GumzoGroupCard
                  key={group.groupId}
                  group={group}
                  membership={membershipsMap[group.groupId]}
                  onSelectGroup={(g) => setSelectedGroup(g)}
                />
              ))}
            </div>
          ) : (
            /* Honest Empty States (Per Requirement 17) */
            <div className="bg-white border border-stone-200 rounded-3xl p-8 text-center space-y-3.5 shadow-2xs">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-800 rounded-2xl flex items-center justify-center mx-auto border border-emerald-200">
                <Users className="w-6 h-6" />
              </div>

              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-sm font-bold text-stone-900">
                  {activeTab === 'MY_GROUPS'
                    ? 'Bado hujaingia kwenye kikundi chochote.'
                    : searchQuery
                    ? 'Hakuna vikundi vilivyopatikana kulingana na utafutaji wako.'
                    : 'Bado hakuna vikundi vinavyopatikana katika kategoria hii.'}
                </h3>
                <p className="text-xs text-stone-500 leading-relaxed">
                  {activeTab === 'MY_GROUPS'
                    ? 'Gundua vikundi vinavyokufaa katika kichupo cha "Gundua Vikundi" au anzisha kikundi chako mwenyewe kuanza jumuiya ya wafugaji.'
                    : 'Kuwa wa kwanza kuanzisha kikundi kwa ajili ya jamii yako au chagua kategoria nyingine ya ufugaji hapo juu.'}
                </p>
              </div>

              <div className="pt-2 flex justify-center gap-2">
                {activeTab === 'MY_GROUPS' ? (
                  <button
                    type="button"
                    onClick={() => setActiveTab('DISCOVER')}
                    className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-2xs transition-colors cursor-pointer min-h-[40px]"
                  >
                    Gundua Vikundi vya Umma
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(true)}
                    className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-2xs transition-colors cursor-pointer min-h-[40px]"
                  >
                    Anzisha Kikundi Sasa
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Group Creation Modal */}
      <CreateGumzoGroupModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        currentUserId={currentUserId}
        onSuccess={(newGroup) => {
          loadData();
          setSelectedGroup(newGroup);
        }}
      />
    </div>
  );
};
export default Community;
