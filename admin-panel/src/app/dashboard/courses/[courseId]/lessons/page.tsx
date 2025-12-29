'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Plus, Edit, Trash2, PlayCircle, FileText, ArrowLeft, BookOpen, Clock } from 'lucide-react'
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
import { formatDate } from '@/lib/utils'
import { 
  getCourseForLessons, 
  getCourseLessons, 
  createLesson, 
  updateLesson, 
  deleteLesson, 
  reorderLesson,
  Course,
  Lesson 
} from '@/lib/api'

interface LessonFormData {
  title: string
  description: string
  content: string
  lesson_type: 'text' | 'video' | 'document' | 'interactive'
  order_index: number
  duration_minutes: number | null
  is_free_preview: boolean
}

const initialFormData: LessonFormData = {
  title: '',
  description: '',
  content: '',
  lesson_type: 'text',
  order_index: 1,
  duration_minutes: null,
  is_free_preview: false
}

export default function LessonsPage() {
  const params = useParams()
  const router = useRouter()
  const courseId = params.courseId as string
  
  const [course, setCourse] = useState<Course | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [formData, setFormData] = useState<LessonFormData>(initialFormData)
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [documentFile, setDocumentFile] = useState<File | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    if (courseId) {
      fetchCourse()
      fetchLessons()
    }
  }, [courseId])

  const fetchCourse = async () => {
    try {
      const data = await getCourseForLessons(courseId as string)
      setCourse(data.course)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch course details",
        variant: "destructive"
      })
    }
  }

  const fetchLessons = async () => {
    try {
      const data = await getCourseLessons(courseId as string)
      setLessons(data.lessons)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch lessons",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      // Convert form data to plain object for JSON
      const lessonData = {
        title: formData.title,
        description: formData.description,
        content_type: formData.lesson_type, // Map lesson_type to content_type
        content_text: formData.content, // Map content to content_text
        content_url: formData.content_url,
        order_index: parseInt(formData.order_index) || 1,
        duration_minutes: parseInt(formData.duration_minutes) || 0,
        is_required: formData.is_required === 'true' || formData.is_required === true
      }

      // Note: File uploads will need to be handled separately if needed
      // For now, we're just sending the JSON data without files

      if (editingLesson) {
        await updateLesson(courseId as string, editingLesson.id, lessonData)
      } else {
        await createLesson(courseId as string, lessonData)
      }

      toast({
        title: "Success",
        description: editingLesson ? "Lesson updated successfully" : "Lesson created successfully"
      })
      
      setIsCreateDialogOpen(false)
      setIsEditDialogOpen(false)
      setFormData(initialFormData)
      setEditingLesson(null)
      setVideoFile(null)
      setDocumentFile(null)
      fetchLessons()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save lesson",
        variant: "destructive"
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = (lesson: Lesson) => {
    setEditingLesson(lesson)
    setFormData({
      title: lesson.title,
      description: lesson.description,
      content: lesson.content,
      lesson_type: lesson.lesson_type,
      order_index: lesson.order_index,
      duration_minutes: lesson.duration_minutes,
      is_free_preview: lesson.is_free_preview
    })
    setIsEditDialogOpen(true)
  }

  const handleDelete = async (lessonId: number) => {
    if (!confirm('Are you sure you want to delete this lesson?')) return

    try {
      await deleteLesson(courseId as string, lessonId)
      toast({
        title: "Success",
        description: "Lesson deleted successfully"
      })
      fetchLessons()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete lesson",
        variant: "destructive"
      })
    }
  }

  const reorderLessons = async (lessonId: number, newOrder: number) => {
    try {
      await reorderLesson(courseId as string, lessonId, newOrder)
      toast({
        title: "Success",
        description: "Lesson order updated"
      })
      fetchLessons()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to reorder lesson",
        variant: "destructive"
      })
    }
  }

  const getTypeBadge = (type: string) => {
    const typeConfig = {
      text: { label: 'Text', className: 'bg-blue-100 text-blue-800', icon: FileText },
      video: { label: 'Video', className: 'bg-purple-100 text-purple-800', icon: PlayCircle },
      document: { label: 'Document', className: 'bg-green-100 text-green-800', icon: FileText },
      interactive: { label: 'Interactive', className: 'bg-orange-100 text-orange-800', icon: BookOpen }
    }

    const config = typeConfig[type as keyof typeof typeConfig] || {
      label: type || 'Unknown',
      className: 'bg-gray-100 text-gray-800',
      icon: FileText
    }
    const Icon = config.icon

    return (
      <Badge className={config.className}>
        <Icon className="w-3 h-3 mr-1" />
        {config.label}
      </Badge>
    )
  }

  const getNextOrderIndex = () => {
    return lessons.length > 0 ? Math.max(...lessons.map(l => l.order_index)) + 1 : 1
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="outline"
            onClick={() => router.push('/dashboard/courses')}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Courses
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {course?.title} - Lessons
            </h1>
            <p className="text-muted-foreground">
              Manage lessons for this course
            </p>
          </div>
        </div>
        
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setFormData({ ...initialFormData, order_index: getNextOrderIndex() })}>
              <Plus className="mr-2 h-4 w-4" />
              Add Lesson
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Lesson</DialogTitle>
              <DialogDescription>
                Add a new lesson to this course
              </DialogDescription>
            </DialogHeader>
            <LessonForm 
              formData={formData}
              setFormData={setFormData}
              onSubmit={handleSubmit}
              submitting={submitting}
              isEdit={false}
              videoFile={videoFile}
              setVideoFile={setVideoFile}
              documentFile={documentFile}
              setDocumentFile={setDocumentFile}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Course Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BookOpen className="h-5 w-5" />
            <span>Course Overview</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <div className="text-2xl font-bold">{lessons.length}</div>
              <div className="text-sm text-muted-foreground">Total Lessons</div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {lessons.reduce((sum, lesson) => sum + (lesson.duration_minutes || 0), 0)}m
              </div>
              <div className="text-sm text-muted-foreground">Total Duration</div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {lessons.filter(l => l.is_free_preview).length}
              </div>
              <div className="text-sm text-muted-foreground">Free Preview Lessons</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lessons Table */}
      <Card>
        <CardHeader>
          <CardTitle>Course Lessons</CardTitle>
          <CardDescription>
            Manage the lessons in this course
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Lesson</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Preview</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lessons.sort((a, b) => a.order_index - b.order_index).map((lesson) => (
                <TableRow key={lesson.id}>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <span className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-sm font-medium">
                        {lesson.order_index}
                      </span>
                      <div className="flex flex-col space-y-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => reorderLessons(lesson.id, lesson.order_index - 1)}
                          disabled={lesson.order_index === 1}
                          className="text-xs"
                        >
                          ↑
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => reorderLessons(lesson.id, lesson.order_index + 1)}
                          disabled={lesson.order_index === lessons.length}
                          className="text-xs"
                        >
                          ↓
                        </Button>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{lesson.title}</div>
                      <div className="text-sm text-muted-foreground truncate max-w-xs">
                        {lesson.description}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {getTypeBadge(lesson.lesson_type)}
                  </TableCell>
                  <TableCell>
                    {lesson.duration_minutes ? (
                      <div className="flex items-center space-x-1">
                        <Clock className="w-3 h-3" />
                        <span>{lesson.duration_minutes}m</span>
                      </div>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>
                    {lesson.is_free_preview ? (
                      <Badge className="bg-green-100 text-green-800">Free Preview</Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>{formatDate(lesson.created_at)}</TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(lesson)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(lesson.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Lesson</DialogTitle>
            <DialogDescription>
              Update the lesson details and content
            </DialogDescription>
          </DialogHeader>
          <LessonForm 
            formData={formData}
            setFormData={setFormData}
            onSubmit={handleSubmit}
            submitting={submitting}
            isEdit={true}
            videoFile={videoFile}
            setVideoFile={setVideoFile}
            documentFile={documentFile}
            setDocumentFile={setDocumentFile}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Lesson Form Component
function LessonForm({ 
  formData, 
  setFormData, 
  onSubmit, 
  submitting, 
  isEdit,
  videoFile,
  setVideoFile,
  documentFile,
  setDocumentFile
}: {
  formData: LessonFormData
  setFormData: (data: LessonFormData) => void
  onSubmit: (e: React.FormEvent) => void
  submitting: boolean
  isEdit: boolean
  videoFile: File | null
  setVideoFile: (file: File | null) => void
  documentFile: File | null
  setDocumentFile: (file: File | null) => void
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">Lesson Title</Label>
          <Input
            id="title"
            placeholder="Enter lesson title"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            required
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="lesson_type">Lesson Type</Label>
          <Select
            value={formData.lesson_type}
            onValueChange={(value: 'text' | 'video' | 'document' | 'interactive') => 
              setFormData({ ...formData, lesson_type: value })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select lesson type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Text Content</SelectItem>
              <SelectItem value="video">Video</SelectItem>
              <SelectItem value="document">Document</SelectItem>
              <SelectItem value="interactive">Interactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="Brief description of the lesson"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="content">Content</Label>
        <Textarea
          id="content"
          placeholder="Main lesson content (text, instructions, etc.)"
          value={formData.content}
          onChange={(e) => setFormData({ ...formData, content: e.target.value })}
          rows={6}
        />
      </div>

      {formData.lesson_type === 'video' && (
        <div className="space-y-2">
          <Label htmlFor="video">Video File</Label>
          <Input
            id="video"
            type="file"
            accept="video/*"
            onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
          />
        </div>
      )}

      {formData.lesson_type === 'document' && (
        <div className="space-y-2">
          <Label htmlFor="document">Document File</Label>
          <Input
            id="document"
            type="file"
            accept=".pdf,.doc,.docx,.ppt,.pptx"
            onChange={(e) => setDocumentFile(e.target.files?.[0] || null)}
          />
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="order_index">Order</Label>
          <Input
            id="order_index"
            type="number"
            min="1"
            placeholder="1"
            value={formData.order_index}
            onChange={(e) => setFormData({ 
              ...formData, 
              order_index: parseInt(e.target.value) || 1 
            })}
            required
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="duration_minutes">Duration (Minutes)</Label>
          <Input
            id="duration_minutes"
            type="number"
            min="0"
            placeholder="0"
            value={formData.duration_minutes || ''}
            onChange={(e) => setFormData({ 
              ...formData, 
              duration_minutes: e.target.value ? parseInt(e.target.value) : null 
            })}
          />
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="is_free_preview"
          checked={formData.is_free_preview}
          onChange={(e) => setFormData({ ...formData, is_free_preview: e.target.checked })}
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <Label htmlFor="is_free_preview">Allow Free Preview</Label>
      </div>

      <div className="flex justify-end space-x-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
          ) : null}
          {isEdit ? 'Update Lesson' : 'Create Lesson'}
        </Button>
      </div>
    </form>
  )
}