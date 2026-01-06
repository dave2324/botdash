'use client';

import { useState, useEffect } from 'react';
import { Settings, Save, RefreshCw, DollarSign, Crown, MessageCircle } from 'lucide-react';

import { motion } from 'framer-motion';
import {
  Setting,
  getSettings,
  bulkUpdateSettings,
  uploadFile,
  getOnboardingQuestions,
  createOnboardingQuestion,
  updateOnboardingQuestion,
  deleteOnboardingQuestion,
  getOnboardingAnswers,
  getWelcomeBlocks,
  saveWelcomeBlocks,
  WelcomeBlock,
  WelcomeBlockType,
  OnboardingQuestion,
  OnboardingAnswer
} from '@/lib/api';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [activeTab, setActiveTab] = useState<'points' | 'premium' | 'welcome' | 'languages' | 'onboarding'>('welcome');

  const [supportedLanguages, setSupportedLanguages] = useState<string>('');
  const [defaultLanguage, setDefaultLanguage] = useState<string>('en');
  const [welcomeText, setWelcomeText] = useState<string>('');
  const [welcomeImageUrl, setWelcomeImageUrl] = useState<string>('');
  const [welcomeVideoUrl, setWelcomeVideoUrl] = useState<string>('');

  // New Welcome Builder (ordered blocks)
  const [welcomeBlocks, setWelcomeBlocks] = useState<any[]>([]);

  const [onboardingQuestions, setOnboardingQuestions] = useState<OnboardingQuestion[]>([]);
  const [onboardingAnswers, setOnboardingAnswers] = useState<OnboardingAnswer[]>([]);
  const [newQuestionCode, setNewQuestionCode] = useState('profile_name');
  const [newQuestionType, setNewQuestionType] = useState<'text' | 'single_choice'>('text');
  const [newQuestionTextEn, setNewQuestionTextEn] = useState('What is your name?');
  const [newQuestionOptions, setNewQuestionOptions] = useState<string>(''); // one option per line: key=Label
  const [newQuestionRequired, setNewQuestionRequired] = useState(true);
  const [newQuestionSortOrder, setNewQuestionSortOrder] = useState(0);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  useEffect(() => {
    fetchSettings();

    // Load welcome blocks
    (async () => {
      try {
        const wb = await getWelcomeBlocks();
        setWelcomeBlocks(wb.blocks || []);
      } catch {
        // ignore if not configured
      }
    })();

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

      // Save welcome blocks first
      try {
        const normalized: WelcomeBlock[] = (welcomeBlocks || []).map((b: any, idx: number) => ({
          sort_order: typeof b.sort_order === 'number' ? b.sort_order : idx,
          is_active: b.is_active !== false,
          block_type: b.block_type as WelcomeBlockType,
          payload: b.payload ?? {},
        }));
        await saveWelcomeBlocks(normalized);
      } catch (e) {
        // If welcome blocks fail, still allow settings save.
        console.error('Error saving welcome blocks:', e);
      }

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
          <h1 className="text-2xl font-bold">Welcome Messages</h1>
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

      {/* Welcome (Legacy + Builder) */}
      {activeTab === 'welcome' && (
        <div className="grid gap-4">
          {/* Welcome Builder */}
          <div className="p-4 rounded-lg bg-white shadow-sm border">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900">Welcome Messages</h3>
              <button
                type="button"
                className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm"
                onClick={() => {
                  const nextSort = (welcomeBlocks?.length || 0);
                  setWelcomeBlocks([
                    ...(welcomeBlocks || []),
                    { sort_order: nextSort, is_active: true, block_type: 'text', payload: { text: '' } }
                  ]);
                }}
              >
                + Add Row
              </button>
            </div>

            <div className="mt-3 overflow-auto">
              <table className="min-w-full text-sm border">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 border">Order</th>
                    <th className="p-2 border">Active</th>
                    <th className="p-2 border">Type</th>
                    <th className="p-2 border">Content</th>
                    <th className="p-2 border">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(welcomeBlocks || []).map((b: any, idx: number) => (
                    <tr key={idx} className="align-top">
                      <td className="p-2 border w-16 text-center">{idx + 1}</td>
                      <td className="p-2 border w-20 text-center">
                        <input
                          type="checkbox"
                          checked={b.is_active !== false}
                          onChange={(e) => {
                            const copy = [...(welcomeBlocks || [])];
                            copy[idx] = { ...copy[idx], is_active: e.target.checked };
                            setWelcomeBlocks(copy);
                          }}
                        />
                      </td>
                      <td className="p-2 border w-44">
                        <select
                          className="w-full px-2 py-1 border rounded"
                          value={b.block_type}
                          onChange={(e) => {
                            const t = e.target.value as WelcomeBlockType;
                            const copy = [...(welcomeBlocks || [])];
                            const payload =
                              t === 'text'
                                ? { text: '' }
                                : t === 'link'
                                  ? { title: '', url: '' }
                                  : t === 'image'
                                    ? { url: '', caption: '' }
                                    : t === 'video'
                                      ? { url: '', caption: '' }
                                      : { slug: '' };
                            copy[idx] = { ...copy[idx], block_type: t, payload };
                            setWelcomeBlocks(copy);
                          }}
                        >
                          <option value="text">Text</option>
                          <option value="link">Link</option>
                          <option value="image">Image</option>
                          <option value="video">Video</option>
                          <option value="question_flow">Question (Flow)</option>
                        </select>
                      </td>
                      <td className="p-2 border">
                        {b.block_type === 'text' && (
                          <textarea
                            className="w-full px-2 py-1 border rounded"
                            rows={3}
                            value={b.payload?.text || ''}
                            onChange={(e) => {
                              const copy = [...(welcomeBlocks || [])];
                              copy[idx] = { ...copy[idx], payload: { ...(copy[idx].payload || {}), text: e.target.value } };
                              setWelcomeBlocks(copy);
                            }}
                            placeholder="Text content"
                          />
                        )}

                        {b.block_type === 'link' && (
                          <div className="grid gap-2">
                            <input
                              className="w-full px-2 py-1 border rounded"
                              value={b.payload?.title || ''}
                              onChange={(e) => {
                                const copy = [...(welcomeBlocks || [])];
                                copy[idx] = { ...copy[idx], payload: { ...(copy[idx].payload || {}), title: e.target.value } };
                                setWelcomeBlocks(copy);
                              }}
                              placeholder="Link title"
                            />
                            <input
                              className="w-full px-2 py-1 border rounded"
                              value={b.payload?.url || ''}
                              onChange={(e) => {
                                const copy = [...(welcomeBlocks || [])];
                                copy[idx] = { ...copy[idx], payload: { ...(copy[idx].payload || {}), url: e.target.value } };
                                setWelcomeBlocks(copy);
                              }}
                              placeholder="https://example.com"
                            />
                          </div>
                        )}

                        {(b.block_type === 'image' || b.block_type === 'video') && (
                          <div className="grid gap-2">
                            <div className="flex gap-2">
                              <input
                                className="flex-1 px-2 py-1 border rounded"
                                value={b.payload?.url || ''}
                                onChange={(e) => {
                                  const copy = [...(welcomeBlocks || [])];
                                  copy[idx] = { ...copy[idx], payload: { ...(copy[idx].payload || {}), url: e.target.value } };
                                  setWelcomeBlocks(copy);
                                }}
                                placeholder="Media URL"
                              />

                              <label className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 cursor-pointer whitespace-nowrap">
                                Upload {b.block_type === 'image' ? 'Image' : 'Video'}
                                <input
                                  type="file"
                                  accept={b.block_type === 'image' ? 'image/*' : 'video/*'}
                                  className="hidden"
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    try {
                                      setSaving(true);
                                      const up = await uploadFile(file, 'welcome');
                                      const copy = [...(welcomeBlocks || [])];
                                      copy[idx] = { ...copy[idx], payload: { ...(copy[idx].payload || {}), url: up.url } };
                                      setWelcomeBlocks(copy);
                                      setMessage({ type: 'success', text: `${b.block_type === 'image' ? 'Image' : 'Video'} uploaded` });
                                      setTimeout(() => setMessage(null), 2500);
                                    } catch (err) {
                                      setMessage({ type: 'error', text: 'Upload failed' });
                                    } finally {
                                      setSaving(false);
                                      // allow re-upload of same file
                                      e.currentTarget.value = '';
                                    }
                                  }}
                                />
                              </label>
                            </div>

                            <input
                              className="w-full px-2 py-1 border rounded"
                              value={b.payload?.caption || ''}
                              onChange={(e) => {
                                const copy = [...(welcomeBlocks || [])];
                                copy[idx] = { ...copy[idx], payload: { ...(copy[idx].payload || {}), caption: e.target.value } };
                                setWelcomeBlocks(copy);
                              }}
                              placeholder="Caption (optional)"
                            />
                          </div>
                        )}

                        {b.block_type === 'question_flow' && (
                          <div className="grid gap-2">
                            <input
                              className="w-full px-2 py-1 border rounded"
                              value={b.payload?.slug || ''}
                              onChange={(e) => {
                                const copy = [...(welcomeBlocks || [])];
                                copy[idx] = { ...copy[idx], payload: { ...(copy[idx].payload || {}), slug: e.target.value } };
                                setWelcomeBlocks(copy);
                              }}
                              placeholder="Flow slug (published)"
                            />
                            <div className="text-xs text-gray-500">
                              This will start the published flow after previous welcome items.
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="p-2 border w-40">
                        <div className="flex flex-col gap-2">
                          <button
                            type="button"
                            className="px-2 py-1 border rounded hover:bg-gray-50"
                            disabled={idx === 0}
                            onClick={() => {
                              if (idx === 0) return;
                              const copy = [...(welcomeBlocks || [])];
                              const tmp = copy[idx - 1];
                              copy[idx - 1] = copy[idx];
                              copy[idx] = tmp;
                              setWelcomeBlocks(copy);
                            }}
                          >
                            ▲ Up
                          </button>
                          <button
                            type="button"
                            className="px-2 py-1 border rounded hover:bg-gray-50"
                            disabled={idx === (welcomeBlocks?.length || 0) - 1}
                            onClick={() => {
                              const copy = [...(welcomeBlocks || [])];
                              if (idx >= copy.length - 1) return;
                              const tmp = copy[idx + 1];
                              copy[idx + 1] = copy[idx];
                              copy[idx] = tmp;
                              setWelcomeBlocks(copy);
                            }}
                          >
                            ▼ Down
                          </button>
                          <button
                            type="button"
                            className="px-2 py-1 border rounded text-red-600 hover:bg-red-50"
                            onClick={() => {
                              const copy = [...(welcomeBlocks || [])];
                              copy.splice(idx, 1);
                              setWelcomeBlocks(copy);
                            }}
                          >
                            ✖ Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

    </div>
  );
}