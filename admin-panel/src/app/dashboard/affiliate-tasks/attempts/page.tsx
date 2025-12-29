'use client'

import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, Eye, Download, ExternalLink, Clock, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { formatDate, formatCurrency } from '@/lib/utils'
import { getAffiliateTaskAttempts, reviewAffiliateTaskAttempt, ReviewData } from '@/lib/api'

// Interface for the actual API response structure
interface TaskAttempt {
  id: number
  user_id: string
  task_id: number
  status: 'pending' | 'approved' | 'completed' | 'rejected'
  proof_url: string | null
  proof_text: string | null
  ip_address: string | null
  device_id: string | null
  conversion_id: string | null
  admin_notes: string | null
  points_awarded: number
  cash_awarded: string
  created_at: string
  updated_at: string
  completed_at: string | null
  reviewed_by: number | null
  username: string | null
  first_name: string
  last_name: string
  photo_url: string
  task_title: string
  reward_amount: string
  reward_type: 'points' | 'cash'
}

export default function AffiliateTaskAttemptsPage() {
  const [attempts, setAttempts] = useState<TaskAttempt[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('pending')
  const [selectedAttempt, setSelectedAttempt] = useState<TaskAttempt | null>(null)
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false)
  const [reviewData, setReviewData] = useState<ReviewData>({ status: 'approved', admin_notes: '' })
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    fetchAttempts()
  }, [activeTab])

  const fetchAttempts = async () => {
    setLoading(true)
    try {
      const data = await getAffiliateTaskAttempts(activeTab)
      setAttempts(data.attempts)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch task attempts",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleReview = async (attempt: TaskAttempt, action: 'approve' | 'reject') => {
    setSelectedAttempt(attempt)
    setReviewData({ 
      status: action === 'approve' ? 'approved' : 'rejected', 
      admin_notes: '' 
    })
    setIsReviewDialogOpen(true)
  }

  const submitReview = async () => {
    if (!selectedAttempt) return

    setSubmitting(true)
    try {
      await reviewAffiliateTaskAttempt(selectedAttempt.id, reviewData)
      
      toast({
        title: "Success",
        description: `Task attempt ${reviewData.status} successfully`
      })
      
      setIsReviewDialogOpen(false)
      setSelectedAttempt(null)
      setReviewData({ status: 'approved', admin_notes: '' })
      fetchAttempts()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to review attempt",
        variant: "destructive"
      })
    } finally {
      setSubmitting(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { label: 'Pending', className: 'bg-yellow-100 text-yellow-800', icon: Clock },
      approved: { label: 'Approved', className: 'bg-green-100 text-green-800', icon: CheckCircle },
      completed: { label: 'Approved', className: 'bg-green-100 text-green-800', icon: CheckCircle },
      rejected: { label: 'Rejected', className: 'bg-red-100 text-red-800', icon: XCircle }
    }
    
    const config = statusConfig[status as keyof typeof statusConfig]
    const Icon = config.icon
    
    return (
      <Badge className={config.className}>
        <Icon className="w-3 h-3 mr-1" />
        {config.label}
      </Badge>
    )
  }


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Task Attempt Reviews</h1>
          <p className="text-muted-foreground">
            Review and approve affiliate task submissions
          </p>
        </div>
      </div>

      {/* Tabs for different statuses */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pending">Pending Review</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>
                {activeTab === 'pending' && 'Pending Reviews'}
                {activeTab === 'approved' && 'Approved Attempts'}
                {activeTab === 'rejected' && 'Rejected Attempts'}
              </CardTitle>
              <CardDescription>
                {activeTab === 'pending' && 'Task attempts waiting for your review'}
                {activeTab === 'approved' && 'Successfully approved task attempts (both new and legacy)'}
                {activeTab === 'rejected' && 'Rejected task attempts with reasons'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Task</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Reward</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attempts.map((attempt) => (
                      <TableRow key={attempt.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{attempt.username || 'Unknown'}</div>
                            <div className="text-sm text-muted-foreground">
                              {attempt.first_name} {attempt.last_name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              ID: {attempt.user_id}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium truncate max-w-xs">{attempt.task_title}</div>
                            <div className="text-sm text-muted-foreground">
                              Task #{attempt.task_id}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {attempt.reward_type === 'points' ? 'Points' : 'Cash'}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatCurrency(attempt.reward_amount)}</TableCell>
                        <TableCell>{formatDate(attempt.created_at)}</TableCell>
                        <TableCell>
                          {getStatusBadge(attempt.status)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                                <DialogHeader>
                                  <DialogTitle>Task Attempt Details</DialogTitle>
                                  <DialogDescription>
                                    Review the user's submission for task completion
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <div>
                                    <Label className="text-sm font-medium">Task:</Label>
                                    <p className="text-sm">{attempt.task_title}</p>
                                  </div>
                                  
                                  <div>
                                    <Label className="text-sm font-medium">User:</Label>
                                    <p className="text-sm">{attempt.username} ({attempt.first_name} {attempt.last_name})</p>
                                  </div>
                                  
                                  <div>
                                    <Label className="text-sm font-medium">User Proof Text:</Label>
                                    <p className="text-sm bg-gray-50 p-3 rounded border">
                                      {attempt.proof_text || 'No text provided'}
                                    </p>
                                  </div>

                                  {attempt.proof_url && (
                                    <div>
                                      <Label className="text-sm font-medium">Proof File:</Label>
                                      <div className="mt-2">
                                        {attempt.proof_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                                          <div className="space-y-2">
                                            <img 
                                              src={attempt.proof_url} 
                                              alt="Proof submission" 
                                              className="max-w-full max-h-96 rounded-lg border shadow-sm"
                                              onError={(e) => {
                                                e.currentTarget.style.display = 'none';
                                                e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                              }}
                                            />
                                            <div className="hidden">
                                              <p className="text-sm text-red-600">Failed to load image</p>
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => window.open(attempt.proof_url, '_blank')}
                                              >
                                                <ExternalLink className="w-3 h-3 mr-1" />
                                                Open in New Tab
                                              </Button>
                                            </div>
                                            <div className="flex items-center space-x-2">
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => window.open(attempt.proof_url, '_blank')}
                                              >
                                                <ExternalLink className="w-3 h-3 mr-1" />
                                                Open Full Size
                                              </Button>
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="flex items-center space-x-2">
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => window.open(attempt.proof_url, '_blank')}
                                            >
                                              <ExternalLink className="w-3 h-3 mr-1" />
                                              View File
                                            </Button>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {attempt.admin_notes && (
                                    <div>
                                      <Label className="text-sm font-medium">Admin Notes:</Label>
                                      <p className="text-sm bg-blue-50 p-3 rounded border">
                                        {attempt.admin_notes}
                                      </p>
                                    </div>
                                  )}

                                  <div>
                                    <Label className="text-sm font-medium">Reward:</Label>
                                    <p className="text-sm">{formatCurrency(attempt.reward_amount)} ({attempt.reward_type})</p>
                                  </div>

                                  <div>
                                    <Label className="text-sm font-medium">Submitted:</Label>
                                    <p className="text-sm">{formatDate(attempt.created_at)}</p>
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                            
                            {attempt.status === 'pending' && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleReview(attempt, 'approve')}
                                  className="text-green-600 hover:text-green-700"
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleReview(attempt, 'reject')}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Review Dialog */}
      <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewData.status === 'approved' ? 'Approve' : 'Reject'} Task Attempt
            </DialogTitle>
            <DialogDescription>
              {reviewData.status === 'approved' 
                ? 'Approve this task attempt and reward the user'
                : 'Reject this task attempt with a reason'
              }
            </DialogDescription>
          </DialogHeader>
          
          {selectedAttempt && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded">
                <h4 className="font-medium">{selectedAttempt.task_title}</h4>
                <p className="text-sm text-muted-foreground">
                  User: {selectedAttempt.username} • 
                  Reward: {formatCurrency(selectedAttempt.reward_amount)}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin_notes">
                  {reviewData.status === 'approved' ? 'Approval Notes (Optional)' : 'Rejection Reason'}
                </Label>
                <Textarea
                  id="admin_notes"
                  placeholder={
                    reviewData.status === 'approved' 
                      ? 'Add any notes about this approval...'
                      : 'Explain why this attempt is being rejected...'
                  }
                  value={reviewData.admin_notes}
                  onChange={(e) => setReviewData({ ...reviewData, admin_notes: e.target.value })}
                  required={reviewData.status === 'rejected'}
                />
              </div>

              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setIsReviewDialogOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={submitReview}
                  disabled={submitting || (reviewData.status === 'rejected' && !reviewData.admin_notes.trim())}
                  className={reviewData.status === 'approved' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
                >
                  {submitting ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  ) : null}
                  {reviewData.status === 'approved' ? 'Approve & Reward' : 'Reject Attempt'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}