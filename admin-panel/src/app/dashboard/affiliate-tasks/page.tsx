'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Edit, Trash2, Eye, CheckCircle, XCircle, DollarSign, Users, TrendingUp, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency } from '@/lib/utils'
import { 
  getAffiliateTasks, 
  createAffiliateTask, 
  updateAffiliateTask, 
  deleteAffiliateTask, 
  getAffiliateTaskStats,
  AffiliateTask 
} from '@/lib/api'

interface TaskFormData {
  title: string
  description: string
  type: 'CPL' | 'CPA'
  target_link: string
  reward_amount: number
  max_completions: number | null
  verification_method: 'automatic' | 'manual'
  expires_at: string
}

const initialFormData: TaskFormData = {
  title: '',
  description: '',
  type: 'CPL',
  target_link: '',
  reward_amount: 0,
  max_completions: null,
  verification_method: 'manual',
  expires_at: ''
}

export default function AffiliateTasksPage() {
  const router = useRouter()
  const [tasks, setTasks] = useState<AffiliateTask[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [formData, setFormData] = useState<TaskFormData>(initialFormData)
  const [editingTask, setEditingTask] = useState<AffiliateTask | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()

  // Stats
  const [stats, setStats] = useState({
    totalTasks: 0,
    activeTasks: 0,
    totalCompletions: 0,
    totalRewardsPaid: 0
  })

  useEffect(() => {
    fetchTasks()
    fetchStats()
  }, [])

  const fetchTasks = async () => {
    try {
      const data = await getAffiliateTasks()
      setTasks(data.tasks)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch affiliate tasks",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const data = await getAffiliateTaskStats()
      setStats(data.stats)
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      if (editingTask) {
        await updateAffiliateTask(editingTask.id, formData)
      } else {
        await createAffiliateTask({
          ...formData,
          status: 'active'
        })
      }

      toast({
        title: "Success",
        description: editingTask ? "Task updated successfully" : "Task created successfully"
      })
      
      setIsCreateDialogOpen(false)
      setIsEditDialogOpen(false)
      setFormData(initialFormData)
      setEditingTask(null)
      fetchTasks()
      fetchStats()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save task",
        variant: "destructive"
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = (task: AffiliateTask) => {
    setEditingTask(task)
    setFormData({
      title: task.title,
      description: task.description,
      type: task.type,
      target_link: task.target_link,
      reward_amount: task.reward_amount,
      max_completions: task.max_completions,
      verification_method: task.verification_method,
      expires_at: task.expires_at ? new Date(task.expires_at).toISOString().split('T')[0] : ''
    })
    setIsEditDialogOpen(true)
  }

  const handleDelete = async (taskId: number) => {
    if (!confirm('Are you sure you want to delete this task?')) return

    try {
      await deleteAffiliateTask(taskId)
      toast({
        title: "Success",
        description: "Task deleted successfully"
      })
      fetchTasks()
      fetchStats()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete task",
        variant: "destructive"
      })
    }
  }

  const toggleTaskStatus = async (taskId: number, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active'
    
    try {
      // Find the current task to get its full data
      const currentTask = tasks.find(task => task.id === taskId)
      if (!currentTask) return

      await updateAffiliateTask(taskId, {
        title: currentTask.title,
        description: currentTask.description,
        type: currentTask.type,
        target_link: currentTask.target_link,
        reward_amount: currentTask.reward_amount,
        max_completions: currentTask.max_completions,
        verification_method: currentTask.verification_method,
        expires_at: currentTask.expires_at || '',
        status: newStatus
      })

      toast({
        title: "Success",
        description: `Task ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`
      })
      fetchTasks()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update task status",
        variant: "destructive"
      })
    }
  }

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      active: { label: 'Active', className: 'bg-green-100 text-green-800' },
      inactive: { label: 'Inactive', className: 'bg-gray-100 text-gray-800' },
      expired: { label: 'Expired', className: 'bg-red-100 text-red-800' }
    }
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.inactive
    return <Badge className={config.className}>{config.label}</Badge>
  }

  const getTypeBadge = (type: string) => {
    return (
      <Badge variant={type === 'CPL' ? 'default' : 'secondary'}>
        {type}
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Affiliate Tasks</h1>
          <p className="text-muted-foreground">
            Manage CPL and CPA affiliate marketing tasks
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button 
            variant="outline"
            onClick={() => router.push('/dashboard/affiliate-tasks/attempts')}
          >
            <FileText className="mr-2 h-4 w-4" />
            View Attempts
          </Button>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Task
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Affiliate Task</DialogTitle>
              <DialogDescription>
                Create a new CPL or CPA affiliate marketing task for users to complete
              </DialogDescription>
            </DialogHeader>
            <TaskForm 
              formData={formData}
              setFormData={setFormData}
              onSubmit={handleSubmit}
              submitting={submitting}
              isEdit={false}
            />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalTasks}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Tasks</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeTasks}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Completions</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCompletions}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rewards Paid</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalRewardsPaid)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tasks Table */}
      <Card>
        <CardHeader>
          <CardTitle>Affiliate Tasks</CardTitle>
          <CardDescription>
            Manage and monitor your affiliate marketing tasks
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
                  <TableHead>Task</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Reward</TableHead>
                  <TableHead>Completions</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{task.title}</div>
                        <div className="text-sm text-muted-foreground truncate max-w-xs">
                          {task.description}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getTypeBadge(task.type)}
                    </TableCell>
                    <TableCell>{formatCurrency(task.reward_amount)}</TableCell>
                    <TableCell>
                      {task.current_completions}
                      {task.max_completions && ` / ${task.max_completions}`}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(task.status)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(task)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleTaskStatus(task.id, task.status)}
                          disabled={task.status === 'expired'}
                        >
                          {task.status === 'active' ? (
                            <XCircle className="h-4 w-4" />
                          ) : (
                            <CheckCircle className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(task.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Affiliate Task</DialogTitle>
            <DialogDescription>
              Update the affiliate marketing task details
            </DialogDescription>
          </DialogHeader>
          <TaskForm 
            formData={formData}
            setFormData={setFormData}
            onSubmit={handleSubmit}
            submitting={submitting}
            isEdit={true}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Task Form Component
function TaskForm({ 
  formData, 
  setFormData, 
  onSubmit, 
  submitting, 
  isEdit 
}: {
  formData: TaskFormData
  setFormData: (data: TaskFormData) => void
  onSubmit: (e: React.FormEvent) => void
  submitting: boolean
  isEdit: boolean
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">Task Title</Label>
          <Input
            id="title"
            placeholder="Enter task title"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            required
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="type">Task Type</Label>
          <Select
            value={formData.type}
            onValueChange={(value: 'CPL' | 'CPA') => setFormData({ ...formData, type: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select task type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CPL">CPL (Cost Per Lead)</SelectItem>
              <SelectItem value="CPA">CPA (Cost Per Action)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="Describe what users need to do"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="target_link">Target Link</Label>
        <Input
          id="target_link"
          placeholder="https://example.com/affiliate-link"
          value={formData.target_link}
          onChange={(e) => setFormData({ ...formData, target_link: e.target.value })}
          required
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="reward_amount">Reward Amount (Birr)</Label>
          <Input
            id="reward_amount"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={formData.reward_amount}
            onChange={(e) => setFormData({ ...formData, reward_amount: parseFloat(e.target.value) || 0 })}
            required
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="max_completions">Max Completions (Optional)</Label>
          <Input
            id="max_completions"
            type="number"
            min="1"
            placeholder="Leave empty for unlimited"
            value={formData.max_completions || ''}
            onChange={(e) => setFormData({ 
              ...formData, 
              max_completions: e.target.value ? parseInt(e.target.value) : null 
            })}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="verification_method">Verification Method</Label>
          <Select
            value={formData.verification_method}
            onValueChange={(value: 'automatic' | 'manual') => 
              setFormData({ ...formData, verification_method: value })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select verification method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual Verification</SelectItem>
              <SelectItem value="automatic">Automatic Verification</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="expires_at">Expiry Date (Optional)</Label>
          <Input
            id="expires_at"
            type="date"
            value={formData.expires_at}
            onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
          />
        </div>
      </div>

      <div className="flex justify-end space-x-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
          ) : null}
          {isEdit ? 'Update Task' : 'Create Task'}
        </Button>
      </div>
    </form>
  )
}