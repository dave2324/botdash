"use client";

import { useAuth } from '@/contexts/AuthContext';

export default function Header() {
  const { logout } = useAuth();

  return (
    <header className="bg-white shadow-sm p-4 h-16 md:ml-64">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <button className="mr-4 text-gray-600 md:hidden">
            <svg 
              width="24" 
              height="24" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <h2 className="text-xl font-semibold text-gray-800">Dashboard</h2>
        </div>

        <button
          type="button"
          onClick={logout}
          className="inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 hover:border-red-300 transition-colors"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mr-2"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Logout
        </button>
      </div>
    </header>
  );
}