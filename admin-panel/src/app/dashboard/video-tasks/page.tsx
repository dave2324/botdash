"use client";

import React, { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { getYoutubeTasks, getYoutubeTask, addYoutubeTask, editYoutubeTask, YoutubeTask, YoutubeQuestion, YoutubeQuestionInput } from '@/lib/api';
import { TaskType } from '@/components/TaskDependencySelector';
import { Plus, X, Check, AlertCircle, HelpCircle, Trash2, BarChart2, Crown } from 'lucide-react';
import TaskDependencySelector, { TaskDependencyValue } from '@/components/TaskDependencySelector';

function parseIds(str: string): number[] {
  return str.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
}

// Question component for adding/editing
interface QuestionFormProps {
  index: number;
  question: string;
  correctAnswer: string;
  wrongAnswers: string[];
  questionType: string;
  maxAttempts: number;
  cooldownSeconds: number;
  onQuestionChange: (value: string) => void;
  onCorrectAnswerChange: (value: string) => void;
  onWrongAnswerChange: (index: number, value: string) => void;
  onAddWrongAnswer: () => void;
  onRemoveWrongAnswer: (index: number) => void;
  onRemoveQuestion: () => void;
  onQuestionTypeChange: (value: string) => void;
  onMaxAttemptsChange: (value: number) => void;
  onCooldownSecondsChange: (value: number) => void;
  isRemovable: boolean;
}

const QuestionForm: React.FC<QuestionFormProps> = ({
  index,
  question,
  correctAnswer,
  wrongAnswers,
  questionType,
  maxAttempts,
  cooldownSeconds,
  onQuestionChange,
  onCorrectAnswerChange,
  onWrongAnswerChange,
  onAddWrongAnswer,
  onRemoveWrongAnswer,
  onRemoveQuestion,
  onQuestionTypeChange,
  onMaxAttemptsChange,
  onCooldownSecondsChange,
  isRemovable
}) => {
  const isShortAnswer = questionType === 'short_answer';
  
  return (
    <div className="mt-2 p-4 border border-gray-200 rounded-md bg-gray-50 mb-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-medium text-gray-700">Question #{index + 1}</h3>
        {isRemovable && (
          <button 
            type="button"
            onClick={onRemoveQuestion}
            className="text-red-500 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      
      <div className="mb-3">
        <label className="block text-sm font-medium text-gray-700 mb-1">Question</label>
        <input 
          type="text" 
          required
          value={question} 
          onChange={e => onQuestionChange(e.target.value)} 
          className="w-full px-3 py-2 border border-gray-300 rounded-md" 
          placeholder="What is the main topic of this video?" 
        />
      </div>
      
      {/* Question Type Selector */}
      <div className="mb-3">
        <label className="block text-sm font-medium text-gray-700 mb-1">Question Type</label>
        <select
          value={questionType}
          onChange={e => onQuestionTypeChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        >
          <option value="multiple_choice">Multiple Choice</option>
          <option value="short_answer">Short Answer</option>
        </select>
        <p className="text-xs text-gray-500 mt-1">
          {isShortAnswer ? 
            "Short answer requires the user to type the exact correct answer" : 
            "Multiple choice provides options for the user to select from"}
        </p>
      </div>
      
      <div className="mb-3">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          <Check className="h-4 w-4 inline mr-1 text-green-500" />
          Correct Answer
        </label>
        <input 
          type="text" 
          required
          value={correctAnswer} 
          onChange={e => onCorrectAnswerChange(e.target.value)} 
          className="w-full px-3 py-2 border border-green-300 bg-green-50 rounded-md" 
          placeholder="The correct answer" 
        />
        {isShortAnswer && (
          <p className="text-xs text-gray-500 mt-1">
            The user must type this answer exactly (case insensitive) to get it correct
          </p>
        )}
      </div>
      
      {/* Only show wrong answers for multiple choice questions */}
      {!isShortAnswer && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700">
              <X className="h-4 w-4 inline mr-1 text-red-500" />
              Wrong Answers
            </label>
            <button 
              type="button"
              onClick={onAddWrongAnswer}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              + Add Another
            </button>
          </div>
          
          {wrongAnswers.map((answer, idx) => (
            <div key={idx} className="flex mb-2">
              <input 
                type="text" 
                value={answer} 
                onChange={e => onWrongAnswerChange(idx, e.target.value)} 
                className="flex-1 px-3 py-2 border border-red-300 bg-red-50 rounded-md" 
                placeholder={`Wrong answer ${idx + 1}`} 
              />
              {wrongAnswers.length > 1 && (
                <button 
                  type="button"
                  onClick={() => onRemoveWrongAnswer(idx)}
                  className="ml-2 p-2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          <p className="text-xs text-gray-500 mt-1">
            At least one wrong answer is recommended for better user experience
          </p>
        </div>
      )}
      
      {/* Trial limit settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Maximum Attempts</label>
          <input 
            type="number" 
            min="1"
            max="10"
            value={maxAttempts} 
            onChange={e => onMaxAttemptsChange(parseInt(e.target.value))} 
            className="w-full px-3 py-2 border border-gray-300 rounded-md" 
          />
          <p className="text-xs text-gray-500 mt-1">
            Number of attempts before cooldown (1-10)
          </p>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Cooldown (seconds)</label>
          <input 
            type="number" 
            min="0"
            max="3600"
            value={cooldownSeconds} 
            onChange={e => onCooldownSecondsChange(parseInt(e.target.value))} 
            className="w-full px-3 py-2 border border-gray-300 rounded-md" 
          />
          <p className="text-xs text-gray-500 mt-1">
            Seconds to wait after max attempts (0-3600)
          </p>
        </div>
      </div>
    </div>
  );
};

export default function YoutubeTasksPage() {
  const [tasks, setTasks] = useState<YoutubeTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [completionLimit, setCompletionLimit] = useState('');
  const [requirePremium, setRequirePremium] = useState(false);
  const [vpnCountries, setVpnCountries] = useState<string[]>([]);
  const [newCountry, setNewCountry] = useState('');
  const [availableCountries, setAvailableCountries] = useState<{code: string, name: string}[]>([]);
  const [adding, setAdding] = useState(false);
  // Toggle for user submitted promotions
  const [includeUserPromotions, setIncludeUserPromotions] = useState(false);
  // Switch: false = show all except user submitted, true = only user submitted
  
  // Questions for adding
  const [addQuestions, setAddQuestions] = useState<{
    question: string;
    correctAnswer: string;
    wrongAnswers: string[];
    question_type: string;
    max_attempts: number;
    cooldown_seconds: number;
  }[]>([]);
  const [showAddQuestions, setShowAddQuestions] = useState(false);
  
  // Edit task state
  const [editTask, setEditTask] = useState<YoutubeTask | null>(null);
  const [editExpiry, setEditExpiry] = useState('');
  const [editCompletionLimit, setEditCompletionLimit] = useState('');
  const [editDisabled, setEditDisabled] = useState(false);
  const [editRequirePremium, setEditRequirePremium] = useState(false);
  const [editVpnCountries, setEditVpnCountries] = useState<string[]>([]);
  const [editNewCountry, setEditNewCountry] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  
  // Questions for editing
  const [editQuestions, setEditQuestions] = useState<{
    id?: number;
    question: string;
    correctAnswer: string;
    wrongAnswers: string[];
    question_type: string;
    max_attempts: number;
    cooldown_seconds: number;
  }[]>([]);
  const [showEditQuestions, setShowEditQuestions] = useState(false);

  // Dependency state for add form
  const [addDependency, setAddDependency] = useState<TaskDependencyValue>({ id: null, type: '' });
  // Dependency state for edit form
  const [editDependency, setEditDependency] = useState<TaskDependencyValue>({ id: null, type: '' });

  const [analyticsModal, setAnalyticsModal] = useState<{ open: boolean; task: YoutubeTask | null; completions: any[] }>({ open: false, task: null, completions: [] });

  const fetchTasks = async () => {
    setIsLoading(true);
    try {
      // Only send param if showing only user submitted
      const res = includeUserPromotions
        ? await getYoutubeTasks({ includeUserPromotions: true })
        : await getYoutubeTasks();
      setTasks(res.tasks || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load tasks');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { 
    fetchTasks(); 
    fetchCountries();
  }, [includeUserPromotions]);

  // Fetch available countries from REST Countries API
  const fetchCountries = async () => {
    try {
      const response = await fetch('https://restcountries.com/v3.1/all?fields=name,cca2');
      const countries = await response.json();
      const sortedCountries = countries
        .map((country: any) => ({
          code: country.cca2,
          name: country.name.common
        }))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
      setAvailableCountries(sortedCountries);
    } catch (error) {
      console.error('Failed to fetch countries:', error);
    }
  };

  // VPN Countries handlers
  const addVpnCountry = () => {
    if (newCountry && !vpnCountries.includes(newCountry)) {
      setVpnCountries([...vpnCountries, newCountry]);
      setNewCountry('');
    }
  };

  const removeVpnCountry = (countryCode: string) => {
    setVpnCountries(vpnCountries.filter(c => c !== countryCode));
  };

  const addEditVpnCountry = () => {
    console.log('Adding VPN country:', editNewCountry);
    console.log('Current editVpnCountries:', editVpnCountries);
    if (editNewCountry && !editVpnCountries.includes(editNewCountry)) {
      const newCountries = [...editVpnCountries, editNewCountry];
      console.log('Setting new VPN countries:', newCountries);
      setEditVpnCountries(newCountries);
      setEditNewCountry('');
    } else {
      console.log('Country already exists or empty');
    }
  };

  const removeEditVpnCountry = (countryCode: string) => {
    setEditVpnCountries(editVpnCountries.filter(c => c !== countryCode));
  };

  const getCountryName = (code: string) => {
    const country = availableCountries.find(c => c.code === code);
    return country ? country.name : code;
  };

  // Add a new question to the add form
  const addNewQuestion = () => {
    setAddQuestions([
      ...addQuestions,
      { 
        question: '', 
        correctAnswer: '', 
        wrongAnswers: ['', ''],
        question_type: 'multiple_choice',
        max_attempts: 3,
        cooldown_seconds: 300
      }
    ]);
  };

  // Initialize questions when showing the add questions section
  useEffect(() => {
    if (showAddQuestions && addQuestions.length === 0) {
      addNewQuestion();
    }
  }, [showAddQuestions]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      // Prepare questions if enabled
      const questions = showAddQuestions 
        ? addQuestions.map(q => ({
            question: q.question,
            correct_answer: q.correctAnswer,
            wrong_answers: q.wrongAnswers.filter(a => a.trim() !== '')
          }))
        : undefined;
      await addYoutubeTask(
        youtubeUrl,
        expiresAt || null,
        questions,
        addDependency.id,
        addDependency.type,
        requirePremium,
        vpnCountries,
        completionLimit ? parseInt(completionLimit) : null
      );
      
      // Reset form
      setYoutubeUrl('');
      setExpiresAt('');
      setCompletionLimit('');
      setRequirePremium(false);
      setVpnCountries([]);
      setNewCountry('');
      setAddQuestions([]);
      setShowAddQuestions(false);
      setAddDependency({ id: null, type: '' });
      fetchTasks();
    } catch (e: any) {
      setError(e.response?.data?.message || e.message || 'Failed to add');
    } finally {
      setAdding(false);
    }
  };

  const openEdit = async (task: YoutubeTask) => {
    try {
      setEditLoading(true);
      
      // Fetch task with questions
      const taskData = await getYoutubeTask(task.id);
      
      setEditTask(taskData.task);
      setEditExpiry(taskData.task.expires_at ? taskData.task.expires_at.slice(0, 16) : '');
      setEditCompletionLimit(taskData.task.completion_limit ? taskData.task.completion_limit.toString() : '');
      setEditDisabled(taskData.task.disabled);
      setEditRequirePremium(taskData.task.require_premium || false);
      setEditVpnCountries(taskData.task.vpn_countries || []);
      setEditNewCountry('');
      setEditDependency({
        id: taskData.task.require_finish_task_id || null,
        type: (taskData.task.require_finish_task_type as TaskType) || ''
      });
      // Set questions data if exists
      if (taskData.questions && taskData.questions.length > 0) {
        setEditQuestions(taskData.questions.map(q => ({
          id: q.id,
          question: q.question,
          correctAnswer: q.correct_answer,
          wrongAnswers: [...q.wrong_answers],
          question_type: q.question_type || 'multiple_choice',
          max_attempts: q.max_attempts || 3,
          cooldown_seconds: q.cooldown_seconds || 300
        })));
        setShowEditQuestions(true);
      } else {
        setEditQuestions([]);
        setShowEditQuestions(false);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load task details');
    } finally {
      setEditLoading(false);
    }
  };

  const closeEdit = () => {
    setEditTask(null);
    setEditExpiry('');
    setEditCompletionLimit('');
    setEditDisabled(false);
    setEditRequirePremium(false);
    setEditVpnCountries([]);
    setEditNewCountry('');
    setEditQuestions([]);
    setShowEditQuestions(false);
    setEditLoading(false);
  };

  // Add a new question to the edit form
  const addNewEditQuestion = () => {
    setEditQuestions([
      ...editQuestions,
      {
        question: '',
        correctAnswer: '',
        wrongAnswers: ['', ''],
        question_type: 'multiple_choice',
        max_attempts: 3,
        cooldown_seconds: 300
      }
    ]);
  };

  // Initialize questions when showing the edit questions section
  useEffect(() => {
    if (showEditQuestions && editQuestions.length === 0) {
      addNewEditQuestion();
    }
  }, [showEditQuestions]);

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTask) return;
    setEditLoading(true);
    setError(null);
    try {
      // Prepare questions based on showEditQuestions state
      const questions = showEditQuestions 
        ? editQuestions.map(q => ({
            id: q.id, // include id for existing questions
            question: q.question,
            correct_answer: q.correctAnswer,
            wrong_answers: q.wrongAnswers.filter(a => a.trim() !== '')
          }))
        : []; // Send empty array to remove all questions
      
      console.log('Saving edit with VPN countries:', editVpnCountries);
      console.log('Full edit data:', {
        expires_at: editExpiry || null,
        disabled: editDisabled,
        questions,
        require_finish_task_id: editDependency.id,
        require_finish_task_type: editDependency.type,
        require_premium: editRequirePremium,
        vpn_countries: editVpnCountries
      });
      
      await editYoutubeTask(editTask.id, {
        expires_at: editExpiry || null,
        disabled: editDisabled,
        questions,
        require_finish_task_id: editDependency.id,
        require_finish_task_type: editDependency.type,
        require_premium: editRequirePremium,
        vpn_countries: editVpnCountries,
        completion_limit: editCompletionLimit ? parseInt(editCompletionLimit) : null
      });
      
      await fetchTasks();
      closeEdit();
    } catch (e: any) {
      setError(e.response?.data?.message || e.message || 'Failed to edit');
    } finally {
      setEditLoading(false);
    }
  };
  
  // Handle question changes for add form
  const handleAddQuestionChange = (index: number, field: string, value: any) => {
    const newQuestions = [...addQuestions];
    if (field === 'question') {
      newQuestions[index].question = value;
    } else if (field === 'correctAnswer') {
      newQuestions[index].correctAnswer = value;
    } else if (field === 'question_type') {
      newQuestions[index].question_type = value;
    } else if (field === 'max_attempts') {
      newQuestions[index].max_attempts = value;
    } else if (field === 'cooldown_seconds') {
      newQuestions[index].cooldown_seconds = value;
    }
    setAddQuestions(newQuestions);
  };
  
  // Handle wrong answer changes for add form
  const handleAddWrongAnswerChange = (questionIndex: number, answerIndex: number, value: string) => {
    const newQuestions = [...addQuestions];
    newQuestions[questionIndex].wrongAnswers[answerIndex] = value;
    setAddQuestions(newQuestions);
  };
  
  // Add wrong answer field for add form
  const addWrongAnswerField = (questionIndex: number) => {
    const newQuestions = [...addQuestions];
    newQuestions[questionIndex].wrongAnswers.push('');
    setAddQuestions(newQuestions);
  };
  
  // Remove wrong answer field for add form
  const removeWrongAnswerField = (questionIndex: number, answerIndex: number) => {
    const newQuestions = [...addQuestions];
    newQuestions[questionIndex].wrongAnswers.splice(answerIndex, 1);
    setAddQuestions(newQuestions);
  };
  
  // Remove question for add form
  const removeAddQuestion = (index: number) => {
    const newQuestions = [...addQuestions];
    newQuestions.splice(index, 1);
    setAddQuestions(newQuestions);
  };
  
  // Handle question changes for edit form
  const handleEditQuestionChange = (index: number, field: string, value: any) => {
    const newQuestions = [...editQuestions];
    if (field === 'question') {
      newQuestions[index].question = value;
    } else if (field === 'correctAnswer') {
      newQuestions[index].correctAnswer = value;
    } else if (field === 'question_type') {
      newQuestions[index].question_type = value;
    } else if (field === 'max_attempts') {
      newQuestions[index].max_attempts = value;
    } else if (field === 'cooldown_seconds') {
      newQuestions[index].cooldown_seconds = value;
    }
    setEditQuestions(newQuestions);
  };
  
  // Handle wrong answer changes for edit form
  const handleEditWrongAnswerChange = (questionIndex: number, answerIndex: number, value: string) => {
    const newQuestions = [...editQuestions];
    newQuestions[questionIndex].wrongAnswers[answerIndex] = value;
    setEditQuestions(newQuestions);
  };
  
  // Add wrong answer field for edit form
  const addEditWrongAnswerField = (questionIndex: number) => {
    const newQuestions = [...editQuestions];
    newQuestions[questionIndex].wrongAnswers.push('');
    setEditQuestions(newQuestions);
  };
  
  // Remove wrong answer field for edit form
  const removeEditWrongAnswerField = (questionIndex: number, answerIndex: number) => {
    const newQuestions = [...editQuestions];
    newQuestions[questionIndex].wrongAnswers.splice(answerIndex, 1);
    setEditQuestions(newQuestions);
  };
  
  // Remove question for edit form
  const removeEditQuestion = (index: number) => {
    const newQuestions = [...editQuestions];
    newQuestions.splice(index, 1);
    setEditQuestions(newQuestions);
  }

  // Remove all questions for edit form (used by Remove Questions button)
  const removeAllEditQuestions = () => {
    setEditQuestions([]);
    setShowEditQuestions(false);
  }

  // Calculate total watch count
  const totalWatchCount = tasks.reduce((sum, t) => Number(sum) + (Number(t.completion_count) || 0), 0);

  // Handler to open analytics modal
  const openAnalytics = async (task: YoutubeTask) => {
    try {
      const data = await getYoutubeTask(task.id);
      setAnalyticsModal({ open: true, task, completions: data.completions || [] });
    } catch (e) {
      setError('Failed to load analytics');
    }
  };
  const closeAnalytics = () => setAnalyticsModal({ open: false, task: null, completions: [] });

  // Tab state
  const [activeTab, setActiveTab] = useState<'videos' | 'analytics'>('videos');

  return (
    <div className="p-6">
      {/* Tab Bar */}
      <div className="mb-6 flex gap-2">
        <button
          className={`px-5 py-2 rounded-full shadow font-medium text-sm transition-colors duration-150 focus:outline-none border-2 ${activeTab === 'videos' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50'}`}
          onClick={() => setActiveTab('videos')}
        >
          Videos List
        </button>
        <button
          className={`px-5 py-2 rounded-full shadow font-medium text-sm transition-colors duration-150 focus:outline-none border-2 ${activeTab === 'analytics' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50'}`}
          onClick={() => setActiveTab('analytics')}
        >
          Video Watch Analytics
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'analytics' && (
        <div>
      {/* Analytics Card */}
      <div className="mb-8">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-blue-900 flex items-center gap-2 mb-1">
              <BarChart2 className="w-5 h-5 text-blue-600" />
              Video Watch Analytics
            </h2>
                <p className="text-blue-800 text-sm">Total Video Watches: <span className="font-bold text-blue-900">{Number(totalWatchCount)}</span></p>
          </div>
        </div>
        <div className="mt-4 bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Watch Count</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Analytics</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tasks.map(task => (
                <tr key={task.id}>
                  <td className="px-4 py-2 text-sm text-gray-900">{task.id}</td>
                  <td className="px-4 py-2 text-sm text-gray-900">{task.title}</td>
                      <td className="px-4 py-2 text-sm text-blue-700 font-bold">{Number(task.completion_count) || 0}</td>
                  <td className="px-4 py-2 text-sm">
                    <button onClick={() => openAnalytics(task)} className="text-blue-600 hover:text-blue-900 flex items-center gap-1">
                      <BarChart2 className="w-4 h-4" />
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
     </div> )}

      {activeTab === 'videos' && (
        <>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">YouTube Video Tasks</h1>
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-gray-700">Filter:</span>
          <button
            type="button"
            className={`px-3 py-1 rounded-l-full border transition-colors duration-150 focus:outline-none ${!includeUserPromotions ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-100 text-gray-700 border-gray-300'}`}
            onClick={() => setIncludeUserPromotions(false)}
          >
            Show All Videos
          </button>
          <button
            type="button"
            className={`px-3 py-1 rounded-r-full border transition-colors duration-150 focus:outline-none ${includeUserPromotions ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-100 text-gray-700 border-gray-300'}`}
            onClick={() => setIncludeUserPromotions(true)}
          >
            Show Only User Submitted Videos
          </button>
        </div>
      </div>
      {/* Accordion for Add Video Task */}
      <div className="mb-6">
        <details className="bg-white shadow rounded-lg p-0" open={false}>
          <summary className="cursor-pointer px-6 py-4 font-semibold text-blue-700 text-lg border-b border-gray-200 select-none">
            + Add New Video Task
          </summary>
          <div className="p-6">
            <form onSubmit={handleAdd}>
              {/* ...existing add form fields... */}
              <div className="mb-4">
                <TaskDependencySelector
                  value={addDependency}
                  onChange={setAddDependency}
                  label="Unlock this video after completing:"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">YouTube Link</label>
                <input 
                  type="url" 
                  required 
                  value={youtubeUrl} 
                  onChange={e => setYoutubeUrl(e.target.value)} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-md" 
                  placeholder="https://www.youtube.com/watch?v=..." 
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Expiry (optional)</label>
                <input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={e => setExpiresAt(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Completion Limit (optional)</label>
                <input
                  type="number"
                  min="1"
                  value={completionLimit}
                  onChange={e => setCompletionLimit(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="e.g. 1000"
                />
                <p className="text-xs text-gray-500 mt-1">Maximum number of users who can complete this task (leave empty for unlimited)</p>
              </div>
              <div className="mb-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="requirePremium"
                    checked={requirePremium}
                    onChange={e => setRequirePremium(e.target.checked)}
                    className="mr-2"
                  />
                  <label htmlFor="requirePremium" className="text-sm font-medium text-gray-700">
                    Require Premium Membership
                  </label>
                </div>
                <p className="text-xs text-gray-500 mt-1">Only premium users can access this video task</p>
              </div>
              {/* VPN Countries Section */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  VPN Countries Required
                </label>
                <div className="flex gap-2 mb-2">
                  <select 
                    value={newCountry}
                    onChange={(e) => setNewCountry(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="">Select a country...</option>
                    {availableCountries.map(country => (
                      <option key={country.code} value={country.code}>
                        {country.name} ({country.code})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={addVpnCountry}
                    disabled={!newCountry}
                    className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {vpnCountries.map(countryCode => (
                    <span
                      key={countryCode}
                      className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-sm"
                    >
                      {getCountryName(countryCode)} ({countryCode})
                      <button
                        type="button"
                        onClick={() => removeVpnCountry(countryCode)}
                        className="ml-1 text-blue-600 hover:text-blue-800"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">Users must use VPN from these countries to access this video task</p>
              </div>
              <div className="mb-4">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700">
                    <div className="flex items-center">
                      <HelpCircle className="h-4 w-4 mr-1" />
                      Validation Questions
                    </div>
                  </label>
                  <button 
                    type="button"
                    onClick={() => setShowAddQuestions(!showAddQuestions)}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    {showAddQuestions ? 'Remove Questions' : 'Add Questions'}
                  </button>
                </div>
                {showAddQuestions && (
                  <div className="mt-2">
                    {addQuestions.map((q, index) => (
                      <QuestionForm
                        key={index}
                        index={index}
                        question={q.question}
                        correctAnswer={q.correctAnswer}
                        wrongAnswers={q.wrongAnswers}
                        questionType={q.question_type}
                        maxAttempts={q.max_attempts}
                        cooldownSeconds={q.cooldown_seconds}
                        onQuestionChange={(value) => handleAddQuestionChange(index, 'question', value)}
                        onCorrectAnswerChange={(value) => handleAddQuestionChange(index, 'correctAnswer', value)}
                        onWrongAnswerChange={(answerIndex, value) => handleAddWrongAnswerChange(index, answerIndex, value)}
                        onAddWrongAnswer={() => addWrongAnswerField(index)}
                        onRemoveWrongAnswer={(answerIndex) => removeWrongAnswerField(index, answerIndex)}
                        onRemoveQuestion={() => removeAddQuestion(index)}
                        onQuestionTypeChange={(value) => handleAddQuestionChange(index, 'question_type', value)}
                        onMaxAttemptsChange={(value) => handleAddQuestionChange(index, 'max_attempts', value)}
                        onCooldownSecondsChange={(value) => handleAddQuestionChange(index, 'cooldown_seconds', value)}
                        isRemovable={addQuestions.length > 1}
                      />
                    ))}
                    <button
                      type="button"
                      onClick={addNewQuestion}
                      className="mt-2 flex items-center text-sm text-blue-600 hover:text-blue-800"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Another Question
                    </button>
                  </div>
                )}
              </div>
              <div className="flex justify-end">
                <button 
                  type="submit" 
                  disabled={adding} 
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium min-w-[120px]"
                >
                  {adding ? 'Adding...' : 'Add Video'}
                </button>
              </div>
            </form>
            {error && (
              <div className="bg-red-50 p-4 mb-6 rounded-md text-red-700 flex items-start">
                <AlertCircle className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}
          </div>
        </details>
      </div>
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Thumbnail</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">YouTube Link</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Added</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expiry</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Questions</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Premium</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">VPN Countries</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Disabled</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading ? (
                <tr><td colSpan={11} className="px-6 py-4 text-center text-gray-500">Loading...</td></tr>
              ) : tasks.length > 0 ? tasks.map(task => (
                <tr key={task.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{task.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap"><img src={task.thumbnail} alt={task.title} className="w-20 h-12 object-cover rounded" /></td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{task.title}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 underline"><a href={task.youtube_url} target="_blank" rel="noopener noreferrer">Link</a></td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDistanceToNow(new Date(task.added_at), { addSuffix: true })}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{task.expires_at ? formatDistanceToNow(new Date(task.expires_at), { addSuffix: true }) : 'No expiry'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {task.question_count && task.question_count > 0 ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <Check className="h-3 w-3 mr-1" />
                        {task.question_count}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        <X className="h-3 w-3 mr-1" />
                        None
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {task.require_premium ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        Premium
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        Free
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {task.vpn_countries && task.vpn_countries.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {task.vpn_countries.map(countryCode => (
                          <span
                            key={countryCode}
                            className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs"
                          >
                            {countryCode}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-400 text-xs">No restrictions</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{task.disabled ? 'Yes' : 'No'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button 
                      className="text-indigo-600 hover:text-indigo-900" 
                      onClick={() => openEdit(task)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={11} className="px-6 py-4 text-center text-gray-500">No tasks found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}
      
      {/* Edit Modal */}
      {editTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <form onSubmit={handleEditSave} className="bg-white rounded-lg shadow-lg p-6 w-full max-w-2xl relative max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Edit YouTube Task #{editTask.id}</h2>
            <div className="mb-4">
              <TaskDependencySelector
                value={editDependency}
                onChange={setEditDependency}
                label="Unlock this video after completing:"
                excludeId={editTask.id}
                excludeType="youtube_video"
              />
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Expiry</label>
              <input 
                type="datetime-local" 
                value={editExpiry} 
                onChange={e => setEditExpiry(e.target.value)} 
                className="w-full px-3 py-2 border border-gray-300 rounded-md" 
              />
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Disabled</label>
              <select
                value={editDisabled ? 'yes' : 'no'}
                onChange={e => setEditDisabled(e.target.value === 'yes')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Completion Limit</label>
              <input
                type="number"
                min="1"
                value={editCompletionLimit}
                onChange={e => setEditCompletionLimit(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="e.g. 1000 (leave empty for unlimited)"
              />
              <p className="text-xs text-gray-500 mt-1">Maximum number of users who can complete this task</p>
            </div>

            <div className="mb-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="editRequirePremium"
                  checked={editRequirePremium}
                  onChange={e => setEditRequirePremium(e.target.checked)}
                  className="mr-2"
                />
                <label htmlFor="editRequirePremium" className="text-sm font-medium text-gray-700">
                  Require Premium Membership
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-1">Only premium users can access this video task</p>
            </div>

            {/* VPN Countries Section for Edit */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                VPN Countries Required
              </label>
              <div className="flex gap-2 mb-2">
                <select 
                  value={editNewCountry}
                  onChange={(e) => setEditNewCountry(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="">Select a country...</option>
                  {availableCountries.map(country => (
                    <option key={country.code} value={country.code}>
                      {country.name} ({country.code})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addEditVpnCountry}
                  disabled={!editNewCountry}
                  className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {editVpnCountries.map(countryCode => (
                  <span
                    key={countryCode}
                    className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-sm"
                  >
                    {getCountryName(countryCode)} ({countryCode})
                    <button
                      type="button"
                      onClick={() => removeEditVpnCountry(countryCode)}
                      className="ml-1 text-blue-600 hover:text-blue-800"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">Users must use VPN from these countries to access this video task</p>
            </div>
            
            <div className="mb-4">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700">
                  <div className="flex items-center">
                    <HelpCircle className="h-4 w-4 mr-1" />
                    Validation Questions
                  </div>
                </label>
                <button 
                  type="button"
                  onClick={() => {
                    if (showEditQuestions) {
                      removeAllEditQuestions();
                    } else {
                      setShowEditQuestions(true);
                    }
                  }}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  {showEditQuestions ? 'Remove Questions' : editQuestions.length > 0 ? 'Edit Questions' : 'Add Questions'}
                </button>
              </div>
              
              {showEditQuestions && (
                <div className="mt-2">
                  {editQuestions.map((q, index) => (
                    <QuestionForm
                      key={index}
                      index={index}
                      question={q.question}
                      correctAnswer={q.correctAnswer}
                      wrongAnswers={q.wrongAnswers}
                      questionType={q.question_type}
                      maxAttempts={q.max_attempts}
                      cooldownSeconds={q.cooldown_seconds}
                      onQuestionChange={(value) => handleEditQuestionChange(index, 'question', value)}
                      onCorrectAnswerChange={(value) => handleEditQuestionChange(index, 'correctAnswer', value)}
                      onWrongAnswerChange={(answerIndex, value) => handleEditWrongAnswerChange(index, answerIndex, value)}
                      onAddWrongAnswer={() => addEditWrongAnswerField(index)}
                      onRemoveWrongAnswer={(answerIndex) => removeEditWrongAnswerField(index, answerIndex)}
                      onRemoveQuestion={() => removeEditQuestion(index)}
                      onQuestionTypeChange={(value) => handleEditQuestionChange(index, 'question_type', value)}
                      onMaxAttemptsChange={(value) => handleEditQuestionChange(index, 'max_attempts', value)}
                      onCooldownSecondsChange={(value) => handleEditQuestionChange(index, 'cooldown_seconds', value)}
                      isRemovable={editQuestions.length > 1}
                    />
                  ))}
                  
                  <button
                    type="button"
                    onClick={addNewEditQuestion}
                    className="mt-2 flex items-center text-sm text-blue-600 hover:text-blue-800"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Another Question
                  </button>
                </div>
              )}
            </div>
            
            <div className="flex gap-2 mt-4">
              <button 
                type="submit" 
                disabled={editLoading} 
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                {editLoading ? 'Saving...' : 'Save'}
              </button>
              <button 
                type="button" 
                onClick={closeEdit} 
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-md text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
      {/* Analytics Modal */}
      {analyticsModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-2xl relative max-h-[90vh] overflow-y-auto">
            {/* ...existing analytics modal content... */}
          </div>
        </div>
      )}
    </div>
  );
}