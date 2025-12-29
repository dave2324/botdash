'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit, Trash2, Eye, BookOpen, Users, DollarSign, Award } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  Course,
  CourseStats,
  getCourses,
  getCourseStats,
  createCourse,
  updateCourse,
  deleteCourse
} from '@/lib/api'

interface CourseFormData {
  title: string
  description: string
  category: string
  type: 'free' | 'premium' | 'pay_to_access'
  price: number | null
  duration_hours: number | null
  difficulty_level: 'beginner' | 'intermediate' | 'advanced'
  points_reward: number
  certificate_enabled: boolean
  status: 'active' | 'inactive' | 'draft'
  thumbnail_url?: string | null
}

const initialFormData: CourseFormData = {
  title: '',
  description: '',
  category: '',
  type: 'free',
  price: null,
  duration_hours: null,
  difficulty_level: 'beginner',
  points_reward: 0,
  certificate_enabled: false,
  status: 'draft',
  thumbnail_url: null
}

const categories = [
  'Technology',
  'Business',
  'Marketing',
  'Finance',
  'Personal Development',
  'Health & Wellness',
  'Language Learning',
  'Creative Arts',
  'Science',
  'Other'
]

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [formData, setFormData] = useState<CourseFormData>(initialFormData)
  const [editingCourse, setEditingCourse] = useState<Course | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null)
  const { toast } = useToast()

  // Stats
  const [stats, setStats] = useState({
    totalCourses: 0,
    activeCourses: 0,
    totalEnrollments: 0,
    totalRevenue: 0
  })

  useEffect(() => {
    fetchCourses()
    fetchStats()
  }, [])

  const fetchCourses = async () => {
    try {
      const data = await getCourses()
      setCourses(data.courses)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch courses",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const data = await getCourseStats()
      // Transform API response to match frontend state structure
      setStats({
        totalCourses: parseInt(data.courses.total_courses),
        activeCourses: parseInt(data.courses.active_courses),
        totalEnrollments: parseInt(data.enrollments.total_enrollments),
        totalRevenue: 0 // Not provided by API yet
      })
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      // Instead of FormData, we'll use a regular object and send as JSON
      const courseData = {
        ...formData,
        // If there's a thumbnail file, we'd need to handle it differently
        // For now, let's use a URL if available from formData or null
        thumbnail_url: formData.thumbnail_url || null
      }
      
      // For files, you would typically:
      // 1. Upload to storage separately and get URL
      // 2. Include the URL in your JSON payload
      // This depends on your backend implementation

      if (editingCourse) {
        await updateCourse(editingCourse.id, courseData)
      } else {
        await createCourse(courseData)
      }

      toast({
        title: "Success",
        description: editingCourse ? "Course updated successfully" : "Course created successfully"
      })
      
      setIsCreateDialogOpen(false)
      setIsEditDialogOpen(false)
      setFormData(initialFormData)
      setEditingCourse(null)
      setThumbnailFile(null)
      fetchCourses()
      fetchStats()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save course",
        variant: "destructive"
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = (course: Course) => {
    setEditingCourse(course)
    // Map API fields to form fields
    const getCourseType = (course: Course) => {
      if (course.is_free) return 'free'
      if (course.require_premium) return 'premium'
      if (course.price && parseFloat(course.price) > 0) return 'pay_to_access'
      return 'free'
    }

    setFormData({
      title: course.title,
      description: course.description,
      category: course.category,
      type: getCourseType(course),
      price: course.price ? parseFloat(course.price) : null,
      duration_hours: course.duration_hours,
      difficulty_level: course.difficulty_level,
      points_reward: 0, // Not in API response
      certificate_enabled: course.certification_required,
      status: course.is_active ? 'active' : 'inactive',
      thumbnail_url: course.thumbnail_url
    })
    setIsEditDialogOpen(true)
  }

  const handleDelete = async (courseId: number) => {
    if (!confirm('Are you sure you want to delete this course? This will also delete all lessons and enrollments.')) return

    try {
      await deleteCourse(courseId)
      toast({
        title: "Success",
        description: "Course deleted successfully"
      })
      fetchCourses()
      fetchStats()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete course",
        variant: "destructive"
      })
    }
  }

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      active: { label: 'Active', className: 'bg-green-100 text-green-800' },
      inactive: { label: 'Inactive', className: 'bg-gray-100 text-gray-800' },
      draft: { label: 'Draft', className: 'bg-yellow-100 text-yellow-800' }
    }
    
    const config = statusConfig[status as keyof typeof statusConfig] || { label: status || 'Unknown', className: 'bg-gray-100 text-gray-800' }
    return <Badge className={config.className}>{config.label}</Badge>
  }

  const getTypeBadge = (type: string, price: number | null) => {
    const typeConfig = {
      free: { label: 'Free', className: 'bg-blue-100 text-blue-800' },
      premium: { label: 'Premium', className: 'bg-purple-100 text-purple-800' },
      pay_to_access: { label: `Pay ${formatCurrency(price || 0)}`, className: 'bg-orange-100 text-orange-800' }
    }
    
    const config = typeConfig[type as keyof typeof typeConfig] || { label: type || 'Unknown', className: 'bg-gray-100 text-gray-800' }
    return <Badge className={config.className}>{config.label}</Badge>
  }

  const getDifficultyBadge = (level: string) => {
    const levelConfig = {
      beginner: { label: 'Beginner', className: 'bg-green-100 text-green-800' },
      intermediate: { label: 'Intermediate', className: 'bg-yellow-100 text-yellow-800' },
      advanced: { label: 'Advanced', className: 'bg-red-100 text-red-800' }
    }
    
    const config = levelConfig[level as keyof typeof levelConfig] || { label: level || 'Unknown', className: 'bg-gray-100 text-gray-800' }
    return <Badge className={config.className}>{config.label}</Badge>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Course Management</h1>
          <p className="text-muted-foreground">
            Create and manage educational courses for users
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Course
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Course</DialogTitle>
              <DialogDescription>
                Create a new educational course with lessons and quizzes
              </DialogDescription>
            </DialogHeader>
            <CourseForm 
              formData={formData}
              setFormData={setFormData}
              onSubmit={handleSubmit}
              submitting={submitting}
              isEdit={false}
              thumbnailFile={thumbnailFile}
              setThumbnailFile={setThumbnailFile}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Courses</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCourses}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Courses</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeCourses}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Enrollments</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalEnrollments}</div>
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
      </div>

      {/* Courses Table */}
      <Card>
        <CardHeader>
          <CardTitle>Courses</CardTitle>
          <CardDescription>
            Manage your educational courses and track performance
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
                  <TableHead>Course</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Difficulty</TableHead>
                  <TableHead>Enrollments</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {courses.map((course) => (
                  <TableRow key={course.id}>
                    <TableCell>
                      <div className="flex items-center space-x-3">
                        {course.thumbnail_url && (
                          <img 
                            src={`/api/uploads/${course.thumbnail_url}`}
                            alt={course.title}
                            className="w-10 h-10 rounded object-cover"
                          />
                        )}
                        <div>
                          <div className="font-medium">{course.title}</div>
                          <div className="text-sm text-muted-foreground truncate max-w-xs">
                            {course.description}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {course.lesson_count} lessons • {course.duration_hours}h
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{course.category}</TableCell>
                    <TableCell>
                      {getTypeBadge(
                        course.is_free ? 'free' :
                        course.require_premium ? 'premium' :
                        (course.price && parseFloat(course.price) > 0) ? 'pay_to_access' : 'free',
                        course.price ? parseFloat(course.price) : null
                      )}
                    </TableCell>
                    <TableCell>
                      {getDifficultyBadge(course.difficulty_level)}
                    </TableCell>
                    <TableCell>{course.enrolled_count}</TableCell>
                    <TableCell>
                      {getStatusBadge(course.is_active ? 'active' : 'inactive')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(`/dashboard/courses/${course.id}/lessons`, '_blank')}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(course)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(course.id)}
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Course</DialogTitle>
            <DialogDescription>
              Update the course details and settings
            </DialogDescription>
          </DialogHeader>
          <CourseForm 
            formData={formData}
            setFormData={setFormData}
            onSubmit={handleSubmit}
            submitting={submitting}
            isEdit={true}
            thumbnailFile={thumbnailFile}
            setThumbnailFile={setThumbnailFile}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Course Form Component
function CourseForm({ 
  formData, 
  setFormData, 
  onSubmit, 
  submitting, 
  isEdit,
  thumbnailFile,
  setThumbnailFile
}: {
  formData: CourseFormData
  setFormData: (data: CourseFormData) => void
  onSubmit: (e: React.FormEvent) => void
  submitting: boolean
  isEdit: boolean
  thumbnailFile: File | null
  setThumbnailFile: (file: File | null) => void
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="basic">Basic Info</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
        </TabsList>
        
        <TabsContent value="basic" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="title">Course Title</Label>
              <Input
                id="title"
                placeholder="Enter course title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>{category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Describe what students will learn"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="thumbnail">Course Thumbnail</Label>
            <Input
              id="thumbnail"
              type="file"
              accept="image/*"
              onChange={(e) => setThumbnailFile(e.target.files?.[0] || null)}
            />
          </div>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="difficulty_level">Difficulty Level</Label>
              <Select
                value={formData.difficulty_level}
                onValueChange={(value: 'beginner' | 'intermediate' | 'advanced') => 
                  setFormData({ ...formData, difficulty_level: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select difficulty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">Beginner</SelectItem>
                  <SelectItem value="intermediate">Intermediate</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="duration_hours">Duration (Hours)</Label>
              <Input
                id="duration_hours"
                type="number"
                min="0"
                step="0.5"
                placeholder="0"
                value={formData.duration_hours || ''}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  duration_hours: e.target.value ? parseFloat(e.target.value) : null 
                })}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="points_reward">Points Reward</Label>
              <Input
                id="points_reward"
                type="number"
                min="0"
                placeholder="0"
                value={formData.points_reward}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  points_reward: parseInt(e.target.value) || 0 
                })}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value: 'active' | 'inactive' | 'draft') => 
                  setFormData({ ...formData, status: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="certificate_enabled"
              checked={formData.certificate_enabled}
              onChange={(e) => setFormData({ ...formData, certificate_enabled: e.target.checked })}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <Label htmlFor="certificate_enabled">Enable Certificate Generation</Label>
          </div>
        </TabsContent>

        <TabsContent value="pricing" className="space-y-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Course Type</Label>
              <Select
                value={formData.type}
                onValueChange={(value: 'free' | 'premium' | 'pay_to_access') => 
                  setFormData({ ...formData, type: value, price: value === 'free' ? null : formData.price })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select course type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free Course</SelectItem>
                  <SelectItem value="premium">Premium (Requires Premium Subscription)</SelectItem>
                  <SelectItem value="pay_to_access">Pay to Access (One-time Payment)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.type === 'pay_to_access' && (
              <div className="space-y-2">
                <Label htmlFor="price">Price (Birr)</Label>
                <Input
                  id="price"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.price || ''}
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    price: e.target.value ? parseFloat(e.target.value) : null 
                  })}
                  required
                />
              </div>
            )}

            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2">Course Type Explanation</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li><strong>Free:</strong> Available to all users at no cost</li>
                <li><strong>Premium:</strong> Requires active premium subscription</li>
                <li><strong>Pay to Access:</strong> One-time payment to unlock course permanently</li>
              </ul>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end space-x-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
          ) : null}
          {isEdit ? 'Update Course' : 'Create Course'}
        </Button>
      </div>
    </form>
  )
}