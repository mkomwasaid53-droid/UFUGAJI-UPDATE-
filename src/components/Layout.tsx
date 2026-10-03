import React from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { BottomNav } from './BottomNav';

export const Layout: React.FC = () => {
  return (
    <div className="min-h-screen bg-stone-100 flex flex-col items-center antialiased text-stone-900 selection:bg-emerald-200">
      {/* Mobile-first centered frame: Looks like a native mobile app on desktop and 100% full-width on mobile */}
      <div className="w-full max-w-md sm:max-w-lg md:max-w-xl min-h-screen bg-stone-50 flex flex-col shadow-sm border-x border-stone-200/60 pb-20">
        <Header />
        <main className="flex-1 flex flex-col">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  );
};
