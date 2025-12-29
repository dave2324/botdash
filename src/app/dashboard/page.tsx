'use client';

import { useEffect, useState } from 'react';
import { getDashboardSummary, DashboardSummary, getTopUsers, TopUser, getRecentActivities, RecentActivity } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [topUsers, setTopUsers] = useState<TopUser[]>([]);
  const [topUsersLoading, setTopUsersLoading] = useState(true);
  const [activities, setActivities] = useState<RecentActivity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    const fetchAll = () => {
      getDashboardSummary().then(data => {
        setSummary(data);
        setLoading(false);
      }).catch(() => setLoading(false));
      getTopUsers(5).then(users => {
        setTopUsers(users);
        setTopUsersLoading(false);
      }).catch(() => setTopUsersLoading(false));
      getRecentActivities(5).then(data => {
        setActivities(data.activities);
        setActivitiesLoading(false);
      }).catch(() => setActivitiesLoading(false));
    };
    fetchAll();
    interval = setInterval(fetchAll, 10000); // Poll every 10 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 text-gray-800">Dashboard Overview</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Stats Cards */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 font-medium">Total Users</p>
              <h3 className="text-2xl font-bold mt-1 text-gray-800">{loading ? '...' : summary?.totalUsers ?? '-'}</h3>
            </div>
            <div className="bg-blue-100 rounded-full p-3">
              <svg 
                width="24" 
                height="24" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                className="text-blue-500"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
          </div>
          <p className="text-green-600 text-sm font-medium mt-2">&nbsp;</p>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 font-medium">Active Quizzes</p>
              <h3 className="text-2xl font-bold mt-1 text-gray-800">{loading ? '...' : summary?.activeQuizzes ?? '-'}</h3>
            </div>
            <div className="bg-purple-100 rounded-full p-3">
              <svg 
                width="24" 
                height="24" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                className="text-purple-500"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <path d="M12 17h.01" />
              </svg>
            </div>
          </div>
          <p className="text-green-600 text-sm font-medium mt-2">&nbsp;</p>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 font-medium">Video Tasks</p>
              <h3 className="text-2xl font-bold mt-1 text-gray-800">{loading ? '...' : summary?.videoTasks ?? '-'}</h3>
            </div>
            <div className="bg-red-100 rounded-full p-3">
              <svg 
                width="24" 
                height="24" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                className="text-red-500"
              >
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            </div>
          </div>
          <p className="text-red-600 text-sm font-medium mt-2">&nbsp;</p>
        </div>
        
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">Recent Activity</h2>
          <div className="divide-y">
            {activitiesLoading ? (
              <div className="py-4 text-center text-gray-500">Loading...</div>
            ) : activities.length > 0 ? activities.map((item, idx) => (
              <div key={idx} className="py-3 flex justify-between items-center">
                <div>
                  <p className="font-medium text-gray-800">{item.first_name} {item.last_name} {item.username && <span className="text-gray-400 ml-1">@{item.username}</span>}</p>
                  <p className="text-sm text-gray-500">{item.description} • {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}</p>
                </div>
                <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-1 rounded">
                  +{item.points} points
                </span>
              </div>
            )) : (
              <div className="py-4 text-center text-gray-500">No recent activity</div>
            )}
          </div>
          <Link 
            href="/dashboard/activities"
            className="text-blue-600 text-sm font-medium mt-4 hover:underline"
          >
            View all activity →
          </Link>
        </div>
        
        {/* Top Performing Users */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">Top Performing Users</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="py-3 px-4 text-left text-gray-800">User</th>
                  <th className="py-3 px-4 text-left text-gray-800">Points</th>
                  <th className="py-3 px-4 text-left text-gray-800">Tasks</th>
                  <th className="py-3 px-4 text-left text-gray-800">Referrals</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {topUsersLoading ? (
                  <tr><td colSpan={4} className="py-4 text-center text-gray-500">Loading...</td></tr>
                ) : topUsers.length > 0 ? topUsers.map((user, idx) => (
                  <tr key={user.id}>
                    <td className="py-3 px-4 font-medium text-gray-800">
                      {user.first_name} {user.last_name} {user.username && <span className="text-gray-400 ml-1">@{user.username}</span>}
                    </td>
                    <td className="py-3 px-4 text-blue-600 font-medium">{user.points.toLocaleString()}</td>
                    <td className="py-3 px-4 text-gray-800">{user.completed_tasks_count}</td>
                    <td className="py-3 px-4 text-gray-800">{user.referral_count}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={4} className="py-4 text-center text-gray-500">No users found</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Link 
            href="/dashboard/users"
            className="text-blue-600 text-sm font-medium mt-4 hover:underline"
          >
            View all users →
          </Link>
        </div>
      </div>
    </div>
  );
} 