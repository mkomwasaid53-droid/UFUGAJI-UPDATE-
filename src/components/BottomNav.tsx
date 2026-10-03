import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, ClipboardList, Bot, Stethoscope, ShoppingBag, Users } from 'lucide-react';

export const BottomNav: React.FC = () => {
  const location = useLocation();

  // Hide bottom nav on specific auth pages if desired, or keep everywhere for consistent mobile feel
  const isAuthPage = location.pathname === '/login' || location.pathname === '/signup';
  if (isAuthPage) return null;

  const navItems = [
    {
      to: '/',
      label: 'Mwanzo',
      icon: Home,
      id: 'nav-home',
      activeMatch: (path: string) => path === '/',
    },
    {
      to: '/my-assistant',
      label: 'Msaidizi',
      icon: ClipboardList,
      id: 'nav-my-assistant',
      activeMatch: (path: string) => path.startsWith('/my-assistant') || path.startsWith('/msaidizi-wangu'),
    },
    {
      to: '/ai-assistant',
      label: 'AI Assistant',
      icon: Bot,
      id: 'nav-ai-assistant',
      activeMatch: (path: string) => path.startsWith('/ai-assistant') || path.startsWith('/knowledge') || path.startsWith('/elimu'),
    },
    {
      to: '/market',
      label: 'Gulio',
      icon: ShoppingBag,
      id: 'nav-market',
      activeMatch: (path: string) => path === '/market' || path === '/gulio' || path === '/marketplace',
    },
    {
      to: '/daktari',
      label: 'Daktari',
      icon: Stethoscope,
      id: 'nav-daktari',
      activeMatch: (path: string) => path.startsWith('/daktari') || path.startsWith('/madaktari') || path.startsWith('/daktari-mtaani-kwako'),
    },
    {
      to: '/community',
      label: 'Gumzo',
      icon: Users,
      id: 'nav-community',
      activeMatch: (path: string) => path === '/community' || path === '/gumzo',
    },
  ];

  return (
    <nav aria-label="Menyu ya Chini" className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-stone-200 shadow-lg">
      <div className="max-w-xl mx-auto px-1 py-1.5 flex items-center justify-between">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.activeMatch(location.pathname);

          return (
            <NavLink
              key={item.to}
              to={item.to}
              id={item.id}
              className={`flex flex-col items-center justify-center min-w-[42px] sm:min-w-[48px] min-h-[46px] py-1 px-1 rounded-xl transition-all ${
                isActive
                  ? 'text-emerald-800 font-semibold bg-emerald-50'
                  : 'text-stone-500 hover:text-emerald-700 hover:bg-stone-50'
              }`}
            >
              <Icon className={`w-4.5 h-4.5 mb-0.5 ${isActive ? 'text-emerald-700 stroke-[2.5]' : 'stroke-[1.8]'}`} />
              <span className="text-[9.5px] sm:text-[10px] leading-tight whitespace-nowrap">{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};
