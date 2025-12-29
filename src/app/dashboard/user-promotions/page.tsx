"use client";

import React, { useEffect, useState } from 'react';
import { 
  getUserPromotions, 
  getUserPromotion, 
  approveUserPromotion, 
  declineUserPromotion, 
  UserSubmittedPromotion, 
  PromotionEngagement 
} from '@/lib/api';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { 
  AlertCircle, 
  CheckCircle2, 
  XCircle, 
  Play, 
  Pause, 
  Loader2, 
  Calendar, 
  DollarSign, 
  Target, 
  Users, 
  Eye,
  ExternalLink,
  MessageSquare,
  Clock,
  Plus,
  X,
  HelpCircle
} from 'lucide-react';

export default function UserPromotionsPage() {
  const [promotions, setPromotions] = useState<UserSubmittedPromotion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalPromotions, setTotalPromotions] = useState(0);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  
  // Modal state
  const [selectedPromotion, setSelectedPromotion] = useState<UserSubmittedPromotion | null>(null);
  const [promotionEngagements, setPromotionEngagements] = useState<PromotionEngagement[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [validationQuestions, setValidationQuestions] = useState<Array<{
    question: string;
    correct_answer: string;
    wrong_answers: string[];
  }>>([]);
  const [showQuestions, setShowQuestions] = useState(false);

  const fetchPromotions = async (page = 1) => {
    setIsLoading(true);
    try {
      const params: any = { page, limit: 10 };
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.type = typeFilter;
      
      const response = await getUserPromotions(params);
      setPromotions(response.promotions);
      if (response.pagination) {
        setTotalPages(response.pagination.pages);
        setTotalPromotions(response.pagination.total);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load promotions');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPromotions(1);
  }, [statusFilter, typeFilter]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    fetchPromotions(page);
  };

  const openPromotionModal = async (promotion: UserSubmittedPromotion) => {
    setSelectedPromotion(promotion);
    setIsModalOpen(true);
    setModalLoading(true);
    setAdminNotes('');
    setValidationQuestions([]);
    setShowQuestions(false);
    
    try {
      const response = await getUserPromotion(promotion.id);
      setPromotionEngagements(response.engagements);
    } catch (e: any) {
      setError(e.message || 'Failed to load promotion details');
    } finally {
      setModalLoading(false);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedPromotion(null);
    setPromotionEngagements([]);
    setAdminNotes('');
    setValidationQuestions([]);
    setShowQuestions(false);
  };

  const handleAction = async (action: 'approve' | 'decline') => {
    if (!selectedPromotion) return;
    
    setActionLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      let result;
      switch (action) {
        case 'approve':
          result = await approveUserPromotion(selectedPromotion.id, adminNotes, validationQuestions.length > 0 ? validationQuestions : undefined);
          break;
        case 'decline':
          result = await declineUserPromotion(selectedPromotion.id, adminNotes);
          break;
      }
      
      setSuccess(result.message);
      setSelectedPromotion(result.promotion);
      fetchPromotions(currentPage);
      
      // Close modal for approve/decline actions
      if (action === 'approve' || action === 'decline') {
        setTimeout(closeModal, 1500);
      }
    } catch (e: any) {
      setError(e.message || `Failed to ${action} promotion`);
    } finally {
      setActionLoading(false);
    }
  };

  // Question management functions
  const addQuestion = () => {
    setValidationQuestions([...validationQuestions, {
      question: '',
      correct_answer: '',
      wrong_answers: ['', '']
    }]);
  };

  const removeQuestion = (index: number) => {
    const newQuestions = [...validationQuestions];
    newQuestions.splice(index, 1);
    setValidationQuestions(newQuestions);
  };

  const updateQuestion = (index: number, field: string, value: string) => {
    const newQuestions = [...validationQuestions];
    if (field === 'question') {
      newQuestions[index].question = value;
    } else if (field === 'correct_answer') {
      newQuestions[index].correct_answer = value;
    }
    setValidationQuestions(newQuestions);
  };

  const updateWrongAnswer = (questionIndex: number, answerIndex: number, value: string) => {
    const newQuestions = [...validationQuestions];
    newQuestions[questionIndex].wrong_answers[answerIndex] = value;
    setValidationQuestions(newQuestions);
  };

  const addWrongAnswer = (questionIndex: number) => {
    const newQuestions = [...validationQuestions];
    newQuestions[questionIndex].wrong_answers.push('');
    setValidationQuestions(newQuestions);
  };

  const removeWrongAnswer = (questionIndex: number, answerIndex: number) => {
    const newQuestions = [...validationQuestions];
    if (newQuestions[questionIndex].wrong_answers.length > 1) {
      newQuestions[questionIndex].wrong_answers.splice(answerIndex, 1);
      setValidationQuestions(newQuestions);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { color: 'bg-yellow-100 text-yellow-800', icon: Clock },
      approved: { color: 'bg-blue-100 text-blue-800', icon: CheckCircle2 },
      declined: { color: 'bg-red-100 text-red-800', icon: XCircle },
      active: { color: 'bg-green-100 text-green-800', icon: Play },
      completed: { color: 'bg-gray-100 text-gray-800', icon: Target },
      expired: { color: 'bg-red-100 text-red-800', icon: Calendar }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    const Icon = config.icon;
    
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        <Icon size={12} />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const getTypeBadge = (type: string) => {
    const typeConfig = {
      channel_join: { color: 'bg-purple-100 text-purple-800', label: 'Channel Join' },
      video_boost: { color: 'bg-orange-100 text-orange-800', label: 'Video Boost' }
    };
    
    const config = typeConfig[type as keyof typeof typeConfig] || typeConfig.channel_join;
    
    return (
      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  const formatBudget = (promotion: UserSubmittedPromotion) => {
    if (promotion.budget_points) {
      return `${promotion.budget_points} points`;
    }
    if (promotion.budget_cash) {
      return `$${promotion.budget_cash}`;
    }
    return 'No budget';
  };

  const formatExpiry = (dateStr: string) => {
    const date = parseISO(dateStr);
    const now = new Date();
    
    if (date < now) {
      return 'Expired';
    }
    
    return formatDistanceToNow(date, { addSuffix: true });
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">User Submitted Promotions</h1>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="declined">Declined</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="expired">Expired</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select 
              value={typeFilter} 
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">All Types</option>
              <option value="channel_join">Channel Join</option>
              <option value="video_boost">Video Boost</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-6 flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-md text-green-700">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <p>{success}</p>
        </div>
      )}

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Budget</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Progress</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expires</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-4 text-center text-gray-500">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading...
                    </div>
                  </td>
                </tr>
              ) : promotions.length > 0 ? promotions.map(promotion => (
                <tr key={promotion.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{promotion.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {promotion.photo_url && (
                        <img src={promotion.photo_url} alt="" className="w-8 h-8 rounded-full mr-3" />
                      )}
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {promotion.username || 'No username'}
                        </div>
                        <div className="text-sm text-gray-500">
                          {[promotion.first_name, promotion.last_name].filter(Boolean).join(' ') || 'Anonymous'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900 max-w-xs truncate">{promotion.title}</div>
                    <div className="text-sm text-gray-500 max-w-xs truncate">{promotion.description}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">{getTypeBadge(promotion.type)}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(promotion.status)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <div className="flex items-center gap-1">
                      {promotion.budget_points ? <Target size={14} /> : <DollarSign size={14} />}
                      {formatBudget(promotion)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 mb-1">
                      {promotion.current_views_joins} / {promotion.target_views_joins} 
                      {promotion.admin_profit_per_action && (
                        <span className="ml-1 text-xs text-green-600">
                          (Admin: {promotion.current_views_joins * promotion.admin_profit_per_action} pts)
                        </span>
                      )}
                    </div>
                    <div className="w-20 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full" 
                        style={{ width: `${Math.min((promotion.current_views_joins / promotion.target_views_joins) * 100, 100)}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {Math.round((promotion.current_views_joins / promotion.target_views_joins) * 100)}% complete
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatExpiry(promotion.expires_at)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button 
                      className="text-indigo-600 hover:text-indigo-900 mr-2" 
                      onClick={() => openPromotionModal(promotion)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={9} className="px-6 py-4 text-center text-gray-500">No promotions found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing <span className="font-medium">{((currentPage - 1) * 10) + 1}</span> to{' '}
                  <span className="font-medium">
                    {Math.min(currentPage * 10, totalPromotions)}
                  </span>{' '}
                  of <span className="font-medium">{totalPromotions}</span> promotions
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
                  
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
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
                    disabled={currentPage === totalPages}
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

      {/* Promotion Detail Modal */}
      {isModalOpen && selectedPromotion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-bold">Promotion #{selectedPromotion.id}</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <XCircle size={24} />
              </button>
            </div>

            {modalLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="ml-2">Loading promotion details...</span>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Promotion Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Promotion Details</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium text-gray-700">Title</label>
                        <p className="text-sm text-gray-900">{selectedPromotion.title}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">Description</label>
                        <p className="text-sm text-gray-900">{selectedPromotion.description}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">Target URL</label>
                        <a 
                          href={selectedPromotion.target_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                        >
                          {selectedPromotion.target_url}
                          <ExternalLink size={14} />
                        </a>
                      </div>
                      <div className="flex gap-4">
                        <div>
                          <label className="text-sm font-medium text-gray-700">Type</label>
                          <div className="mt-1">{getTypeBadge(selectedPromotion.type)}</div>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-700">Status</label>
                          <div className="mt-1">{getStatusBadge(selectedPromotion.status)}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold mb-3">Campaign Info</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-gray-700">Budget:</span>
                        <span className="text-sm text-gray-900">{formatBudget(selectedPromotion)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-gray-700">Target:</span>
                        <span className="text-sm text-gray-900">{selectedPromotion.target_views_joins}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-gray-700">Current:</span>
                        <span className="text-sm text-gray-900">{selectedPromotion.current_views_joins}</span>
                      </div>

                      {/* Per-Action Economics */}
                      <div className="pt-2 pb-1 border-t border-gray-100">
                        <span className="text-sm font-medium text-gray-700">Per-Action Economics:</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-gray-700">Cost per Action:</span>
                        <span className="text-sm text-gray-900">{selectedPromotion.cost_per_action || '-'} points</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-gray-700">User Reward:</span>
                        <span className="text-sm text-gray-900">{selectedPromotion.reward_per_action || '-'} points</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-gray-700">Admin Profit:</span>
                        <span className="text-sm text-gray-900">{selectedPromotion.admin_profit_per_action || '-'} points</span>
                      </div>

                      {/* Total Admin Profit */}
                      <div className="flex justify-between pt-2 pb-1 border-t border-gray-100">
                        <span className="text-sm font-medium text-gray-700">Total Admin Profit:</span>
                        <span className="text-sm font-semibold text-green-600">
                          {selectedPromotion.current_views_joins * (selectedPromotion.admin_profit_per_action || 0)} points
                        </span>
                      </div>

                      <div className="pt-2 pb-1 border-t border-gray-100"></div>
                      
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-gray-700">Expires:</span>
                        <span className="text-sm text-gray-900">{formatExpiry(selectedPromotion.expires_at)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-gray-700">Created:</span>
                        <span className="text-sm text-gray-900">
                          {formatDistanceToNow(parseISO(selectedPromotion.created_at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Validation Questions */}
                {selectedPromotion.validation_questions && selectedPromotion.validation_questions.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                      <MessageSquare size={20} />
                      Validation Questions ({selectedPromotion.validation_questions.length})
                    </h3>
                    <div className="space-y-4">
                      {selectedPromotion.validation_questions.map((question: any, index: number) => (
                        <div key={index} className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                          <div className="mb-2">
                            <span className="text-sm font-medium text-blue-900">Question {index + 1}:</span>
                            <p className="text-sm text-gray-900 mt-1">{question.question}</p>
                          </div>
                          <div className="mb-2">
                            <span className="text-xs font-medium text-green-700">✓ Correct Answer:</span>
                            <p className="text-sm text-green-800 bg-green-100 px-2 py-1 rounded mt-1 inline-block">
                              {question.correct_answer}
                            </p>
                          </div>
                          {question.wrong_answers && question.wrong_answers.length > 0 && (
                            <div>
                              <span className="text-xs font-medium text-red-700">✗ Wrong Answers:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {question.wrong_answers.map((wrongAnswer: string, idx: number) => (
                                  <span key={idx} className="text-sm text-red-800 bg-red-100 px-2 py-1 rounded">
                                    {wrongAnswer}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* User Info */}
                <div>
                  <h3 className="text-lg font-semibold mb-3">Submitted By</h3>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    {selectedPromotion.photo_url && (
                      <img src={selectedPromotion.photo_url} alt="" className="w-12 h-12 rounded-full" />
                    )}
                    <div>
                      <div className="font-medium text-gray-900">
                        {selectedPromotion.username || 'No username'}
                      </div>
                      <div className="text-sm text-gray-500">
                        {[selectedPromotion.first_name, selectedPromotion.last_name].filter(Boolean).join(' ') || 'Anonymous'}
                      </div>
                      <div className="text-xs text-gray-400">ID: {selectedPromotion.user_id}</div>
                    </div>
                  </div>
                </div>

                {/* Admin Notes */}
                {(selectedPromotion.status === 'pending' || selectedPromotion.admin_notes) && (
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Admin Notes</h3>
                    {selectedPromotion.status === 'pending' ? (
                      <textarea
                        value={adminNotes}
                        onChange={(e) => setAdminNotes(e.target.value)}
                        placeholder="Add notes for approval/decline..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                        rows={3}
                      />
                    ) : (
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-900">{selectedPromotion.admin_notes || 'No notes'}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-4 border-t">
                  {selectedPromotion.status === 'pending' && (
                    <>
                      <button
                        onClick={() => handleAction('approve')}
                        disabled={actionLoading}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                      >
                        {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        Approve
                      </button>
                      <button
                        onClick={() => handleAction('decline')}
                        disabled={actionLoading}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                      >
                        {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                        Decline
                      </button>
                    </>
                  )}
                  
                  <button
                    onClick={closeModal}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-md text-sm font-medium"
                  >
                    Close
                  </button>
                </div>

                {/* Engagements */}
                {promotionEngagements.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Engagements ({promotionEngagements.length})</h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Points</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {promotionEngagements.map((engagement) => (
                            <tr key={engagement.id}>
                              <td className="px-4 py-2">
                                <div className="flex items-center">
                                  {engagement.photo_url && (
                                    <img src={engagement.photo_url} alt="" className="w-6 h-6 rounded-full mr-2" />
                                  )}
                                  <div>
                                    <div className="text-sm font-medium text-gray-900">
                                      {engagement.username || 'No username'}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      {[engagement.first_name, engagement.last_name].filter(Boolean).join(' ') || 'Anonymous'}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-2">
                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                  engagement.engagement_type === 'view' 
                                    ? 'bg-blue-100 text-blue-800' 
                                    : 'bg-green-100 text-green-800'
                                }`}>
                                  {engagement.engagement_type === 'view' ? <Eye size={12} /> : <Users size={12} />}
                                  {engagement.engagement_type.charAt(0).toUpperCase() + engagement.engagement_type.slice(1)}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-900">+{engagement.points_awarded}</td>
                              <td className="px-4 py-2 text-sm text-gray-500">
                                {formatDistanceToNow(parseISO(engagement.created_at), { addSuffix: true })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
} 