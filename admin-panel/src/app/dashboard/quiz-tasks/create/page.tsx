'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Hash, Plus, X, AlertCircle, Save, ArrowLeft, GripVertical, ChevronDown } from 'lucide-react';
import { createQuiz, getQuizCategories } from '@/lib/api';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import TaskDependencySelector, { TaskDependencyValue } from '@/components/TaskDependencySelector';

interface Question {
  question_text: string;
  correct_answer: string;
  wrong_answers: string[];
}

interface QuizForm {
  title: string;
  hashtags: string[];
  points_per_question: number;
  category: string;
  questions: Question[];
}

export default function CreateQuizPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hashtagInput, setHashtagInput] = useState('');
  
  const [formData, setFormData] = useState<QuizForm>({
    title: '',
    hashtags: [],
    points_per_question: 10,
    category: '',
    questions: [{ question_text: '', correct_answer: '', wrong_answers: [''] }]
  });

  const [dependency, setDependency] = useState<TaskDependencyValue>({ id: null, type: '' });
  const [categories, setCategories] = useState<string[]>([]);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await getQuizCategories();
      if (Array.isArray(response.categories)) {
        setCategories(response.categories);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.category-dropdown')) {
        setShowCategoryDropdown(false);
      }
    };

    if (showCategoryDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCategoryDropdown]);

  const addHashtag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && hashtagInput.trim()) {
      e.preventDefault();
      if (!formData.hashtags.includes(hashtagInput.trim())) {
        setFormData({
          ...formData,
          hashtags: [...formData.hashtags, hashtagInput.trim()]
        });
      }
      setHashtagInput('');
    }
  };

  const removeHashtag = (tagToRemove: string) => {
    setFormData({
      ...formData,
      hashtags: formData.hashtags.filter(tag => tag !== tagToRemove)
    });
  };

  const addQuestion = () => {
    setFormData({
      ...formData,
      questions: [
        ...formData.questions,
        { question_text: '', correct_answer: '', wrong_answers: [''] }
      ]
    });
  };

  const removeQuestion = (index: number) => {
    setFormData({
      ...formData,
      questions: formData.questions.filter((_, i) => i !== index)
    });
  };

  const updateQuestion = (index: number, field: keyof Question | string, value: string, wrongAnswerIndex?: number) => {
    const updatedQuestions = [...formData.questions];
    if (field === 'wrong_answers' && typeof wrongAnswerIndex === 'number') {
      updatedQuestions[index].wrong_answers[wrongAnswerIndex] = value;
    } else {
      updatedQuestions[index] = {
        ...updatedQuestions[index],
        [field]: value
      };
    }
    setFormData({ ...formData, questions: updatedQuestions });
  };

  const addWrongAnswer = (questionIndex: number) => {
    const updatedQuestions = [...formData.questions];
    updatedQuestions[questionIndex].wrong_answers.push('');
    setFormData({ ...formData, questions: updatedQuestions });
  };

  const removeWrongAnswer = (questionIndex: number, answerIndex: number) => {
    const updatedQuestions = [...formData.questions];
    updatedQuestions[questionIndex].wrong_answers.splice(answerIndex, 1);
    setFormData({ ...formData, questions: updatedQuestions });
  };

  const handleDragEnd = (result: any) => {
    if (!result.destination) return;
    const items = Array.from(formData.questions);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setFormData({ ...formData, questions: items });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Validate form
      if (!formData.title.trim()) {
        throw new Error('Quiz title is required');
      }

      if (formData.questions.length === 0) {
        throw new Error('At least one question is required');
      }

      // Validate each question
      formData.questions.forEach((q, idx) => {
        if (!q.question_text.trim()) {
          throw new Error(`Question ${idx + 1} text is required`);
        }
        if (!q.correct_answer.trim()) {
          throw new Error(`Question ${idx + 1} correct answer is required`);
        }
        if (q.wrong_answers.some(a => !a.trim())) {
          throw new Error(`Question ${idx + 1} wrong answers are required`);
        }
      });

      await createQuiz({
        ...formData,
        category: formData.category || undefined,
        require_finish_task_id: dependency.id,
        require_finish_task_type: dependency.type
      });
      router.push('/dashboard/quiz-tasks');
    } catch (err) {
      console.error('Error creating quiz:', err);
      setError(err instanceof Error ? err.message : 'Failed to create quiz');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => router.back()}
            className="text-gray-600 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          <h1 className="text-2xl font-bold text-gray-800">Create New Quiz</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          <TaskDependencySelector
            value={dependency}
            onChange={setDependency}
            label="Unlock this quiz after completing:"
          />
        </div>
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
            <p className="text-red-600">{error}</p>
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quiz Title
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter quiz title"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Category
            </label>
            <div className="relative category-dropdown">
              <button
                type="button"
                onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-left flex items-center justify-between"
              >
                <span className={formData.category ? 'text-gray-900' : 'text-gray-500'}>
                  {formData.category ? (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                      {formData.category}
                    </span>
                  ) : (
                    'Select a category (optional)'
                  )}
                </span>
                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showCategoryDropdown ? 'rotate-180' : ''}`} />
              </button>
              
              {showCategoryDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, category: '' });
                        setShowCategoryDropdown(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 text-gray-500"
                    >
                      No category
                    </button>
                    {categories.map((category) => (
                      <button
                        key={category}
                        type="button"
                        onClick={() => {
                          setFormData({ ...formData, category });
                          setShowCategoryDropdown(false);
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 text-gray-900"
                      >
                        {category}
                      </button>
                    ))}
                    <div className="border-t border-gray-200 pt-1">
                      {showNewCategoryInput ? (
                        <div className="px-3 py-2">
                          <input
                            type="text"
                            value={newCategoryInput}
                            onChange={(e) => setNewCategoryInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && newCategoryInput.trim()) {
                                setFormData({ ...formData, category: newCategoryInput.trim() });
                                setShowCategoryDropdown(false);
                                setShowNewCategoryInput(false);
                                setNewCategoryInput('');
                              } else if (e.key === 'Escape') {
                                setShowNewCategoryInput(false);
                                setNewCategoryInput('');
                              }
                            }}
                            className="w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="Type new category name..."
                            autoFocus
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowNewCategoryInput(true)}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 text-blue-600 font-medium"
                        >
                          <Plus className="h-3 w-3 inline mr-1" />
                          Create new category
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Choose a category to help organize your quizzes
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Hashtags
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {formData.hashtags.map((tag, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center px-2.5 py-1.5 rounded-full text-sm font-medium bg-gray-100 text-gray-800"
                >
                  <Hash className="h-4 w-4 mr-1" />
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeHashtag(tag)}
                    className="ml-1 text-gray-500 hover:text-gray-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </span>
              ))}
            </div>
            <input
              type="text"
              value={hashtagInput}
              onChange={(e) => setHashtagInput(e.target.value)}
              onKeyDown={addHashtag}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Type hashtag and press Enter"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Points per Question
            </label>
            <input
              type="number"
              value={formData.points_per_question}
              onChange={(e) => setFormData({ ...formData, points_per_question: parseInt(e.target.value) || 0 })}
              min="1"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-gray-800">Questions</h2>
            <button
              type="button"
              onClick={addQuestion}
              className="flex items-center text-sm text-blue-600 hover:text-blue-800"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Question
            </button>
          </div>

          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="questions">
              {(provided) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="space-y-8"
                >
                  {formData.questions.map((question, questionIndex) => (
                    <Draggable key={questionIndex} draggableId={String(questionIndex)} index={questionIndex}>
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className="relative border rounded-lg p-4 bg-gray-50"
                        >
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 cursor-move" {...provided.dragHandleProps}>
                            <GripVertical className="h-5 w-5 text-gray-400" />
                          </div>
                          <div className="pl-8"> {/* Add left padding for drag handle */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Question {questionIndex + 1}
                              </label>
                              <input
                                type="text"
                                value={question.question_text}
                                onChange={(e) => updateQuestion(questionIndex, 'question_text', e.target.value)}
                                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Enter question text"
                              />
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Correct Answer
                              </label>
                              <input
                                type="text"
                                value={question.correct_answer}
                                onChange={(e) => updateQuestion(questionIndex, 'correct_answer', e.target.value)}
                                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 bg-green-50"
                                placeholder="Enter correct answer"
                              />
                            </div>

                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <label className="block text-sm font-medium text-gray-700">
                                  Wrong Answers
                                </label>
                                <button
                                  type="button"
                                  onClick={() => addWrongAnswer(questionIndex)}
                                  className="flex items-center text-sm text-blue-600 hover:text-blue-800"
                                >
                                  <Plus className="h-4 w-4 mr-1" />
                                  Add Option
                                </button>
                              </div>
                              <div className="space-y-2">
                                {question.wrong_answers.map((answer, answerIndex) => (
                                  <div key={answerIndex} className="flex items-center space-x-2">
                                    <input
                                      type="text"
                                      value={answer}
                                      onChange={(e) => updateQuestion(questionIndex, 'wrong_answers', e.target.value, answerIndex)}
                                      className="flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 bg-red-50"
                                      placeholder={`Wrong answer ${answerIndex + 1}`}
                                    />
                                    {question.wrong_answers.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => removeWrongAnswer(questionIndex, answerIndex)}
                                        className="text-gray-400 hover:text-red-500"
                                      >
                                        <X className="h-5 w-5" />
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>

        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 text-gray-700 bg-white border rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className={`px-4 py-2 text-white bg-blue-600 rounded-md flex items-center space-x-2
              ${isSubmitting ? 'opacity-75 cursor-not-allowed' : 'hover:bg-blue-700'}`}
          >
            <Save className="h-4 w-4" />
            <span>{isSubmitting ? 'Creating...' : 'Create Quiz'}</span>
          </button>
        </div>
      </form>
    </div>
  );
} 