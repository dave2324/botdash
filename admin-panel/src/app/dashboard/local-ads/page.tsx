'use client'

import { useState, useEffect } from 'react'
import { Eye, CheckCircle, XCircle, Calendar, Target, BarChart3, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { formatDate, formatCurrency } from '@/lib/utils'
import {
  LocalAd,
  LocalAdStats,
  LocalAdSettings,
  getLocalAds,
  getLocalAdStats,
  reviewLocalAd,
  updateLocalAdStatus,
  getLocalAdSettings,
  updateLocalAdSettings
} from '@/lib/api'

interface ReviewData {
  status: 'approved' | 'rejected'
  admin_notes: string
}

export default function LocalAdsPage() {
  const [ads, setAds] = useState<LocalAd[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('pending')
  const [selectedAd, setSelectedAd] = useState<LocalAd | null>(null)
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false)
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false)
  const [reviewData, setReviewData] = useState<ReviewData>({ status: 'approved', admin_notes: '' })
  const [submitting, setSubmitting] = useState(false)
  const [settings, setSettings] = useState<LocalAdSettings[]>([])
  const { toast } = useToast()

  // Stats
  const [stats, setStats] = useState({
    totalAds: 0,
    activeAds: 0,
    totalRevenue: 0,
    totalImpressions: 0,
    totalClicks: 0,
    averageCTR: 0
  })

  useEffect(() => {
    fetchAds()
    fetchStats()
    fetchSettings()
  }, [activeTab])

  const fetchAds = async () => {
    setLoading(true)
    try {
      const data = await getLocalAds(activeTab)
      setAds(data.ads)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch ads",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const data = await getLocalAdStats()
      setStats(data.stats)
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }

  const fetchSettings = async () => {
    try {
      const data = await getLocalAdSettings()
      setSettings(data.settings)
    } catch (error) {
      console.error('Failed to fetch settings:', error)
    }
  }

  const handleReview = async (ad: LocalAd, action: 'approve' | 'reject') => {
    setSelectedAd(ad)
    setReviewData({ 
      status: action === 'approve' ? 'approved' : 'rejected', 
      admin_notes: '' 
    })
    setIsReviewDialogOpen(true)
  }

  const submitReview = async () => {
    if (!selectedAd) return

    setSubmitting(true)
    try {
      await reviewLocalAd(selectedAd.id, reviewData.status, reviewData.admin_notes)
      toast({
        title: "Success",
        description: `Ad ${reviewData.status} successfully`
      })
      
      setIsReviewDialogOpen(false)
      setSelectedAd(null)
      setReviewData({ status: 'approved', admin_notes: '' })
      fetchAds()
      fetchStats()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to review ad",
        variant: "destructive"
      })
    } finally {
      setSubmitting(false)
    }
  }

  const updateAdStatus = async (adId: number, newStatus: string) => {
    try {
      await updateLocalAdStatus(adId, newStatus)
      toast({
        title: "Success",
        description: `Ad status updated to ${newStatus}`
      })
      fetchAds()
      fetchStats()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update ad status",
        variant: "destructive"
      })
    }
  }

  const saveSettings = async (newSettings: LocalAdSettings[]) => {
    try {
      await updateLocalAdSettings(newSettings)
      toast({
        title: "Success",
        description: "Settings updated successfully"
      })
      setIsSettingsDialogOpen(false)
      fetchSettings()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update settings",
        variant: "destructive"
      })
    }
  }

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { label: 'Pending Review', className: 'bg-yellow-100 text-yellow-800' },
      approved: { label: 'Approved', className: 'bg-green-100 text-green-800' },
      rejected: { label: 'Rejected', className: 'bg-red-100 text-red-800' },
      active: { label: 'Active', className: 'bg-blue-100 text-blue-800' },
      completed: { label: 'Completed', className: 'bg-gray-100 text-gray-800' },
      paused: { label: 'Paused', className: 'bg-orange-100 text-orange-800' }
    }
    
    const config = statusConfig[status as keyof typeof statusConfig]
    return <Badge className={config.className}>{config.label}</Badge>
  }

  const getTypeBadge = (type: string) => {
    const typeConfig = {
      banner: { label: 'Banner', className: 'bg-blue-100 text-blue-800' },
      video: { label: 'Video', className: 'bg-purple-100 text-purple-800' },
      text: { label: 'Text', className: 'bg-green-100 text-green-800' }
    }
    
    const config = typeConfig[type as keyof typeof typeConfig]
    return <Badge className={config.className}>{config.label}</Badge>
  }

  const getPaymentBadge = (status: string) => {
    const statusConfig = {
      pending: { label: 'Payment Pending', className: 'bg-yellow-100 text-yellow-800' },
      paid: { label: 'Paid', className: 'bg-green-100 text-green-800' },
      failed: { label: 'Payment Failed', className: 'bg-red-100 text-red-800' }
    }
    
    const config = statusConfig[status as keyof typeof statusConfig]
    return <Badge className={config.className}>{config.label}</Badge>
  }

  const calculateCTR = (clicks: number, impressions: number) => {
    return impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) : '0.00'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Local Ads Management</h1>
          <p className="text-muted-foreground">
            Review and manage local advertising campaigns
          </p>
        </div>
        <Button onClick={() => setIsSettingsDialogOpen(true)}>
          Ad Settings
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Ads</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalAds}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Ads</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeAds}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalRevenue)}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Impressions</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalImpressions.toLocaleString()}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clicks</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalClicks.toLocaleString()}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg CTR</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.averageCTR.toFixed(2)}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for different statuses */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pending">Pending Review</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>
                {activeTab === 'pending' && 'Pending Review'}
                {activeTab === 'approved' && 'Approved Ads'}
                {activeTab === 'active' && 'Active Campaigns'}
                {activeTab === 'completed' && 'Completed Campaigns'}
                {activeTab === 'rejected' && 'Rejected Ads'}
              </CardTitle>
              <CardDescription>
                {activeTab === 'pending' && 'Ads waiting for your review and approval'}
                {activeTab === 'approved' && 'Approved ads ready to go live'}
                {activeTab === 'active' && 'Currently running ad campaigns'}
                {activeTab === 'completed' && 'Finished ad campaigns'}
                {activeTab === 'rejected' && 'Rejected ads with reasons'}
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
                      <TableHead>Advertiser</TableHead>
                      <TableHead>Ad Details</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Budget</TableHead>
                      <TableHead>Performance</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ads.map((ad) => (
                      <TableRow key={ad.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{ad.advertiser_name}</div>
                            <div className="text-sm text-muted-foreground">
                              {ad.advertiser_email}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium truncate max-w-xs">{ad.ad_title}</div>
                            <div className="text-sm text-muted-foreground truncate max-w-xs">
                              {ad.ad_description}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {ad.duration_days} days • Created {formatDate(ad.created_at)}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {getTypeBadge(ad.ad_type)}
                        </TableCell>
                        <TableCell>{formatCurrency(ad.budget_amount)}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div>{ad.impressions.toLocaleString()} views</div>
                            <div>{ad.clicks} clicks</div>
                            <div className="text-muted-foreground">
                              {calculateCTR(ad.clicks, ad.impressions)}% CTR
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {getPaymentBadge(ad.payment_status)}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {getStatusBadge(ad.status)}
                            {activeTab === 'active' && (
                              <Select
                                value={ad.status}
                                onValueChange={(value) => updateAdStatus(ad.id, value)}
                              >
                                <SelectTrigger className="w-32 h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="active">Active</SelectItem>
                                  <SelectItem value="paused">Paused</SelectItem>
                                  <SelectItem value="completed">Complete</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          </div>
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
                                  <DialogTitle>Ad Details</DialogTitle>
                                  <DialogDescription>
                                    Review the complete ad submission
                                  </DialogDescription>
                                </DialogHeader>
                                <AdDetails ad={ad} />
                              </DialogContent>
                            </Dialog>
                            
                            {ad.status === 'pending' && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleReview(ad, 'approve')}
                                  className="text-green-600 hover:text-green-700"
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleReview(ad, 'reject')}
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
              {reviewData.status === 'approved' ? 'Approve' : 'Reject'} Ad
            </DialogTitle>
            <DialogDescription>
              {reviewData.status === 'approved' 
                ? 'Approve this ad to make it available for display'
                : 'Reject this ad with a reason'
              }
            </DialogDescription>
          </DialogHeader>
          
          {selectedAd && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded">
                <h4 className="font-medium">{selectedAd.ad_title}</h4>
                <p className="text-sm text-muted-foreground">
                  Advertiser: {selectedAd.advertiser_name} • 
                  Budget: {formatCurrency(selectedAd.budget_amount)}
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
                      : 'Explain why this ad is being rejected...'
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
                  {reviewData.status === 'approved' ? 'Approve Ad' : 'Reject Ad'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={isSettingsDialogOpen} onOpenChange={setIsSettingsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ad Settings</DialogTitle>
            <DialogDescription>
              Configure advertising platform settings
            </DialogDescription>
          </DialogHeader>
          <AdSettings 
            settings={settings} 
            onSave={saveSettings}
            onCancel={() => setIsSettingsDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Ad Details Component
function AdDetails({ ad }: { ad: LocalAd }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label className="text-sm font-medium">Ad Title:</Label>
          <p className="text-sm">{ad.ad_title}</p>
        </div>
        <div>
          <Label className="text-sm font-medium">Ad Type:</Label>
          <p className="text-sm">{ad.ad_type}</p>
        </div>
      </div>
      
      <div>
        <Label className="text-sm font-medium">Description:</Label>
        <p className="text-sm bg-gray-50 p-3 rounded border">{ad.ad_description}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label className="text-sm font-medium">Budget:</Label>
          <p className="text-sm">{formatCurrency(ad.budget_amount)}</p>
        </div>
        <div>
          <Label className="text-sm font-medium">Duration:</Label>
          <p className="text-sm">{ad.duration_days} days</p>
        </div>
      </div>

      {ad.content_url && (
        <div>
          <Label className="text-sm font-medium">Content:</Label>
          <div className="mt-2">
            {ad.ad_type === 'video' ? (
              <video controls className="w-full max-w-md">
                <source src={`/api/uploads/${ad.content_url}`} />
              </video>
            ) : ad.ad_type === 'banner' ? (
              <img 
                src={`/api/uploads/${ad.content_url}`} 
                alt={ad.ad_title}
                className="max-w-md rounded border"
              />
            ) : (
              <a 
                href={`/api/uploads/${ad.content_url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                View Content File
              </a>
            )}
          </div>
        </div>
      )}

      {ad.target_url && (
        <div>
          <Label className="text-sm font-medium">Target URL:</Label>
          <a 
            href={ad.target_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline text-sm block"
          >
            {ad.target_url}
          </a>
        </div>
      )}

      {ad.target_demographics && (
        <div>
          <Label className="text-sm font-medium">Target Demographics:</Label>
          <pre className="text-sm bg-gray-50 p-3 rounded border overflow-x-auto">
            {JSON.stringify(ad.target_demographics, null, 2)}
          </pre>
        </div>
      )}

      {ad.admin_notes && (
        <div>
          <Label className="text-sm font-medium">Admin Notes:</Label>
          <p className="text-sm bg-blue-50 p-3 rounded border">{ad.admin_notes}</p>
        </div>
      )}
    </div>
  )
}

// Ad Settings Component
function AdSettings({ 
  settings, 
  onSave, 
  onCancel 
}: { 
  settings: LocalAdSettings[]
  onSave: (settings: LocalAdSettings[]) => void
  onCancel: () => void
}) {
  const [localSettings, setLocalSettings] = useState(settings)

  const updateSetting = (key: string, value: string) => {
    setLocalSettings(prev => 
      prev.map(setting => 
        setting.setting_key === key 
          ? { ...setting, setting_value: value }
          : setting
      )
    )
  }

  const getSetting = (key: string) => {
    return localSettings.find(s => s.setting_key === key)?.setting_value || ''
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="min_budget">Minimum Budget (Birr)</Label>
        <Input
          id="min_budget"
          type="number"
          value={getSetting('min_budget')}
          onChange={(e) => updateSetting('min_budget', e.target.value)}
          placeholder="100"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="max_budget">Maximum Budget (Birr)</Label>
        <Input
          id="max_budget"
          type="number"
          value={getSetting('max_budget')}
          onChange={(e) => updateSetting('max_budget', e.target.value)}
          placeholder="10000"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="cost_per_click">Cost Per Click (Birr)</Label>
        <Input
          id="cost_per_click"
          type="number"
          step="0.01"
          value={getSetting('cost_per_click')}
          onChange={(e) => updateSetting('cost_per_click', e.target.value)}
          placeholder="0.50"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="cost_per_view">Cost Per View (Birr)</Label>
        <Input
          id="cost_per_view"
          type="number"
          step="0.01"
          value={getSetting('cost_per_view')}
          onChange={(e) => updateSetting('cost_per_view', e.target.value)}
          placeholder="0.10"
        />
      </div>

      <div className="flex justify-end space-x-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => onSave(localSettings)}>
          Save Settings
        </Button>
      </div>
    </div>
  )
}