import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { auth, db } from '../lib/firebase';
import { classifyFirestoreError } from '../utils/firestoreErrorClassifier';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy
} from 'firebase/firestore';
import { LivestockRecord, LivestockEvent, EventType, LivestockGroupSummary } from '../types';
import { LivestockHistoryView } from '../components/LivestockHistoryView';
import { LivestockIntelligenceView } from '../components/LivestockIntelligenceView';
import {
  calculateLivestockBalance,
  sortEventsChronologicallyDesc,
  isPositiveEventType,
  isNegativeEventType
} from '../utils/livestockBalance';
import {
  generateFarmerLivestockSnapshot,
  generateGroupSummary
} from '../utils/livestockIntelligence';
import {
  buildFarmerContext,
  getGroupStatusInsight
} from '../utils/farmerContext';
import {
  getLivestockIntelligenceSnapshot
} from '../services/livestockIntelligenceEngine';
import { MyAssistantMarketplaceContext } from '../types/myAssistantMarketplace';
import { MyAssistantMarketplaceDiscovery } from '../components/MyAssistantMarketplaceDiscovery';
import { MarketplaceProduct } from '../types/marketplace';
import { getLocalCachedProducts, fetchMarketplaceProducts } from '../services/marketplaceService';

import {
  ClipboardList,
  Plus,
  Edit3,
  Trash2,
  Calendar,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  User,
  Wheat,
  Search,
  Filter,
  Save,
  ArrowRight,
  Info,
  History,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Clock
} from 'lucide-react';

const CATEGORY_OPTIONS = [
  { key: 'Poultry', label: 'Kuku na Ndege (Poultry)', icon: '🐔' },
  { key: 'Cattle', label: "Ng'ombe (Cattle)", icon: '🐄' },
  { key: 'Goats', label: 'Mbuzi (Goats)', icon: '🐐' },
  { key: 'Pigs', label: 'Nguruwe (Pigs)', icon: '🐖' },
  { key: 'Rabbits', label: 'Sungura (Rabbits)', icon: '🐇' },
  { key: 'Sheep', label: 'Kondoo (Sheep)', icon: '🐑' },
  { key: 'Fish', label: 'Samaki (Fish)', icon: '🐟' },
  { key: 'Beekeeping', label: 'Nyuki (Beekeeping)', icon: '🐝' },
  { key: 'Other', label: 'Nyingine (Other)', icon: '🌾' },
];

const PRESET_TYPES_BY_CATEGORY: Record<string, string[]> = {
  Poultry: [
    'Kuku wa Kienyeji',
    'Broiler (Kuku wa Nyama)',
    'Layers (Kuku wa Mayai)',
    'Sasso',
    'Kuroiler',
    'Kenbro',
    'Kuchi',
    'Bata',
    'Kanga',
    'Nyingine'
  ],
  Cattle: [
    "Ng'ombe wa Maziwa (Friesian)",
    "Ng'ombe wa Maziwa (Ayrshire)",
    "Ng'ombe wa Maziwa (Jersey)",
    "Ng'ombe wa Nyama (Boran)",
    "Ng'ombe wa Nyama (Sahiwal)",
    "Ng'ombe wa Kienyeji (Zebu)",
    'Nyingine'
  ],
  Goats: [
    'Mbuzi wa Nyama (Boer)',
    'Mbuzi wa Maziwa (Toggenburg)',
    'Mbuzi wa Maziwa (Saanen)',
    'Mbuzi wa Galla',
    'Mbuzi wa Kienyeji (SEA)',
    'Nyingine'
  ],
  Pigs: [
    'Landrace',
    'Large White',
    'Duroc',
    'Pietrain',
    'Chotara',
    'Nyingine'
  ],
  Rabbits: [
    'New Zealand White',
    'California White',
    'Flemish Giant',
    'Chinchilla',
    'Kienyeji',
    'Nyingine'
  ],
  Sheep: [
    'Dorper',
    'Blackhead Persian',
    'Red Maasai',
    'Kienyeji',
    'Nyingine'
  ],
  Fish: [
    'Sato (Tilapia)',
    'Kambale (Catfish)',
    'Nyingine'
  ],
  Beekeeping: [
    'Mizinga ya Kisasa (Top Bar)',
    'Mizinga ya Langstroth',
    'Mizinga ya Kiasili',
    'Nyingine'
  ],
  Other: [
    'Mifugo Mchanganyiko',
    'Nyingine'
  ]
};

export const MyAssistant: React.FC = () => {
  const { currentUser, userProfile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Records state
  const [records, setRecords] = useState<LivestockRecord[]>([]);
  const [recordEventsMap, setRecordEventsMap] = useState<Record<string, LivestockEvent[]>>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // History view state
  const historyRecordId = searchParams.get('history');
  const [selectedRecordForHistory, setSelectedRecordForHistory] = useState<LivestockRecord | null>(null);

  // Filter & Search
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal / Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<LivestockRecord | null>(null);
  const [formData, setFormData] = useState({
    livestockCategory: 'Poultry',
    livestockType: 'Kuku wa Kienyeji',
    isCustomType: false,
    customTypeName: '',
    quantity: '',
    recordName: '',
    dateAdded: new Date().toISOString().split('T')[0],
    notes: ''
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete confirmation modal state
  const [recordToDelete, setRecordToDelete] = useState<LivestockRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Global Notification Banner
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Active Tab state ('records' | 'intelligence' | 'history')
  const [activeTab, setActiveTab] = useState<'records' | 'intelligence' | 'history'>('records');

  // V1.5D Marketplace Discovery state
  const [activeMarketplaceContext, setActiveMarketplaceContext] = useState<MyAssistantMarketplaceContext | null>(null);
  const [marketplaceProducts, setMarketplaceProducts] = useState<MarketplaceProduct[]>(() => getLocalCachedProducts());

  useEffect(() => {
    let isMounted = true;
    fetchMarketplaceProducts()
      .then((prods) => {
        if (isMounted && prods && prods.length > 0) {
          setMarketplaceProducts(prods);
        }
      })
      .catch((e) => console.warn('Could not fetch marketplace products in MyAssistant:', e));
    return () => {
      isMounted = false;
    };
  }, []);

  // Sync tab with URL if present
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'intelligence' || tab === 'history' || tab === 'records') {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const handleSwitchTab = (tab: 'records' | 'intelligence' | 'history') => {
    setActiveTab(tab);
    if (tab === 'records') {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('tab');
        return next;
      });
    } else {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', tab);
        return next;
      });
    }
  };

  // V1.4A Intelligence Engine Snapshot (Pure, Deterministic, Reactive)
  const intelligenceSnapshot = useMemo(() => {
    const uid = currentUser?.uid || auth.currentUser?.uid || 'guest_user';
    return getLivestockIntelligenceSnapshot(uid, records, recordEventsMap);
  }, [currentUser?.uid, records, recordEventsMap]);

  // Aggregate farm-wide events for History tab
  const allFarmEvents = useMemo(() => {
    const list: Array<LivestockEvent & { recordName: string; livestockType: string; livestockCategory: string; recordId: string }> = [];
    for (const rec of records) {
      const evts = recordEventsMap[rec.recordId] || [];
      for (const e of evts) {
        list.push({
          ...e,
          recordName: rec.recordName || rec.livestockType,
          livestockType: rec.livestockType,
          livestockCategory: rec.livestockCategory,
          recordId: rec.recordId
        });
      }
    }
    return list.sort((a, b) => {
      const dateA = a.eventDate || '';
      const dateB = b.eventDate || '';
      if (dateB !== dateA) return dateB.localeCompare(dateA);
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
  }, [records, recordEventsMap]);

  // Sync selected record for history with URL and records list
  useEffect(() => {
    if (historyRecordId) {
      // 1. Check in records state
      let matched = records.find((r) => r.recordId === historyRecordId);

      // 2. If not found yet in state, check cached records
      if (!matched) {
        const uid = currentUser?.uid || auth.currentUser?.uid || 'guest_user';
        try {
          const cached = localStorage.getItem(`livestock_records_${uid}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed)) {
              matched = parsed.find((r: LivestockRecord) => r.recordId === historyRecordId);
            }
          }
        } catch {}
      }

      if (matched) {
        setSelectedRecordForHistory(matched);
      }
    } else if (!historyRecordId && selectedRecordForHistory) {
      setSelectedRecordForHistory(null);
    }
  }, [historyRecordId, records, currentUser?.uid]);

  const handleOpenHistory = (rec: LivestockRecord) => {
    setSelectedRecordForHistory(rec);
    setSearchParams({ history: rec.recordId });
  };

  const handleCloseHistory = () => {
    setSelectedRecordForHistory(null);
    setSearchParams({});
  };

  // Update recordEventsMap when events for a record are updated in history view
  const handleEventsUpdated = (recordId: string, updatedEvents: LivestockEvent[]) => {
    setRecordEventsMap((prev) => ({
      ...prev,
      [recordId]: updatedEvents
    }));
  };

  // Format Swahili Date
  const formatSwahiliDate = (dateStr?: string) => {
    if (!dateStr) return 'Leo';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('sw-TZ', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  // Swahili label for event types
  const getSwahiliEventTypeLabel = (type: EventType | null): string => {
    switch (type) {
      case 'addition':
        return 'Kuongezwa';
      case 'birth':
        return 'Kuzaliwa';
      case 'purchase':
        return 'Kununua';
      case 'sale':
        return 'Kuuza';
      case 'death':
      case 'mortality':
        return 'Vifo';
      case 'vaccination':
        return 'Chanjo';
      case 'treatment':
        return 'Matibabu';
      case 'feed':
        return 'Mlo/Chakula';
      case 'observation':
        return 'Uchunguzi';
      case 'other':
      default:
        return 'Tukio';
    }
  };

  // Load events for a single record from localStorage and Firestore
  const fetchEventsForRecord = async (recordId: string, userId: string): Promise<LivestockEvent[]> => {
    const storageKey = `livestock_events_${userId}_${recordId}`;
    let cachedEvents: LivestockEvent[] = [];
    try {
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          cachedEvents = parsed;
        }
      }
    } catch {}

    try {
      const eventsRef = collection(db, 'users', userId, 'livestockRecords', recordId, 'events');
      let querySnapshot;
      try {
        const q = query(eventsRef, orderBy('eventDate', 'desc'));
        querySnapshot = await getDocs(q);
      } catch {
        querySnapshot = await getDocs(eventsRef);
      }

      const items: LivestockEvent[] = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const rawType = (data.eventType as EventType) || 'other';
        const notesValue = data.notes || data.description || '';
        items.push({
          eventId: docSnap.id,
          eventType: rawType,
          eventDate: data.eventDate || data.createdAt?.split('T')[0] || new Date().toISOString().split('T')[0],
          quantity:
            data.quantity !== undefined && data.quantity !== null && data.quantity !== ''
              ? Number(data.quantity)
              : null,
          title: data.title || '',
          notes: notesValue,
          description: notesValue,
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt || new Date().toISOString()
        });
      });

      const sorted = sortEventsChronologicallyDesc(items);
      try {
        localStorage.setItem(storageKey, JSON.stringify(sorted));
      } catch {}
      return sorted;
    } catch (err) {
      return cachedEvents;
    }
  };

  // Fetch Livestock Records from /users/{uid}/livestockRecords with local cache fallback
  const fetchLivestockRecords = async () => {
    if (!currentUser?.uid) {
      setLoading(false);
      return;
    }
    setFetchError(null);

    const storageKey = `livestock_records_${currentUser.uid}`;
    // Pre-populate with cached records if available
    let hasLocalData = false;
    let initialRecords: LivestockRecord[] = [];
    try {
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          initialRecords = parsed;
          setRecords(parsed);
          hasLocalData = true;
          setLoading(false);

          // Pre-populate events map from cached event keys
          const initialEventsMap: Record<string, LivestockEvent[]> = {};
          for (const rec of parsed) {
            try {
              const recEventsCached = localStorage.getItem(`livestock_events_${currentUser.uid}_${rec.recordId}`);
              if (recEventsCached) {
                const parsedEvents = JSON.parse(recEventsCached);
                if (Array.isArray(parsedEvents)) {
                  initialEventsMap[rec.recordId] = parsedEvents;
                }
              }
            } catch {}
          }
          setRecordEventsMap(initialEventsMap);
        }
      }
    } catch {}

    if (!hasLocalData) {
      setLoading(true);
    }

    try {
      if (auth.currentUser) {
        await auth.currentUser.getIdToken();
      }
      const recordsRef = collection(db, 'users', currentUser.uid, 'livestockRecords');
      let querySnapshot;
      try {
        const q = query(recordsRef, orderBy('createdAt', 'desc'));
        querySnapshot = await getDocs(q);
      } catch {
        querySnapshot = await getDocs(recordsRef);
      }

      const items: LivestockRecord[] = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        items.push({
          recordId: docSnap.id,
          userId: data.userId || currentUser.uid,
          livestockCategory: data.livestockCategory || 'Poultry',
          livestockType: data.livestockType || 'Mifugo',
          quantity: typeof data.quantity === 'number' ? data.quantity : Number(data.quantity) || 1,
          recordName: data.recordName || '',
          dateAdded: data.dateAdded || data.createdAt?.split('T')[0] || new Date().toISOString().split('T')[0],
          notes: data.notes || '',
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt || new Date().toISOString()
        });
      });

      if (items.length > 0) {
        items.sort((a, b) => (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        setRecords(items);
        try {
          localStorage.setItem(storageKey, JSON.stringify(items));
        } catch {}

        // Fetch events for each record to ensure fresh balances
        const eventsMap: Record<string, LivestockEvent[]> = {};
        await Promise.all(
          items.map(async (rec) => {
            const evts = await fetchEventsForRecord(rec.recordId, currentUser.uid);
            eventsMap[rec.recordId] = evts;
          })
        );
        setRecordEventsMap(eventsMap);
      } else {
        setRecords([]);
      }
    } catch (err: any) {
      if (!hasLocalData) {
        const classified = classifyFirestoreError(err);
        console.debug(`[${classified.code}] Taarifa ya kupakua rekodi:`, classified.message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      if (currentUser?.uid) {
        fetchLivestockRecords();
      } else {
        setLoading(false);
      }
    }
  }, [currentUser?.uid, authLoading]);

  // Open Add Record Form
  const handleOpenAddForm = () => {
    setEditingRecord(null);
    setFormError(null);
    setFormData({
      livestockCategory: 'Poultry',
      livestockType: 'Kuku wa Kienyeji',
      isCustomType: false,
      customTypeName: '',
      quantity: '',
      recordName: '',
      dateAdded: new Date().toISOString().split('T')[0],
      notes: ''
    });
    setIsFormOpen(true);
  };

  // Open Edit Record Form
  const handleOpenEditForm = (rec: LivestockRecord) => {
    setEditingRecord(rec);
    setFormError(null);

    const presetTypes = PRESET_TYPES_BY_CATEGORY[rec.livestockCategory] || [];
    const isPreset = presetTypes.includes(rec.livestockType) && rec.livestockType !== 'Nyingine';

    setFormData({
      livestockCategory: rec.livestockCategory,
      livestockType: isPreset ? rec.livestockType : 'Nyingine',
      isCustomType: !isPreset,
      customTypeName: !isPreset ? rec.livestockType : '',
      quantity: rec.quantity.toString(),
      recordName: rec.recordName || '',
      dateAdded: rec.dateAdded || new Date().toISOString().split('T')[0],
      notes: rec.notes || ''
    });
    setIsFormOpen(true);
  };

  // Handle Form Submit (Add or Edit)
  const handleSaveRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!currentUser) {
      setFormError('Hujaingia kwenye mfumo.');
      return;
    }

    // Validate Quantity: must be positive integer > 0
    const parsedQty = parseInt(formData.quantity, 10);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      setFormError('Tafadhali weka idadi sahihi ya mifugo (namba chanya kuanzia 1).');
      return;
    }

    // Validate Livestock Type
    let finalType = formData.livestockType;
    if (formData.livestockType === 'Nyingine' || formData.isCustomType) {
      if (!formData.customTypeName.trim()) {
        setFormError('Tafadhali andika aina ya mifugo.');
        return;
      }
      finalType = formData.customTypeName.trim();
    }

    setIsSubmitting(true);
    const now = new Date().toISOString();
    const recordId = editingRecord ? editingRecord.recordId : doc(collection(db, 'users', currentUser.uid, 'livestockRecords')).id;
    const recordRef = doc(db, 'users', currentUser.uid, 'livestockRecords', recordId);

    const recordPayload: LivestockRecord = {
      recordId,
      userId: currentUser.uid,
      livestockCategory: formData.livestockCategory,
      livestockType: finalType,
      quantity: parsedQty,
      recordName: formData.recordName.trim(),
      dateAdded: formData.dateAdded || now.split('T')[0],
      notes: formData.notes.trim(),
      createdAt: editingRecord ? editingRecord.createdAt : now,
      updatedAt: now
    };

    // 1. Immediately update local state and localStorage
    let updatedList: LivestockRecord[];
    if (editingRecord) {
      updatedList = records.map((item) => (item.recordId === recordId ? recordPayload : item));
      setSuccessBanner(`Rekodi ya "${finalType}" imesasishwa kikamilifu!`);
    } else {
      updatedList = [recordPayload, ...records];
      setSuccessBanner(`Rekodi mpya ya "${finalType}" (${parsedQty}) imehifadhiwa kikamilifu!`);
    }
    setRecords(updatedList);
    try {
      localStorage.setItem(`livestock_records_${currentUser.uid}`, JSON.stringify(updatedList));
    } catch {}

    setIsFormOpen(false);
    setEditingRecord(null);

    // 2. Persist to Firestore
    try {
      if (auth.currentUser) {
        await auth.currentUser.getIdToken();
      }
      await setDoc(recordRef, recordPayload, { merge: true });
    } catch (err: any) {
      console.warn('Taarifa ya kuhifadhi Firestore:', err?.message || err);
    } finally {
      setIsSubmitting(false);
      setTimeout(() => {
        setSuccessBanner(null);
      }, 5000);
    }
  };

  // Handle Delete Record
  const handleConfirmDelete = async () => {
    if (!currentUser || !recordToDelete) return;
    setIsDeleting(true);

    // 1. Immediately update local state and localStorage
    const toDeleteId = recordToDelete.recordId;
    const updatedList = records.filter((r) => r.recordId !== toDeleteId);
    setRecords(updatedList);
    setRecordEventsMap((prev) => {
      const next = { ...prev };
      delete next[toDeleteId];
      return next;
    });

    try {
      localStorage.setItem(`livestock_records_${currentUser.uid}`, JSON.stringify(updatedList));
      localStorage.removeItem(`livestock_events_${currentUser.uid}_${toDeleteId}`);
    } catch {}

    setSuccessBanner(`Rekodi ya "${recordToDelete.livestockType}" imefutwa.`);
    setRecordToDelete(null);

    // 2. Delete from Firestore
    try {
      if (auth.currentUser) {
        await auth.currentUser.getIdToken();
      }
      const recordRef = doc(db, 'users', currentUser.uid, 'livestockRecords', toDeleteId);
      await deleteDoc(recordRef);
    } catch (err: any) {
      console.warn('Taarifa ya kufuta Firestore:', err?.message || err);
    } finally {
      setIsDeleting(false);
      setTimeout(() => {
        setSuccessBanner(null);
      }, 5000);
    }
  };

  // Farmer Context & Snapshot Intelligence
  const farmerContext = useMemo(() => {
    return buildFarmerContext(
      currentUser?.uid || '',
      userProfile,
      records,
      recordEventsMap
    );
  }, [currentUser?.uid, userProfile, records, recordEventsMap]);

  // Backward-compatible alias for existing snapshot references
  const farmerSnapshot = useMemo(() => {
    return generateFarmerLivestockSnapshot(
      currentUser?.uid || '',
      records,
      recordEventsMap
    );
  }, [currentUser?.uid, records, recordEventsMap]);

  // Group summary lookup map
  const groupSummaryMap = useMemo(() => {
    const map: Record<string, LivestockGroupSummary> = {};
    for (const group of farmerSnapshot.groupSummaries) {
      map[group.recordId] = group;
    }
    return map;
  }, [farmerSnapshot]);

  // Group context lookup map with status insights
  const groupContextMap = useMemo(() => {
    const map: Record<string, typeof farmerContext.livestock.groups[0]> = {};
    for (const group of farmerContext.livestock.groups) {
      map[group.recordId] = group;
    }
    return map;
  }, [farmerContext]);

  // Filtered records
  const filteredRecords = records.filter((rec) => {
    const matchesCategory =
      selectedCategoryFilter === 'ALL' || rec.livestockCategory === selectedCategoryFilter;
    const matchesSearch =
      searchQuery.trim() === '' ||
      rec.livestockType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (rec.recordName && rec.recordName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (rec.notes && rec.notes.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const getCategoryIcon = (cat: string) => {
    const found = CATEGORY_OPTIONS.find((c) => c.key === cat);
    return found ? found.icon : '🌾';
  };

  const displayName = userProfile?.displayName || currentUser?.displayName || 'Mfugaji';
  const mainLivestockList = userProfile?.mainLivestock && userProfile.mainLivestock.length > 0
    ? userProfile.mainLivestock.join(', ')
    : 'Hujaweka bado (Bofya Wasifu kuweka)';

  // If viewing history for a specific record, render the LivestockHistoryView
  if (selectedRecordForHistory) {
    return (
      <div className="flex-1 p-4 space-y-4 max-w-lg mx-auto w-full pb-24">
        <LivestockHistoryView
          record={selectedRecordForHistory}
          onBack={handleCloseHistory}
          onEventsUpdated={handleEventsUpdated}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 space-y-4 max-w-lg mx-auto w-full pb-24">
      {/* Header & Farmer Profile Integration Banner */}
      <div className="bg-gradient-to-br from-emerald-800 to-emerald-950 text-white rounded-2xl p-5 shadow-sm space-y-3 relative overflow-hidden">
        <div className="relative z-10 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-700/80 text-emerald-100 border border-emerald-500/30 flex items-center gap-1.5">
              <ClipboardList className="w-3.5 h-3.5 text-emerald-300" />
              Msaidizi Wangu
            </span>
            <Link
              to="/profile"
              className="text-[11px] text-emerald-200 hover:text-white flex items-center gap-1 underline underline-offset-2 cursor-pointer"
            >
              <User className="w-3.5 h-3.5" /> Wasifu
            </Link>
          </div>

          <div>
            <h2 className="text-xl font-bold tracking-tight text-white">
              Habari, {displayName}! 👋
            </h2>
            <p className="text-xs text-emerald-100/90 leading-relaxed pt-0.5">
              Rekodi na fuatilia mifugo yako kwa urahisi na usalama.
            </p>
          </div>

          {/* Farmer's Main Livestock from Profile */}
          <div className="pt-1 flex items-center gap-2 text-xs text-emerald-200/95 bg-emerald-900/50 px-3 py-1.5 rounded-xl border border-emerald-700/40">
            <Wheat className="w-4 h-4 text-emerald-300 shrink-0" />
            <span className="truncate">
              <strong>Mifugo kuu:</strong> <span className="capitalize">{mainLivestockList}</span>
            </span>
          </div>
        </div>

        {/* Decorative ambient blur */}
        <div className="absolute -right-8 -bottom-8 w-36 h-36 bg-emerald-600/30 rounded-full blur-2xl pointer-events-none" />
      </div>

      {/* Muhtasari wa Mifugo (Farmer Livestock Snapshot) */}
      <div className="bg-white border border-stone-200/90 rounded-2xl p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider flex items-center gap-1.5">
            <span className="text-base">📊</span>
            Muhtasari wa Mifugo
          </h3>
          {farmerSnapshot.overallBalanceStatus === 'invalid' && (
            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              ⚠️ Angalizo la Hesabu
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {/* 1. Makundi ya Mifugo */}
          <div className="bg-stone-50 border border-stone-200/80 rounded-xl p-2.5">
            <p className="text-[11px] text-stone-500 font-medium">Makundi ya Mifugo</p>
            <p className="text-lg font-extrabold text-stone-900 leading-tight pt-0.5">
              {loading ? '...' : farmerSnapshot.totalGroups}
            </p>
          </div>

          {/* 2. Mifugo kwa Sasa */}
          <div className="bg-emerald-50/60 border border-emerald-200/70 rounded-xl p-2.5">
            <p className="text-[11px] text-emerald-800 font-medium">Mifugo kwa Sasa</p>
            <p className="text-lg font-black text-emerald-950 leading-tight pt-0.5">
              {loading ? '...' : Number(farmerSnapshot.totalCurrentQuantity ?? 0).toLocaleString()}
            </p>
          </div>

          {/* 3. Ongezeko */}
          <div className="bg-emerald-50/30 border border-emerald-100 rounded-xl p-2.5">
            <p className="text-[11px] text-emerald-700 font-medium">Ongezeko</p>
            <p className="text-lg font-extrabold text-emerald-800 leading-tight pt-0.5">
              {loading ? '...' : `+${Number(farmerSnapshot.totalAdditions ?? 0).toLocaleString()}`}
            </p>
          </div>

          {/* 4. Upungufu */}
          <div className="bg-red-50/30 border border-red-100 rounded-xl p-2.5">
            <p className="text-[11px] text-red-700 font-medium">Upungufu</p>
            <p className="text-lg font-extrabold text-red-800 leading-tight pt-0.5">
              {loading ? '...' : `-${Number(farmerSnapshot.totalReductions ?? 0).toLocaleString()}`}
            </p>
          </div>
        </div>

        {/* Secondary snapshot row: Net change & Latest activity */}
        {!loading && farmerSnapshot.totalGroups > 0 && (
          <div className="flex items-center justify-between gap-2 pt-1 text-[11px] text-stone-500 border-t border-stone-100 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-stone-600">Mabadiliko Halisi:</span>
              <span className={`font-bold ${
                (farmerSnapshot.netChange ?? 0) > 0
                  ? 'text-emerald-700'
                  : (farmerSnapshot.netChange ?? 0) < 0
                  ? 'text-red-700'
                  : 'text-stone-700'
              }`}>
                {(farmerSnapshot.netChange ?? 0) > 0
                  ? `+${Number(farmerSnapshot.netChange ?? 0).toLocaleString()}`
                  : Number(farmerSnapshot.netChange ?? 0).toLocaleString()}
              </span>
            </div>

            {farmerSnapshot.lastEventDate && (
              <div className="flex items-center gap-1 text-stone-600">
                <Calendar className="w-3 h-3 text-stone-400" />
                <span>Tukio la mwisho:</span>
                <strong className="text-stone-800">
                  {getSwahiliEventTypeLabel(farmerSnapshot.lastEventType)} ({formatSwahiliDate(farmerSnapshot.lastEventDate)})
                </strong>
              </div>
            )}

            <button
              type="button"
              id="muhtasari-intelligence-link"
              onClick={() => handleSwitchTab('intelligence')}
              className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer hover:underline"
            >
              <span>Uchambuzi (Intelligence) &rarr;</span>
            </button>
          </div>
        )}
      </div>

      {/* Success Notification Banner */}
      {successBanner && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-start gap-2.5 text-emerald-900 text-xs shadow-xs animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
          <div className="space-y-0.5 flex-1">
            <p className="font-bold">{successBanner}</p>
            <p className="text-[11px] text-emerald-800">Imehifadhiwa kwenye akaunti yako katika Firestore.</p>
          </div>
          <button
            onClick={() => setSuccessBanner(null)}
            className="text-emerald-700 hover:text-emerald-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Error Notification Banner */}
      {errorBanner && (
        <div className="p-3.5 bg-red-50 border border-red-300 rounded-2xl flex items-start gap-2.5 text-red-900 text-xs shadow-xs animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
          <span className="flex-1">{errorBanner}</span>
          <button
            onClick={() => setErrorBanner(null)}
            className="text-red-700 hover:text-red-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 3-Way Tab Switcher: Mifugo | Intelligence | Historia */}
      <div className="flex items-center gap-1 bg-stone-100/90 p-1 rounded-2xl border border-stone-200 text-xs font-semibold shadow-2xs">
        <button
          id="tab-records-btn"
          type="button"
          onClick={() => handleSwitchTab('records')}
          className={`flex-1 py-2.5 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px] ${
            activeTab === 'records'
              ? 'bg-white text-stone-900 shadow-xs font-bold border border-stone-200/80'
              : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          <ClipboardList className="w-3.5 h-3.5 text-emerald-700" />
          <span>Mifugo</span>
          {records.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-stone-100 text-stone-700 font-bold">
              {records.length}
            </span>
          )}
        </button>

        <button
          id="tab-intelligence-btn"
          type="button"
          onClick={() => handleSwitchTab('intelligence')}
          className={`flex-1 py-2.5 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px] ${
            activeTab === 'intelligence'
              ? 'bg-white text-emerald-950 shadow-xs font-bold border border-emerald-200/80'
              : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5 text-emerald-700" />
          <span>Intelligence</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 font-bold">
            V1.4B
          </span>
        </button>

        <button
          id="tab-history-btn"
          type="button"
          onClick={() => handleSwitchTab('history')}
          className={`flex-1 py-2.5 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px] ${
            activeTab === 'history'
              ? 'bg-white text-stone-900 shadow-xs font-bold border border-stone-200/80'
              : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-stone-600" />
          <span>Historia</span>
          {farmerSnapshot.eventStats.totalEvents > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-stone-100 text-stone-700 font-bold">
              {farmerSnapshot.eventStats.totalEvents}
            </span>
          )}
        </button>
      </div>

      {/* INTELLIGENCE TAB VIEW (V1.4A FOUNDATION & V1.4B TRENDS) */}
      {activeTab === 'intelligence' && (
        <LivestockIntelligenceView
          snapshot={intelligenceSnapshot}
          records={records}
          recordEventsMap={recordEventsMap}
          uid={currentUser?.uid || auth.currentUser?.uid || 'guest_user'}
          onOpenAddRecord={handleOpenAddForm}
          onSwitchTab={handleSwitchTab}
          onOpenMarketplaceDiscovery={(ctx) => setActiveMarketplaceContext(ctx)}
        />
      )}

      {/* FARM-WIDE EVENT HISTORY TAB VIEW */}
      {activeTab === 'history' && (
        <div className="space-y-3 animate-in fade-in duration-200">
          <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs space-y-1.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-emerald-700" />
                Historia ya Shamba Zima (Farm-Wide Events)
              </h3>
              <span className="text-[10px] font-semibold text-stone-500 bg-stone-100 px-2 py-0.5 rounded-md">
                {allFarmEvents.length} matukio
              </span>
            </div>
            <p className="text-xs text-stone-500 leading-relaxed">
              Matukio yote yaliyorekodiwa kwa makundi yako ya mifugo kwa mpangilio wa tarehe.
            </p>
          </div>

          {allFarmEvents.length === 0 ? (
            <div className="bg-white border border-stone-200/90 rounded-2xl p-8 text-center space-y-2">
              <p className="text-sm font-bold text-stone-900">Bado hakuna matukio yaliyorekodiwa.</p>
              <p className="text-xs text-stone-500 max-w-xs mx-auto">
                Fungua kundi la mifugo kwenye kichupo cha "Mifugo" na ubonyeze "Matukio" kurekodi shughuli au mabadiliko ya mifugo.
              </p>
              <button
                type="button"
                onClick={() => handleSwitchTab('records')}
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 underline cursor-pointer"
              >
                Rudi kwenye orodha ya mifugo &rarr;
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {allFarmEvents.map((evt) => {
                const rec = records.find((r) => r.recordId === evt.recordId);
                return (
                  <div
                    key={evt.eventId}
                    className="bg-white border border-stone-200 rounded-xl p-3.5 shadow-2xs flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-stone-900">{evt.recordName}</span>
                        <span className="text-[10px] bg-stone-100 text-stone-600 px-2 py-0.5 rounded-md">
                          {evt.livestockType}
                        </span>
                        <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          {getSwahiliEventTypeLabel(evt.eventType)}
                        </span>
                        <span className="text-[10px] text-stone-400">
                          {formatSwahiliDate(evt.eventDate)}
                        </span>
                      </div>
                      {evt.title && <p className="text-xs font-medium text-stone-800">{evt.title}</p>}
                      {evt.notes && <p className="text-[11px] text-stone-500 leading-relaxed">{evt.notes}</p>}
                    </div>

                    <div className="flex flex-col items-end shrink-0 gap-1.5">
                      {evt.quantity !== null && evt.quantity !== undefined && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                          evt.quantity > 0 && isPositiveEventType(evt.eventType)
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : isNegativeEventType(evt.eventType)
                            ? 'bg-red-50 text-red-800 border border-red-200'
                            : 'bg-stone-50 text-stone-700 border border-stone-200'
                        }`}>
                          {isPositiveEventType(evt.eventType) ? `+${evt.quantity}` : isNegativeEventType(evt.eventType) ? `-${evt.quantity}` : evt.quantity}
                        </span>
                      )}
                      {rec && (
                        <button
                          type="button"
                          onClick={() => handleOpenHistory(rec)}
                          className="text-[10px] text-emerald-700 hover:text-emerald-800 font-semibold underline cursor-pointer"
                        >
                          Fungua kundi &rarr;
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* RECORDS TAB VIEW (ACTIVE TAB = 'records') */}
      {activeTab === 'records' && (
        <div className="space-y-4">
          {/* Action Bar: Add Record & Filter */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-emerald-700" />
                Rekodi za Mifugo Yako
              </h3>

              <button
                id="my-assistant-add-record-btn"
                type="button"
                onClick={handleOpenAddForm}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer min-h-[44px]"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>+ Ongeza Rekodi</span>
              </button>
            </div>

        {/* Search & Category Filter */}
        {records.length > 0 && (
          <div className="space-y-2 pt-1">
            <div className="relative">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tafuta kundi, aina au maelezo..."
                className="w-full pl-9 pr-3.5 py-2 bg-white border border-stone-200 rounded-xl text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 min-h-[40px]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
              <button
                type="button"
                onClick={() => setSelectedCategoryFilter('ALL')}
                className={`px-3 py-1.5 rounded-xl font-medium transition-colors shrink-0 cursor-pointer ${
                  selectedCategoryFilter === 'ALL'
                    ? 'bg-emerald-700 text-white shadow-2xs font-semibold'
                    : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-50'
                }`}
              >
                Yote ({records.length})
              </button>
              {CATEGORY_OPTIONS.map((cat) => {
                const count = records.filter((r) => r.livestockCategory === cat.key).length;
                if (count === 0) return null;
                const isSelected = selectedCategoryFilter === cat.key;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setSelectedCategoryFilter(cat.key)}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl font-medium transition-colors shrink-0 cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-700 text-white shadow-2xs font-semibold'
                        : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-50'
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.label.split(' ')[0]}</span>
                    <span className="opacity-80 text-[11px]">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Main Records List / Empty / Loading */}
      {loading ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-700 mx-auto" />
          <p className="text-xs text-stone-500 font-medium">Inapakia rekodi za mifugo yako...</p>
        </div>
      ) : records.length === 0 ? (
        /* Empty State */
        <div className="bg-white border border-stone-200/90 rounded-3xl p-8 text-center space-y-4 shadow-xs">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-700 rounded-full flex items-center justify-center mx-auto text-3xl border border-emerald-200/60 shadow-2xs">
            📋
          </div>
          <div className="space-y-1 max-w-xs mx-auto">
            <h4 className="text-base font-bold text-stone-900">
              Hujawaweka mifugo yako bado.
            </h4>
            <p className="text-xs text-stone-500 leading-relaxed">
              Anza kwa kuweka kundi au aina ya mifugo unayofuga ili Msaidizi Wangu akusaidie kufuatilia idadi na matukio.
            </p>
          </div>
          <div className="pt-2">
            <button
              id="my-assistant-empty-add-btn"
              type="button"
              onClick={handleOpenAddForm}
              className="inline-flex items-center gap-2 px-5 py-3 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-semibold text-xs rounded-xl shadow-sm transition-colors cursor-pointer min-h-[44px]"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>+ Ongeza Mifugo</span>
            </button>
          </div>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-6 text-center space-y-2">
          <p className="text-xs text-stone-500">
            Hakuna rekodi inayolingana na kichujio au utafutaji wako.
          </p>
          <button
            type="button"
            onClick={() => {
              setSelectedCategoryFilter('ALL');
              setSearchQuery('');
            }}
            className="text-xs text-emerald-700 font-semibold underline"
          >
            Ondoa vichujio
          </button>
        </div>
      ) : (
        /* Render Livestock Cards with Calculated Balances & Group Insights */
        <div className="space-y-3">
          {filteredRecords.map((record) => {
            const events = recordEventsMap[record.recordId] || [];
            const groupSummary = groupSummaryMap[record.recordId] || generateGroupSummary(record, events);
            const groupCtx = groupContextMap[record.recordId];
            const statusInsight = groupCtx?.statusInsight || getGroupStatusInsight(groupSummary);

            return (
              <div
                key={record.recordId}
                id={`livestock-card-${record.recordId}`}
                className="bg-white border border-stone-200/90 rounded-2xl p-4 shadow-xs hover:border-emerald-300 transition-all space-y-3 group"
              >
                {/* Card Top: Category Icon & Title & Prominent Current Quantity */}
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-xl shrink-0">
                      {getCategoryIcon(record.livestockCategory)}
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="text-sm font-bold text-stone-900 leading-tight">
                          {record.recordName || record.livestockType}
                        </h4>
                        {record.recordName && (
                          <span className="text-[10px] bg-stone-100 text-stone-600 px-2 py-0.5 rounded-md font-medium">
                            {record.livestockType}
                          </span>
                        )}
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-md font-semibold border ${
                            statusInsight === 'Imeongezeka'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : statusInsight === 'Imepungua'
                              ? 'bg-red-50 text-red-800 border-red-200'
                              : 'bg-stone-50 text-stone-600 border-stone-200'
                          }`}
                        >
                          {statusInsight}
                        </span>
                        {groupSummary.balanceStatus === 'invalid' && (
                          <span className="text-[10px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md font-bold border border-amber-300">
                            ⚠️ Angalizo la Hesabu
                          </span>
                        )}
                      </div>


                      <p className="text-xs text-stone-500 flex items-center gap-1.5">
                        <span className="font-medium text-emerald-800 capitalize">
                          {record.livestockCategory}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-stone-400">
                          <Calendar className="w-3 h-3" />
                          {formatSwahiliDate(record.dateAdded)}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Prominent Current Quantity Badge */}
                  <div className="text-right shrink-0">
                    <div className="inline-flex flex-col items-end bg-emerald-900 text-white px-3 py-1.5 rounded-xl shadow-xs border border-emerald-950">
                      <span className="text-base font-black text-emerald-200 leading-tight">
                        {Number(groupSummary.currentQuantity ?? 0).toLocaleString()}
                      </span>
                      <span className="text-[9px] text-emerald-300 font-bold uppercase tracking-wider">
                        Idadi ya Sasa
                      </span>
                    </div>
                  </div>
                </div>

                {/* Group Insight Information Area: Idadi ya Sasa | Mabadiliko | Matukio | Tukio la Mwisho */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-2 bg-stone-50 border border-stone-200/70 rounded-xl text-center text-xs">
                  {/* 1. Idadi ya Sasa */}
                  <div className="px-1.5 py-1 bg-white rounded-lg border border-stone-200/60 shadow-2xs">
                    <span className="text-[10px] text-stone-500 block leading-tight font-medium">
                      Idadi ya Sasa
                    </span>
                    <span className="text-xs font-black text-emerald-900 leading-tight">
                      {Number(groupSummary.currentQuantity ?? 0).toLocaleString()}
                    </span>
                  </div>

                  {/* 2. Mabadiliko */}
                  <div className="px-1.5 py-1 bg-white rounded-lg border border-stone-200/60 shadow-2xs">
                    <span className="text-[10px] text-stone-500 block leading-tight font-medium">
                      Mabadiliko
                    </span>
                    <span className={`text-xs font-bold leading-tight ${
                      (groupSummary.netChange ?? 0) > 0
                        ? 'text-emerald-700'
                        : (groupSummary.netChange ?? 0) < 0
                        ? 'text-red-700'
                        : 'text-stone-600'
                    }`}>
                      {(groupSummary.netChange ?? 0) > 0
                        ? `+${Number(groupSummary.netChange ?? 0).toLocaleString()}`
                        : Number(groupSummary.netChange ?? 0).toLocaleString()}
                    </span>
                  </div>

                  {/* 3. Matukio */}
                  <div className="px-1.5 py-1 bg-white rounded-lg border border-stone-200/60 shadow-2xs">
                    <span className="text-[10px] text-stone-500 block leading-tight font-medium">
                      Matukio
                    </span>
                    <span className="text-xs font-bold text-stone-800 leading-tight">
                      {groupSummary.eventCount}
                    </span>
                  </div>

                  {/* 4. Tukio la Mwisho */}
                  <div className="px-1.5 py-1 bg-white rounded-lg border border-stone-200/60 shadow-2xs flex flex-col justify-center">
                    <span className="text-[10px] text-stone-500 block leading-tight font-medium">
                      Tukio la Mwisho
                    </span>
                    <span
                      className="text-[11px] font-semibold text-stone-800 leading-tight truncate"
                      title={
                        groupSummary.lastEventType
                          ? `${getSwahiliEventTypeLabel(groupSummary.lastEventType)} (${formatSwahiliDate(groupSummary.lastEventDate || undefined)})`
                          : 'Bado hakuna'
                      }
                    >
                      {groupSummary.lastEventType
                        ? `${getSwahiliEventTypeLabel(groupSummary.lastEventType)} (${formatSwahiliDate(groupSummary.lastEventDate || undefined)})`
                        : 'Bado hakuna'}
                    </span>
                  </div>
                </div>

                {/* Balance Breakdown Row: Idadi ya Kuanzia | Ongezeko | Upungufu */}
                <div className="grid grid-cols-3 gap-1.5 p-2 bg-stone-50/70 border border-stone-100 rounded-xl text-center">
                  {/* 1. Base Quantity */}
                  <div className="px-1 py-0.5">
                    <span className="text-[10px] text-stone-500 block leading-tight font-medium">
                      Idadi ya Kuanzia
                    </span>
                    <span className="text-xs font-bold text-stone-800 leading-tight">
                      {Number(groupSummary.startingQuantity ?? 0).toLocaleString()}
                    </span>
                  </div>

                  {/* 2. Ongezeko */}
                  <div className="px-1 py-0.5 border-x border-stone-200">
                    <span className="text-[10px] text-emerald-700 block leading-tight font-medium">
                      Ongezeko
                    </span>
                    <span className="text-xs font-bold text-emerald-800 leading-tight">
                      +{Number(groupSummary.totalAdditions ?? 0).toLocaleString()}
                    </span>
                  </div>

                  {/* 3. Upungufu */}
                  <div className="px-1 py-0.5">
                    <span className="text-[10px] text-red-700 block leading-tight font-medium">
                      Upungufu
                    </span>
                    <span className="text-xs font-bold text-red-800 leading-tight">
                      -{Number(groupSummary.totalReductions ?? 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Notes block if present */}
                {record.notes && (
                  <div className="p-2.5 bg-stone-50 border border-stone-100 rounded-xl text-xs text-stone-600 leading-relaxed">
                    <span className="font-semibold text-stone-700">Maelezo: </span>
                    {record.notes}
                  </div>
                )}

                {/* Action Buttons Footer */}
                <div className="flex items-center justify-between pt-1 border-t border-stone-100 text-xs">
                  <span className="text-[10px] text-stone-400">
                    Imesasishwa: {formatSwahiliDate(record.updatedAt)}
                  </span>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      id={`btn-history-record-${record.recordId}`}
                      type="button"
                      onClick={() => handleOpenHistory(record)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl font-semibold transition-colors cursor-pointer min-h-[36px]"
                    >
                      <History className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Historia</span>
                      {events.length > 0 && (
                        <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-emerald-200 text-emerald-900 text-[10px] font-bold">
                          {events.length}
                        </span>
                      )}
                    </button>

                    <button
                      id={`btn-edit-record-${record.recordId}`}
                      type="button"
                      onClick={() => handleOpenEditForm(record)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-stone-50 hover:bg-emerald-50 text-stone-700 hover:text-emerald-800 border border-stone-200 hover:border-emerald-300 rounded-xl font-medium transition-colors cursor-pointer min-h-[36px]"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Hariri</span>
                    </button>

                    <button
                      id={`btn-delete-record-${record.recordId}`}
                      type="button"
                      onClick={() => setRecordToDelete(record)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-stone-50 hover:bg-red-50 text-stone-500 hover:text-red-700 border border-stone-200 hover:border-red-300 rounded-xl font-medium transition-colors cursor-pointer min-h-[36px]"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-600" />
                      <span>Futa</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
        </div>
      )}

      {/* ADD / EDIT RECORD MODAL FORM */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white border border-stone-200 rounded-3xl w-full max-w-md p-5 shadow-2xl space-y-4 my-8 animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <ClipboardList className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-900">
                    {editingRecord ? 'Hariri Rekodi ya Mifugo' : 'Ongeza Rekodi ya Mifugo'}
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    {editingRecord ? 'Sasisha taarifa za kundi hili' : 'Weka taarifa sahihi za mifugo'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsFormOpen(false);
                  setEditingRecord(null);
                }}
                className="w-8 h-8 rounded-xl bg-stone-100 text-stone-500 hover:text-stone-800 hover:bg-stone-200 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Error Alert */}
            {formError && (
              <div className="p-3 bg-red-50 border border-red-300 rounded-xl flex items-start gap-2 text-red-900 text-xs">
                <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveRecord} className="space-y-3.5">
              {/* 1. Kundi la mifugo (Category) */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1" htmlFor="input-livestock-category">
                  Kundi la Mifugo <span className="text-red-500">*</span>
                </label>
                <select
                  id="input-livestock-category"
                  value={formData.livestockCategory}
                  onChange={(e) => {
                    const newCat = e.target.value;
                    const presets = PRESET_TYPES_BY_CATEGORY[newCat] || [];
                    setFormData({
                      ...formData,
                      livestockCategory: newCat,
                      livestockType: presets[0] || 'Nyingine',
                      isCustomType: false,
                      customTypeName: ''
                    });
                  }}
                  className="w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 min-h-[44px]"
                >
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.icon} {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Aina ya mifugo (Type / Breeds) */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1" htmlFor="input-livestock-type">
                  Aina ya Mifugo <span className="text-red-500">*</span>
                </label>
                <select
                  id="input-livestock-type"
                  value={formData.isCustomType ? 'Nyingine' : formData.livestockType}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'Nyingine') {
                      setFormData({ ...formData, livestockType: 'Nyingine', isCustomType: true });
                    } else {
                      setFormData({ ...formData, livestockType: val, isCustomType: false });
                    }
                  }}
                  className="w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 min-h-[44px]"
                >
                  {(PRESET_TYPES_BY_CATEGORY[formData.livestockCategory] || ['Nyingine']).map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>

                {/* Custom type input if "Nyingine" selected */}
                {(formData.isCustomType || formData.livestockType === 'Nyingine') && (
                  <div className="pt-2">
                    <input
                      id="input-custom-livestock-type"
                      type="text"
                      required
                      value={formData.customTypeName}
                      onChange={(e) => setFormData({ ...formData, customTypeName: e.target.value })}
                      placeholder="Andika aina maalum (mf. Kuchi, Kuchi wa Pemba, Kuroiler)..."
                      className="w-full px-3.5 py-2.5 bg-emerald-50/50 border border-emerald-300 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 min-h-[44px]"
                    />
                  </div>
                )}
              </div>

              {/* 3. Idadi ya Kuanzia (Base Quantity) */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1" htmlFor="input-record-quantity">
                  Idadi ya Kuanzia <span className="text-red-500">*</span>
                </label>
                <input
                  id="input-record-quantity"
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  placeholder="Mfano: 50"
                  className="w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 min-h-[44px]"
                />
                <p className="text-[10px] text-stone-500 mt-1">
                  Weka idadi ya kuanzia ya kundi hili la mifugo (namba chanya kuanzia 1).
                </p>
              </div>

              {/* 4. Jina la kundi / utambulisho */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1" htmlFor="input-record-name">
                  Jina la Kundi / Utambulisho <span className="text-stone-400 font-normal">(Hiari)</span>
                </label>
                <input
                  id="input-record-name"
                  type="text"
                  value={formData.recordName}
                  onChange={(e) => setFormData({ ...formData, recordName: e.target.value })}
                  placeholder="Mfano: Kundi A - Vifaranga, Banda Namba 2, n.k."
                  className="w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 min-h-[44px]"
                />
              </div>

              {/* 5. Tarehe */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1" htmlFor="input-record-date">
                  Tarehe ya Kuingizwa / Kuanza <span className="text-red-500">*</span>
                </label>
                <input
                  id="input-record-date"
                  type="date"
                  required
                  value={formData.dateAdded}
                  onChange={(e) => setFormData({ ...formData, dateAdded: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 min-h-[44px]"
                />
              </div>

              {/* 6. Maelezo (Notes) */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1" htmlFor="input-record-notes">
                  Maelezo ya Ziada <span className="text-stone-400 font-normal">(Hiari)</span>
                </label>
                <textarea
                  id="input-record-notes"
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Mfano: Chanjo ya kwanza ya Mdondo imekamilika, umri wiki 2..."
                  className="w-full px-3.5 py-2 bg-white border border-stone-300 rounded-xl text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 resize-none"
                />
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex items-center gap-2">
                <button
                  id="btn-submit-save-record"
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 disabled:opacity-60 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer min-h-[44px]"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Inahifadhi Rekodi...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>{editingRecord ? 'Hifadhi Mabadiliko' : 'Hifadhi Rekodi'}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsFormOpen(false);
                    setEditingRecord(null);
                  }}
                  className="px-4 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer min-h-[44px]"
                >
                  Ghairi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION DIALOG */}
      {recordToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs">
          <div className="bg-white border border-stone-200 rounded-3xl w-full max-w-sm p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-700 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h4 className="text-base font-bold text-stone-900">
                Una uhakika unataka kufuta rekodi hii?
              </h4>
              <p className="text-xs text-stone-600">
                Rekodi ya <strong className="text-stone-900">{recordToDelete.livestockType}</strong> ({recordToDelete.quantity} {recordToDelete.livestockCategory}) na historia yake yote vitafutwa kutoka kwenye orodha yako.
              </p>
              <p className="text-[11px] text-stone-400 pt-1">
                Wasifu wako na rekodi nyingine zitaendelea kuwepo salama.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                id="btn-confirm-delete-record"
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-60 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer min-h-[44px]"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Inafuta...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Futa</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setRecordToDelete(null)}
                className="flex-1 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer min-h-[44px]"
              >
                Ghairi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* V1.5D — My Assistant → Marketplace Discovery Modal */}
      {activeMarketplaceContext && (
        <MyAssistantMarketplaceDiscovery
          context={activeMarketplaceContext}
          allProducts={marketplaceProducts}
          onClose={() => setActiveMarketplaceContext(null)}
        />
      )}
    </div>
  );
};
