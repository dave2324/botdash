import React, { useEffect, useState } from 'react';
import { getQuizzes, getYoutubeTasks, getTelegramChannels } from '@/lib/api';

export type TaskType = 'quiz' | 'youtube_video' | 'channel_join';

export interface TaskDependencyValue {
  id: number | null;
  type: TaskType | '';
}

interface TaskDependencySelectorProps {
  value: TaskDependencyValue;
  onChange: (value: TaskDependencyValue) => void;
  excludeId?: number;
  excludeType?: TaskType;
  label?: string;
}

export const TaskDependencySelector: React.FC<TaskDependencySelectorProps> = ({ value, onChange, excludeId, excludeType, label }) => {
  const [type, setType] = useState<TaskType | ''>(value.type || '');
  const [taskId, setTaskId] = useState<number | null>(value.id || null);
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<{ id: number; label: string; type: TaskType }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setType(value.type || '');
    setTaskId(value.id || null);
  }, [value]);

  useEffect(() => {
    if (!type) {
      setTasks([]);
      return;
    }
    setLoading(true);
    setError(null);
    (async () => {
      try {
        let fetched: { id: number; label: string; type: TaskType }[] = [];
        if (type === 'quiz') {
          const res = await getQuizzes();
          fetched = res.quizzes.map((q: any) => ({ id: q.id, label: q.title, type: 'quiz' }));
        } else if (type === 'youtube_video') {
          const res = await getYoutubeTasks();
          fetched = res.tasks.map((t: any) => ({ id: t.id, label: t.title, type: 'youtube_video' }));
        } else if (type === 'channel_join') {
          const res = await getTelegramChannels();
          fetched = res.channels.map((c: any) => ({ id: c.id, label: c.name, type: 'channel_join' }));
        }
        // Exclude self if needed
        if (excludeId && excludeType === type) {
          fetched = fetched.filter(t => t.id !== excludeId);
        }
        setTasks(fetched);
      } catch (e: any) {
        setError(e.message || 'Failed to load tasks');
      } finally {
        setLoading(false);
      }
    })();
  }, [type, excludeId, excludeType]);

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value as TaskType;
    setType(newType);
    setTaskId(null);
    onChange({ id: null, type: newType });
  };

  const handleTaskChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value ? Number(e.target.value) : null;
    setTaskId(newId);
    onChange({ id: newId, type });
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">{label || 'Unlocks after completing:'}</label>
      <div className="flex gap-2">
        <select
          className="px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={type}
          onChange={handleTypeChange}
        >
          <option value="">-- Select Type --</option>
          <option value="quiz">Quiz</option>
          <option value="youtube_video">YouTube Video</option>
          <option value="channel_join">Telegram Channel</option>
        </select>
        <select
          className="px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={taskId || ''}
          onChange={handleTaskChange}
          disabled={!type || loading}
        >
          <option value="">-- Select Task --</option>
          {tasks.map(task => (
            <option key={task.id} value={task.id}>{task.label}</option>
          ))}
        </select>
      </div>
      {loading && <div className="text-xs text-gray-400">Loading...</div>}
      {error && <div className="text-xs text-red-500">{error}</div>}
    </div>
  );
};

export default TaskDependencySelector; 