import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Sprout, Shield, LogOut, Menu, Bell, SlidersHorizontal, ShieldCheck } from 'lucide-react';
import { NotificationCenterModal } from './notifications/NotificationCenterModal';
import { subscribeToUserNotifications, calculateUnreadCount } from '../services/notificationService';

export const Header: React.FC = () => {
  const { currentUser, userProfile, role, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!currentUser?.uid) {
      setUnreadCount(0);
      return;
    }

    // Controlled listener complying with V1.10A-Corrective-2 Section 10 & 11:
    // - waits for auth readiness
    // - recipient scoped
    // - cleans up on logout/unmount
    // - no aggressive polling
    // - no side-effect mutations
    const unsubscribe = subscribeToUserNotifications(
      currentUser.uid,
      isAdmin,
      (notifications) => {
        setUnreadCount(calculateUnreadCount(notifications));
      }
    );

    return () => {
      unsubscribe();
    };
  }, [currentUser?.uid, isAdmin]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      console.error('Hitilafu wakati wa kutoka:', err);
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-emerald-800 text-white shadow-md">
      <div className="px-4 py-3 flex items-center justify-between">
        {/* Brand logo & title */}
        <Link to="/" className="flex items-center space-x-2 focus:outline-none">
          <div className="w-9 h-9 rounded-xl bg-emerald-600/60 border border-emerald-400/30 flex items-center justify-center text-emerald-200">
            <Sprout className="w-5 h-5 text-emerald-100" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white leading-tight">UFUGAJI UPDATE</h1>
            <p className="text-[10px] text-emerald-200 font-medium tracking-wide uppercase">Jukwaa la Wafugaji Tanzania</p>
          </div>
        </Link>

        {/* User / Action Area: [App identity/title]  [Notifications] [☰] */}
        <div className="flex items-center space-x-2">
          {currentUser ? (
            <>
              {/* Notification Bell with Badge */}
              <button
                id="header-notification-btn"
                type="button"
                onClick={() => setIsNotificationOpen(true)}
                title="Kituo cha Arifa"
                aria-label="Kituo cha Arifa"
                className="relative p-1.5 rounded-lg bg-emerald-700/80 text-emerald-100 hover:bg-emerald-700 transition-colors cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span
                    id="header-notification-badge"
                    className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-400 text-stone-900 font-bold text-[10px] flex items-center justify-center leading-none shadow-xs"
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Admin quick access & Readiness Dashboard */}
              {isAdmin && (
                <div className="flex items-center space-x-1.5">
                  <Link
                    to="/admin?tab=readiness"
                    id="header-readiness-link"
                    title="Dashibodi ya Utayari (Ad Readiness V1.9B)"
                    className="px-2 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs flex items-center gap-1 shadow-xs transition-colors"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-stone-950" />
                    <span className="hidden sm:inline">Utayari</span>
                  </Link>
                  <Link
                    to="/admin"
                    id="header-admin-link"
                    title="Paneli ya Msimamizi"
                    className="p-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-500 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                  >
                    <Shield className="w-4 h-4" />
                  </Link>
                </div>
              )}

              {/* ☰ Menu Icon -> Settings */}
              <Link
                to="/settings"
                id="header-menu-link"
                title="Mipangilio"
                aria-label="Fungua menyu ya mipangilio"
                className="p-1.5 rounded-lg bg-emerald-700/80 text-emerald-100 hover:bg-emerald-700 hover:text-white transition-colors cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                <Menu className="w-5 h-5 text-emerald-100" />
              </Link>
            </>
          ) : (
            <div className="flex items-center space-x-2 text-xs">
              <Link
                to="/admin/readiness"
                id="header-guest-readiness-btn"
                title="Dashibodi ya Utayari (Admin Readiness)"
                className="px-2 py-1.5 font-bold rounded-lg bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 border border-amber-400/40 transition-colors flex items-center gap-1"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Admin Readiness</span>
              </Link>
              <Link
                to="/login"
                id="header-login-btn"
                className="px-3 py-1.5 font-medium text-emerald-100 hover:text-white transition-colors"
              >
                Ingia
              </Link>
              <Link
                to="/signup"
                id="header-signup-btn"
                className="px-3 py-1.5 font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors shadow-sm"
              >
                Jisajili
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Notification Center Modal */}
      {currentUser && (
        <NotificationCenterModal
          isOpen={isNotificationOpen}
          onClose={() => setIsNotificationOpen(false)}
          userId={currentUser.uid}
          isAdmin={isAdmin}
          onNavigate={(url) => navigate(url)}
        />
      )}
    </header>
  );
};
