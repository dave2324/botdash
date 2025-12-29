"use client";

export default function Header() {
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
      </div>
    </header>
  );
} 