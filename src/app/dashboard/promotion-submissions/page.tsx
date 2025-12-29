'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, ExternalLink, Search, Eye, User, Filter } from 'lucide-react';
import { useToast } from '@/components/ui/toaster';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { getPromotionSubmissions, updatePromotionSubmissionStatus, PromotionSubmission, PromotionSubmissionsFilters } from '@/lib/api';
import Image from 'next/image';

export default function PromotionSubmissions() {
  const [submissions, setSubmissions] = useState<PromotionSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewSubmission, setViewSubmission] = useState<PromotionSubmission | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [rewardAmount, setRewardAmount] = useState(0);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [totalSubmissions, setTotalSubmissions] = useState(0);
  
  // Filter states
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  const { toast } = useToast();

  const fetchSubmissions = async () => {
    try {
      setLoading(true);
      const filters: PromotionSubmissionsFilters = {
        status: statusFilter,
        platform: platformFilter,
        search: searchTerm || undefined,
        limit: 100
      };
      
      const data = await getPromotionSubmissions(filters);
      setSubmissions(data.submissions || []);
      setTotalSubmissions(data.pagination?.total || data.submissions?.length || 0);
    } catch (error) {
      console.error('Error fetching submissions:', error);
      toast({
        title: 'Error',
        description: 'Failed to load promotion submissions',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Debounced fetch for search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchSubmissions();
    }, searchTerm ? 500 : 0); // 500ms delay for search, immediate for other filters

    return () => clearTimeout(timeoutId);
  }, [statusFilter, platformFilter, searchTerm]);

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const handleStatusChange = async (submissionId: number, status: 'approved' | 'rejected') => {
    setProcessingId(submissionId);
    
    try {
      await updatePromotionSubmissionStatus(
        submissionId,
        status,
        reviewNotes,
        status === 'approved' ? rewardAmount : 0
      );
      
      toast({
        title: 'Success',
        description: `Submission ${status} successfully`,
      });
      
      setViewSubmission(null);
      fetchSubmissions();
    } catch (error) {
      console.error(`Error ${status}ing submission:`, error);
      toast({
        title: 'Error',
        description: `Failed to ${status} submission`,
        variant: 'destructive',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-800 border-green-200">Approved</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800 border-red-200">Rejected</Badge>;
      default:
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Pending</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Promotion Submissions</h1>
        <div className="text-sm text-gray-500">
          {submissions.length} of {totalSubmissions} submissions
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search by user, product..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Platform</label>
              <Select value={platformFilter} onValueChange={setPlatformFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All platforms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Platforms</SelectItem>
                  <SelectItem value="youtube">YouTube</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                  <SelectItem value="twitter">Twitter</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button 
                variant="outline" 
                onClick={() => {
                  setStatusFilter('all');
                  setPlatformFilter('all');
                  setSearchTerm('');
                }}
                className="w-full"
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : submissions.length === 0 ? (
        <Card className="text-center py-8">
          <CardContent>
            <p className="text-muted-foreground">
              {totalSubmissions === 0 ? 'No promotion submissions found.' : 'No submissions match your filters.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Review Submissions</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Views</TableHead>
                  <TableHead>Likes</TableHead>
                  <TableHead>Comments</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map((submission) => (
                  <TableRow key={submission.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {submission.photo_url ? (
                          <div className="relative h-8 w-8 rounded-full overflow-hidden">
                            <Image 
                              src={submission.photo_url} 
                              alt={submission.username || 'User'} 
                              fill
                              className="object-cover"
                              sizes="32px"
                            />
                          </div>
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">
                            <User className="w-4 h-4 text-gray-500" />
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-gray-900">
                            {submission.username || `User ${submission.user_id}`}
                          </div>
                          <div className="text-xs text-gray-500">
                            {submission.first_name && submission.last_name 
                              ? `${submission.first_name} ${submission.last_name}`
                              : `ID: ${submission.user_id}`
                            }
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{submission.product_name || `Product #${submission.product_id}`}</div>
                      <div className="text-xs text-gray-500">ID: {submission.product_id}</div>
                    </TableCell>
                    <TableCell>{submission.platform}</TableCell>
                    <TableCell>{submission.claimed_views.toLocaleString()}</TableCell>
                    <TableCell>{submission.claimed_likes.toLocaleString()}</TableCell>
                    <TableCell>{submission.claimed_comments.toLocaleString()}</TableCell>
                    <TableCell>{formatDate(submission.created_at)}</TableCell>
                    <TableCell>{getStatusBadge(submission.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex items-center gap-1"
                          onClick={() => window.open(submission.content_url, '_blank')}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex items-center gap-1"
                          onClick={() => setViewSubmission(submission)}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Review
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      
      {/* Submission Review Dialog */}
      <Dialog open={!!viewSubmission} onOpenChange={(open) => !open && setViewSubmission(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Review Promotion Submission</DialogTitle>
          </DialogHeader>
          
          {viewSubmission && (
            <div className="flex-1 overflow-y-auto space-y-6 pr-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="font-medium mb-1">User</h3>
                  <div className="flex items-center gap-2">
                    {viewSubmission.photo_url ? (
                      <div className="relative h-10 w-10 rounded-full overflow-hidden">
                        <Image 
                          src={viewSubmission.photo_url} 
                          alt={viewSubmission.username || 'User'} 
                          fill
                          className="object-cover"
                          sizes="40px"
                        />
                      </div>
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                        <User className="w-5 h-5 text-gray-500" />
                      </div>
                    )}
                    <div>
                      <div className="font-medium text-gray-900">
                        {viewSubmission.username || `User ${viewSubmission.user_id}`}
                      </div>
                      <div className="text-sm text-gray-500">
                        {viewSubmission.first_name && viewSubmission.last_name 
                          ? `${viewSubmission.first_name} ${viewSubmission.last_name}`
                          : 'Name not available'
                        }
                      </div>
                      <div className="text-xs text-gray-400">
                        ID: {viewSubmission.user_id}
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="font-medium mb-1">Product</h3>
                  <p>{viewSubmission.product_name}</p>
                </div>
                <div>
                  <h3 className="font-medium mb-1">Platform</h3>
                  <p>{viewSubmission.platform}</p>
                </div>
                <div>
                  <h3 className="font-medium mb-1">Submitted On</h3>
                  <p>{formatDate(viewSubmission.created_at)}</p>
                </div>
                <div>
                  <h3 className="font-medium mb-1">Status</h3>
                  <p>{getStatusBadge(viewSubmission.status)}</p>
                </div>
              </div>
              
              <div>
                <h3 className="font-medium mb-1">Content URL</h3>
                <div className="flex items-center gap-2">
                  <p className="text-blue-500 overflow-hidden text-ellipsis">{viewSubmission.content_url}</p>
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={() => window.open(viewSubmission.content_url, '_blank')}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="font-medium mb-1">View Count</h3>
                  <p>{viewSubmission.claimed_views.toLocaleString()}</p>
                </div>
                <div>
                  <h3 className="font-medium mb-1">Engagement Count</h3>
                  <p>{viewSubmission.claimed_likes.toLocaleString()}</p>
                </div>
                <div>
                  <h3 className="font-medium mb-1">Comments Count</h3>
                  <p>{viewSubmission.claimed_comments.toLocaleString()}</p>
                </div>
              </div>
              
              {viewSubmission.proof_url && (
                <div>
                  <h3 className="font-medium mb-1">Proof</h3>
                  <div className="flex items-center gap-2">
                    <p className="text-blue-500 overflow-hidden text-ellipsis">{viewSubmission.proof_url}</p>
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => window.open(viewSubmission.proof_url, '_blank')}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
              
              {viewSubmission.status === 'pending' && (
                <>
                  <div className="space-y-2">
                    <label className="font-medium">Review Notes</label>
                    <textarea
                      className="w-full p-2 border rounded"
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      rows={3}
                      placeholder="Add any notes about this submission..."
                    ></textarea>
                  </div>
                  
                  <div>
                    <label className="font-medium block mb-2">Reward Amount (points)</label>
                    <input
                      type="number"
                      className="w-full p-2 border rounded"
                      value={rewardAmount}
                      onChange={(e) => setRewardAmount(parseInt(e.target.value) || 0)}
                      min="0"
                      placeholder="Enter reward amount"
                    />
                  </div>
                  
                  <div className="flex justify-end gap-3">
                    <Button
                      variant="destructive"
                      onClick={() => handleStatusChange(viewSubmission.id, 'rejected')}
                      disabled={!!processingId}
                      className="flex items-center gap-2"
                    >
                      {processingId === viewSubmission.id ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      ) : (
                        <XCircle className="w-4 h-4" />
                      )}
                      Reject
                    </Button>
                    <Button
                      onClick={() => handleStatusChange(viewSubmission.id, 'approved')}
                      disabled={!!processingId || rewardAmount <= 0}
                      className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white border-green-600 hover:border-green-700 focus:ring-green-500 shadow-lg"
                    >
                      {processingId === viewSubmission.id ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      ) : (
                        <CheckCircle className="w-4 h-4" />
                      )}
                      Approve
                    </Button>
                  </div>
                </>
              )}
              
              {viewSubmission.status !== 'pending' && (
                <div>
                  <h3 className="font-medium mb-1">Review Notes</h3>
                  <p>{viewSubmission.admin_notes || 'No notes provided'}</p>
                  
                  <h3 className="font-medium mb-1 mt-4">Review Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-medium">Reviewed At</h4>
                      <p>{viewSubmission.reviewed_at ? formatDate(viewSubmission.reviewed_at) : 'N/A'}</p>
                    </div>
                    <div>
                      <h4 className="font-medium">Reviewed By</h4>
                      <p>{viewSubmission.reviewed_by || 'N/A'}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
