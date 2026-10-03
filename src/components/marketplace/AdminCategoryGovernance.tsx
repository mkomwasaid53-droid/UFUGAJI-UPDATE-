import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  GovernedCategory,
  CategoryType,
  CategoryStatus,
  CreateCategoryInput,
  UpdateCategoryInput
} from '../../types/marketplaceCategory';
import {
  fetchGovernedCategories,
  buildCategoryHierarchyTree,
  createGovernedCategory,
  updateGovernedCategory,
  deactivateGovernedCategory,
  activateGovernedCategory,
  seedDefaultMarketplaceTaxonomy,
  SEED_GOVERNED_CATEGORIES
} from '../../services/marketplaceCategoryService';
import {
  Layers,
  Plus,
  Edit,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ChevronRight,
  Power,
  Database,
  X
} from 'lucide-react';

const LIVESTOCK_OPTIONS = [
  { value: 'Kuku', label: 'Kuku & Ndege (Poultry)' },
  { value: "Ng'ombe", label: "Ng'ombe (Cattle)" },
  { value: 'Mbuzi', label: 'Mbuzi (Goats)' },
  { value: 'Kondoo', label: 'Kondoo (Sheep)' },
  { value: 'Nguruwe', label: 'Nguruwe (Pigs)' },
  { value: 'Sungura', label: 'Sungura (Rabbits)' },
  { value: 'Nyuki', label: 'Nyuki (Bees)' },
  { value: 'Samaki', label: 'Samaki (Fish)' }
];

export const AdminCategoryGovernance: React.FC = () => {
  const { user, isAdmin } = useAuth();

  const [categories, setCategories] = useState<GovernedCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Search and Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Modal State for Add/Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<GovernedCategory | null>(null);

  // Form Fields
  const [formCategoryId, setFormCategoryId] = useState('');
  const [formName, setFormName] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategoryType, setFormCategoryType] = useState<CategoryType>('CATEGORY');
  const [formParentId, setFormParentId] = useState<string>('');
  const [formLivestockTypes, setFormLivestockTypes] = useState<string[]>([]);
  const [formSortOrder, setFormSortOrder] = useState<number>(1);
  const [formStatus, setFormStatus] = useState<CategoryStatus>('ACTIVE');

  // Status Change Confirmation Modal
  const [statusTarget, setStatusTarget] = useState<{
    category: GovernedCategory;
    newStatus: CategoryStatus;
  } | null>(null);

  // Seed Confirmation Modal
  const [showSeedModal, setShowSeedModal] = useState(false);
  const [seedForceReset, setSeedForceReset] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    setFeedback(null);
    try {
      const data = await fetchGovernedCategories();
      setCategories(data);
    } catch (err: any) {
      console.error('Hitilafu ya kupata kategoria:', err);
      setFeedback({
        type: 'error',
        text: err?.message || 'Haikuweza kupakia kategoria za soko kutoka Firestore.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Root / parent categories for selection
  const rootCategories = useMemo(() => {
    return categories.filter(
      (c) => (c.categoryType === 'ROOT' || c.categoryType === 'CATEGORY') && c.status === 'ACTIVE'
    );
  }, [categories]);

  // Hierarchical display tree
  const hierarchyTree = useMemo(() => {
    return buildCategoryHierarchyTree(categories);
  }, [categories]);

  // Filtered categories for table/list
  const filteredCategories = useMemo(() => {
    return categories.filter((cat) => {
      if (filterType !== 'ALL' && cat.categoryType !== filterType) return false;
      if (filterStatus !== 'ALL' && cat.status !== filterStatus) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesName = cat.name.toLowerCase().includes(q);
        const matchesId = cat.categoryId.toLowerCase().includes(q);
        const matchesSlug = cat.slug.toLowerCase().includes(q);
        if (!matchesName && !matchesId && !matchesSlug) return false;
      }
      return true;
    });
  }, [categories, filterType, filterStatus, searchTerm]);

  // Category counts
  const stats = useMemo(() => {
    const total = categories.length;
    const roots = categories.filter((c) => c.categoryType === 'ROOT' || c.categoryType === 'CATEGORY').length;
    const subs = categories.filter((c) => c.categoryType === 'SUBCATEGORY').length;
    const active = categories.filter((c) => c.status === 'ACTIVE').length;
    const inactive = categories.filter((c) => c.status === 'INACTIVE').length;
    return { total, roots, subs, active, inactive };
  }, [categories]);

  // Open Create Modal
  const handleOpenCreate = (defaultParentId?: string) => {
    setEditingCategory(null);
    setFormCategoryId('');
    setFormName('');
    setFormSlug('');
    setFormDescription('');
    setFormCategoryType(defaultParentId ? 'SUBCATEGORY' : 'CATEGORY');
    setFormParentId(defaultParentId || '');
    setFormLivestockTypes([]);
    setFormSortOrder(categories.length + 1);
    setFormStatus('ACTIVE');
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (category: GovernedCategory) => {
    setEditingCategory(category);
    setFormCategoryId(category.categoryId);
    setFormName(category.name);
    setFormSlug(category.slug || '');
    setFormDescription(category.description || '');
    setFormCategoryType(category.categoryType);
    setFormParentId(category.parentCategoryId || '');
    setFormLivestockTypes(category.livestockTypesAllowed || []);
    setFormSortOrder(category.sortOrder || 1);
    setFormStatus(category.status);
    setIsModalOpen(true);
  };

  // Handle Save (Create or Edit)
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid || !isAdmin) {
      setFeedback({ type: 'error', text: 'Ruhusa ya msimamizi (Admin) inahitajika.' });
      return;
    }

    if (!formName.trim()) {
      setFeedback({ type: 'error', text: 'Tafadhali weka jina la kategoria.' });
      return;
    }

    if (formCategoryType === 'SUBCATEGORY' && !formParentId) {
      setFeedback({ type: 'error', text: 'Kundi dogo lazima liwe na kundi kuu mzazi (Parent Category).' });
      return;
    }

    setIsProcessing(true);
    setFeedback(null);

    try {
      if (editingCategory) {
        const updateInput: UpdateCategoryInput = {
          name: formName.trim(),
          slug: formSlug.trim() || undefined,
          description: formDescription.trim(),
          parentCategoryId: formCategoryType === 'SUBCATEGORY' ? formParentId : null,
          sortOrder: Number(formSortOrder) || 1,
          status: formStatus,
          livestockTypesAllowed: formLivestockTypes
        };

        const updated = await updateGovernedCategory(
          editingCategory.categoryId,
          updateInput,
          user.uid,
          isAdmin
        );

        setCategories((prev) =>
          prev.map((c) => (c.categoryId === updated.categoryId ? updated : c))
        );

        setFeedback({
          type: 'success',
          text: `Kategoria "${updated.name}" (${updated.categoryId}) imesasishwa kikamilifu.`
        });
      } else {
        const finalCatId = formCategoryId.trim()
          ? formCategoryId.trim()
          : `cat_${formName.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 32)}`;

        const createInput: CreateCategoryInput = {
          categoryId: finalCatId,
          name: formName.trim(),
          slug: formSlug.trim() || undefined,
          description: formDescription.trim(),
          parentCategoryId: formCategoryType === 'SUBCATEGORY' ? formParentId : null,
          categoryType: formCategoryType,
          status: formStatus,
          sortOrder: Number(formSortOrder) || 1,
          livestockTypesAllowed: formLivestockTypes
        };

        const created = await createGovernedCategory(createInput, user.uid, isAdmin);

        setCategories((prev) => [...prev, created]);

        setFeedback({
          type: 'success',
          text: `Kategoria mpya "${created.name}" (${created.categoryId}) imeundwa kikamilifu.`
        });
      }

      setIsModalOpen(false);
    } catch (err: any) {
      console.error('Hitilafu ya kuhifadhi kategoria:', err);
      setFeedback({
        type: 'error',
        text: err?.message || 'Haikuweza kuhifadhi kategoria.'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Status Toggle (Activate or Deactivate)
  const handleConfirmStatusChange = async () => {
    if (!statusTarget || !user?.uid || !isAdmin) return;

    setIsProcessing(true);
    setFeedback(null);

    try {
      let updated: GovernedCategory;
      if (statusTarget.newStatus === 'ACTIVE') {
        updated = await activateGovernedCategory(
          statusTarget.category.categoryId,
          user.uid,
          isAdmin
        );
      } else {
        updated = await deactivateGovernedCategory(
          statusTarget.category.categoryId,
          user.uid,
          isAdmin
        );
      }

      setCategories((prev) =>
        prev.map((c) => (c.categoryId === updated.categoryId ? updated : c))
      );

      setFeedback({
        type: 'success',
        text: `Hali ya kategoria "${updated.name}" imebadilishwa kuwa ${updated.status}.`
      });
      setStatusTarget(null);
    } catch (err: any) {
      console.error('Hitilafu:', err);
      setFeedback({
        type: 'error',
        text: err?.message || 'Haikuweza kubadili hali ya kategoria.'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Seed Taxonomy
  const handleSeedTaxonomy = async () => {
    if (!user?.uid || !isAdmin) return;
    setIsProcessing(true);
    setFeedback(null);

    try {
      const seeded = await seedDefaultMarketplaceTaxonomy(user.uid, isAdmin, seedForceReset);
      setCategories(seeded);
      setFeedback({
        type: 'success',
        text: `Kategoria chaguomsingi ${seeded.length} za Gulio zimeingizwa kwenye Firestore na cache kikamilifu.`
      });
      setShowSeedModal(false);
    } catch (err: any) {
      console.error('Hitilafu ya kuseed:', err);
      setFeedback({
        type: 'error',
        text: err?.message || 'Haikuweza kuseed kategoria za soko.'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleLivestockType = (val: string) => {
    setFormLivestockTypes((prev) =>
      prev.includes(val) ? prev.filter((item) => item !== val) : [...prev, val]
    );
  };

  return (
    <div className="space-y-4">
      {/* Header & Title */}
      <div className="bg-white border border-stone-200/80 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-amber-100 text-amber-900 rounded-lg">
                <Layers className="w-4 h-4" />
              </span>
              <h3 className="text-base font-bold text-stone-900">
                Usimamizi wa Kategoria za Soko (V1.7A Category Governance)
              </h3>
            </div>
            <p className="text-xs text-stone-500 max-w-2xl">
              Kategoria za Marketplace ni <strong>Controlled Data</strong> (zinazoidhinishwa na Wasimamizi tu). Wauzaji na mifumo ya AI hawana mamlaka ya kutengeneza kategoria mpya bila idhini ya kiutawala.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={loadData}
              disabled={isLoading}
              className="p-2 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer border border-stone-200 min-h-[40px]"
              title="Pakia Upya"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => setShowSeedModal(true)}
              className="py-2 px-3 text-xs font-bold text-stone-700 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded-xl inline-flex items-center gap-1.5 transition-colors cursor-pointer min-h-[40px]"
            >
              <Database className="w-3.5 h-3.5 text-stone-600" />
              <span>Ingiza Kategoria za Awali (Seed Taxonomy)</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenCreate()}
              className="py-2 px-3.5 text-xs font-bold text-white bg-amber-700 hover:bg-amber-800 rounded-xl inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer min-h-[40px]"
            >
              <Plus className="w-4 h-4" />
              <span>Tengeneza Kategoria Mpya</span>
            </button>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        {/* Stats Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1 border-t border-stone-100 text-xs">
          <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200/80">
            <span className="text-[11px] text-stone-500 block">Jumla ya Kategoria</span>
            <strong className="text-base text-stone-900 font-bold">{stats.total}</strong>
          </div>
          <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200/80">
            <span className="text-[11px] text-stone-500 block">Makundi Makuu (Roots)</span>
            <strong className="text-base text-amber-800 font-bold">{stats.roots}</strong>
          </div>
          <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200/80">
            <span className="text-[11px] text-stone-500 block">Makundi Madogo (Sub)</span>
            <strong className="text-base text-blue-800 font-bold">{stats.subs}</strong>
          </div>
          <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200/80">
            <span className="text-[11px] text-stone-500 block">Zinazotumika (Active)</span>
            <strong className="text-base text-emerald-800 font-bold">{stats.active}</strong>
          </div>
          <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200/80">
            <span className="text-[11px] text-stone-500 block">Zilizozimwa (Inactive)</span>
            <strong className="text-base text-stone-600 font-bold">{stats.inactive}</strong>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-stone-200/80 rounded-2xl p-3 shadow-xs space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tafuta kwa jina, ID (mfano: cat_dawa_za_mifugo), au slug..."
              className="w-full pl-9 pr-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-600 min-h-[40px]"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-600 min-h-[40px]"
            >
              <option value="ALL">Aina Zote za Kategoria</option>
              <option value="ROOT">ROOT / Makundi Makuu Tu</option>
              <option value="CATEGORY">CATEGORY Tu</option>
              <option value="SUBCATEGORY">SUBCATEGORY / Makundi Madogo Tu</option>
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-600 min-h-[40px]"
            >
              <option value="ALL">Hali Zote (ACTIVE & INACTIVE)</option>
              <option value="ACTIVE">ACTIVE Tu (Zinazofanya Kazi)</option>
              <option value="INACTIVE">INACTIVE Tu (Zilizozimwa)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Category List */}
      <div className="bg-white border border-stone-200/80 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-3.5 bg-stone-50 border-b border-stone-200 flex items-center justify-between text-xs font-semibold text-stone-700">
          <span>Orodha ya Kategoria za Gulio ({filteredCategories.length})</span>
          <span className="text-[11px] text-stone-500">Msimbo wa Category ID ni dhabiti na hautegemei jina</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin text-amber-700 mx-auto" />
            <p className="text-xs text-stone-500">Inapakia kategoria kutoka hifadhidata ya soko...</p>
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <Layers className="w-10 h-10 text-stone-300 mx-auto" />
            <p className="text-sm font-semibold text-stone-700">Hakuna kategoria zilizopatikana</p>
            <p className="text-xs text-stone-500 max-w-md mx-auto">
              Hifadhidata ya soko haina kategoria zinazolingana na utafutaji wako. Unaweza kuingiza kategoria rasmi za mwanzo sasa.
            </p>
            <button
              type="button"
              onClick={() => setShowSeedModal(true)}
              className="py-2 px-4 bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <Database className="w-3.5 h-3.5" />
              <span>Ingiza Kategoria za Awali (Seed Default)</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {filteredCategories.map((cat) => {
              const isSub = cat.categoryType === 'SUBCATEGORY';
              const parentObj = cat.parentCategoryId
                ? categories.find((c) => c.categoryId === cat.parentCategoryId)
                : null;
              const subCount = categories.filter((c) => c.parentCategoryId === cat.categoryId).length;

              return (
                <div
                  key={cat.categoryId}
                  className={`p-3.5 hover:bg-stone-50/80 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                    isSub ? 'pl-7 bg-stone-50/40' : ''
                  }`}
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isSub && <ChevronRight className="w-3.5 h-3.5 text-stone-400 shrink-0" />}
                      <span className="text-sm font-bold text-stone-900">{cat.name}</span>

                      {/* Type Badge */}
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                          !isSub
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : 'bg-blue-50 text-blue-800 border border-blue-200'
                        }`}
                      >
                        {cat.categoryType}
                      </span>

                      {/* Status Badge */}
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                          cat.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-stone-100 text-stone-600 border border-stone-200'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            cat.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-stone-400'
                          }`}
                        />
                        <span>{cat.status}</span>
                      </span>

                      {/* Sort Order */}
                      <span className="text-[10px] text-stone-400 font-mono">
                        Mpangilio #{cat.sortOrder || 1}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-stone-500 flex-wrap">
                      <span className="font-mono text-[11px] bg-stone-100 text-stone-700 px-2 py-0.5 rounded border border-stone-200">
                        ID: {cat.categoryId}
                      </span>

                      <span className="font-mono text-[11px] text-stone-500">
                        slug: /{cat.slug}
                      </span>

                      {parentObj && (
                        <span className="text-[11px] text-stone-600">
                          Mzazi: <strong>{parentObj.name}</strong> ({parentObj.categoryId})
                        </span>
                      )}

                      {!isSub && subCount > 0 && (
                        <span className="text-[11px] text-amber-800 font-medium">
                          {subCount} Makundi Madogo
                        </span>
                      )}
                    </div>

                    {cat.description && (
                      <p className="text-xs text-stone-600 leading-snug">{cat.description}</p>
                    )}

                    {/* Livestock types allowed */}
                    {cat.livestockTypesAllowed && cat.livestockTypesAllowed.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap pt-0.5 text-[11px]">
                        <span className="text-stone-400 text-[10px]">Mifugo:</span>
                        {cat.livestockTypesAllowed.map((t) => (
                          <span
                            key={t}
                            className="px-1.5 py-0.2 rounded bg-amber-50 text-amber-900 border border-amber-200 text-[10px]"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0 self-end md:self-center">
                    {!isSub && (
                      <button
                        type="button"
                        onClick={() => handleOpenCreate(cat.categoryId)}
                        className="p-1.5 text-blue-700 hover:bg-blue-50 rounded-lg border border-blue-200 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
                        title="Ongeza Kundi Dogo Chini ya Kundi Hili"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span className="text-[11px] hidden sm:inline">Kundi Dogo</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleOpenEdit(cat)}
                      className="p-1.5 text-stone-700 hover:bg-stone-100 rounded-lg border border-stone-200 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
                      title="Hariri Kategoria"
                    >
                      <Edit className="w-3.5 h-3.5 text-stone-600" />
                      <span className="text-[11px]">Hariri</span>
                    </button>

                    {/* Status Toggle */}
                    {cat.status === 'ACTIVE' ? (
                      <button
                        type="button"
                        onClick={() => setStatusTarget({ category: cat, newStatus: 'INACTIVE' })}
                        className="p-1.5 text-amber-800 hover:bg-amber-50 rounded-lg border border-amber-200 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
                        title="Zima Kategoria (Deactivate)"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                        <span className="text-[11px]">Zima</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setStatusTarget({ category: cat, newStatus: 'ACTIVE' })}
                        className="p-1.5 text-emerald-800 hover:bg-emerald-50 rounded-lg border border-emerald-200 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
                        title="Washa Kategoria (Activate)"
                      >
                        <Power className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-[11px]">Washa</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: ADD OR EDIT CATEGORY */}
      {/* ========================================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-stone-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 sm:p-5 bg-stone-900 text-white flex items-center justify-between gap-3 shrink-0">
              <div>
                <h3 className="text-base font-bold text-white">
                  {editingCategory ? 'Hariri Kategoria ya Soko' : 'Tengeneza Kategoria Mpya ya Soko'}
                </h3>
                <p className="text-xs text-stone-300 pt-0.5">
                  Taxonomy inayodhibitiwa na msimamizi kwa ajili ya usalama na mpangilio wa soko
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-stone-400 hover:text-white rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 text-xs">
                {/* Category Type Selection */}
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">
                    Aina ya Kategoria (Category Type) *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setFormCategoryType('CATEGORY');
                        setFormParentId('');
                      }}
                      className={`p-2.5 rounded-xl border font-bold text-center transition-all cursor-pointer ${
                        formCategoryType === 'CATEGORY' || formCategoryType === 'ROOT'
                          ? 'bg-amber-900 text-white border-amber-950'
                          : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      Kundi Kuu (CATEGORY)
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormCategoryType('SUBCATEGORY')}
                      className={`p-2.5 rounded-xl border font-bold text-center transition-all cursor-pointer ${
                        formCategoryType === 'SUBCATEGORY'
                          ? 'bg-blue-900 text-white border-blue-950'
                          : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      Kundi Dogo (SUBCATEGORY)
                    </button>
                  </div>
                </div>

                {/* Parent Selection if SUBCATEGORY */}
                {formCategoryType === 'SUBCATEGORY' && (
                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">
                      Kundi Mzazi (Parent Category) *
                    </label>
                    <select
                      value={formParentId}
                      required
                      onChange={(e) => setFormParentId(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 font-medium focus:outline-none focus:ring-2 focus:ring-amber-600 min-h-[44px]"
                    >
                      <option value="">-- Chagua Kundi Kuu Mzazi --</option>
                      {rootCategories.map((rc) => (
                        <option key={rc.categoryId} value={rc.categoryId}>
                          {rc.name} ({rc.categoryId})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Category ID */}
                <div>
                  <label className="block font-semibold text-stone-700 mb-1 flex items-center justify-between">
                    <span>Category ID (Kitambulisho cha Kudumu) *</span>
                    {editingCategory && (
                      <span className="text-[10px] text-stone-500 font-normal">
                        (Haiwezi kubadilishwa baada ya kuundwa)
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    disabled={Boolean(editingCategory)}
                    value={formCategoryId}
                    onChange={(e) => setFormCategoryId(e.target.value)}
                    placeholder="mfano: cat_dawa_za_mifugo au cat_kuku_chotara"
                    className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-amber-600 disabled:opacity-60 min-h-[40px]"
                  />
                  <p className="text-[10px] text-stone-500 pt-0.5">
                    Acha wazi wakati wa kuunda ili mfumo uzalishe ID ya kipekee kiotomatiki.
                  </p>
                </div>

                {/* Name & Slug */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">
                      Jina la Kategoria (Kiswahili) *
                    </label>
                    <input
                      type="text"
                      required
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="mfano: Dawa za Mifugo"
                      className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 font-medium focus:outline-none focus:ring-2 focus:ring-amber-600 min-h-[40px]"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">
                      URL Slug (Hiari)
                    </label>
                    <input
                      type="text"
                      value={formSlug}
                      onChange={(e) => setFormSlug(e.target.value)}
                      placeholder="mfano: dawa-za-mifugo"
                      className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 font-mono focus:outline-none focus:ring-2 focus:ring-amber-600 min-h-[40px]"
                    />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">
                    Maelezo ya Kategoria (Description)
                  </label>
                  <textarea
                    rows={2}
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Eleza kategoria hii inajumuisha bidhaa za aina gani..."
                    className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 text-xs resize-none"
                  />
                </div>

                {/* Livestock Types Allowed */}
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">
                    Mifugo Inayoruhusiwa (Livestock Types Allowed)
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-2.5 bg-stone-50 rounded-xl border border-stone-200">
                    {LIVESTOCK_OPTIONS.map((opt) => {
                      const checked = formLivestockTypes.includes(opt.value);
                      return (
                        <label
                          key={opt.value}
                          className="flex items-center gap-1.5 cursor-pointer text-[11px] text-stone-700 select-none"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleLivestockType(opt.value)}
                            className="rounded border-stone-300 text-amber-700 focus:ring-amber-600"
                          />
                          <span>{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-stone-500 pt-0.5">
                    Hutenganisha kwa uwazi kategoria na aina ya mifugo inayohusika.
                  </p>
                </div>

                {/* Sort Order & Status */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">
                      Nambari ya Mpangilio (Sort Order)
                    </label>
                    <input
                      type="number"
                      value={formSortOrder}
                      onChange={(e) => setFormSortOrder(Number(e.target.value) || 1)}
                      className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 min-h-[40px]"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">
                      Hali ya Kategoria (Status) *
                    </label>
                    <select
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as CategoryStatus)}
                      className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 font-semibold focus:outline-none focus:ring-2 focus:ring-amber-600 min-h-[40px]"
                    >
                      <option value="ACTIVE">ACTIVE (Inafanya kazi)</option>
                      <option value="INACTIVE">INACTIVE (Imezimwa)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Form Footer */}
              <div className="p-4 bg-stone-50 border-t border-stone-200 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="py-2.5 px-4 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Ghairi
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="py-2.5 px-5 bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {isProcessing ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>{editingCategory ? 'Sasisha Kategoria' : 'Unda Kategoria'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: STATUS CHANGE CONFIRMATION */}
      {/* ========================================================================= */}
      {statusTarget && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-stone-200 animate-in fade-in zoom-in-95 duration-150 text-xs">
            <div className="flex items-center gap-2 text-stone-900 font-bold text-sm">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <span>Kubadili Hali ya Kategoria</span>
            </div>

            <p className="text-stone-600 leading-relaxed">
              Unakaribia kubadilisha hali ya kategoria <strong>"{statusTarget.category.name}"</strong> kuwa{' '}
              <span className="font-bold font-mono px-1.5 py-0.5 bg-stone-100 rounded text-stone-800">
                {statusTarget.newStatus}
              </span>
              .
            </p>

            {statusTarget.newStatus === 'INACTIVE' && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 space-y-1">
                <p className="font-bold">Ulinzi wa Bidhaa za Awali (Legacy Preservation):</p>
                <p className="text-[11px] leading-relaxed">
                  Bidhaa zilizopo zilizowahi kupewa kategoria hii <strong>zitaendelea kuonekana sokoni</strong>. Hata hivyo, wauzaji hawataweza kuchagua kategoria hii wakati wa kuweka bidhaa mpya au kurekebisha bidhaa zilizopo.
                </p>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setStatusTarget(null)}
                className="py-2 px-3.5 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Ghairi
              </button>
              <button
                type="button"
                onClick={handleConfirmStatusChange}
                disabled={isProcessing}
                className="py-2 px-4 bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {isProcessing && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Thibitisha Mabadiliko</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: SEED TAXONOMY CONFIRMATION */}
      {/* ========================================================================= */}
      {showSeedModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-stone-200 animate-in fade-in zoom-in-95 duration-150 text-xs">
            <div className="flex items-center gap-2 text-stone-900 font-bold text-sm">
              <Database className="w-5 h-5 text-amber-700" />
              <span>Ingiza Kategoria za Awali za Soko (Taxonomy Seeder)</span>
            </div>

            <p className="text-stone-600 leading-relaxed">
              Utaratibu huu utaingiza orodha kamili ya kategoria rasmi za mfugo na pembejeo nchini Tanzania kwenye Firestore (<code>marketplaceCategories</code> collection).
            </p>

            <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-1.5">
              <p className="font-semibold text-stone-800">Kategoria Zitakazoingizwa ({SEED_GOVERNED_CATEGORIES.length}):</p>
              <div className="max-h-36 overflow-y-auto space-y-0.5 text-[11px] text-stone-600">
                {SEED_GOVERNED_CATEGORIES.map((c) => (
                  <div key={c.categoryId} className="flex items-center justify-between">
                    <span>{c.name}</span>
                    <span className="font-mono text-[10px] text-stone-400">{c.categoryId}</span>
                  </div>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none text-stone-700">
              <input
                type="checkbox"
                checked={seedForceReset}
                onChange={(e) => setSeedForceReset(e.target.checked)}
                className="rounded border-stone-300 text-amber-700 focus:ring-amber-600"
              />
              <span>Sasisha kategoria zilizopo ikiwa zilishawahi kuingizwa awali</span>
            </label>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setShowSeedModal(false)}
                className="py-2 px-3.5 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Ghairi
              </button>
              <button
                type="button"
                onClick={handleSeedTaxonomy}
                disabled={isProcessing}
                className="py-2 px-4 bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {isProcessing && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Ingiza Kategoria Sasa</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
