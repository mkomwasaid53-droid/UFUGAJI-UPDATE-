/**
 * Ufugaji Platform - Module Unread Notification Badge (V9.5)
 * Shared, accessible, responsive badge component for navigation icons (Gulio, Gumzo, etc.).
 * Automatically renders count up to limit (e.g. 99+) and hides when 0.
 */

import React from 'react';

export interface ModuleBadgeProps {
  count: number;
  moduleName: string;
  className?: string;
  maxDisplay?: number;
  id?: string;
}

export const ModuleBadge: React.FC<ModuleBadgeProps> = ({
  count,
  moduleName,
  className = '',
  maxDisplay = 99,
  id
}) => {
  if (!count || count <= 0) return null;

  const displayCount = count > maxDisplay ? `${maxDisplay}+` : `${count}`;
  const ariaLabel = `Arifa ${displayCount} mpya za ${moduleName}`;

  return (
    <span
      id={id}
      role="status"
      aria-label={ariaLabel}
      title={ariaLabel}
      className={`absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-red-600 text-white font-bold text-[9px] sm:text-[9.5px] flex items-center justify-center leading-none shadow-xs pointer-events-none z-10 transition-transform ${className}`}
    >
      {displayCount}
    </span>
  );
};
