'use client';

import { useState, useEffect } from 'react';
import { Settings, Save, RefreshCw, DollarSign, Crown, MessageCircle } from 'lucide-react';

import { motion } from 'framer-motion';
import {
  Setting,
  getSettings,
  bulkUpdateSettings,
  uploadFile,
  broadcastMedia,
  getOnboardingQuestions,
  createOnboardingQuestion,
  updateOnboardingQuestion,
  deleteOnboardingQuestion,
  getOnboardingAnswers,
  OnboardingQuestion,
  OnboardingAnswer
} from '@/lib/api';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [activeTab, setActiveTab] = useState<'points' | 'premium' | 'welcome' | 'languages' | 'onboarding' | 'broadcast'>('welcome');

  const [supportedLanguages, setSupportedLanguages] = useState<string>('');
  const [defaultLanguage, setDefaultLanguage] = useState<string>('en');
  const [welcomeText, setWelcomeText] = useState<string>('');
  const [welcomeImageUrl, setWelcomeImageUrl] = useState<string>('');
  const [welcomeVideoUrl, setWelcomeVideoUrl] = useState<string>('');

  const [onboardingQuestions, setOnboardingQuestions] = useState<OnboardingQuestion[]>([]);
  const [onboardingAnswers, setOnboardingAnswers] = useState<OnboardingAnswer[]>([]);
  const [newQuestionCode, setNewQuestionCode] = useState('profile_name');
  const [newQuestionType, setNewQuestionType] = useState<'text' | 'single_choice'>('text');
  const [newQuestionTextEn, setNewQuestionTextEn] = useState('What is your name?');
  const [newQuestionOptions, setNewQuestionOptions] = useState<string>(''); // one option per line: key=Label
  const [newQuestionRequired, setNewQuestionRequired] = useState(true);
  const [newQuestionSortOrder, setNewQuestionSortOrder] = useState(0);

  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastTarget, setBroadcastTarget] = useState<'all' | 'premium' | 'non_banned'>('all');
  const [broadcastMediaUrl, setBroadcastMediaUrl] = useState<string>('');
  const [broadcastMediaType, setBroadcastMediaType] = useState<'photo' | 'video'>('photo');
  const [broadcastUploading, setBroadcastUploading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  useEffect(() => {
    fetchSettings();
    // Load onboarding data in background
    (async () => {
      try {
        const q = await getOnboardingQuestions();
        setOnboardingQuestions(q.questions);
        const a = await getOnboardingAnswers();
        setOnboardingAnswers(a.answers);
      } catch (e) {
        // ignore if not configured
      }
    })();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await getSettings();
      setSettings(response.settings);

      const map = new Map(response.settings.map(s => [s.key, String(s.value ?? '')]));
      setSupportedLanguages(map.get('supported_languages') || '[]');
      setDefaultLanguage(map.get('default_language') || 'en');
      setWelcomeText(map.get('welcome_text') || '');
      setWelcomeImageUrl(map.get('welcome_image_url') || '');
      setWelcomeVideoUrl(map.get('welcome_video_url') || '');
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

      const extraUpdates = [
        { key: 'supported_languages', value: supportedLanguages },
        { key: 'default_language', value: defaultLanguage },
        { key: 'welcome_text', value: welcomeText },
        { key: 'welcome_image_url', value: welcomeImageUrl },
        { key: 'welcome_video_url', value: welcomeVideoUrl }
      ];

      const base = settings.map(({ key, value }) => ({ key, value }));
      const merged = [
        ...base.filter(s => !['supported_languages', 'default_language', 'welcome_text', 'welcome_image_url', 'welcome_video_url'].includes(s.key)),
        ...extraUpdates
      ];

      const updatedSettings = await bulkUpdateSettings(merged);
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
              onClick={() => setActiveTab('welcome')}
              className={`inline-block p-4 border-b-2 ${
                activeTab === 'welcome' 
                  ? 'text-blue-600 border-blue-600' 
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              } rounded-t-lg`}
            >
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4" />
                Welcome
              </div>
            </button>
          </li>

          <li className="mr-2">
            <button 
              onClick={() => setActiveTab('languages')}
              className={`inline-block p-4 border-b-2 ${
                activeTab === 'languages' 
                  ? 'text-blue-600 border-blue-600' 
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              } rounded-t-lg`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Languages</span>
              </div>
            </button>
          </li>

          <li className="mr-2">
            <button 
              onClick={() => setActiveTab('onboarding')}
              className={`inline-block p-4 border-b-2 ${
                activeTab === 'onboarding' 
                  ? 'text-blue-600 border-blue-600' 
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              } rounded-t-lg`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Onboarding</span>
              </div>
            </button>
          </li>

          <li className="mr-2">
            <button 
              onClick={() => setActiveTab('broadcast')}
              className={`inline-block p-4 border-b-2 ${
                activeTab === 'broadcast' 
                  ? 'text-blue-600 border-blue-600' 
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              } rounded-t-lg`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Broadcast</span>
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

      {/* Welcome (Legacy + Multi-language) */}
      {activeTab === 'welcome' && (
        <div className="grid gap-4">
          <div className="p-4 rounded-lg bg-white shadow-sm border">
            <h3 className="text-sm font-medium text-gray-900">Welcome Message</h3>
            
            <textarea
              value={welcomeText}
              onChange={(e) => setWelcomeText(e.target.value)}
              rows={6}
              className="w-full mt-3 px-3 py-2 rounded-lg border border-gray-300 text-sm"
              placeholder="Welcome to our bot!"
            />

            <div className="mt-4 grid gap-3">
              <div>
                {welcomeImageUrl && (
                  <div className="mt-2 mb-2">
                    <img
                      src={welcomeImageUrl}
                      alt="Welcome preview"
                      className="max-h-40 rounded border border-gray-200 object-contain bg-gray-50"
                    />
                  </div>
                )}
                <label className="text-sm font-medium text-gray-900">Welcome Image URL</label>
                <div className="flex gap-2 mt-2">
                  <input
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm"
                    value={welcomeImageUrl}
                    onChange={(e) => setWelcomeImageUrl(e.target.value)}
                    placeholder="https://... or Telegram file_id"
                  />
                  <label className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 cursor-pointer">
                    Upload Image
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          setSaving(true);
                          const up = await uploadFile(file, 'welcome');
                          setWelcomeImageUrl(up.url);
                          setMessage({ type: 'success', text: 'Welcome image uploaded' });
                        } catch (err) {
                          setMessage({ type: 'error', text: 'Image upload failed' });
                        } finally {
                          setSaving(false);
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              <div>
                {welcomeVideoUrl && (
                  <div className="mt-2 mb-2">
                    <video
                      src={welcomeVideoUrl}
                      controls
                      className="max-h-56 rounded border border-gray-200 bg-black"
                    />
                  </div>
                )}
                <label className="text-sm font-medium text-gray-900">Welcome Video URL</label>
                <div className="flex gap-2 mt-2">
                  <input
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm"
                    value={welcomeVideoUrl}
                    onChange={(e) => setWelcomeVideoUrl(e.target.value)}
                    placeholder="https://... or Telegram file_id"
                  />
                  <label className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 cursor-pointer">
                    Upload Video
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          setSaving(true);
                          const up = await uploadFile(file, 'welcome');
                          setWelcomeVideoUrl(up.url);
                          setMessage({ type: 'success', text: 'Welcome video uploaded' });
                        } catch (err) {
                          setMessage({ type: 'error', text: 'Video upload failed' });
                        } finally {
                          setSaving(false);
                        }
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Languages Tab */}
      {activeTab === 'languages' && (
        <div className="grid gap-4">
          <div className="p-4 rounded-lg bg-white shadow-sm border">
            <h3 className="text-sm font-medium text-gray-900">Supported Languages (JSON)</h3>
            <textarea
              value={supportedLanguages}
              onChange={(e) => setSupportedLanguages(e.target.value)}
              rows={6}
              className="w-full mt-3 px-3 py-2 rounded-lg border border-gray-300 font-mono text-sm"
            />
            <div className="mt-3">
              <label className="text-sm font-medium text-gray-900">Default Language</label>
              <input
                type="text"
                value={defaultLanguage}
                onChange={(e) => setDefaultLanguage(e.target.value)}
                className="w-full mt-2 px-3 py-2 rounded-lg border border-gray-300 text-sm"
                placeholder="en"
              />
            </div>
            <div className="mt-3 text-xs text-gray-500">Save Changes will persist keys: supported_languages, default_language, welcome_text, welcome_image_url, welcome_video_url.</div>
          </div>
        </div>
      )}

      {/* Onboarding Tab */}
      {activeTab === 'onboarding' && (
        <div className="grid gap-4">
          <div className="p-4 rounded-lg bg-white shadow-sm border">
            <h3 className="text-sm font-medium text-gray-900">Create Onboarding Question</h3>

            <div className="grid gap-3 mt-3">
              <div>
                <label className="text-sm font-medium text-gray-900">Code</label>
                <input
                  className="w-full mt-2 px-3 py-2 rounded-lg border border-gray-300 text-sm"
                  value={newQuestionCode}
                  onChange={(e) => setNewQuestionCode(e.target.value)}
                  placeholder="profile_name"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-900">Type</label>
                <select
                  className="w-full mt-2 px-3 py-2 rounded-lg border border-gray-300 text-sm"
                  value={newQuestionType}
                  onChange={(e) => setNewQuestionType(e.target.value as any)}
                >
                  <option value="text">Text</option>
                  <option value="single_choice">Single choice</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-900">Question (English)</label>
                <input
                  className="w-full mt-2 px-3 py-2 rounded-lg border border-gray-300 text-sm"
                  value={newQuestionTextEn}
                  onChange={(e) => setNewQuestionTextEn(e.target.value)}
                  placeholder="What is your name?"
                />
              </div>

              {newQuestionType === 'single_choice' && (
                <div>
                  <label className="text-sm font-medium text-gray-900">Options (one per line)</label>
                  <p className="text-xs text-gray-500 mt-1">Format: key=Label (example: yes=Yes)</p>
                  <textarea
                    className="w-full mt-2 px-3 py-2 rounded-lg border border-gray-300 font-mono text-sm"
                    rows={5}
                    value={newQuestionOptions}
                    onChange={(e) => setNewQuestionOptions(e.target.value)}
                    placeholder={'yes=Yes\nno=No'}
                  />
                </div>
              )}

              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={newQuestionRequired} onChange={(e) => setNewQuestionRequired(e.target.checked)} />
                  Required
                </label>

                <div className="flex items-center gap-2">
                  <span className="text-sm">Sort order</span>
                  <input
                    type="number"
                    className="w-24 px-3 py-2 rounded-lg border border-gray-300 text-sm"
                    value={newQuestionSortOrder}
                    onChange={(e) => setNewQuestionSortOrder(parseInt(e.target.value || '0', 10))}
                  />
                </div>
              </div>

              <button
                className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white"
                onClick={async () => {
                  try {
                    const question_translations = { en: newQuestionTextEn };

                    let options_translations: any = null;
                    if (newQuestionType === 'single_choice') {
                      const lines = newQuestionOptions.split('\n').map(l => l.trim()).filter(Boolean);
                      const opts: Record<string, string> = {};
                      for (const line of lines) {
                        const idx = line.indexOf('=');
                        if (idx === -1) continue;
                        const key = line.slice(0, idx).trim();
                        const label = line.slice(idx + 1).trim();
                        if (key) opts[key] = label;
                      }
                      options_translations = { en: opts };
                    }

                    const payload: any = {
                      code: newQuestionCode,
                      is_active: true,
                      trigger: 'on_start',
                      type: newQuestionType,
                      required: newQuestionRequired,
                      sort_order: newQuestionSortOrder,
                      question_translations,
                      options_translations
                    };

                    const created = await createOnboardingQuestion(payload);
                    setOnboardingQuestions([created.question, ...onboardingQuestions]);
                    setMessage({ type: 'success', text: 'Question created' });
                  } catch (e) {
                    setMessage({ type: 'error', text: 'Failed to create question' });
                  }
                }}
              >
                Create
              </button>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-white shadow-sm border">
            <h3 className="text-sm font-medium text-gray-900">Questions</h3>
            <div className="mt-3 grid gap-3">
              {onboardingQuestions.map((q) => (
                <div key={q.id} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{q.code} (#{q.id})</div>
                    <div className="flex gap-2">
                      <button className="text-sm text-red-600" onClick={async () => {
                        await deleteOnboardingQuestion(q.id);
                        setOnboardingQuestions(onboardingQuestions.filter(x => x.id !== q.id));
                      }}>Delete</button>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">type={q.type} active={String(q.is_active)} sort={q.sort_order}</div>
                  <button className="mt-2 text-sm text-blue-600" onClick={async () => {
                    await updateOnboardingQuestion(q.id, { is_active: !q.is_active });
                    setOnboardingQuestions(onboardingQuestions.map(x => x.id === q.id ? { ...x, is_active: !x.is_active } : x));
                  }}>Toggle Active</button>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-lg bg-white shadow-sm border">
            <h3 className="text-sm font-medium text-gray-900">Latest Answers (max 500)</h3>
            <div className="mt-3 text-xs text-gray-700 max-h-[28rem] overflow-auto">
              <pre>{JSON.stringify(onboardingAnswers.slice(0, 50), null, 2)}</pre>
            </div>
          </div>
        </div>
      )}

      {/* Broadcast Tab */}
      {activeTab === 'broadcast' && (
        <div className="grid gap-4">
          <div className="p-4 rounded-lg bg-white shadow-sm border">
            <h3 className="text-sm font-medium text-gray-900">Broadcast (text + photo/video)</h3>
            <textarea
              value={broadcastMessage}
              onChange={(e) => setBroadcastMessage(e.target.value)}
              rows={6}
              className="w-full mt-3 px-3 py-2 rounded-lg border border-gray-300 text-sm"
              placeholder="Message (optional if sending media)"
            />
            <div className="mt-3 flex gap-3 items-center">
              <select className="px-3 py-2 border rounded" value={broadcastTarget} onChange={(e) => setBroadcastTarget(e.target.value as any)}>
                <option value="all">All</option>
                <option value="premium">Premium</option>
                <option value="non_banned">Non-banned</option>
              </select>
              <select className="px-3 py-2 border rounded" value={broadcastMediaType} onChange={(e) => setBroadcastMediaType(e.target.value as any)}>
                <option value="photo">Photo</option>
                <option value="video">Video</option>
              </select>
              <label className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 cursor-pointer">
                {broadcastUploading ? 'Uploading...' : 'Upload Media'}
                <input
                  type="file"
                  accept={broadcastMediaType === 'photo' ? 'image/*' : 'video/*'}
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      setBroadcastUploading(true);
                      const up = await uploadFile(file, 'broadcast');
                      setBroadcastMediaUrl(up.url);
                    } catch (err) {
                      setMessage({ type: 'error', text: 'Media upload failed' });
                    } finally {
                      setBroadcastUploading(false);
                    }
                  }}
                />
              </label>
            </div>
            <input
              className="w-full mt-3 px-3 py-2 rounded-lg border border-gray-300 text-sm"
              value={broadcastMediaUrl}
              onChange={(e) => setBroadcastMediaUrl(e.target.value)}
              placeholder="Media URL (optional if not sending media)"
            />
            <button
              className="mt-3 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white"
              onClick={async () => {
                try {
                  const res = await broadcastMedia({
                    message: broadcastMessage,
                    media_type: broadcastMediaUrl ? broadcastMediaType : undefined,
                    media_url: broadcastMediaUrl || undefined,
                    target: broadcastTarget
                  });
                  setMessage({ type: 'success', text: `Broadcast done. Sent=${res.sent}, Failed=${res.failed}` });
                } catch (e) {
                  setMessage({ type: 'error', text: 'Broadcast failed' });
                }
              }}
            >
              Send Broadcast
            </button>
          </div>
        </div>
      )}
    </div>
  );
}