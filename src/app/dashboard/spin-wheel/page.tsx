'use client';

import { useState, useEffect } from 'react';
import { Loader2, Plus, Save, Trash2, GripVertical, RotateCcw } from 'lucide-react';
import { motion } from 'framer-motion';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { SpinWheelReward, getSpinWheelRewards, createSpinWheelReward, updateSpinWheelReward, deleteSpinWheelReward, reorderSpinWheelRewards, resetSpinWheelToDefault } from '@/lib/api';

// Default segments optimized for better user experience
const ADMIN_DEFAULT_SEGMENTS = [
  { label: '5 Points', points: 5, color: '#18181b', probability: 0.25, is_active: true, position: 0 },
  { label: '10 Points', points: 10, color: '#18181b', probability: 0.20, is_active: true, position: 1 },
  { label: '25 Points', points: 25, color: '#18181b', probability: 0.15, is_active: true, position: 2 },
  { label: '50 Points', points: 50, color: '#18181b', probability: 0.12, is_active: true, position: 3 },
  { label: '100 Points', points: 100, color: '#18181b', probability: 0.10, is_active: true, position: 4 },
  { label: '200 Points', points: 200, color: '#dc2626', probability: 0.08, is_active: true, position: 5 },
  { label: '500 Points', points: 500, color: '#facc15', probability: 0.05, is_active: true, position: 6 },
  { label: 'Free Spin', points: 0, color: '#18181b', probability: 0.05, is_active: true, position: 7 },
];

export default function SpinWheelPage() {
  const [rewards, setRewards] = useState<SpinWheelReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [editingReward, setEditingReward] = useState<SpinWheelReward | null>(null);

  useEffect(() => {
    fetchRewards();
  }, []);

  const fetchRewards = async () => {
    try {
      setLoading(true);
      const response = await getSpinWheelRewards();
      setRewards(response.rewards);
    } catch (error) {
      console.error('Error fetching rewards:', error);
      setMessage({ type: 'error', text: 'Failed to load rewards' });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveReward = async (reward: SpinWheelReward) => {
    try {
      setSaving(true);
      if (reward.id) {
        const updated = await updateSpinWheelReward(reward.id, reward);
        setRewards(rewards.map(r => r.id === updated.id ? updated : r));
      } else {
        const created = await createSpinWheelReward({
          ...reward,
          position: rewards.length
        });
        setRewards([...rewards, created]);
      }
      setEditingReward(null);
      setMessage({ type: 'success', text: 'Reward saved successfully' });
    } catch (error) {
      console.error('Error saving reward:', error);
      setMessage({ type: 'error', text: 'Failed to save reward' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteReward = async (id: number) => {
    try {
      await deleteSpinWheelReward(id);
      setRewards(rewards.filter(r => r.id !== id));
      setMessage({ type: 'success', text: 'Reward deleted successfully' });
    } catch (error) {
      console.error('Error deleting reward:', error);
      setMessage({ type: 'error', text: 'Failed to delete reward' });
    }
  };

  const handleDragEnd = async (result: any) => {
    if (!result.destination) return;

    const items = Array.from(rewards);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    const updatedRewards = items.map((item, index) => ({
      ...item,
      position: index
    }));

    setRewards(updatedRewards);

    try {
      await reorderSpinWheelRewards(
        updatedRewards.map((r, i) => ({ id: r.id, position: i }))
      );
    } catch (error) {
      console.error('Error reordering rewards:', error);
      setMessage({ type: 'error', text: 'Failed to reorder rewards' });
      fetchRewards(); // Revert to original order
    }
  };

  const handleResetToDefault = async () => {
    if (!confirm('Are you sure you want to reset to default segments? This will delete all current rewards and replace them with optimized defaults.')) {
      return;
    }

    try {
      setSaving(true);
      setMessage({ type: 'success', text: 'Resetting to default segments...' });

      // Use the new API endpoint that handles foreign key constraints
      const response = await resetSpinWheelToDefault();
      
      setRewards(response.rewards);
      setMessage({ type: 'success', text: 'Successfully reset to default segments with optimized probabilities!' });
    } catch (error) {
      console.error('Error resetting to defaults:', error);
      setMessage({ type: 'error', text: 'Failed to reset to default segments' });
      fetchRewards(); // Reload current state
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold">Spin Wheel Rewards</h1>
        <div className="flex gap-3">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleResetToDefault}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            Reset to Default
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setEditingReward({
              id: 0,
              label: '',
              points: 0,
              color: '#FFFFFF',
              probability: 1,
              is_active: true,
              position: rewards.length,
              created_at: '',
              updated_at: ''
            })}
            className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Reward
          </motion.button>
        </div>
      </div>

      {message && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mb-4 p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}
        >
          {message.text}
        </motion.div>
      )}

      {/* Info Card about Default Segments */}
      <div className="mb-6 p-4 rounded-lg bg-blue-50 border border-blue-200">
        <h3 className="font-medium text-blue-900 mb-2">About Default Segments</h3>
        <p className="text-sm text-blue-700 mb-2">
          The default segments are optimized for better user engagement with:
        </p>
        <ul className="text-xs text-blue-600 space-y-1 ml-4">
          <li>• Higher probability (25%) for small rewards (5 points) to keep users engaged</li>
          <li>• Gradual decrease in probability for higher rewards</li>
          <li>• Maximum reward of 500 points (5% chance) to maintain balance</li>
          <li>• Free spin option (5% chance) for bonus engagement</li>
          <li>• Total of 8 segments for optimal wheel visibility</li>
        </ul>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="rewards">
            {(provided) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                className="space-y-4"
              >
                {rewards.map((reward, index) => (
                  <Draggable key={reward.id} draggableId={String(reward.id)} index={index}>
                    {(provided) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className="p-4 rounded-lg bg-white shadow-sm border"
                      >
                        <div className="flex items-center gap-4">
                          <div {...provided.dragHandleProps} className="cursor-move">
                            <GripVertical className="h-5 w-5 text-gray-400" />
                          </div>
                          <div
                            className="w-6 h-6 rounded-full"
                            style={{ backgroundColor: reward.color }}
                          />
                          <div className="flex-1">
                            <h3 className="font-medium">{reward.label}</h3>
                            <p className="text-sm text-gray-500">
                              {reward.points} points • {(reward.probability * 100).toFixed(0)}% chance
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setEditingReward(reward)}
                              className="p-2 rounded-lg hover:bg-gray-100"
                            >
                              <Save className="h-4 w-4 text-gray-500" />
                            </button>
                            <button
                              onClick={() => handleDeleteReward(reward.id)}
                              className="p-2 rounded-lg hover:bg-gray-100"
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </button>
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
      )}

      {editingReward && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl p-6 w-full max-w-md"
          >
            <h2 className="text-xl font-bold mb-4">
              {editingReward.id ? 'Edit Reward' : 'New Reward'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Label
                </label>
                <input
                  type="text"
                  value={editingReward.label}
                  onChange={(e) => setEditingReward({ ...editingReward, label: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Points
                </label>
                <input
                  type="number"
                  value={editingReward.points}
                  onChange={(e) => setEditingReward({ ...editingReward, points: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Color
                </label>
                <input
                  type="color"
                  value={editingReward.color}
                  onChange={(e) => setEditingReward({ ...editingReward, color: e.target.value })}
                  className="w-full h-10 rounded-lg cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Probability (0-100%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={editingReward.probability * 100}
                  onChange={(e) => setEditingReward({ ...editingReward, probability: parseInt(e.target.value) / 100 })}
                  className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editingReward.is_active}
                  onChange={(e) => setEditingReward({ ...editingReward, is_active: e.target.checked })}
                  className="rounded text-blue-500 focus:ring-blue-500"
                />
                <label className="text-sm font-medium text-gray-700">
                  Active
                </label>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setEditingReward(null)}
                className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSaveReward(editingReward)}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white flex items-center gap-2"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
} 