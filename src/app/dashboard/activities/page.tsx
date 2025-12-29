'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { getRecentActivities, RecentActivity, ActivitiesResponse, ActivityFilters } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import { ArrowLeft, Loader2, Filter, X, Search, Calendar, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

function ActivitiesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Filter states
  const [filters, setFilters] = useState<ActivityFilters>({
    type: searchParams.get('type') || undefined,
    task_type: searchParams.get('task_type') || undefined,
    user_id: searchParams.get('user_id') ? parseInt(searchParams.get('user_id')!) : undefined,
    start_date: searchParams.get('start_date') || undefined,
    end_date: searchParams.get('end_date') || undefined,
  });
  const [showFilters, setShowFilters] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  
  // Activity states
  const [activities, setActivities] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const observer = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useCallback((node: HTMLDivElement) => {
    if (loading || loadingMore) return;
    if (observer.current) observer.current.disconnect();
    
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        loadMore();
      }
    });
    
    if (node) observer.current.observe(node);
  }, [loading, loadingMore, hasMore]);

  // Initial load
  useEffect(() => {
    const fetchActivities = async () => {
      try {
        setLoading(true);
        const data = await getRecentActivities(20, undefined, filters);
        setActivities(data.activities);
        setCursor(data.pagination.nextCursor);
        setHasMore(data.pagination.hasMore);
      } catch (err) {
        console.error('Error fetching activities:', err);
        setError('Failed to load activities. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchActivities();
    
    // Update URL with filters
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined) {
        params.set(key, String(value));
      }
    });
    
    const newUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : '');
    window.history.replaceState({}, '', newUrl);
    
  }, [filters]);

  // Load more function for infinite scroll
  const loadMore = async () => {
    if (!cursor || loadingMore || !hasMore) return;

    try {
      setLoadingMore(true);
      const data = await getRecentActivities(20, cursor, filters);
      setActivities(prev => [...prev, ...data.activities]);
      setCursor(data.pagination.nextCursor);
      setHasMore(data.pagination.hasMore);
    } catch (err) {
      console.error('Error loading more activities:', err);
      setError('Failed to load more activities. Please try again.');
    } finally {
      setLoadingMore(false);
    }
  };
  
  const handleFilterChange = (key: keyof ActivityFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value === '' ? undefined : value
    }));
    // Reset cursor and activities when filters change
    setCursor(null);
  };
  
  const clearFilters = () => {
    setFilters({});
    setUserSearch('');
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Link href="/dashboard" className="mr-4 p-2 rounded-lg hover:bg-gray-100">
              <ArrowLeft className="text-gray-600" />
            </Link>
            <h1 className="text-2xl font-bold text-gray-800">Recent Activities</h1>
          </div>
          
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center px-4 py-2 bg-white border rounded-lg hover:bg-gray-50"
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
            {Object.values(filters).some(v => v !== undefined) && (
              <span className="ml-2 bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {Object.values(filters).filter(v => v !== undefined).length}
              </span>
            )}
          </button>
        </div>
        
        {/* Filter panel */}
        {showFilters && (
          <div className="bg-white rounded-lg shadow p-4 mb-6 animate-fadeIn">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-semibold text-gray-700">Filter Activities</h2>
              <div className="flex space-x-2">
                <button 
                  onClick={clearFilters}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Clear all
                </button>
                <button 
                  onClick={() => setShowFilters(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Activity Type Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Activity Type
                </label>
                <select
                  value={filters.type || ''}
                  onChange={(e) => handleFilterChange('type', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Types</option>
                  <option value="task">Tasks</option>
                  <option value="custom_quiz">Quizzes</option>
                  <option value="referral">Referrals</option>
                  <option value="spin">Spin Wheel</option>
                </select>
              </div>
              
              {/* Task Type Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Task Type
                </label>
                <select
                  value={filters.task_type || ''}
                  onChange={(e) => handleFilterChange('task_type', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Tasks</option>
                  <option value="channel_join">Channel Join</option>
                  <option value="video_watch">Video Watch</option>
                  <option value="quiz">Quiz</option>
                  <option value="custom_quiz">Custom Quiz</option>
                  <option value="referral">Referral</option>
                  <option value="spin">Spin</option>
                </select>
              </div>
              
              {/* Date Range Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Calendar className="h-4 w-4 inline mr-1" />
                  Start Date
                </label>
                <input
                  type="date"
                  value={filters.start_date || ''}
                  onChange={(e) => handleFilterChange('start_date', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Calendar className="h-4 w-4 inline mr-1" />
                  End Date
                </label>
                <input
                  type="date"
                  value={filters.end_date || ''}
                  onChange={(e) => handleFilterChange('end_date', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              {/* User ID Filter */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <User className="h-4 w-4 inline mr-1" />
                  User ID
                </label>
                <div className="flex">
                  <input
                    type="number"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Enter user ID"
                    className="flex-1 px-3 py-2 border rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => handleFilterChange('user_id', userSearch ? parseInt(userSearch) : undefined)}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-r-md"
                  >
                    <Search className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
            
            {/* Active filters display */}
            {Object.values(filters).some(v => v !== undefined) && (
              <div className="mt-4 flex flex-wrap gap-2">
                {Object.entries(filters).map(([key, value]) => {
                  if (value === undefined) return null;
                  return (
                    <div key={key} className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-1 rounded-full flex items-center">
                      {key.replace('_', ' ')}: {value}
                      <button 
                        onClick={() => handleFilterChange(key as keyof ActivityFilters, undefined)}
                        className="ml-1 text-blue-600 hover:text-blue-800"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <span className="ml-3 text-gray-600">Loading activities...</span>
            </div>
          ) : error ? (
            <div className="py-8 text-center">
              <p className="text-red-500">{error}</p>
              <button 
                onClick={() => window.location.reload()}
                className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                Retry
              </button>
            </div>
          ) : activities.length > 0 ? (
            <div className="divide-y">
              {activities.map((item, idx) => (
                <div key={idx} className="py-4 flex justify-between items-center">
                  <div className="flex items-start gap-3">
                    <div className="mt-1">
                      {item.task_icon && (
                        <span className="text-xl" role="img" aria-label={item.task_type || 'task'}>
                          {item.task_icon}
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center">
                        <p className="font-medium text-gray-800">
                          {item.first_name} {item.last_name}
                        </p>
                        {item.username && (
                          <span className="text-gray-400 ml-1">@{item.username}</span>
                        )}
                        <span className="text-xs text-gray-500 ml-2">ID: {item.user_id}</span>
                      </div>
                      <p className="text-sm text-gray-500">{item.description}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-1 rounded">
                      +{item.points} points
                    </span>
                    <span className="text-xs text-gray-500 mt-1">
                      {item.type} / {item.task_type}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-gray-500">No activities found</div>
          )}
          
          {/* Infinite scroll loader */}
          {!loading && hasMore && (
            <div 
              ref={loadMoreRef} 
              className="py-4 flex justify-center"
            >
              {loadingMore ? (
                <div className="flex items-center">
                  <Loader2 className="w-5 h-5 text-blue-500 animate-spin mr-2" />
                  <span className="text-gray-500">Loading more...</span>
                </div>
              ) : (
                <div className="h-8" />
              )}
            </div>
          )}
          
          {!hasMore && activities.length > 0 && (
            <div className="py-4 text-center text-gray-500">
              You've reached the end!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ActivitiesPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
      </div>
    }>
      <ActivitiesContent />
    </Suspense>
  );
} 