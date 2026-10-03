/**
 * Ufugaji Platform - Admin Governance Inbox (V1.7H)
 * Centralized governance notification inbox for platform administrators.
 */

import React, { useState, useEffect } from 'react';
import {
  Bell,
  ShieldAlert,
  AlertTriangle,
  Scale,
  ExternalLink,
  CheckCircle2,
  RefreshCw,
  Clock,
  Filter,
  CheckCheck
} from 'lucide-react';
import { AppNotification } from '../../types/notification';
import {
  fetchUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead
} from '../../services/notificationService';

interface AdminGovernanceInboxProps {
  adminUserId: string;
  onSelectTab?: (tabKey: 'moderation' | 'governance' | 'reports_appeals' | 'categories') => void;
}

export const AdminGovernanceInbox: React.FC<AdminGovernanceInboxProps> = ({
  adminUserId,
  onSelectTab
}) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [filter, setFilter] = useState<'ALL' | 'UNREAD' | 'REPORTS' | 'APPEALS'>('ALL');

  const loadAdminNotifications = async () => {
    setLoading(true);
    try {
      const data = await fetchUserNotifications(adminUserId, true, { limitCount: 100 });
      setNotifications(data);
    } catch (err) {
      console.warn('Hitilafu ya kupakia arifa za admin:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (adminUserId) {
      loadAdminNotifications();
    }
  }, [adminUserId]);

  const handleMarkAsRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.notificationId === id ? { ...n, read: true, readAt: new Date().toISOString() } : n))
    );
    await markNotificationAsRead(adminUserId, id, true);
  };

  const handleMarkAllRead = async () => {
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read: true, readAt: n.readAt || new Date().toISOString() }))
    );
    await markAllNotificationsAsRead(adminUserId, true);
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  const filtered = notifications.filter((n) => {
    if (filter === 'UNREAD') return !n.read;
    if (filter === 'REPORTS') return n.type === 'REPORT_RECEIVED' || n.targetType === 'REPORT';
    if (filter === 'APPEALS') return n.type === 'APPEAL_SUBMITTED' || n.targetType === 'APPEAL';
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="p-4 bg-gradient-to-r from-stone-900 to-stone-800 text-white rounded-2xl shadow-xs flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold tracking-tight">Kituo cha Arifa za Usimamizi (Governance Inbox)</h3>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-400 text-stone-900 rounded-full">
                  {unreadCount} zinahitaji hatua
                </span>
              )}
            </div>
            <p className="text-xs text-stone-300">
              Ufuatiliaji wa papo hapo wa ripoti mpya za soko, rufaa za wauzaji, na matukio ya kiutawala (V1.7H).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              id="admin-btn-mark-all-read"
              type="button"
              onClick={handleMarkAllRead}
              className="px-3 py-1.5 text-xs font-semibold bg-stone-700 hover:bg-stone-600 text-white rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Soma Zote</span>
            </button>
          )}
          <button
            id="admin-btn-refresh-inbox"
            type="button"
            onClick={loadAdminNotifications}
            disabled={loading}
            className="p-2 bg-stone-700 hover:bg-stone-600 text-white rounded-lg transition-colors cursor-pointer"
            title="Sasisha arifa"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-300' : ''}`} />
          </button>
        </div>
      </div>

      {/* Quick Action Navigation Buttons */}
      {onSelectTab && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={() => onSelectTab('reports_appeals')}
            className="p-3 bg-white border border-stone-200 rounded-xl hover:border-amber-400 text-left transition-colors cursor-pointer flex items-center justify-between"
          >
            <div>
              <p className="text-xs font-bold text-stone-900">Ripoti na Rufaa (V1.7F)</p>
              <p className="text-[11px] text-stone-500">Shughulikia malalamiko na rufaa</p>
            </div>
            <Scale className="w-4 h-4 text-amber-600" />
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('moderation')}
            className="p-3 bg-white border border-stone-200 rounded-xl hover:border-emerald-500 text-left transition-colors cursor-pointer flex items-center justify-between"
          >
            <div>
              <p className="text-xs font-bold text-stone-900">Ukaguzi wa Matangazo (V1.7D)</p>
              <p className="text-[11px] text-stone-500">Kagua matangazo yanayosubiri idhini</p>
            </div>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('governance')}
            className="p-3 bg-white border border-stone-200 rounded-xl hover:border-red-400 text-left transition-colors cursor-pointer flex items-center justify-between"
          >
            <div>
              <p className="text-xs font-bold text-stone-900">Maonyo na Vizuizi (V1.7E)</p>
              <p className="text-[11px] text-stone-500">Tazama kumbukumbu za nidhamu</p>
            </div>
            <ShieldAlert className="w-4 h-4 text-red-600" />
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-stone-100 rounded-xl w-fit">
        <button
          type="button"
          onClick={() => setFilter('ALL')}
          className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
            filter === 'ALL' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          Zote ({notifications.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter('UNREAD')}
          className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
            filter === 'UNREAD' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          Zinazosubiri ({unreadCount})
        </button>
        <button
          type="button"
          onClick={() => setFilter('REPORTS')}
          className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
            filter === 'REPORTS' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          Ripoti Pekee
        </button>
        <button
          type="button"
          onClick={() => setFilter('APPEALS')}
          className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
            filter === 'APPEALS' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          Rufaa Pekee
        </button>
      </div>

      {/* Notification List */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="p-8 bg-stone-50 rounded-2xl border border-stone-200 text-center space-y-1">
            <Bell className="w-8 h-8 text-stone-300 mx-auto mb-1 stroke-1" />
            <p className="text-xs font-bold text-stone-700">Hakuna arifa katika kichujio hiki</p>
            <p className="text-[11px] text-stone-500">Arifa mpya za kiutawala zitaonekana hapa punde zinapotokea.</p>
          </div>
        ) : (
          filtered.map((item) => (
            <div
              key={item.notificationId}
              className={`p-3.5 rounded-xl border transition-all ${
                item.read
                  ? 'bg-white border-stone-200/80 text-stone-700'
                  : 'bg-amber-50/50 border-amber-200 text-stone-900 shadow-xs'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded bg-stone-100 text-stone-700 border border-stone-200">
                      {item.type}
                    </span>
                    {!item.read && (
                      <span className="inline-block w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                    )}
                    <span className="text-[11px] text-stone-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(item.createdAt).toLocaleString('sw-TZ')}
                    </span>
                  </div>

                  <h4 className="text-xs font-bold text-stone-900">{item.title}</h4>
                  <p className="text-xs text-stone-600 leading-relaxed whitespace-pre-line">{item.message}</p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {!item.read && (
                    <button
                      type="button"
                      onClick={() => handleMarkAsRead(item.notificationId)}
                      className="px-2.5 py-1 text-xs font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-md transition-colors cursor-pointer"
                    >
                      Soma
                    </button>
                  )}
                  {item.targetType === 'REPORT' && onSelectTab && (
                    <button
                      type="button"
                      onClick={() => onSelectTab('reports_appeals')}
                      className="px-2.5 py-1 text-xs font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-md transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <span>Fungua Ripoti</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                  {item.targetType === 'APPEAL' && onSelectTab && (
                    <button
                      type="button"
                      onClick={() => onSelectTab('reports_appeals')}
                      className="px-2.5 py-1 text-xs font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-md transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <span>Fungua Rufaa</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                  {item.targetType === 'LISTING' && onSelectTab && (
                    <button
                      type="button"
                      onClick={() => onSelectTab('moderation')}
                      className="px-2.5 py-1 text-xs font-semibold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 rounded-md transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <span>Fungua Tangazo</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
