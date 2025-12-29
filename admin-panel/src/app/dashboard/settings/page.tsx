'use client';

import { useState, useEffect } from 'react';
import { Settings, Save, RefreshCw, CreditCard, DollarSign, Crown, Wallet, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { Setting, getSettings, bulkUpdateSettings } from '@/lib/api';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [activeTab, setActiveTab] = useState<'points' | 'premium' | 'payment' | 'deposits' | 'withdrawals'>('points');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  // Payment gateway settings
  const [paymentSettings, setPaymentSettings] = useState({
    chapa_api_key: '',
    chapa_public_key: '',
    chapa_test_mode: true,
    chapa_webhook_enabled: true
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await getSettings();
      setSettings(response.settings);
      
      // Load payment gateway settings
      const paymentSettingsData = {
        chapa_api_key: '',
        chapa_public_key: '',
        chapa_test_mode: true,
        chapa_webhook_enabled: true
      };
      
      response.settings.forEach(setting => {
        if (setting.key === 'chapa_api_key') {
          paymentSettingsData.chapa_api_key = setting.value === '0' ? '' : String(setting.value);
        } else if (setting.key === 'chapa_public_key') {
          paymentSettingsData.chapa_public_key = setting.value === '0' ? '' : String(setting.value);
        } else if (setting.key === 'chapa_test_mode') {
          paymentSettingsData.chapa_test_mode = setting.value === '1' || setting.value === 1;
        } else if (setting.key === 'chapa_webhook_enabled') {
          paymentSettingsData.chapa_webhook_enabled = setting.value === '1' || setting.value === 1;
        }
      });
      
      setPaymentSettings(paymentSettingsData);
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
  
  const handlePaymentSettingChange = (key: string, value: string | boolean) => {
    setPaymentSettings({
      ...paymentSettings,
      [key]: value
    });
    
    // Also update the settings array for saving
    const settingKey = key;
    const settingValue = typeof value === 'boolean' ? (value ? '1' : '0') : value;
    
    setSettings(prevSettings => {
      const existingSetting = prevSettings.find(s => s.key === settingKey);
      if (existingSetting) {
        return prevSettings.map(setting => 
          setting.key === settingKey ? { ...setting, value: settingValue } : setting
        );
      } else {
        // Add new setting if it doesn't exist
        return [...prevSettings, {
          id: Date.now(), // temporary ID
          key: settingKey,
          value: settingValue,
          description: `${key.replace(/_/g, ' ')} setting`,
          updated_at: new Date().toISOString()
        }];
      }
    });
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
          <li className="mr-2">
            <button 
              onClick={() => setActiveTab('payment')}
              className={`inline-block p-4 border-b-2 ${
                activeTab === 'payment' 
                  ? 'text-blue-600 border-blue-600' 
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              } rounded-t-lg`}
            >
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Payment Gateways
              </div>
            </button>
          </li>
          <li className="mr-2">
            <button 
              onClick={() => setActiveTab('deposits')}
              className={`inline-block p-4 border-b-2 ${
                activeTab === 'deposits' 
                  ? 'text-blue-600 border-blue-600' 
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              } rounded-t-lg`}
            >
              <div className="flex items-center gap-2">
                <ArrowDownCircle className="h-4 w-4" />
                Deposits
              </div>
            </button>
          </li>
          <li className="mr-2">
            <button 
              onClick={() => setActiveTab('withdrawals')}
              className={`inline-block p-4 border-b-2 ${
                activeTab === 'withdrawals' 
                  ? 'text-blue-600 border-blue-600' 
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              } rounded-t-lg`}
            >
              <div className="flex items-center gap-2">
                <ArrowUpCircle className="h-4 w-4" />
                Withdrawals
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
            .filter(setting => 
              !setting.key.startsWith('premium_') && 
              !setting.key.startsWith('chapa_') &&
              !setting.key.startsWith('conversion_') &&
              !setting.key.startsWith('withdrawal_') &&
              !setting.key.startsWith('deposit_')
            )
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

      {/* Payment Gateways Tab */}
      {activeTab === 'payment' && (
        <div className="space-y-6">
          <div className="p-4 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-sm">
            <p>Configure payment gateway credentials for processing premium subscriptions. These keys should be kept confidential.</p>
          </div>
          
          {/* Chapa */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-md bg-blue-100 flex items-center justify-center">
                <span className="font-bold text-blue-600">CH</span>
              </div>
              <h2 className="text-lg font-semibold">Chapa Payment Gateway</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Secret API Key</label>
                <input
                  type="password"
                  value={paymentSettings.chapa_api_key}
                  onChange={(e) => handlePaymentSettingChange('chapa_api_key', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="sk_test_..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Public Key</label>
                <input
                  type="text"
                  value={paymentSettings.chapa_public_key}
                  onChange={(e) => handlePaymentSettingChange('chapa_public_key', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="CHAPUBK_TEST-..."
                />
              </div>
              
              <div className="flex items-center justify-between border-t pt-4 mt-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-700">Test Mode</h3>
                  <p className="text-xs text-gray-500">Enable for testing with sandbox credentials</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={paymentSettings.chapa_test_mode}
                    onChange={(e) => handlePaymentSettingChange('chapa_test_mode', e.target.checked)}
                    className="sr-only peer" 
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-gray-700">Enable Webhook</h3>
                  <p className="text-xs text-gray-500">Process payment status updates from Chapa</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={paymentSettings.chapa_webhook_enabled}
                    onChange={(e) => handlePaymentSettingChange('chapa_webhook_enabled', e.target.checked)}
                    className="sr-only peer" 
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Webhook URL (copy to Chapa dashboard)</label>
                <div className="flex">
                  <input
                    type="text"
                    readOnly
                    value={`${process.env.NEXT_PUBLIC_API_URL}/api/payments/premium/webhook`}
                    className="w-full px-3 py-2 rounded-l-lg border border-gray-300 bg-gray-50"
                  />
                  <button 
                    className="px-3 py-2 bg-gray-100 rounded-r-lg border-y border-r border-gray-300 hover:bg-gray-200"
                    onClick={() => navigator.clipboard.writeText(`${process.env.NEXT_PUBLIC_API_URL}/api/payments/premium/webhook`)}
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Transfer Approval URL (for automatic withdrawals)</label>
                <div className="flex">
                  <input
                    type="text"
                    readOnly
                    value={`${process.env.NEXT_PUBLIC_API_URL}/api/payments/transfer/approve`}
                    className="w-full px-3 py-2 rounded-l-lg border border-gray-300 bg-gray-50"
                  />
                  <button 
                    className="px-3 py-2 bg-gray-100 rounded-r-lg border-y border-r border-gray-300 hover:bg-gray-200"
                    onClick={() => navigator.clipboard.writeText(`${process.env.NEXT_PUBLIC_API_URL}/api/payments/transfer/approve`)}
                  >
                    Copy
                  </button>
                </div>
              </div>
              
              <div className="p-3 bg-yellow-50 border border-yellow-100 rounded-lg text-xs text-yellow-800">
                <p><strong>Webhook URL:</strong> Add this to your Chapa dashboard to receive payment notifications.</p>
                <p className="mt-1"><strong>Approval URL:</strong> Configure this in Chapa for automatic withdrawal approvals.</p>
              </div>
            </div>
          </div>
          
          {/* API Price Fetch */}
          <div className="flex justify-end">
            <button
              onClick={fetchSettings}
              className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Fetch Latest Prices
            </button>
          </div>
        </div>
      )}

      {/* Deposits Settings Tab */}
      {activeTab === 'deposits' && (
        <div className="grid gap-4">
          <div className="p-4 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm">
            <p>Configure deposit settings for users to add funds to their accounts via Chapa.</p>
          </div>
          
          {settings
            .filter(setting => setting.key.startsWith('deposit_') || setting.key === 'conversion_rate_points_to_etb')
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
                    {setting.key.replace('deposit_', '').split('_').map(word => 
                      word.charAt(0).toUpperCase() + word.slice(1)
                    ).join(' ')}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">{setting.description}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    Last updated: {new Date(setting.updated_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {setting.key === 'deposit_enabled' ? (
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={setting.value === '1' || setting.value === 1}
                        onChange={(e) => handleValueChange(setting.key, e.target.checked ? '1' : '0')}
                        className="sr-only peer" 
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  ) : setting.key.includes('_etb') ? (
                    <>
                      <input
                        type="number"
                        value={setting.value}
                        onChange={(e) => handleValueChange(setting.key, e.target.value)}
                        className="w-24 px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <span className="text-sm text-gray-500">ETB</span>
                    </>
                  ) : setting.key === 'conversion_rate_points_to_etb' || setting.key === 'deposit_points_per_etb' ? (
                    <>
                      <input
                        type="number"
                        step="0.01"
                        value={setting.value}
                        onChange={(e) => handleValueChange(setting.key, e.target.value)}
                        className="w-24 px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <span className="text-sm text-gray-500">{setting.key === 'deposit_points_per_etb' ? 'pts/ETB' : 'ETB/pt'}</span>
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

      {/* Withdrawals Settings Tab */}
      {activeTab === 'withdrawals' && (
        <div className="space-y-6">
          <div className="p-4 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-sm">
            <p>Configure withdrawal limits, requirements, and premium benefits for user withdrawals.</p>
          </div>
          
          {/* Basic Withdrawal Settings */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Basic Settings</h3>
            <div className="grid gap-4">
              {settings
                .filter(setting => 
                  setting.key.startsWith('withdrawal_') && 
                  !setting.key.includes('premium')
                )
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
                        {setting.key.replace('withdrawal_', '').split('_').map(word => 
                          word.charAt(0).toUpperCase() + word.slice(1)
                        ).join(' ')}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">{setting.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {setting.key === 'withdrawal_enabled' ? (
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={setting.value === '1' || setting.value === 1}
                            onChange={(e) => handleValueChange(setting.key, e.target.checked ? '1' : '0')}
                            className="sr-only peer" 
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      ) : setting.key === 'withdrawal_frequency' ? (
                        <select
                          value={setting.value}
                          onChange={(e) => handleValueChange(setting.key, e.target.value)}
                          className="px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                        </select>
                      ) : setting.key.includes('_limit') ? (
                        <>
                          <input
                            type="number"
                            value={setting.value}
                            onChange={(e) => handleValueChange(setting.key, e.target.value)}
                            className="w-24 px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                          <span className="text-sm text-gray-500">ETB</span>
                        </>
                      ) : setting.key.includes('_points') ? (
                        <>
                          <input
                            type="number"
                            value={setting.value}
                            onChange={(e) => handleValueChange(setting.key, e.target.value)}
                            className="w-24 px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                          <span className="text-sm text-gray-500">points</span>
                        </>
                      ) : setting.key.includes('_days') ? (
                        <>
                          <input
                            type="number"
                            value={setting.value}
                            onChange={(e) => handleValueChange(setting.key, e.target.value)}
                            className="w-24 px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                          <span className="text-sm text-gray-500">days</span>
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
          </div>
          
          {/* Premium Withdrawal Benefits */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Crown className="h-5 w-5 text-yellow-500" />
              Premium User Benefits
            </h3>
            <div className="grid gap-4">
              {settings
                .filter(setting => 
                  setting.key.startsWith('premium_withdrawal')
                )
                .map((setting) => (
                <motion.div
                  key={setting.key}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 rounded-lg bg-white shadow-sm border border-yellow-200"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="text-sm font-medium text-gray-900">
                        {setting.key.replace('premium_withdrawal_', '').split('_').map(word => 
                          word.charAt(0).toUpperCase() + word.slice(1)
                        ).join(' ')}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">{setting.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {setting.key === 'premium_withdrawal_frequency' ? (
                        <select
                          value={setting.value}
                          onChange={(e) => handleValueChange(setting.key, e.target.value)}
                          className="px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                          <option value="unlimited">Unlimited</option>
                        </select>
                      ) : setting.key.includes('percent') ? (
                        <>
                          <input
                            type="number"
                            value={setting.value}
                            onChange={(e) => handleValueChange(setting.key, e.target.value)}
                            className="w-24 px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                          <span className="text-sm text-gray-500">%</span>
                        </>
                      ) : setting.key.includes('_limit') ? (
                        <>
                          <input
                            type="number"
                            value={setting.value}
                            onChange={(e) => handleValueChange(setting.key, e.target.value)}
                            className="w-24 px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                          <span className="text-sm text-gray-500">ETB</span>
                        </>
                      ) : setting.key.includes('_points') ? (
                        <>
                          <input
                            type="number"
                            value={setting.value}
                            onChange={(e) => handleValueChange(setting.key, e.target.value)}
                            className="w-24 px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                          <span className="text-sm text-gray-500">points</span>
                        </>
                      ) : (
                        <input
                          type="text"
                          value={setting.value}
                          onChange={(e) => handleValueChange(setting.key, e.target.value)}
                          className="w-32 px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 