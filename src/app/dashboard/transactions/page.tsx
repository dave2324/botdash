'use client';

import { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, RefreshCw, Download, Filter, X, DollarSign, ArrowUpCircle, ArrowDownCircle, Star, Wallet, Play } from 'lucide-react';
import { 
  getTransactions, 
  getChapaBalance, 
  processPendingTransactions, 
  exportTransactions,
  Transaction, 
  TransactionStatistics, 
  TransactionFilters 
} from '@/lib/api';

interface ChapaBalance {
  success: boolean;
  balance: number;
  ledger_balance: number;
  currency: string;
  pending_withdrawals?: {
    count: number;
    total_amount: number;
  };
  last_updated?: string;
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [statistics, setStatistics] = useState<TransactionStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState<TransactionFilters>({
    type: 'all',
    status: 'all',
    dateRange: 'all',
    search: ''
  });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [chapaBalance, setChapaBalance] = useState<ChapaBalance | null>(null);
  const [checkingBalance, setCheckingBalance] = useState(false);
  const [processingPending, setProcessingPending] = useState(false);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      
      const data = await getTransactions({
        ...filters,
        page
      });
      
      setTransactions(data.transactions || []);
      setStatistics(data.statistics || null);
      setTotalPages(data.totalPages || 1);
    } catch (error) {
      if (error instanceof Error && error.message.includes('401')) {
        console.error('Authentication failed - redirecting to login');
        window.location.href = '/login';
      } else {
        console.error('Failed to fetch transactions:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [page, filters]);

  const checkChapaBalance = async () => {
    try {
      setCheckingBalance(true);
      const data = await getChapaBalance();
      setChapaBalance(data);
    } catch (error) {
      console.error('Error checking balance:', error);
      alert('Error checking balance');
    } finally {
      setCheckingBalance(false);
    }
  };

  const handleProcessPendingTransactions = async () => {
    if (!confirm('Are you sure you want to process pending withdrawals? This will attempt to transfer funds for all eligible pending withdrawals.')) {
      return;
    }

    try {
      setProcessingPending(true);
      const data = await processPendingTransactions();
      alert(data.message || 'Processing triggered successfully');
      // Refresh transactions after processing
      await fetchTransactions();
      // Check balance again
      await checkChapaBalance();
    } catch (error) {
      console.error('Error processing pending transactions:', error);
      alert('Error processing pending transactions');
    } finally {
      setProcessingPending(false);
    }
  };

  const handleExportTransactions = async () => {
    try {
      const blob = await exportTransactions(filters);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error exporting transactions:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'processing': return 'bg-blue-100 text-blue-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'deposit': return <ArrowDownCircle className="h-5 w-5 text-green-600" />;
      case 'withdrawal': return <ArrowUpCircle className="h-5 w-5 text-red-600" />;
      case 'premium': return <Star className="h-5 w-5 text-purple-600" />;
      default: return <DollarSign className="h-5 w-5 text-gray-600" />;
    }
  };

  const formatAmount = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined || isNaN(amount)) {
      return '0.00';
    }
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Transactions</h1>
        <div className="flex gap-3">
          <button
            onClick={checkChapaBalance}
            disabled={checkingBalance}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
          >
            <Wallet className={`h-4 w-4 ${checkingBalance ? 'animate-spin' : ''}`} />
            Check Balance
          </button>
          <button
            onClick={handleProcessPendingTransactions}
            disabled={processingPending}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 disabled:opacity-50"
          >
            <Play className={`h-4 w-4 ${processingPending ? 'animate-spin' : ''}`} />
            Process Pending
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <Filter className="h-4 w-4" />
            Filters
          </button>
          <button
            onClick={handleExportTransactions}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
          <button
            onClick={fetchTransactions}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Chapa Balance Alert */}
      {chapaBalance && (
        <div className={`p-4 rounded-lg mb-6 ${
          chapaBalance.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
        }`}>
          <div className="flex justify-between items-start">
            <div>
              <h3 className={`font-semibold mb-2 ${
                chapaBalance.success ? 'text-green-800' : 'text-red-800'
              }`}>
                Chapa Balance Status
              </h3>
              {chapaBalance.success ? (
                <div className="space-y-1">
                  <p className="text-green-700">
                    Available Balance: <span className="font-bold">{formatAmount(chapaBalance.balance)} {chapaBalance.currency}</span>
                  </p>
                  {chapaBalance.pending_withdrawals && chapaBalance.pending_withdrawals.count > 0 && (
                    <p className="text-green-600">
                      Pending Withdrawals: {chapaBalance.pending_withdrawals.count} transactions 
                      ({formatAmount(chapaBalance.pending_withdrawals.total_amount)} ETB)
                    </p>
                  )}
                  {chapaBalance.last_updated && (
                    <p className="text-green-600 text-sm">
                      Last checked: {new Date(chapaBalance.last_updated).toLocaleString()}
                    </p>
                  )}
                  {chapaBalance.pending_withdrawals && 
                   chapaBalance.pending_withdrawals.total_amount > chapaBalance.balance && (
                    <p className="text-orange-600 font-semibold mt-2">
                      ⚠️ Insufficient balance for all pending withdrawals
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-red-700">Failed to retrieve balance</p>
              )}
            </div>
            <button
              onClick={() => setChapaBalance(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* Statistics Cards */}
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-sm text-gray-600 mb-1">Total Deposits</div>
            <div className="text-xl font-semibold">{statistics.total_deposits}</div>
            <div className="text-sm text-green-600">{formatAmount(statistics.total_deposit_amount)} ETB</div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-sm text-gray-600 mb-1">Total Withdrawals</div>
            <div className="text-xl font-semibold">{statistics.total_withdrawals}</div>
            <div className="text-sm text-red-600">{formatAmount(statistics.total_withdrawal_amount)} ETB</div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-sm text-gray-600 mb-1">Premium Payments</div>
            <div className="text-xl font-semibold">{statistics.total_premium_payments}</div>
            <div className="text-sm text-purple-600">{formatAmount(statistics.total_premium_amount)} ETB</div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-sm text-gray-600 mb-1">Pending Deposits</div>
            <div className="text-xl font-semibold text-yellow-600">{statistics.pending_deposits}</div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-sm text-gray-600 mb-1">Pending Withdrawals</div>
            <div className="text-xl font-semibold text-yellow-600">{statistics.pending_withdrawals}</div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-sm text-gray-600 mb-1">Net Balance</div>
            <div className="text-xl font-semibold">
              {formatAmount(statistics.total_deposit_amount - statistics.total_withdrawal_amount)} ETB
            </div>
          </div>
        </div>
      )}

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-white p-4 rounded-lg border border-gray-200 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={filters.type}
                onChange={(e) => setFilters({ ...filters, type: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="all">All Types</option>
                <option value="deposit">Deposits</option>
                <option value="withdrawal">Withdrawals</option>
                <option value="premium">Premium Payments</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date Range</label>
              <select
                value={filters.dateRange}
                onChange={(e) => setFilters({ ...filters, dateRange: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
              <input
                type="text"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                placeholder="User ID, Transaction ID..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => setFilters({ type: 'all', status: 'all', dateRange: 'all', search: '' })}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Clear Filters
            </button>
          </div>
        </div>
      )}

      {/* Transactions Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Transaction ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount (ETB)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Points
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
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
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    <div className="flex justify-center">
                      <RefreshCw className="h-6 w-6 animate-spin" />
                    </div>
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    No transactions found
                  </td>
                </tr>
              ) : (
                transactions.map((transaction) => (
                  <tr key={`${transaction.type}-${transaction.id}`} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {getTypeIcon(transaction.type)}
                        <span className="text-sm font-medium capitalize">{transaction.type}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 font-mono">{transaction.transaction_id}</div>
                      {transaction.chapa_reference && (
                        <div className="text-xs text-gray-500">Chapa: {transaction.chapa_reference}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">ID: {transaction.user_id}</div>
                      {transaction.user_username && (
                        <div className="text-xs text-gray-500">@{transaction.user_username}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {formatAmount(transaction.amount_etb)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {transaction.points ? formatAmount(transaction.points) : '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(transaction.status)}`}>
                        {transaction.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {new Date(transaction.created_at).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(transaction.created_at).toLocaleTimeString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => setSelectedTransaction(transaction)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Page <span className="font-medium">{page}</span> of{' '}
                  <span className="font-medium">{totalPages}</span>
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page === totalPages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Transaction Details Modal */}
      {selectedTransaction && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-screen overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-xl font-semibold">Transaction Details</h2>
                <button
                  onClick={() => setSelectedTransaction(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-600">Type</label>
                    <p className="font-medium capitalize">{selectedTransaction.type}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Status</label>
                    <p>
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(selectedTransaction.status)}`}>
                        {selectedTransaction.status}
                      </span>
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Transaction ID</label>
                    <p className="font-mono text-sm">{selectedTransaction.transaction_id}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Amount (ETB)</label>
                    <p className="font-medium">{formatAmount(selectedTransaction.amount_etb)}</p>
                  </div>
                  {selectedTransaction.points && (
                    <div>
                      <label className="text-sm text-gray-600">Points</label>
                      <p className="font-medium">{formatAmount(selectedTransaction.points)}</p>
                    </div>
                  )}
                  <div>
                    <label className="text-sm text-gray-600">User ID</label>
                    <p className="font-medium">{selectedTransaction.user_id}</p>
                  </div>
                  {selectedTransaction.account_number && (
                    <div>
                      <label className="text-sm text-gray-600">Account</label>
                      <p className="font-medium">
                        {selectedTransaction.account_type}: {selectedTransaction.account_number}
                      </p>
                    </div>
                  )}
                  {selectedTransaction.payment_method && (
                    <div>
                      <label className="text-sm text-gray-600">Payment Method</label>
                      <p className="font-medium">{selectedTransaction.payment_method}</p>
                    </div>
                  )}
                  <div>
                    <label className="text-sm text-gray-600">Created</label>
                    <p>{new Date(selectedTransaction.created_at).toLocaleString()}</p>
                  </div>
                  {selectedTransaction.completed_at && (
                    <div>
                      <label className="text-sm text-gray-600">Completed</label>
                      <p>{new Date(selectedTransaction.completed_at).toLocaleString()}</p>
                    </div>
                  )}
                  {selectedTransaction.failed_at && (
                    <div>
                      <label className="text-sm text-gray-600">Failed</label>
                      <p>{new Date(selectedTransaction.failed_at).toLocaleString()}</p>
                    </div>
                  )}
                </div>
                
                {selectedTransaction.failure_reason && (
                  <div>
                    <label className="text-sm text-gray-600">Failure Reason</label>
                    <p className="text-red-600">{selectedTransaction.failure_reason}</p>
                  </div>
                )}
                
                {selectedTransaction.admin_notes && (
                  <div>
                    <label className="text-sm text-gray-600">Admin Notes</label>
                    <p className="text-gray-700">{selectedTransaction.admin_notes}</p>
                  </div>
                )}
                
                {selectedTransaction.chapa_reference && (
                  <div>
                    <label className="text-sm text-gray-600">Chapa Reference</label>
                    <p className="font-mono text-sm">{selectedTransaction.chapa_reference}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}