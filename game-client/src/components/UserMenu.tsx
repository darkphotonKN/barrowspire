'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeftStartOnRectangleIcon, Cog6ToothIcon, UserIcon } from '@heroicons/react/24/outline';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { useAuthStore } from '@/stores/authStore';

// The default silhouette is the only portrait a member has (FS-TVCZQ req 4, 7).
function Silhouette() {
  return (
    <svg className="user-silhouette" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 12C14.7614 12 17 9.76142 17 7C17 4.23858 14.7614 2 12 2C9.23858 2 7 4.23858 7 7C7 9.76142 9.23858 12 12 12Z"
        fill="currentColor"
      />
      <path d="M12 14C7.03125 14 3 18.0312 3 23H21C21 18.0312 16.9688 14 12 14Z" fill="currentColor" />
    </svg>
  );
}

export default function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { memberInfo, logout } = useAuthStore();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const handleLogout = () => {
    logout();
    router.push('/');
    setIsOpen(false);
  };

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        className={`user-menu-trigger ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="User menu"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <div className="user-badge"><Silhouette /></div>
        <span className="user-name">{memberInfo?.name || 'User'}</span>
        <ChevronDownIcon className="chevron" aria-hidden="true" />
      </button>

      {isOpen && (
        <div className="header-popover user-menu-dropdown" role="menu">
          <div className="menu-header">
            <div className="user-badge user-badge-lg"><Silhouette /></div>
            <div className="menu-user-info">
              <div className="menu-user-name">{memberInfo?.name}</div>
              <div className="menu-user-email">{memberInfo?.email}</div>
            </div>
          </div>

          <div className="menu-divider" />

          <nav className="menu-nav">
            <Link href="/profile" className="menu-item" role="menuitem" onClick={() => setIsOpen(false)}>
              <UserIcon className="menu-icon" aria-hidden="true" />
              Profile
            </Link>
            <Link href="/settings" className="menu-item" role="menuitem" onClick={() => setIsOpen(false)}>
              <Cog6ToothIcon className="menu-icon" aria-hidden="true" />
              Settings
            </Link>
          </nav>

          <div className="menu-divider" />

          <button className="menu-item menu-logout" role="menuitem" onClick={handleLogout}>
            <ArrowLeftStartOnRectangleIcon className="menu-icon" aria-hidden="true" />
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
