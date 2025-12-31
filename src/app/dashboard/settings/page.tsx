'use client';

import { useState, useEffect } from 'react';
import { Settings, Save, RefreshCw, DollarSign, Crown } from 'lucide-react';
import { motion } from 'framer-motion';
import { Setting, getSettings, bulkUpdateSettings } from '@/lib/api';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [activeTab, setActiveTab] = useState<'points' | 'premium'>('points');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await getSettings();
      setSettings(response.settings);
    } catch (error) {
      console.error('Error fetching settings:', error);
      setMessage({ type: 'error', text: 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  };

  const handleValueChange = (key: string, newValue: string) => {
    setSettings(settings.map(setting => 
      setting.key === key ? { ...setting, value: newValue } : setting
    ));
  };


  const saveSettings = async () => {
    try {
      setSaving(true);
      const updatedSettings = await bulkUpdateSettings(
        settings.map(({ key, value }) => ({ key, value }))
      );
      setSettings(updatedSettings);
      setMessage({ type: 'success', text: 'Settings saved successfully' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-blue-500" />
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>
        <div className="flex gap-2">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={fetchSettings}
            className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center gap-2"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={saveSettings}
            className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white flex items-center gap-2"
            disabled={saving}
          >
            <Save className="h-4 w-4" />
            Save Changes
          </motion.button>
        </div>
      </div>
      
      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <ul className="flex flex-wrap -mb-px">
          <li className="mr-2">
            <button 
              onClick={() => setActiveTab('points')}
              className={`inline-block p-4 border-b-2 ${
                activeTab === 'points' 
                  ? 'text-blue-600 border-blue-600' 
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              } rounded-t-lg`}
            >
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Points
              </div>
            </button>
          </li>
          <li className="mr-2">
            <button 
              onClick={() => setActiveTab('premium')}
              className={`inline-block p-4 border-b-2 ${
                activeTab === 'premium' 
                  ? 'text-blue-600 border-blue-600' 
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              } rounded-t-lg`}
            >
              <div className="flex items-center gap-2">
                <Crown className="h-4 w-4" />
                Premium Features
              </div>
            </button>
          </li>
        </ul>
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

      {/* Points Settings Tab */}
      {activeTab === 'points' && (
        <div className="grid gap-4">
          {settings
            .filter(setting => !setting.key.startsWith('premium_'))
            .map((setting) => (
            <motion.div
              key={setting.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-lg bg-white shadow-sm border"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-gray-900">
                    {setting.key.split('_').map(word => 
                      word.charAt(0).toUpperCase() + word.slice(1)
                    ).join(' ')}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">{setting.description}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    Last updated: {new Date(setting.updated_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={setting.value}
                    onChange={(e) => handleValueChange(setting.key, e.target.value)}
                    className="w-24 px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {!(setting.key === 'max_math_quiz_plays_per_day' || setting.key === 'max_spin_wheel_plays_per_day') && (
                    <span className="text-sm text-gray-500">points</span>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Premium Features Tab */}
      {activeTab === 'premium' && (
        <div className="grid gap-4">
          {settings.filter(setting => setting.key.startsWith('premium_')).map((setting) => (
            <motion.div
              key={setting.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-lg bg-white shadow-sm border"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-gray-900">
                    {setting.key.replace('premium_', '').split('_').map(word => 
                      word.charAt(0).toUpperCase() + word.slice(1)
                    ).join(' ')}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">{setting.description}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    Last updated: {new Date(setting.updated_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {setting.key === 'premium_enabled' ? (
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={setting.value === '1' || setting.value === 1}
                        onChange={(e) => handleValueChange(setting.key, e.target.checked ? '1' : '0')}
                        className="sr-only peer" 
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  ) : setting.key === 'premium_price_monthly' ? (
                    <>
                      <span className="text-sm text-gray-500">$</span>
                      <input
                        type="text"
                        value={(Number(setting.value) / 100).toFixed(2)}
                        onChange={(e) => handleValueChange(setting.key, (parseFloat(e.target.value) * 100).toString())}
                        className="w-24 px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </>
                  ) : (
                    <input
                      type="number"
                      value={setting.value}
                      onChange={(e) => handleValueChange(setting.key, e.target.value)}
                      className="w-24 px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

    </div>
  );
} 