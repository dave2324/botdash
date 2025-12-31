"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useCallback, useRef } from 'react';
import { getDashboardStats, type DashboardStats } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { CSSProperties } from 'react';

// Navigation item type
type NavItem = {
  name: string;
  href: string;
  icon: string;
  showCount?: string;
  permission?: string;
};

// Navigation items for sidebar
const navItems = [
  { name: 'Dashboard', href: '/dashboard', icon: 'grid' },
  { name: 'Quiz Tasks', href: '/dashboard/quiz-tasks', icon: 'help-circle', showCount: 'active' },
  { name: 'Video Tasks', href: '/dashboard/video-tasks', icon: 'video', showCount: 'active' },
  { name: 'Affiliate Tasks', href: '/dashboard/affiliate-tasks', icon: 'external-link', showCount: 'active' },
  { name: 'Courses', href: '/dashboard/courses', icon: 'book-open', showCount: 'active' },
  { name: 'Telegram Channels', href: '/dashboard/telegram-channels', icon: 'message-circle', showCount: 'active' },
  { name: 'User Promotions', href: '/dashboard/user-promotions', icon: 'trending-up', showCount: 'pending' },
  { name: 'Promotion Products', href: '/dashboard/promotion-products', icon: 'package', showCount: 'active' },
  { name: 'Promotion Submissions', href: '/dashboard/promotion-submissions', icon: 'clipboard', showCount: 'pending' },
  { name: 'Spin Wheel', href: '/dashboard/spin-wheel', icon: 'loader', showCount: 'active' },
  { name: 'Users', href: '/dashboard/users', icon: 'users', showCount: 'active' },
  { name: 'Referrals', href: '/dashboard/referrals', icon: 'users-2', showCount: 'total' },
  { name: 'Promotion Settings', href: '/dashboard/promotion-settings', icon: 'settings' },
  { name: 'Settings', href: '/dashboard/settings', icon: 'settings' },
  
  // System Administration section
  { name: 'Admin Roles', href: '/dashboard/admin/roles', icon: 'shield', permission: 'manage_roles' },
  { name: 'Admin Users', href: '/dashboard/admin/users', icon: 'user-cog', permission: 'manage_admin_users' },
  { name: 'Activity Logs', href: '/dashboard/admin/activity-logs', icon: 'activity', permission: 'view_activity_logs' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const { hasPermission, isSuperAdmin } = useAuth();

  // Draggable sidebar state
  const [sidebarWidth, setSidebarWidth] = useState<number>(400); // Default width in pixels
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  
  // Load saved sidebar width from localStorage
  useEffect(() => {
    const savedWidth = localStorage.getItem('sidebarWidth');
    if (savedWidth) {
      const width = parseInt(savedWidth);
      if (width >= 200 && width <= 400) { // Bounds check
        setSidebarWidth(width);
      }
    }
  }, []);

  // Save sidebar width to localStorage
  useEffect(() => {
    localStorage.setItem('sidebarWidth', sidebarWidth.toString());
  }, [sidebarWidth]);

  // Mouse move handler for resizing
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;

    const newWidth = e.clientX;
    if (newWidth >= 200 && newWidth <= 400) { // Min: 200px, Max: 400px
      setSidebarWidth(newWidth);
    }
  }, [isResizing]);

  // Mouse up handler to stop resizing
  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';
  }, []);

  // Add/remove event listeners for resizing
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  // Start resizing
  const handleMouseDown = useCallback(() => {
    setIsResizing(true);
  }, []);

  // Scrollbar custom styling
  const scrollbarStyles: CSSProperties = {
    '--scrollbar-track': '#2d3748',
    '--scrollbar-thumb': '#4a5568',
    '--scrollbar-thumb-hover': '#3182ce',
  } as CSSProperties;

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const dashboardStats = await getDashboardStats();
        console.log('Dashboard stats fetched:', dashboardStats); // Debug log
        setStats(dashboardStats);
      } catch (error) {
        console.error('Error fetching dashboard stats:', error);
      }
    };

    fetchStats();
    
    // Refresh stats every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const getCountForItem = (href: string, countType: string): number | null => {
    if (!stats) return null;
    
    switch (href) {
      case '/dashboard/quiz-tasks':
        return countType === 'active' ? stats.quizzes?.active || 0 : null;
      case '/dashboard/video-tasks':
        return countType === 'active' ? stats.youtube_tasks?.active || 0 : null;
      case '/dashboard/affiliate-tasks':
        return countType === 'active' ? stats.affiliateTasks?.active || 0 : null;
      case '/dashboard/courses':
        return countType === 'active' ? stats.courses?.active || 0 : null;
      case '/dashboard/telegram-channels':
        return countType === 'active' ? stats.telegram_channels?.active || 0 : null;
      case '/dashboard/user-promotions':
        if (countType === 'pending') return stats.user_submitted_promotions?.pending || 0;
        if (countType === 'active') return stats.user_submitted_promotions?.active || 0;
        return null;
      case '/dashboard/promotion-products':
        return countType === 'active' ? stats.spinWheelRewards?.active || 0 : null; // Assuming promotion products use spin wheel rewards for now
      case '/dashboard/promotion-submissions':
        if (countType === 'pending') return stats.promotion_submissions?.pending || 0;
        if (countType === 'approved') return stats.promotion_submissions?.approved || 0;
        return null;
      case '/dashboard/spin-wheel':
        return countType === 'active' ? stats.spin_wheel_rewards?.active || 0 : null;
      case '/dashboard/users':
        return countType === 'active' ? stats.users?.active || 0 : null;
      case '/dashboard/referrals':
        return countType === 'total' ? stats.referrals?.total || 0 : null;
      default:
        return null;
    }
  };

  const getBadgeColor = (countType: string): string => {
    switch (countType) {
      case 'pending':
        return 'bg-red-500/20 text-red-300 border border-red-500/30';
      case 'active':
        return 'bg-green-500/20 text-green-300 border border-green-500/30';
      case 'total':
        return 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
      case 'approved':
        return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
      default:
        return 'bg-gray-500/20 text-gray-300 border border-gray-500/30';
    }
  };

  return (
    <aside
      ref={sidebarRef}
      className="fixed inset-y-0 left-0 bg-gray-800 p-4 hidden md:block overflow-hidden select-none"
      style={{ width: `${sidebarWidth}px` }}
    >
      <div className="flex flex-col h-full" style={scrollbarStyles}>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Mini App Game</h1>
          <p className="text-gray-400 text-sm text-white">Admin Panel</p>
        </div>
        
        <nav className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const count = item.showCount ? getCountForItem(item.href, item.showCount) : null;
              
              // Skip items that require permissions the user doesn't have
              if (item.permission && !hasPermission(item.permission) && !isSuperAdmin) {
                return null;
              }
              
              return (
                <li key={item.href}>
                  <Link 
                    href={item.href}
                    className={`flex items-center justify-between px-3 py-2 rounded-md text-sm ${
                      isActive 
                        ? 'bg-blue-600 sidebar-active' 
                        : 'sidebar-link hover:bg-gray-700'
                    }`}
                  >
                    <div className="flex items-center">
                      <span className="mr-3 text-white">
                        <svg 
                          width="16" 
                          height="16" 
                          viewBox="0 0 24 24" 
                          fill="none" 
                          stroke="currentColor" 
                          strokeWidth="2" 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          className="feather"
                   >
                          {item.icon === 'grid' && (
                            <>
                              <rect x="3" y="3" width="7" height="7" />
                              <rect x="14" y="3" width="7" height="7" />
                              <rect x="14" y="14" width="7" height="7" />
                              <rect x="3" y="14" width="7" height="7" />
                            </>
                          )}
                          {item.icon === 'help-circle' && (
                            <>
                              <circle cx="12" cy="12" r="10" />
                              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                              <line x1="12" y1="17" x2="12.01" y2="17" />
                            </>
                          )}
                          {item.icon === 'video' && (
                            <>
                              <polygon points="23 7 16 12 23 17 23 7" />
                              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                            </>
                          )}
                          {item.icon === 'external-link' && (
                            <>
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                              <polyline points="15,3 21,3 21,9" />
                              <line x1="10" y1="14" x2="21" y2="3" />
                            </>
                          )}
                          {item.icon === 'book-open' && (
                            <>
                              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                            </>
                          )}
                          {item.icon === 'message-circle' && (
                            <>
                              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                            </>
                          )}
                          {item.icon === 'trending-up' && (
                            <>
                              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                              <polyline points="17 6 23 6 23 12" />
                            </>
                          )}
                          {item.icon === 'loader' && (
                            <>
                              <line x1="12" y1="2" x2="12" y2="6" />
                              <line x1="12" y1="18" x2="12" y2="22" />
                              <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
                              <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
                              <line x1="2" y1="12" x2="6" y2="12" />
                              <line x1="18" y1="12" x2="22" y2="12" />
                              <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
                              <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
                            </>
                          )}
                          {item.icon === 'users' && (
                            <>
                              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                              <circle cx="9" cy="7" r="4" />
                              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                            </>
                          )}
                          {item.icon === 'users-2' && (
                            <>
                              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                              <circle cx="9" cy="7" r="4" />
                              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                            </>
                          )}
                          {item.icon === 'wallet' && (
                            <>
                              <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" />
                              <path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8" />
                              <path d="M20 8v4h-6a2 2 0 1 1 0-4" />
                            </>
                          )}
                          {item.icon === 'package' && (
                            <>
                              <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
                              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                              <line x1="12" y1="22.08" x2="12" y2="12" />
                            </>
                          )}
                          {item.icon === 'clipboard' && (
                            <>
                              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                            </>
                          )}
                          {item.icon === 'settings' && (
                            <>
                              <circle cx="12" cy="12" r="3" />
                              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                            </>
                          )}
                          {item.icon === 'shield' && (
                            <>
                              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            </>
                          )}
                          {item.icon === 'user-cog' && (
                            <>
                              <circle cx="12" cy="8" r="4" />
                              <path d="M20 19v-2a4 4 0 0 0-3-3.87" />
                              <path d="M4 19v-2a4 4 0 0 1 4-4h4" />
                              <circle cx="17" cy="15" r="1" />
                              <path d="m18.7 16.8-.9.9" />
                              <path d="m18.7 13.2-.9-.9" />
                              <path d="m15.3 16.8.9.9" />
                              <path d="m15.3 13.2.9-.9" />
                            </>
                          )}
                          {item.icon === 'activity' && (
                            <>
                              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                            </>
                          )}
                        </svg>
                      </span>
                      <span className={isActive ? 'text-white' : 'text-gray-300'}>
                        {item.name}
                      </span>
                    </div>
                    
                    {/* Count Badge */}
                    {count !== null && count > 0 && (
                      <span className={`${item.showCount ? getBadgeColor(item.showCount) : 'bg-gray-500'} text-white text-xs px-2 py-1 rounded-full min-w-[20px] text-center`}>
                        {count > 99 ? '99+' : count}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

      </div>

      {/* Resize Handle */}
      <div
        ref={resizeHandleRef}
        className="absolute top-0 right-0 w-1 h-full bg-transparent hover:bg-blue-500 cursor-col-resize group transition-colors duration-200"
        onMouseDown={handleMouseDown}
      >
        <div className="absolute top-0 right-0 w-1 h-full bg-gray-600 group-hover:bg-blue-500 transition-colors duration-200" />
        {/* Visual indicator for draggable area */}
        <div className="absolute top-1/2 -translate-y-1/2 right-0 w-3 h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="w-0.5 h-6 bg-white rounded-full opacity-60" />
        </div>
      </div>
    </aside>
  );
} 