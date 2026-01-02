"use client";

import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

export default function AdminLayout({
  children
}: {
  children: React.ReactNode
}) {
  const [sidebarWidth, setSidebarWidth] = useState<number>(256);

  // Sync sidebar width with localStorage
  useEffect(() => {
    const updateSidebarWidth = () => {
      const savedWidth = localStorage.getItem('sidebarWidth');
      if (savedWidth) {
        const width = parseInt(savedWidth);
        if (width >= 200 && width <= 400) {
          setSidebarWidth(width);
        }
      }
    };

    // Initial load
    updateSidebarWidth();

    // Listen for changes (when sidebar is resized)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'sidebarWidth') {
        updateSidebarWidth();
      }
    };

    // Custom event for real-time updates
    const handleSidebarResize = () => {
      updateSidebarWidth();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('sidebar-resize', handleSidebarResize);

    // Poll for changes (fallback for same-tab updates)
    const interval = setInterval(updateSidebarWidth, 100);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('sidebar-resize', handleSidebarResize);
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main
          className="flex-1 overflow-x-hidden overflow-y-auto p-2 py-4 bg-gray-50 transition-all duration-200"
          style={{ marginLeft: `${sidebarWidth}px` }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}