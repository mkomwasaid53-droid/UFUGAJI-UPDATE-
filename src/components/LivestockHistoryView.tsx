import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { auth, db } from '../lib/firebase';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy
} from 'firebase/firestore';
import { LivestockRecord, LivestockEvent, EventType } from '../types';
import {
  ArrowLeft,
  Plus,
  Edit3,
  Trash2,
  Calendar,
  History,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Save,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  Info
} from 'lucide-react';
import {
  calculateLivestockBalance,
  getEventDelta,
  isPositiveEventType,
  isNegativeEventType,
  isNeutralEventType,
  sortEventsChronologicallyDesc,
  validateEventBalanceTimeline,
  validateTimelineAfterDeletion
} from '../utils/livestockBalance';

export const EVENT_TYPE_CONFIG: Record<
  EventType,
  {
    label: string;
    icon: string;
    badgeClass: string;
    borderClass: string;
    bgClass: string;
    effectType: 'positive' | 'negative' | 'neutral';
    effectLabel: string;
  }
> = {
  addition: {
    label: 'Kuongezeka / Kuongezwa',
    icon: '➕',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    borderClass: 'border-emerald-200',
    bgClass: 'bg-emerald-50/40',
    effectType: 'positive',
    effectLabel: 'Inaongeza idadi (+)'
  },
  birth: {
    label: 'Kuzaliwa',
    icon: '🐣',
    badgeClass: 'bg-teal-100 text-teal-800 border-teal-300',
    borderClass: 'border-teal-200',
    bgClass: 'bg-teal-50/40',
    effectType: 'positive',
    effectLabel: 'Inaongeza idadi (+)'
  },
  purchase: {
    label: 'Kununua',
    icon: '📥',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-300',
    borderClass: 'border-purple-200',
    bgClass: 'bg-purple-50/40',
    effectType: 'positive',
    effectLabel: 'Inaongeza idadi (+)'
  },
  sale: {
    label: 'Kuuza',
    icon: '💰',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
    borderClass: 'border-amber-200',
    bgClass: 'bg-amber-50/40',
    effectType: 'negative',
    effectLabel: 'Inapunguza idadi (-)'
  },
  death: {
    label: 'Vifo',
    icon: '☠️',
    badgeClass: 'bg-red-100 text-red-800 border-red-300',
    borderClass: 'border-red-200',
    bgClass: 'bg-red-50/40',
    effectType: 'negative',
    effectLabel: 'Inapunguza idadi (-)'
  },
  mortality: {
    label: 'Vifo',
    icon: '⚠️',
    badgeClass: 'bg-red-100 text-red-800 border-red-300',
    borderClass: 'border-red-200',
    bgClass: 'bg-red-50/40',
    effectType: 'negative',
    effectLabel: 'Inapunguza idadi (-)'
  },
  vaccination: {
    label: 'Chanjo',
    icon: '💉',
    badgeClass: 'bg-cyan-100 text-cyan-800 border-cyan-300',
    borderClass: 'border-cyan-200',
    bgClass: 'bg-cyan-50/40',
    effectType: 'neutral',
    effectLabel: 'Haibadilishi idadi (0)'
  },
  treatment: {
    label: 'Matibabu',
    icon: '💊',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-300',
    borderClass: 'border-blue-200',
    bgClass: 'bg-blue-50/40',
    effectType: 'neutral',
    effectLabel: 'Haibadilishi idadi (0)'
  },
  feed: {
    label: 'Chakula',
    icon: '🌾',
    badgeClass: 'bg-orange-100 text-orange-800 border-orange-300',
    borderClass: 'border-orange-200',
    bgClass: 'bg-orange-50/40',
    effectType: 'neutral',
    effectLabel: 'Haibadilishi idadi (0)'
  },
  observation: {
    label: 'Uchunguzi / Maelezo',
    icon: '👁️',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-300',
    borderClass: 'border-slate-200',
    bgClass: 'bg-slate-50/40',
    effectType: 'neutral',
    effectLabel: 'Haibadilishi idadi (0)'
  },
  other: {
    label: 'Nyingine',
    icon: '📝',
    badgeClass: 'bg-stone-100 text-stone-800 border-stone-300',
    borderClass: 'border-stone-200',
    bgClass: 'bg-stone-50/40',
    effectType: 'neutral',
    effectLabel: 'Haibadilishi idadi (0)'
  }
};

const EVENT_TYPE_LIST: EventType[] = [
  'addition',
  'birth',
  'purchase',
  'sale',
  'death',
  'vaccination',
  'treatment',
  'feed',
  'observation',
  'other'
];

// Event types where livestock quantity count is strictly required
const QUANTITY_REQUIRED_EVENT_TYPES: EventType[] = [
  'addition',
  'birth',
  'purchase',
  'sale',
  'death',
  'mortality'
];

interface LivestockHistoryViewProps {
  record: LivestockRecord;
  onBack: () => void;
  onEventsUpdated?: (recordId: string, updatedEvents: LivestockEvent[]) => void;
}

export const LivestockHistoryView: React.FC<LivestockHistoryViewProps> = ({
  record,
  onBack,
  onEventsUpdated
}) => {
  const { currentUser } = useAuth();
  const activeUid = currentUser?.uid || auth.currentUser?.uid || record.userId || 'guest_user';

  const [events, setEvents] = useState<LivestockEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Add / Edit Modal state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<LivestockEvent | null>(null);
  const [formData, setFormData] = useState({
    eventType: 'addition' as EventType,
    eventDate: new Date().toISOString().split('T')[0],
    quantity: '',
    title: '',
    notes: ''
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete Modal state
  const [eventToDelete, setEventToDelete] = useState<LivestockEvent | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Banner states
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Calculated balance summary
  const balanceSummary = calculateLivestockBalance(record.quantity, events);

  // Format Swahili Date (e.g., "29 Ago 2026")
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

  // Fetch Events for this livestock record
  const fetchEvents = async () => {
    if (!record?.recordId) {
      setLoading(false);
      return;
    }
    setFetchError(null);

    const storageKey = `livestock_events_${activeUid}_${record.recordId}`;
    let hasLocalData = false;
    try {
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          setEvents(parsed);
          hasLocalData = true;
          setLoading(false);
          if (onEventsUpdated) {
            onEventsUpdated(record.recordId, parsed);
          }
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
      const eventsRef = collection(
        db,
        'users',
        activeUid,
        'livestockRecords',
        record.recordId,
        'events'
      );

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

      // Deterministic sort newest first
      const sorted = sortEventsChronologicallyDesc(items);

      setEvents(sorted);
      try {
        localStorage.setItem(storageKey, JSON.stringify(sorted));
      } catch {}

      if (onEventsUpdated) {
        onEventsUpdated(record.recordId, sorted);
      }
    } catch (err: any) {
      if (!hasLocalData) {
        console.warn('Taarifa ya kupakua matukio ya mifugo:', err?.message || err);
        setFetchError('Imeshindikana kupakia historia ya matukio. Tafadhali jaribu tena.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [activeUid, record?.recordId]);

  // Open Add Event modal
  const handleOpenAddModal = () => {
    setEditingEvent(null);
    setFormError(null);
    setFormData({
      eventType: 'addition',
      eventDate: new Date().toISOString().split('T')[0],
      quantity: '',
      title: '',
      notes: ''
    });
    setIsFormOpen(true);
  };

  // Open Edit Event modal
  const handleOpenEditModal = (evt: LivestockEvent) => {
    setEditingEvent(evt);
    setFormError(null);
    setFormData({
      eventType: evt.eventType,
      eventDate: evt.eventDate || new Date().toISOString().split('T')[0],
      quantity: evt.quantity !== null && evt.quantity !== undefined ? evt.quantity.toString() : '',
      title: evt.title || '',
      notes: evt.notes || evt.description || ''
    });
    setIsFormOpen(true);
  };

  // Handle Save Event (Create or Update with negative balance validation)
  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!currentUser) {
      setFormError('Hujaingia kwenye mfumo.');
      return;
    }

    if (!formData.title.trim()) {
      setFormError('Tafadhali weka Kichwa / Jina la tukio.');
      return;
    }

    if (!formData.eventDate) {
      setFormError('Tafadhali chagua Tarehe ya tukio.');
      return;
    }

    const isQuantityRequired = QUANTITY_REQUIRED_EVENT_TYPES.includes(formData.eventType);

    let parsedQuantity: number | null = null;
    if (formData.quantity.trim() !== '') {
      const num = Number(formData.quantity);
      if (isNaN(num) || num <= 0 || !Number.isInteger(num)) {
        setFormError('Kiasi / Idadi lazima iwe namba chanya kamilifu (mfano: 1, 5, 20).');
        return;
      }
      parsedQuantity = num;
    } else if (isQuantityRequired) {
      setFormError(
        `Tafadhali weka kiasi/idadi ya mifugo kwa tukio la ${
          EVENT_TYPE_CONFIG[formData.eventType]?.label || formData.eventType
        }.`
      );
      return;
    }

    const now = new Date().toISOString();
    const eventId = editingEvent
      ? editingEvent.eventId
      : doc(
          collection(
            db,
            'users',
            activeUid,
            'livestockRecords',
            record.recordId,
            'events'
          )
        ).id;

    const trimmedNotes = formData.notes.trim();

    const eventPayload: LivestockEvent = {
      eventId,
      eventType: formData.eventType,
      quantity: parsedQuantity,
      eventDate: formData.eventDate,
      title: formData.title.trim(),
      notes: trimmedNotes,
      description: trimmedNotes,
      createdAt: editingEvent ? editingEvent.createdAt : now,
      updatedAt: now
    };

    // Strict timeline integrity validation (Prevents negative balance at any chronological point)
    const timelineValidation = validateEventBalanceTimeline(
      record.quantity,
      events,
      eventPayload,
      !!editingEvent
    );

    if (!timelineValidation.valid) {
      setFormError(timelineValidation.errorMessage || 'Kiasi cha tukio kinasababisha idadi ya mifugo kuwa hasi.');
      return;
    }

    setIsSubmitting(true);

    // 1. Instant local update
    let updatedList: LivestockEvent[];
    if (editingEvent) {
      updatedList = events.map((item) => (item.eventId === eventId ? eventPayload : item));
      setSuccessBanner(`Tukio la "${EVENT_TYPE_CONFIG[formData.eventType]?.label}" limesasishwa kikamilifu!`);
    } else {
      updatedList = [eventPayload, ...events];
      setSuccessBanner(`Tukio jipya la "${EVENT_TYPE_CONFIG[formData.eventType]?.label}" limehifadhiwa kikamilifu!`);
    }

    // Re-sort newest first
    const sortedUpdatedList = sortEventsChronologicallyDesc(updatedList);
    setEvents(sortedUpdatedList);

    const storageKey = `livestock_events_${activeUid}_${record.recordId}`;
    try {
      localStorage.setItem(storageKey, JSON.stringify(sortedUpdatedList));
    } catch {}

    if (onEventsUpdated) {
      onEventsUpdated(record.recordId, sortedUpdatedList);
    }

    setIsFormOpen(false);
    setEditingEvent(null);

    // 2. Persist to Firestore
    try {
      if (auth.currentUser) {
        await auth.currentUser.getIdToken();
      }
      const eventRef = doc(
        db,
        'users',
        activeUid,
        'livestockRecords',
        record.recordId,
        'events',
        eventId
      );
      await setDoc(eventRef, eventPayload, { merge: true });
    } catch (err: any) {
      console.warn('Taarifa ya kuhifadhi tukio Firestore:', err?.message || err);
    } finally {
      setIsSubmitting(false);
      setTimeout(() => {
        setSuccessBanner(null);
      }, 5000);
    }
  };

  // Handle Confirm Delete Event
  const handleConfirmDeleteEvent = async () => {
    if (!eventToDelete) return;

    // Check if deleting this event breaks the timeline balance for later reduction events
    const deletionValidation = validateTimelineAfterDeletion(
      record.quantity,
      events,
      eventToDelete.eventId
    );

    if (!deletionValidation.valid) {
      setErrorBanner(deletionValidation.errorMessage || 'Huwezi kufuta tukio hili kwa sababu linasababisha idadi kuwa hasi.');
      setEventToDelete(null);
      return;
    }

    setIsDeleting(true);
    const deletedId = eventToDelete.eventId;
    const deletedLabel = EVENT_TYPE_CONFIG[eventToDelete.eventType]?.label || 'Tukio';

    // 1. Instant local update
    const updatedList = events.filter((e) => e.eventId !== deletedId);
    const sortedUpdatedList = sortEventsChronologicallyDesc(updatedList);
    setEvents(sortedUpdatedList);

    const storageKey = `livestock_events_${activeUid}_${record.recordId}`;
    try {
      localStorage.setItem(storageKey, JSON.stringify(sortedUpdatedList));
    } catch {}

    if (onEventsUpdated) {
      onEventsUpdated(record.recordId, sortedUpdatedList);
    }

    setSuccessBanner(`Tukio la "${deletedLabel}" limefutwa.`);
    setEventToDelete(null);

    // 2. Delete from Firestore
    try {
      if (auth.currentUser) {
        await auth.currentUser.getIdToken();
      }
      const eventRef = doc(
        db,
        'users',
        activeUid,
        'livestockRecords',
        record.recordId,
        'events',
        deletedId
      );
      await deleteDoc(eventRef);
    } catch (err: any) {
      console.warn('Taarifa ya kufuta tukio Firestore:', err?.message || err);
    } finally {
      setIsDeleting(false);
      setTimeout(() => {
        setSuccessBanner(null);
      }, 5000);
    }
  };

  // Event counts summary
  const eventCountsByType = events.reduce((acc, evt) => {
    const key = evt.eventType === 'mortality' ? 'death' : evt.eventType;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-4">
      {/* Top Navigation Bar: Back to Livestock List */}
      <div className="flex items-center justify-between gap-2">
        <button
          id="btn-back-to-livestock-records"
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 text-xs font-semibold rounded-xl shadow-2xs transition-colors cursor-pointer min-h-[40px]"
        >
          <ArrowLeft className="w-4 h-4 text-stone-600" />
          <span>Rudi kwenye Orodha ya Mifugo</span>
        </button>

        <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg flex items-center gap-1">
          <History className="w-3.5 h-3.5" />
          Historia ya Mifugo
        </span>
      </div>

      {/* Parent Livestock Record Header & Calculated Balance Summary Card */}
      <div className="bg-gradient-to-br from-stone-900 via-stone-850 to-stone-900 text-white rounded-3xl p-5 shadow-sm space-y-4 relative overflow-hidden border border-stone-800">
        <div className="relative z-10 space-y-3">
          {/* Top metadata info */}
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[11px] font-semibold uppercase tracking-wider">
                  {record.livestockCategory}
                </span>
                {record.recordName && (
                  <span className="text-xs text-stone-300 bg-stone-800/80 px-2 py-0.5 rounded-md font-medium border border-stone-700">
                    {record.recordName}
                  </span>
                )}
              </div>
              <h2 className="text-xl font-extrabold text-white tracking-tight">
                {record.recordName ? record.recordName : record.livestockType}
              </h2>
              {record.recordName && (
                <p className="text-xs text-stone-300 font-medium">{record.livestockType}</p>
              )}
            </div>

            {/* Prominent Current Quantity Badge */}
            <div className="text-right shrink-0 bg-emerald-950/90 border border-emerald-500/50 px-4 py-2.5 rounded-2xl shadow-inner">
              <span className="text-2xl font-black text-emerald-300 leading-none block">
                {Number(balanceSummary.currentQuantity ?? 0).toLocaleString()}
              </span>
              <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider block pt-1">
                Idadi ya Sasa
              </span>
            </div>
          </div>

          {/* Balance Breakdown Strip */}
          <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-stone-800 text-center">
            {/* 1. Base Quantity */}
            <div className="bg-stone-800/70 border border-stone-700/60 rounded-xl p-2">
              <span className="text-[10px] text-stone-400 block font-medium">Kuanzia</span>
              <span className="text-xs sm:text-sm font-bold text-stone-200">
                {Number(balanceSummary.baseQuantity ?? 0).toLocaleString()}
              </span>
            </div>

            {/* 2. Total Additions */}
            <div className="bg-emerald-950/40 border border-emerald-800/40 rounded-xl p-2">
              <span className="text-[10px] text-emerald-300/80 block font-medium">Ongezeko</span>
              <span className="text-xs sm:text-sm font-bold text-emerald-300">
                +{Number(balanceSummary.totalAdditions ?? 0).toLocaleString()}
              </span>
            </div>

            {/* 3. Total Reductions */}
            <div className="bg-red-950/40 border border-red-800/40 rounded-xl p-2">
              <span className="text-[10px] text-red-300/80 block font-medium">Upungufu</span>
              <span className="text-xs sm:text-sm font-bold text-red-300">
                -{Number(balanceSummary.totalReductions ?? 0).toLocaleString()}
              </span>
            </div>

            {/* 4. Net Change */}
            <div className="bg-stone-800/70 border border-stone-700/60 rounded-xl p-2">
              <span className="text-[10px] text-stone-400 block font-medium">Mabadiliko</span>
              <span className={`text-xs sm:text-sm font-bold ${
                (balanceSummary.totalAdditions ?? 0) - (balanceSummary.totalReductions ?? 0) > 0
                  ? 'text-emerald-300'
                  : (balanceSummary.totalAdditions ?? 0) - (balanceSummary.totalReductions ?? 0) < 0
                  ? 'text-red-300'
                  : 'text-stone-300'
              }`}>
                {(balanceSummary.totalAdditions ?? 0) - (balanceSummary.totalReductions ?? 0) > 0
                  ? `+${Number((balanceSummary.totalAdditions ?? 0) - (balanceSummary.totalReductions ?? 0)).toLocaleString()}`
                  : Number((balanceSummary.totalAdditions ?? 0) - (balanceSummary.totalReductions ?? 0)).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Additional notes & date */}
          <div className="flex items-center justify-between gap-2 text-xs text-stone-400 pt-1">
            <div className="flex items-center gap-1.5 text-stone-300">
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              <span>Imeanzishwa: {formatSwahiliDate(record.dateAdded)}</span>
            </div>
            {record.notes && (
              <span className="text-stone-400 text-xs truncate max-w-[220px]" title={record.notes}>
                • {record.notes}
              </span>
            )}
          </div>
        </div>

        {/* Decorative blur */}
        <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-emerald-600/20 rounded-full blur-2xl pointer-events-none" />
      </div>

      {/* Success Notification Banner */}
      {successBanner && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-start gap-2.5 text-emerald-900 text-xs shadow-xs animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
          <div className="space-y-0.5 flex-1">
            <p className="font-bold">{successBanner}</p>
            <p className="text-[11px] text-emerald-800">
              Hesabu ya idadi ya sasa imesasishwa ({balanceSummary.currentQuantity} jumla).
            </p>
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

      {/* History Section Header & Summary */}
      <div className="bg-white border border-stone-200/90 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
              <History className="w-4 h-4 text-emerald-700" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900 uppercase tracking-wide">HISTORIA YA KUNDI</h3>
              <p className="text-[11px] text-stone-500 font-medium">
                Jumla ya Matukio: <strong className="text-stone-900">{events.length}</strong>
              </p>
            </div>
          </div>

          <button
            id="btn-add-event"
            type="button"
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer min-h-[40px]"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>+ Ongeza Tukio</span>
          </button>
        </div>

        {/* Event Type Counts Breakdown Chips */}
        {events.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs pt-1 border-t border-stone-100">
            {EVENT_TYPE_LIST.map((typeKey) => {
              const count = eventCountsByType[typeKey];
              if (!count) return null;
              const config = EVENT_TYPE_CONFIG[typeKey];
              return (
                <span
                  key={typeKey}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${config.badgeClass} shrink-0`}
                >
                  <span>{config.icon}</span>
                  <span>
                    {config.label}: {count}
                  </span>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Events List / Empty / Loading / Error */}
      {loading ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-700 mx-auto" />
          <p className="text-xs text-stone-500 font-medium">Inapakia historia ya matukio...</p>
        </div>
      ) : fetchError ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-red-600 mx-auto" />
          <p className="text-xs text-red-800">{fetchError}</p>
          <button
            type="button"
            onClick={fetchEvents}
            className="px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-xl hover:bg-red-700 cursor-pointer"
          >
            Jaribu Tena
          </button>
        </div>
      ) : events.length === 0 ? (
        /* Empty State */
        <div className="bg-white border border-stone-200/90 rounded-3xl p-7 text-center space-y-4 shadow-xs">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-700 rounded-full flex items-center justify-center mx-auto text-3xl border border-emerald-200/60 shadow-2xs">
            📅
          </div>
          <div className="space-y-1 max-w-xs mx-auto">
            <h4 className="text-base font-bold text-stone-900">
              Hakuna historia ya tukio bado.
            </h4>
            <p className="text-xs text-stone-500 leading-relaxed">
              Weka kumbukumbu za matukio kama vile kuongezeka, kuzaliwa, kununua, kuuza, vifo, chanjo, matibabu, chakula, au uchunguzi wa kundi hili.
            </p>
          </div>
          <div className="pt-1">
            <button
              id="btn-empty-add-event"
              type="button"
              onClick={handleOpenAddModal}
              className="inline-flex items-center gap-2 px-5 py-3 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-semibold text-xs rounded-xl shadow-sm transition-colors cursor-pointer min-h-[44px]"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>+ Ongeza Tukio</span>
            </button>
          </div>
        </div>
      ) : (
        /* Chronological Events Timeline / Cards (Newest First) */
        <div className="space-y-3">
          {events.map((evt) => {
            const config = EVENT_TYPE_CONFIG[evt.eventType] || EVENT_TYPE_CONFIG.other;
            const eventNotes = evt.notes || evt.description;
            const delta = getEventDelta(evt.eventType, evt.quantity);

            return (
              <div
                key={evt.eventId}
                id={`event-card-${evt.eventId}`}
                className={`bg-white border ${config.borderClass} rounded-2xl p-4 shadow-xs transition-all space-y-3 relative group hover:shadow-sm`}
              >
                {/* Event Top Bar */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-stone-50 border border-stone-200/80 flex items-center justify-center text-lg shrink-0">
                      {config.icon}
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${config.badgeClass}`}
                        >
                          {config.icon} {config.label}
                        </span>
                        <span className="text-xs text-stone-500 font-medium flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-stone-400" />
                          {formatSwahiliDate(evt.eventDate)}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-stone-900 leading-snug pt-0.5">
                        {evt.title}
                      </h4>
                    </div>
                  </div>

                  {/* Balance Effect Badge */}
                  <div className="text-right shrink-0">
                    {delta > 0 ? (
                      <div className="inline-flex items-center gap-1 bg-emerald-100 border border-emerald-300 text-emerald-900 px-2.5 py-1 rounded-xl">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-700" />
                        <span className="text-xs font-black text-emerald-900">+{delta}</span>
                      </div>
                    ) : delta < 0 ? (
                      <div className="inline-flex items-center gap-1 bg-red-100 border border-red-300 text-red-900 px-2.5 py-1 rounded-xl">
                        <TrendingDown className="w-3.5 h-3.5 text-red-700" />
                        <span className="text-xs font-black text-red-900">{delta}</span>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1 bg-stone-100 border border-stone-200 text-stone-600 px-2 py-1 rounded-xl">
                        <Minus className="w-3 h-3 text-stone-400" />
                        <span className="text-[10px] font-medium text-stone-500">
                          Hakuna mabadiliko ya idadi
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Event Notes if provided */}
                {eventNotes && (
                  <div className="p-2.5 bg-stone-50/80 border border-stone-100 rounded-xl text-xs text-stone-700 leading-relaxed whitespace-pre-wrap">
                    {eventNotes}
                  </div>
                )}

                {/* Actions Footer */}
                <div className="flex items-center justify-between pt-1 border-t border-stone-100 text-xs">
                  <span className="text-[10px] text-stone-400">
                    Tarehe: {evt.eventDate}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      id={`btn-edit-event-${evt.eventId}`}
                      type="button"
                      onClick={() => handleOpenEditModal(evt)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-stone-50 hover:bg-emerald-50 text-stone-700 hover:text-emerald-800 border border-stone-200 hover:border-emerald-300 rounded-xl font-medium transition-colors cursor-pointer min-h-[36px]"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Hariri</span>
                    </button>

                    <button
                      id={`btn-delete-event-${evt.eventId}`}
                      type="button"
                      onClick={() => setEventToDelete(evt)}
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

      {/* ADD / EDIT EVENT MODAL */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white border border-stone-200 rounded-3xl w-full max-w-md p-5 shadow-2xl space-y-4 my-8 animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <History className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-900">
                    {editingEvent ? 'Hariri Tukio' : 'Ongeza Tukio la Mifugo'}
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Kundi: <strong className="text-stone-700">{record.recordName || record.livestockType}</strong>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsFormOpen(false);
                  setEditingEvent(null);
                }}
                className="w-8 h-8 rounded-xl bg-stone-100 text-stone-500 hover:text-stone-800 hover:bg-stone-200 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Error Alert */}
            {formError && (
              <div className="p-3.5 bg-red-50 border border-red-300 rounded-xl flex items-start gap-2 text-red-900 text-xs">
                <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEvent} className="space-y-3.5">
              {/* 1. Aina ya Tukio (Required) */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1" htmlFor="input-event-type">
                  Aina ya Tukio <span className="text-red-500">*</span>
                </label>
                <select
                  id="input-event-type"
                  value={formData.eventType}
                  onChange={(e) => {
                    const newType = e.target.value as EventType;
                    setFormData({ ...formData, eventType: newType });
                  }}
                  className="w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 min-h-[44px]"
                >
                  {EVENT_TYPE_LIST.map((typeKey) => {
                    const cfg = EVENT_TYPE_CONFIG[typeKey];
                    return (
                      <option key={typeKey} value={typeKey}>
                        {cfg.icon} {cfg.label}
                      </option>
                    );
                  })}
                </select>

                {/* Event Population Effect Indicator */}
                <div className="mt-1.5">
                  {EVENT_TYPE_CONFIG[formData.eventType]?.effectType === 'positive' && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl font-semibold">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Athari: <strong>Inaongeza idadi ya mifugo (+)</strong></span>
                    </div>
                  )}
                  {EVENT_TYPE_CONFIG[formData.eventType]?.effectType === 'negative' && (
                    <div className="flex items-center gap-1.5 text-xs text-red-800 bg-red-50 border border-red-200 px-3 py-1.5 rounded-xl font-semibold">
                      <TrendingDown className="w-3.5 h-3.5 text-red-700" />
                      <span>Athari: <strong>Inapunguza idadi ya mifugo (-)</strong></span>
                    </div>
                  )}
                  {EVENT_TYPE_CONFIG[formData.eventType]?.effectType === 'neutral' && (
                    <div className="flex items-center gap-1.5 text-xs text-stone-700 bg-stone-100 border border-stone-200 px-3 py-1.5 rounded-xl font-semibold">
                      <Minus className="w-3.5 h-3.5 text-stone-500" />
                      <span>Athari: <strong>Haibadilishi idadi ya mifugo (0)</strong></span>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. Kiasi / Idadi */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-stone-700" htmlFor="input-event-quantity">
                    Kiasi / Idadi ya Mifugo{' '}
                    {QUANTITY_REQUIRED_EVENT_TYPES.includes(formData.eventType) ? (
                      <span className="text-red-500 font-bold">* (Inahitajika)</span>
                    ) : (
                      <span className="text-stone-400 font-normal">(Hiari)</span>
                    )}
                  </label>
                </div>
                <input
                  id="input-event-quantity"
                  type="number"
                  min="1"
                  step="1"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  placeholder={
                    QUANTITY_REQUIRED_EVENT_TYPES.includes(formData.eventType)
                      ? 'Mfano: 5, 20, 150...'
                      : 'Mfano: 150 (acha wazi kama haihusiki)'
                  }
                  className="w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 min-h-[44px]"
                />
                <p className="text-[10px] text-stone-500 mt-1">
                  {QUANTITY_REQUIRED_EVENT_TYPES.includes(formData.eventType)
                    ? 'Weka namba chanya kamilifu ya mifugo inayoathirika na tukio hili.'
                    : 'Weka namba chanya ikiwa tukio linahusisha idadi maalum (mfano kuku waliochanjwa).'}
                </p>
              </div>

              {/* 3. Tarehe ya Tukio (Required) */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1" htmlFor="input-event-date">
                  Tarehe ya Tukio <span className="text-red-500">*</span>
                </label>
                <input
                  id="input-event-date"
                  type="date"
                  required
                  value={formData.eventDate}
                  onChange={(e) => setFormData({ ...formData, eventDate: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 min-h-[44px]"
                />
              </div>

              {/* 4. Kichwa / Jina la Tukio (Required) */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1" htmlFor="input-event-title">
                  Kichwa / Jina la Tukio <span className="text-red-500">*</span>
                </label>
                <input
                  id="input-event-title"
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Mfano: Kundi jipya limeanzishwa, Chanjo ya Newcastle, Vifo 3..."
                  className="w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 min-h-[44px]"
                />
              </div>

              {/* 5. Maelezo (Optional) */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1" htmlFor="input-event-notes">
                  Maelezo <span className="text-stone-400 font-normal">(Hiari)</span>
                </label>
                <textarea
                  id="input-event-notes"
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Eleza kwa kina kile kilichotokea, dalili, dawa zilizotumika au maelezo yoyote..."
                  className="w-full px-3.5 py-2 bg-white border border-stone-300 rounded-xl text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 resize-none"
                />
              </div>

              {/* Form Buttons */}
              <div className="pt-2 flex items-center gap-2">
                <button
                  id="btn-submit-save-event"
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 disabled:opacity-60 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer min-h-[44px]"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Inahifadhi Tukio...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>{editingEvent ? 'Hifadhi Mabadiliko' : 'Hifadhi Tukio'}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsFormOpen(false);
                    setEditingEvent(null);
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

      {/* DELETE EVENT CONFIRMATION MODAL */}
      {eventToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs">
          <div className="bg-white border border-stone-200 rounded-3xl w-full max-w-sm p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-700 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h4 className="text-base font-bold text-stone-900">
                Una uhakika unataka kufuta tukio hili?
              </h4>
              <p className="text-xs text-stone-600">
                Tukio la <strong className="text-stone-900">{eventToDelete.title}</strong> ({EVENT_TYPE_CONFIG[eventToDelete.eventType]?.label}) litafutwa kutoka kwenye historia ya kundi hili.
              </p>
              <p className="text-[11px] text-stone-500 pt-1">
                Hesabu ya mifugo itarekebishwa mara moja kulingana na matukio yaliyosalia.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                id="btn-confirm-delete-event"
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDeleteEvent}
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
                id="btn-cancel-delete-event"
                type="button"
                disabled={isDeleting}
                onClick={() => setEventToDelete(null)}
                className="flex-1 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer min-h-[44px]"
              >
                Ghairi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
