"use client";

import React, { useEffect, useState } from 'react';
import { getReferrals, Referral, ReferralsResponse } from '@/lib/api';
import AdminLayout from '@/components/layout/AdminLayout';
import Link from 'next/link';
import Image from 'next/image';
import { formatDistanceToNow } from 'date-fns';

export default function ReferralsPage() {
  const [referralsData, setReferralsData] = useState<ReferralsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchReferrals = async (page = 1) => {
    try {
      setIsLoading(true);
      const data = await getReferrals(page);
      setReferralsData(data);
      setCurrentPage(page);
    } catch (error: any) {
      setError(error.message || 'Failed to load referrals');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReferrals();
  }, []);

  const handlePageChange = (page: number) => {
    fetchReferrals(page);
  };

  const filteredReferrals = referralsData?.referrals.filter(referral => {
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    return (
      referral.referrer_username?.toLowerCase().includes(searchLower) ||
      referral.referrer_first_name.toLowerCase().includes(searchLower) ||
      referral.referrer_last_name?.toLowerCase().includes(searchLower) ||
      referral.referred_username?.toLowerCase().includes(searchLower) ||
      referral.referred_first_name.toLowerCase().includes(searchLower) ||
      referral.referred_last_name?.toLowerCase().includes(searchLower) ||
      referral.referrer_id.toString().includes(searchLower) ||
      referral.referred_id.toString().includes(searchLower)
    );
  });

  return (
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Referrals</h1>
          <div className="w-64">
            <input
              type="text"
              placeholder="Search referrals..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 p-4 mb-6 rounded-md text-red-700">
            {error}
          </div>
        )}

        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Referrer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Referred User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Points Awarded
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                      Loading referrals...
                    </td>
                  </tr>
                ) : filteredReferrals && filteredReferrals.length > 0 ? (
                  filteredReferrals.map((referral) => (
                    <tr key={referral.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {referral.id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 mr-4">
                            {referral.referrer_photo_url ? (
                              <div className="relative h-10 w-10 rounded-full overflow-hidden">
                                <Image 
                                  src={referral.referrer_photo_url} 
                                  alt={referral.referrer_username || 'Profile picture'} 
                                  fill
                                  className="object-cover"
                                  sizes="40px"
                                />
                              </div>
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                                <span className="text-gray-500 font-medium text-sm">
                                  {(referral.referrer_first_name?.[0] || referral.referrer_username?.[0] || '?').toUpperCase()}
                                </span>
                              </div>
                            )}
                          </div>
                          <div>
                            <Link href={`/dashboard/users/${referral.referrer_id}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-900">
                              {referral.referrer_username || 'No username'}
                            </Link>
                            <div className="text-sm text-gray-500">
                              {[referral.referrer_first_name, referral.referrer_last_name].filter(Boolean).join(' ') || 'Anonymous'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 mr-4">
                            {referral.referred_photo_url ? (
                              <div className="relative h-10 w-10 rounded-full overflow-hidden">
                                <Image 
                                  src={referral.referred_photo_url} 
                                  alt={referral.referred_username || 'Profile picture'} 
                                  fill
                                  className="object-cover"
                                  sizes="40px"
                                />
                              </div>
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                                <span className="text-gray-500 font-medium text-sm">
                                  {(referral.referred_first_name?.[0] || referral.referred_username?.[0] || '?').toUpperCase()}
                                </span>
                              </div>
                            )}
                          </div>
                          <div>
                            <Link href={`/dashboard/users/${referral.referred_id}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-900">
                              {referral.referred_username || 'No username'}
                            </Link>
                            <div className="text-sm text-gray-500">
                              {[referral.referred_first_name, referral.referred_last_name].filter(Boolean).join(' ') || 'Anonymous'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 font-medium">{referral.points_awarded}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDistanceToNow(new Date(referral.created_at), { addSuffix: true })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <Link href={`/dashboard/referrals/${referral.id}`} className="text-indigo-600 hover:text-indigo-900 mr-4">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                      No referrals found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {referralsData && referralsData.pagination && (
            <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    Showing <span className="font-medium">{((currentPage - 1) * referralsData.pagination.limit) + 1}</span> to{' '}
                    <span className="font-medium">
                      {Math.min(currentPage * referralsData.pagination.limit, referralsData.pagination.total)}
                    </span>{' '}
                    of <span className="font-medium">{referralsData.pagination.total}</span> referrals
                  </p>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    
                    {Array.from({ length: Math.min(5, referralsData.pagination.pages) }, (_, i) => {
                      let pageNum;
                      
                      if (referralsData.pagination.pages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= referralsData.pagination.pages - 2) {
                        pageNum = referralsData.pagination.pages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      
                      return (
                        <button
                          key={pageNum}
                          onClick={() => handlePageChange(pageNum)}
                          className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                            currentPage === pageNum
                              ? 'z-10 bg-indigo-50 border-indigo-500 text-indigo-600'
                              : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    
                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === referralsData.pagination.pages}
                      className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
  );
}