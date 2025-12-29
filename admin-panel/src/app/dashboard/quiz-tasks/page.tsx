'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Hash, Plus, Edit2, Trash2, AlertCircle } from 'lucide-react';
import { Quiz as QuizType, getQuizzes, deleteQuiz, getQuizCategories } from '@/lib/api';

type Quiz = QuizType & { category?: string };

export default function QuizTasksPage() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('');
  const router = useRouter();

  useEffect(() => {
    fetchQuizzes();
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await getQuizCategories();
      if (Array.isArray(response.categories)) {
        setCategories(response.categories);
        if (!activeCategory && response.categories.length > 0) {
          setActiveCategory(response.categories[0]);
        }
      }
    } catch (error) {
      // fallback: do nothing, categories will be empty
    }
  };

  const fetchQuizzes = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await getQuizzes();
      setQuizzes(response.quizzes);
    } catch (error) {
      console.error('Error fetching quizzes:', error);
      setError('Failed to load quizzes. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this quiz? This action cannot be undone.')) return;
    
    try {
      await deleteQuiz(id);
      await fetchQuizzes(); // Refresh the list
    } catch (error) {
      console.error('Error deleting quiz:', error);
      alert('Failed to delete quiz. Please try again later.');
    }
  };

  const filteredQuizzes = quizzes
    .filter(quiz => (activeCategory ? (quiz.category || 'Uncategorized') === activeCategory : true))
    .filter(quiz => 
      quiz.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quiz.hashtags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
    );

  if (error) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="mx-auto h-12 w-12 text-red-500" />
        <p className="mt-2 text-red-600">{error}</p>
        <button 
          onClick={fetchQuizzes}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Quiz Tasks</h1>
        <button 
          onClick={() => router.push('/dashboard/quiz-tasks/create')}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center transition-colors"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add New Quiz
        </button>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold text-gray-800 mr-2">Active Quizzes</h2>
              {/* Category Tabs */}
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors duration-150 mr-1 mb-1
                    ${activeCategory === cat ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-100 text-gray-800 border-gray-300 hover:bg-blue-100'}`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="flex space-x-2 mt-2 md:mt-0">
              <input 
                type="text" 
                placeholder="Search quizzes or hashtags..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="text-center py-8">
              <AlertCircle className="mx-auto h-8 w-8 text-gray-400 animate-pulse" />
              <p className="mt-2 text-gray-500">Loading quizzes...</p>
            </div>
          ) : filteredQuizzes.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="mx-auto h-8 w-8 text-gray-400" />
              <p className="mt-2 text-gray-500">
                {searchTerm ? 'No quizzes match your search' : 'No quizzes found'}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="py-3 px-4 text-left text-gray-800">Quiz Name</th>
                  <th className="py-3 px-4 text-left text-gray-800">Hashtags</th>
                  <th className="py-3 px-4 text-left text-gray-800">Questions</th>
                  <th className="py-3 px-4 text-left text-gray-800">Points/Q</th>
                  <th className="py-3 px-4 text-left text-gray-800">Attempts</th>
                  <th className="py-3 px-4 text-left text-gray-800">Avg Score</th>
                  <th className="py-3 px-4 text-left text-gray-800">Status</th>
                  <th className="py-3 px-4 text-left text-gray-800">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredQuizzes.map((quiz) => (
                  <tr key={quiz.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4 font-medium">{quiz.title}</td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {quiz.hashtags.map((tag, idx) => (
                          <span 
                            key={idx}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800"
                          >
                            <Hash className="mr-1 h-3 w-3" />
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4">{Number(quiz.question_count) || 0}</td>
                    <td className="py-3 px-4">{quiz.points_per_question}</td>
                    <td className="py-3 px-4">{Number(quiz.attempt_count) || 0}</td>
                    <td className="py-3 px-4">
                      {Number(quiz.attempt_count) ? 
                        `${Math.round(Number(quiz.avg_score) || 0)}%` : 
                        'No attempts'
                      }
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        quiz.is_active 
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {quiz.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex space-x-2">
                        <button 
                          onClick={() => router.push(`/dashboard/quiz-tasks/${quiz.id}`)}
                          className="text-blue-600 hover:text-blue-800 transition-colors"
                          title="Edit Quiz"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(quiz.id)}
                          className="text-red-600 hover:text-red-800 transition-colors"
                          title="Delete Quiz"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Quiz Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold mb-4">Quiz Overview</h3>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span>Total Quizzes</span>
              <span className="font-semibold">{quizzes.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Active Quizzes</span>
              <span className="font-semibold">
                {quizzes.filter(q => q.is_active).length}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Total Questions</span>
              <span className="font-semibold">
                {quizzes.reduce((sum, q) => sum + (Number(q.question_count) || 0), 0)}
              </span>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold mb-4">User Engagement</h3>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span>Total Attempts</span>
              <span className="font-semibold">
                {quizzes.reduce((sum, q) => sum + (Number(q.attempt_count) || 0), 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Average Score</span>
              <span className="font-semibold">
                {(() => {
                  const totalAttempts = quizzes.reduce((sum, q) => sum + (Number(q.attempt_count) || 0), 0);
                  if (totalAttempts === 0) return "0";
                  
                  const weightedScore = quizzes.reduce(
                    (sum, q) => sum + ((Number(q.avg_score) || 0) * (Number(q.attempt_count) || 0)), 
                    0
                  );
                  
                  return `${Math.round(weightedScore / totalAttempts) || 0}%`;
                })()}
              </span>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold mb-4">Popular Hashtags</h3>
          <div className="flex flex-wrap gap-2">
            {Array.from(
              new Set(quizzes.flatMap(q => q.hashtags))
            ).map((tag, idx) => (
              <span 
                key={idx}
                className="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800"
              >
                <Hash className="mr-1 h-4 w-4" />
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
} 