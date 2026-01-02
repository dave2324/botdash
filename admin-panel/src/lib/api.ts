import axios from 'axios';

// Backend runs on a separate port from the Next.js dev server.
// If NEXT_PUBLIC_API_URL is not set, default to http://localhost:3001.
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Create axios instance with default config
const api = axios.create({
  baseURL: `${API_URL}`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('admin_token');
    if (token) {
      config.headers['x-admin-token'] = token;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle common errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear token and redirect to login if unauthorized
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_username');
      
      // Clear cookies
      document.cookie = 'admin_token=; path=/; max-age=0';
      document.cookie = 'admin_username=; path=/; max-age=0';
      
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Helper function to make authenticated fetch API calls
export const fetchWithAuth = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const token = localStorage.getItem('admin_token');
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { 'x-admin-token': token }),
    ...(options.headers || {}),
  };

  const response = await fetch(url.startsWith('http') ? url : `${API_URL}${url}`, {
    ...options,
    headers,
  });

  // Handle unauthorized errors
  if (response.status === 401) {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_username');
    
    // Clear cookies
    document.cookie = 'admin_token=; path=/; max-age=0';
    document.cookie = 'admin_username=; path=/; max-age=0';
    
    window.location.href = '/login';
  }

  return response;
};

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  username: string;
  role?: string;
  role_id?: number;
  is_superadmin?: boolean;
  permissions?: string[];
}

export interface User {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  language_code: string;
  photo_url: string | null;
  points: number;
  referral_code: string;
  created_at: string;
  last_active: string;
  is_banned: boolean;
  is_premium: boolean;
  premium_until: string | null;
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface UsersResponse {
  users: User[];
  pagination: Pagination;
}

export interface Referral {
  id: number;
  referrer_id: number;
  referrer_username: string | null;
  referrer_first_name: string;
  referrer_last_name: string | null;
  referrer_photo_url: string | null;
  referred_id: number;
  referred_username: string | null;
  referred_first_name: string;
  referred_last_name: string | null;
  referred_photo_url: string | null;
  points_awarded: number;
  created_at: string;
}

export interface ReferralsResponse {
  referrals: Referral[];
  pagination: Pagination;
}

export interface UserDetailResponse {
  user: User & {
    total_tasks_completed: number;
    total_points_earned: number;
    total_referrals: number;
  };
  tasks: {
    id: number;
    type: string;
    description: string;
    completed_at: string;
    points_awarded: number;
  }[];
  referrals: {
    id: number;
    created_at: string;
    points_awarded: number;
    referred_user_id: number;
    referred_username: string;
    referred_first_name: string;
    referred_last_name: string;
    referred_photo_url: string | null;
  }[];
}

export interface DashboardSummary {
  totalUsers: number;
  activeQuizzes: number;
  videoTasks: number;
  totalPoints: number;
  taskPoints: {
    quiz: number;
    video: number;
    channel: number;
    referral: number;
    spin: number;
  };
}

// Authentication API calls
export const login = async (credentials: LoginCredentials): Promise<LoginResponse> => {
  const response = await api.post('/admin/login', credentials);
  return response.data;
};

// User management API calls
export const getUsers = async (page = 1, limit = 10, showBanned = false, showPremium?: boolean): Promise<UsersResponse> => {
  let url = `/admin/users?page=${page}&limit=${limit}&banned=${showBanned ? '1' : '0'}`;
  if (showPremium !== undefined) {
    url += `&premium=${showPremium ? '1' : '0'}`;
  }
  const response = await api.get(url);
  return response.data;
};

export const getUserById = async (id: number): Promise<UserDetailResponse> => {
  const response = await api.get(`/admin/users/${id}`);
  return response.data;
};

export const updateUserPoints = async (id: number, points: number, reason?: string) => {
  const response = await api.patch(`/admin/users/${id}/points`, { points, reason });
  return response.data;
};

// Ban or unban a user
export const setUserBanned = async (id: number, is_banned: boolean): Promise<User> => {
  const response = await api.patch(`/admin/users/${id}/ban`, { is_banned });
  return response.data.user;
};

// Toggle premium status for a user
export const setUserPremium = async (id: number, is_premium: boolean, premium_until?: string): Promise<User> => {
  const response = await api.patch(`/admin/users/${id}/premium`, { is_premium, premium_until });
  return response.data.user;
};

// Referrals API calls
export const getReferrals = async (page = 1, limit = 10): Promise<ReferralsResponse> => {
  const response = await api.get(`/admin/referrals?page=${page}&limit=${limit}`);
  return response.data;
};

export const getReferralById = async (id: number) => {
  const response = await api.get(`/admin/referrals/${id}`);
  return response.data;
};

// Dashboard API calls
export const getDashboardSummary = async (): Promise<DashboardSummary> => {
  const response = await api.get('/admin/dashboard-summary');
  return response.data;
};

// Dashboard stats for sidebar counters
export interface DashboardStats {
  promotion_submissions: {
    pending: number;
    approved: number;
    rejected: number;
  };
  user_submitted_promotions: {
    pending: number;
    approved: number;
    declined: number;
    active: number;
  };
  users: {
    active: number;
    banned: number;
  };
  quizzes: {
    active: number;
    inactive: number;
  };
  youtube_tasks: {
    active: number;
    disabled: number;
  };
  telegram_channels: {
    active: number;
    disabled: number;
  };
  referrals: {
    total: number;
  };
  spin_wheel_rewards: {
    active: number;
    inactive: number;
  };
  // New fields for additional features
  affiliateTasks: {
    active: number;
    pending: number;
    completed: number;
  };
  courses: {
    active: number;
    inactive: number;
  };
  // Aliases for consistency
  videoTasks: {
    active: number;
    disabled: number;
  };
  telegramChannels: {
    active: number;
    disabled: number;
  };
  userPromotions: {
    pending: number;
    approved: number;
    declined: number;
    active: number;
  };
  promotionSubmissions: {
    pending: number;
    approved: number;
    rejected: number;
  };
  spinWheelRewards: {
    active: number;
    inactive: number;
  };
}



// --- YOUTUBE VIDEO TASKS ---
export interface YoutubeTask {
  id: number;
  youtube_url: string;
  title: string;
  thumbnail: string;
  added_at: string;
  expires_at: string | null;
  disabled: boolean;
  video_duration: number | null;
  question_count?: number;
  completion_count?: number;
  completion_limit?: number | null;
  require_finish_task_id?: number | null;
  require_finish_task_type?: string | null;
  require_premium?: boolean;
  vpn_countries?: string[];
}

export interface YoutubeQuestion {
  id: number;
  youtube_task_id: number;
  question: string;
  correct_answer: string;
  wrong_answers: string[];
  question_type?: string;
  max_attempts?: number;
  cooldown_seconds?: number;
  created_at: string;
  updated_at: string;
}

export interface VideoCompletion {
  id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  photo_url: string | null;
  completed_at: string;
  metadata: any;
}

export interface YoutubeTaskResponse {
  task: YoutubeTask;
  questions: YoutubeQuestion[];
  completions?: VideoCompletion[];
}

export interface YoutubeTasksResponse {
  tasks: YoutubeTask[];
}

export const getYoutubeTasks = async (options?: { includeUserPromotions?: boolean }): Promise<YoutubeTasksResponse> => {
  const params: any = {};
  if (options?.includeUserPromotions) {
    params.includeUserPromotions = 1;
  }
  const response = await api.get('/admin/youtube-tasks', { params });
  return response.data;
};

export const getYoutubeTask = async (id: number): Promise<YoutubeTaskResponse> => {
  const response = await api.get(`/admin/youtube-tasks/${id}`);
  return response.data;
};

export const getTelegramChannel = async (id: number): Promise<TelegramChannelResponse> => {
  const response = await api.get(`/admin/telegram-channels/${id}`);
  return response.data;
};

export interface YoutubeQuestionInput {
  question: string;
  correct_answer: string;
  wrong_answers: string[];
  question_type?: string;
  max_attempts?: number;
  cooldown_seconds?: number;
}

export const addYoutubeTask = async (
  youtube_url: string,
  expires_at?: string | null,
  questions?: YoutubeQuestionInput[],
  require_finish_task_id?: number | null,
  require_finish_task_type?: string | null,
  require_premium?: boolean,
  vpn_countries?: string[],
  completion_limit?: number | null
): Promise<YoutubeTaskResponse> => {
  const response = await api.post('/admin/youtube-tasks', {
    youtube_url,
    expires_at,
    questions,
    require_finish_task_id,
    require_finish_task_type,
    require_premium,
    vpn_countries,
    completion_limit
  });
  return response.data;
};

export const editYoutubeTask = async (
  id: number,
  data: {
    expires_at?: string | null;
    disabled?: boolean;
    questions?: YoutubeQuestionInput[];
    require_finish_task_id?: number | null;
    require_finish_task_type?: string | null;
    require_premium?: boolean;
    vpn_countries?: string[];
    completion_limit?: number | null;
  }
): Promise<YoutubeTaskResponse> => {
  const response = await api.patch(`/admin/youtube-tasks/${id}`, data);
  return response.data;
};

export const setYoutubeTaskCompletedUsers = async (id: number, completed_user_ids: number[]) => {
  const response = await api.post(`/admin/youtube-tasks/${id}/completed-users`, { completed_user_ids });
  return response.data.task;
};

// --- TELEGRAM CHANNELS ---
export interface TelegramChannel {
  id: number;
  name: string;
  title?: string;
  link: string;
  is_public: boolean;
  is_private?: boolean;
  disabled: boolean;
  expires_at: string | null;
  created_at: string;
  join_count?: number;
  require_finish_task_id?: number | null;
  require_finish_task_type?: string | null;
  require_premium?: boolean;
}

export interface ChannelJoin {
  id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  photo_url: string | null;
  joined_at: string;
}

export interface TelegramChannelResponse {
  channel: TelegramChannel;
  joins?: ChannelJoin[];
}

export interface TelegramChannelsResponse {
  channels: TelegramChannel[];
}

export const getTelegramChannels = async (): Promise<TelegramChannelsResponse> => {
  const response = await api.get('/admin/telegram-channels');
  return response.data;
};

export const addTelegramChannel = async (
  link: string,
  expires_at?: string | null,
  require_finish_task_id?: number | null,
  require_finish_task_type?: string | null,
  require_premium?: boolean
): Promise<{ message: string; channel: TelegramChannel }> => {
  const response = await api.post('/admin/telegram-channels', { link, expires_at, require_finish_task_id, require_finish_task_type, require_premium });
  return response.data;
};

export const editTelegramChannel = async (
  id: number,
  data: {
    disabled?: boolean;
    expires_at?: string | null;
    require_finish_task_id?: number | null;
    require_finish_task_type?: string | null;
    require_premium?: boolean;
  }
): Promise<{ message: string; channel: TelegramChannel }> => {
  const response = await api.patch(`/admin/telegram-channels/${id}`, data);
  return response.data;
};

export const deleteTelegramChannel = async (id: number): Promise<{ message: string }> => {
  const response = await api.delete(`/admin/telegram-channels/${id}`);
  return response.data;
};

export interface TopUser {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  photo_url: string | null;
  points: number;
  completed_tasks_count: number;
  referral_count: number;
}

export const getTopUsers = async (limit = 5): Promise<TopUser[]> => {
  const response = await api.get(`/admin/top-users?limit=${limit}`);
  return response.data.users;
};

export interface RecentActivity {
  type: 'task' | 'referral' | 'spin' | 'custom_quiz';
  user_id: number;
  username: string;
  first_name: string;
  last_name: string;
  photo_url: string | null;
  task_type: string | null;
  task_icon?: string;
  description: string;
  points: number;
  timestamp: string;
}

export interface ActivitiesResponse {
  activities: RecentActivity[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
  };
}

export interface ActivityFilters {
  type?: string;
  task_type?: string;
  user_id?: number;
  start_date?: string;
  end_date?: string;
}

export const getRecentActivities = async (
  limit = 20,
  cursor?: string,
  filters?: ActivityFilters
): Promise<ActivitiesResponse> => {
  let url = `/admin/recent-activities?limit=${limit}`;
  if (cursor) {
    url += `&cursor=${encodeURIComponent(cursor)}`;
  }
  
  // Add filters if provided
  if (filters) {
    if (filters.type) url += `&type=${encodeURIComponent(filters.type)}`;
    if (filters.task_type) url += `&task_type=${encodeURIComponent(filters.task_type)}`;
    if (filters.user_id) url += `&user_id=${filters.user_id}`;
    if (filters.start_date) url += `&start_date=${encodeURIComponent(filters.start_date)}`;
    if (filters.end_date) url += `&end_date=${encodeURIComponent(filters.end_date)}`;
  }
  
  const response = await api.get(url);
  return response.data;
};

// --- SETTINGS ---
export interface Setting {
  id: number;
  key: string;
  value: string | number; // Changed to support both string and number values
  description: string;
  updated_at: string;
}

export interface UserRequest {
  id: number;
  user_id: number;
  telegram_chat_id: number;
  source: string;
  action_key: string;
  message: string;
  payload: any;
  status: 'open' | 'in_progress' | 'closed';
  admin_reply?: string;
  replied_at?: string;
  created_at: string;
  updated_at: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface SettingsResponse {
  settings: Setting[];
}

export const getSettings = async (): Promise<SettingsResponse> => {
  const response = await api.get('/admin/settings');
  return response.data;
};

export const updateSetting = async (key: string, value: string | number): Promise<Setting> => {
  const response = await api.patch(`/admin/settings/${key}`, { value });
  return response.data.setting;
};

export const bulkUpdateSettings = async (settings: { key: string; value: string | number }[]): Promise<Setting[]> => {
  const response = await api.post('/admin/settings/bulk-update', { settings });
  return response.data.settings;
};

// --- FLOW BUILDER ---
export const getFlows = async (): Promise<{ flows: any[] }> => {
  const response = await api.get('/admin/flows');
  return response.data;
};

export const createFlow = async (data: { slug: string; title: string; description?: string }): Promise<any> => {
  const response = await api.post('/admin/flows', data);
  return response.data;
};

export const getFlow = async (id: number): Promise<{ flow: any; versions: any[] }> => {
  const response = await api.get(`/admin/flows/${id}`);
  return response.data;
};

export const createFlowVersion = async (flowId: number): Promise<any> => {
  const response = await api.post(`/admin/flows/${flowId}/versions`, {});
  return response.data;
};

export const getFlowVersion = async (flowId: number, versionId: number): Promise<any> => {
  const response = await api.get(`/admin/flows/${flowId}/versions/${versionId}`);
  return response.data;
};

export const setFlowStartNode = async (versionId: number, start_node_key: string): Promise<any> => {
  const response = await api.post(`/admin/flows/versions/${versionId}/start`, { start_node_key });
  return response.data;
};

export const validateFlowVersion = async (versionId: number): Promise<{ ok: boolean; errors: string[] }> => {
  const response = await api.get(`/admin/flows/versions/${versionId}/validate`);
  return response.data;
};

export const publishFlowVersion = async (versionId: number): Promise<any> => {
  const response = await api.post(`/admin/flows/versions/${versionId}/publish`, {});
  return response.data;
};

export const upsertFlowNode = async (versionId: number, nodeKey: string, node: any): Promise<any> => {
  const response = await api.put(`/admin/flows/versions/${versionId}/nodes/${encodeURIComponent(nodeKey)}`, node);
  return response.data;
};

export const deleteFlowNode = async (versionId: number, nodeKey: string): Promise<any> => {
  const response = await api.delete(`/admin/flows/versions/${versionId}/nodes/${encodeURIComponent(nodeKey)}`);
  return response.data;
};

export const upsertFlowOption = async (nodeId: number, optionKey: string, option: any): Promise<any> => {
  const response = await api.put(`/admin/flows/nodes/${nodeId}/options/${encodeURIComponent(optionKey)}`, option);
  return response.data;
};

export const deleteFlowOption = async (nodeId: number, optionKey: string): Promise<any> => {
  const response = await api.delete(`/admin/flows/nodes/${nodeId}/options/${encodeURIComponent(optionKey)}`);
  return response.data;
};

// --- SPIN WHEEL ---
export interface SpinWheelReward {
  id: number;
  label: string;
  points: number;
  color: string;
  probability: number;
  is_active: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface SpinWheelRewardsResponse {
  rewards: SpinWheelReward[];
}

export const getSpinWheelRewards = async (): Promise<SpinWheelRewardsResponse> => {
  const response = await api.get('/admin/spin-wheel/rewards');
  return response.data;
};

export const createSpinWheelReward = async (reward: Omit<SpinWheelReward, 'id' | 'created_at' | 'updated_at'>): Promise<SpinWheelReward> => {
  const response = await api.post('/admin/spin-wheel/rewards', reward);
  return response.data.reward;
};

export const updateSpinWheelReward = async (id: number, reward: Partial<SpinWheelReward>): Promise<SpinWheelReward> => {
  const response = await api.patch(`/admin/spin-wheel/rewards/${id}`, reward);
  return response.data.reward;
};

export const deleteSpinWheelReward = async (id: number): Promise<void> => {
  await api.delete(`/admin/spin-wheel/rewards/${id}`);
};

export const reorderSpinWheelRewards = async (rewards: { id: number; position: number }[]): Promise<SpinWheelReward[]> => {
  const response = await api.post('/admin/spin-wheel/rewards/reorder', { rewards });
  return response.data;
};

export const resetSpinWheelToDefault = async (): Promise<SpinWheelRewardsResponse> => {
  const response = await api.post('/admin/spin-wheel/reset-to-default');
  return response.data;
};

// --- QUIZZES ---
export interface QuizQuestion {
  id: number;
  quiz_id: number;
  question_text: string;
  correct_answer: string;
  wrong_answers: string[];
  created_at: string;
  updated_at: string;
}

export interface Quiz {
  id: number;
  title: string;
  hashtags: string[];
  category?: string;
  points_per_question: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  question_count: string;
  attempt_count: string;
  avg_score: number;
}

export interface QuizWithQuestions extends Quiz {
  questions: QuizQuestion[];
  require_finish_task_id?: number | null;
  require_finish_task_type?: string | null;
}

export interface CreateQuizData {
  title: string;
  hashtags: string[];
  points_per_question: number;
  category?: string;
  require_finish_task_id?: number | null;
  require_finish_task_type?: string | null;
  questions: {
    question_text: string;
    correct_answer: string;
    wrong_answers: string[];
  }[];
}

export interface UpdateQuizData extends CreateQuizData {
  is_active: boolean;
}

export const getQuizzes = async (category?: string): Promise<{ quizzes: Quiz[] }> => {
  const params = category ? { category } : {};
  const response = await api.get('/admin/quizzes', { params });
  return response.data;
};

export const getQuiz = async (id: number): Promise<{ quiz: QuizWithQuestions }> => {
  const response = await api.get(`/admin/quizzes/${id}`);
  return response.data;
};

export const createQuiz = async (data: CreateQuizData): Promise<{ quiz: QuizWithQuestions }> => {
  const response = await api.post('/admin/quizzes', data);
  return response.data;
};

export const updateQuiz = async (id: number, data: UpdateQuizData): Promise<{ quiz: QuizWithQuestions }> => {
  const response = await api.put(`/admin/quizzes/${id}`, data);
  return response.data;
};

export const deleteQuiz = async (id: number): Promise<void> => {
  await api.delete(`/admin/quizzes/${id}`);
};

export const getQuizCategories = async (): Promise<{ categories: string[] }> => {
  const response = await api.get('/admin/quizzes/categories');
  return response.data;
};

// --- CREATOR PROMOTION PRODUCTS ---
export interface PricingTier {
  id?: number;
  view_count: number;
  points_reward: number;
  cash_reward?: number;
  currency?: string;
  description?: string;
}

export interface PromotionProduct {
  id: number;
  name: string;
  description: string;
  image_url: string | null;
  product_link?: string | null;
  status?: 'active' | 'inactive';
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  pricing_tiers: PricingTier[];
}

export interface PromotionProductsResponse {
  products: PromotionProduct[];
}

export const getPromotionProducts = async (): Promise<PromotionProductsResponse> => {
  const response = await api.get('/admin/promotion-products');
  return response.data;
};

export const getPromotionProduct = async (id: number): Promise<{ product: PromotionProduct }> => {
  const response = await api.get(`/admin/promotion-products/${id}`);
  return response.data;
};

export const createPromotionProduct = async (product: Omit<PromotionProduct, 'id' | 'created_at'>): Promise<{ product: PromotionProduct }> => {
  const response = await api.post('/admin/promotion-products', product);
  return response.data;
};

export const updatePromotionProduct = async (id: number, data: Partial<PromotionProduct>): Promise<{ product: PromotionProduct }> => {
  // If we're just toggling active status, use the toggle endpoint
  if (Object.keys(data).length === 1 && 'is_active' in data) {
    const response = await api.patch(`/admin/promotion-products/${id}/toggle`, {});
    return { product: response.data };
  } else {
    // For full updates, use the PUT endpoint
    const response = await api.put(`/admin/promotion-products/${id}`, data);
    return response.data;
  }
};

export const deletePromotionProduct = async (id: number): Promise<void> => {
  await api.delete(`/admin/promotion-products/${id}`);
};

// --- CREATOR PROMOTION SUBMISSIONS ---
export interface PromotionSubmission {
  id: number;
  user_id: string;
  product_id: number;
  product_name?: string;
  content_url: string;
  platform: string;
  claimed_views: number;
  claimed_likes: number;
  claimed_comments: number;
  proof_url?: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes?: string;
  points_awarded?: number;
  cash_awarded?: number;
  created_at: string;
  updated_at?: string;
  reviewed_at?: string;
  reviewed_by?: number | null;
  // User information from backend API (joined from users table)
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
}

export interface PromotionSubmissionsResponse {
  submissions: PromotionSubmission[];
  pagination?: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface PromotionSubmissionsFilters {
  status?: string;
  platform?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export const getPromotionSubmissions = async (filters?: PromotionSubmissionsFilters): Promise<PromotionSubmissionsResponse> => {
  const params = new URLSearchParams();
  
  if (filters?.status && filters.status !== 'all') {
    params.append('status', filters.status);
  }
  
  if (filters?.platform && filters.platform !== 'all') {
    params.append('platform', filters.platform);
  }
  
  if (filters?.search) {
    params.append('search', filters.search);
  }
  
  if (filters?.limit) {
    params.append('limit', filters.limit.toString());
  }
  
  if (filters?.offset) {
    params.append('offset', filters.offset.toString());
  }
  
  const queryString = params.toString();
  const url = `/admin/promotion-submissions${queryString ? `?${queryString}` : ''}`;
  
  const response = await api.get(url);
  
  // Handle both old format (direct array) and new format (object with submissions)
  if (Array.isArray(response.data)) {
    return { submissions: response.data };
  }
  
  return response.data;
};

export const getPromotionSubmission = async (id: number): Promise<{ submission: PromotionSubmission }> => {
  const response = await api.get(`/admin/promotion-submissions/${id}`);
  return response.data;
};

export const updatePromotionSubmissionStatus = async (
  id: number, 
  status: 'approved' | 'rejected', 
  notes?: string,
  reward_amount?: number
): Promise<{ submission: PromotionSubmission }> => {
  const response = await api.put(`/admin/promotion-submissions/${id}`, {
    status,
    notes,
    reward_amount: status === 'approved' ? reward_amount : 0
  });
  return response.data;
};

// User Submitted Promotions Types
export interface UserSubmittedPromotion {
  id: number;
  user_id: number;
  type: 'channel_join' | 'video_boost';
  title: string;
  description: string;
  target_url: string;
  target_views_joins: number;
  budget_points: number | null;
  budget_cash: number | null;
  expires_at: string;
  status: 'pending' | 'approved' | 'declined' | 'active' | 'completed' | 'expired';
  admin_notes: string | null;
  current_views_joins: number;
  cost_per_action?: number;
  reward_per_action?: number;
  admin_profit_per_action?: number;
  validation_questions?: Array<{
    question: string;
    correct_answer: string;
    wrong_answers: string[];
  }> | null;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  declined_at: string | null;
  activated_at: string | null;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
  total_engagements?: number;
}

export interface PromotionEngagement {
  id: number;
  user_id: number;
  promotion_id: number;
  engagement_type: 'view' | 'join';
  points_awarded: number;
  created_at: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
}

export interface UserPromotionsResponse {
  promotions: UserSubmittedPromotion[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface PromotionDetailResponse {
  promotion: UserSubmittedPromotion;
  engagements: PromotionEngagement[];
  linkedTask?: {
    type: 'channel' | 'video';
    data: TelegramChannel | YoutubeTask;
  };
}

// User Submitted Promotions API Functions
export const getUserPromotions = async (params?: {
  status?: string;
  type?: string;
  page?: number;
  limit?: number;
}): Promise<UserPromotionsResponse> => {
  const response = await api.get('/admin/user-promotions', { params });
  return response.data;
};

export const getUserPromotion = async (id: number): Promise<PromotionDetailResponse> => {
  const response = await api.get(`/admin/user-promotions/${id}`);
  return response.data;
};

export const approveUserPromotion = async (
  id: number, 
  adminNotes?: string, 
  validationQuestions?: Array<{
    question: string;
    correct_answer: string;
    wrong_answers: string[];
  }>
): Promise<{ message: string; promotion: UserSubmittedPromotion }> => {
  const response = await api.put(`/admin/user-promotions/${id}/approve`, { 
    admin_notes: adminNotes,
    validation_questions: validationQuestions 
  });
  return response.data;
};

export const declineUserPromotion = async (id: number, adminNotes?: string): Promise<{ message: string; promotion: UserSubmittedPromotion }> => {
  const response = await api.put(`/admin/user-promotions/${id}/decline`, { admin_notes: adminNotes });
  return response.data;
};

export const getDashboardStats = async (): Promise<DashboardStats> => {
  const response = await api.get('/admin/dashboard-stats');
  return response.data;
};

// --- LOCAL ADS ---
export interface LocalAd {
  id: number;
  advertiser_name: string;
  advertiser_email: string;
  ad_title: string;
  ad_description: string;
  ad_type: 'banner' | 'video' | 'text';
  content_url: string | null;
  target_url: string;
  target_demographics: any;
  budget_amount: number;
  duration_days: number;
  status: 'pending' | 'approved' | 'rejected' | 'active' | 'completed' | 'paused';
  impressions: number;
  clicks: number;
  created_at: string;
  approved_at: string | null;
  approved_by: number | null;
  admin_notes: string | null;
  payment_status: 'pending' | 'paid' | 'failed';
}

export interface LocalAdsResponse {
  ads: LocalAd[];
}

export interface LocalAdStats {
  totalAds: number;
  activeAds: number;
  totalRevenue: number;
  totalImpressions: number;
  totalClicks: number;
  averageCTR: number;
}

export interface LocalAdSettings {
  id: number;
  setting_key: string;
  setting_value: string;
}

export const getLocalAds = async (status?: string): Promise<LocalAdsResponse> => {
  let url = '/admin/local-ads';
  if (status) {
    url += `?status=${status}`;
  }
  const response = await fetchWithAuth(url);
  if (!response.ok) throw new Error('Failed to fetch local ads');
  return await response.json();
};

export const getLocalAdStats = async (): Promise<{ stats: LocalAdStats }> => {
  const response = await fetchWithAuth('/admin/local-ads/stats');
  if (!response.ok) throw new Error('Failed to fetch local ad stats');
  return await response.json();
};

export const reviewLocalAd = async (id: number, status: 'approved' | 'rejected', admin_notes: string): Promise<void> => {
  const response = await fetchWithAuth(`/admin/local-ads/${id}/review`, {
    method: 'PUT',
    body: JSON.stringify({ status, admin_notes }),
  });
  if (!response.ok) throw new Error('Failed to review local ad');
};

export const updateLocalAdStatus = async (id: number, status: string): Promise<void> => {
  const response = await fetchWithAuth(`/admin/local-ads/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
  if (!response.ok) throw new Error('Failed to update local ad status');
};

export const getLocalAdSettings = async (): Promise<{ settings: LocalAdSettings[] }> => {
  const response = await fetchWithAuth('/admin/local-ads/settings');
  if (!response.ok) throw new Error('Failed to fetch local ad settings');
  return await response.json();
};

export const updateLocalAdSettings = async (settings: LocalAdSettings[]): Promise<void> => {
  const response = await fetchWithAuth('/admin/local-ads/settings', {
    method: 'PUT',
    body: JSON.stringify({ settings }),
  });
  if (!response.ok) throw new Error('Failed to update local ad settings');
};

// --- COURSES ---
export interface Course {
  id: number;
  title: string;
  description: string;
  category: string;

  // Backend may provide either a consolidated `type` or flags.
  type?: 'free' | 'premium' | 'pay_to_access';
  is_free?: boolean;
  require_premium?: boolean;

  // Backend sometimes serializes numbers as strings
  price?: number | string | null;

  thumbnail_url: string | null;
  duration_hours: number | null;
  difficulty_level: 'beginner' | 'intermediate' | 'advanced';

  points_reward?: number;
  certificate_enabled?: boolean;
  certification_required?: boolean;

  status?: 'active' | 'inactive' | 'draft';
  is_active?: boolean;

  created_at: string;

  // Count fields (some endpoints use different names)
  lessons_count?: number;
  lesson_count?: number;
  enrollments_count?: number;
  enrolled_count?: number;
}

export interface CourseStats {
  totalCourses: number;
  activeCourses: number;
  totalEnrollments: number;
  totalRevenue: number;
}

// The backend currently returns a nested stats payload (strings).
export interface CourseStatsResponse {
  courses: {
    total_courses: string;
    active_courses: string;
  };
  enrollments: {
    total_enrollments: string;
  };
}

export const getCourses = async (): Promise<{ courses: Course[] }> => {
  const response = await fetchWithAuth('/admin/courses');
  if (!response.ok) throw new Error('Failed to fetch courses');
  return await response.json();
};

export const getCourseStats = async (): Promise<CourseStatsResponse> => {
  const response = await fetchWithAuth('/admin/courses/stats');
  if (!response.ok) throw new Error('Failed to fetch course stats');
  return await response.json();
};

export const createCourse = async (courseData: Omit<Course, 'id' | 'created_at' | 'lessons_count' | 'enrollments_count'>): Promise<{ course: Course }> => {
  const token = localStorage.getItem('admin_token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['x-admin-token'] = token;
  }
  
  const response = await fetch(`${API_URL}/admin/courses`, {
    method: 'POST',
    headers,
    body: JSON.stringify(courseData),
  });
  if (!response.ok) throw new Error('Failed to create course');
  return await response.json();
};

export const updateCourse = async (id: number, courseData: Partial<Omit<Course, 'id' | 'created_at' | 'lessons_count' | 'enrollments_count'>>): Promise<{ course: Course }> => {
  const token = localStorage.getItem('admin_token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['x-admin-token'] = token;
  }
  
  const response = await fetch(`${API_URL}/admin/courses/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(courseData),
  });
  if (!response.ok) throw new Error('Failed to update course');
  return await response.json();
};

export const deleteCourse = async (id: number): Promise<void> => {
  const response = await fetchWithAuth(`/admin/courses/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete course');
};

// --- AFFILIATE TASKS ---
export interface AffiliateTask {
  id: number;
  title: string;
  description: string;
  type: 'CPL' | 'CPA';
  target_link: string;
  reward_amount: number;
  max_completions: number | null;
  current_completions: number;
  verification_method: 'automatic' | 'manual';
  status: 'active' | 'inactive' | 'expired';
  created_at: string;
  expires_at: string | null;
}

export interface AffiliateTaskStats {
  totalTasks: number;
  activeTasks: number;
  totalCompletions: number;
  totalRewardsPaid: number;
}

export const getAffiliateTasks = async (): Promise<{ tasks: AffiliateTask[] }> => {
  const response = await fetchWithAuth('/admin/affiliate-tasks');
  if (!response.ok) throw new Error('Failed to fetch affiliate tasks');
  return await response.json();
};

export const getAffiliateTaskStats = async (): Promise<{ stats: AffiliateTaskStats }> => {
  const response = await fetchWithAuth('/admin/affiliate-tasks/stats');
  if (!response.ok) throw new Error('Failed to fetch affiliate task stats');
  return await response.json();
};

export const createAffiliateTask = async (data: Omit<AffiliateTask, 'id' | 'created_at' | 'current_completions'>): Promise<{ task: AffiliateTask }> => {
  const response = await fetchWithAuth('/admin/affiliate-tasks', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to create affiliate task');
  return await response.json();
};

export const updateAffiliateTask = async (id: number, data: Partial<AffiliateTask>): Promise<{ task: AffiliateTask }> => {
  const response = await fetchWithAuth(`/admin/affiliate-tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to update affiliate task');
  return await response.json();
};

export const deleteAffiliateTask = async (id: number): Promise<void> => {
  const response = await fetchWithAuth(`/admin/affiliate-tasks/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete affiliate task');
};

export const updateAffiliateTaskStatus = async (id: number, status: string): Promise<void> => {
  const response = await fetchWithAuth(`/admin/affiliate-tasks/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
  if (!response.ok) throw new Error('Failed to update affiliate task status');
};

// Task Attempt Management
// NOTE: This type reflects the (flat) payload returned by `/admin/affiliate-tasks/attempts` as used in the admin UI.
// Some fields are optional because the backend may omit them depending on query/join.
export interface TaskAttempt {
  id: number;
  user_id: string;
  task_id: number;
  status: 'pending' | 'approved' | 'completed' | 'rejected';

  // Proof
  proof_url?: string | null;
  proof_text?: string | null;
  proof_files?: string[]; // kept for backwards compatibility if backend returns an array

  // Metadata
  ip_address?: string | null;
  device_id?: string | null;
  conversion_id?: string | null;

  // Review
  admin_notes?: string | null;
  reviewed_by?: number | null;

  // Rewards
  points_awarded?: number;
  cash_awarded?: number | string;

  // Timestamps
  created_at: string;
  updated_at: string;
  completed_at?: string | null;

  // Joined/user/task display fields
  username?: string | null;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
  task_title?: string;
  reward_amount?: number | string;
  reward_type?: 'points' | 'cash';
}


export interface ReviewData {
  status: 'approved' | 'rejected';
  admin_notes: string;
}

export const getAffiliateTaskAttempts = async (status?: string): Promise<{ attempts: TaskAttempt[] }> => {
  const params = status ? `?status=${status}` : '';
  const response = await fetchWithAuth(`/admin/affiliate-tasks/attempts${params}`);
  return response.json();
};

export const reviewAffiliateTaskAttempt = async (attemptId: number, reviewData: ReviewData): Promise<void> => {
  const response = await fetchWithAuth(`/admin/affiliate-tasks/attempts/${attemptId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reviewData),
  });
  if (!response.ok) throw new Error('Failed to review affiliate task attempt');
};

// Transaction Management
export interface Transaction {
  id: number;
  type: 'deposit' | 'withdrawal' | 'premium';
  user_id: number;
  user_name?: string;
  user_username?: string;
  transaction_id: string;
  amount_etb: number;
  points?: number;
  status: string;
  payment_method?: string;
  account_number?: string;
  account_type?: string;
  created_at: string;
  completed_at?: string;
  failed_at?: string;
  failure_reason?: string;
  chapa_reference?: string;
  admin_notes?: string;
}

export interface TransactionStatistics {
  total_deposits: number;
  total_withdrawals: number;
  total_premium_payments: number;
  total_deposit_amount: number;
  total_withdrawal_amount: number;
  total_premium_amount: number;
  pending_withdrawals: number;
  pending_deposits: number;
}

export interface TransactionFilters {
  type: 'all' | 'deposit' | 'withdrawal' | 'premium';
  status: 'all' | 'pending' | 'processing' | 'completed' | 'failed' | 'rejected';
  dateRange: 'all' | 'today' | 'week' | 'month';
  search: string;
  page?: number;
}

export const getTransactions = async (filters: TransactionFilters): Promise<{ 
  transactions: Transaction[]; 
  statistics: TransactionStatistics; 
  totalPages: number; 
}> => {
  const params = new URLSearchParams({
    type: filters.type,
    status: filters.status,
    dateRange: filters.dateRange,
    search: filters.search,
    page: (filters.page || 1).toString()
  });
  
  const response = await fetchWithAuth(`/admin/transactions?${params}`);
  return response.json();
};

export const getChapaBalance = async (): Promise<any> => {
  const response = await fetchWithAuth('/admin/transactions/balance');
  return response.json();
};

export const processPendingTransactions = async (): Promise<{ message: string }> => {
  const response = await fetchWithAuth('/admin/transactions/process-pending', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  return response.json();
};

export const exportTransactions = async (filters: TransactionFilters): Promise<Blob> => {
  const params = new URLSearchParams({
    type: filters.type,
    status: filters.status,
    dateRange: filters.dateRange,
    search: filters.search,
    format: 'csv'
  });
  
  const response = await fetchWithAuth(`/admin/transactions/export?${params}`);
  if (!response.ok) throw new Error('Failed to export transactions');
  return response.blob();
};

// Course Lesson Management
export interface Lesson {
  id: number;
  course_id: number;
  title: string;
  description: string;
  content: string;
  lesson_type: 'text' | 'video' | 'document' | 'interactive';
  video_url: string | null;
  document_url: string | null;
  order_index: number;
  duration_minutes: number | null;
  is_free_preview: boolean;
  created_at: string;
}

export const getCourseForLessons = async (courseId: string): Promise<{ course: Course }> => {
  const response = await fetchWithAuth(`/admin/courses/${courseId}`);
  return response.json();
};

export const getCourseLessons = async (courseId: string): Promise<{ lessons: Lesson[] }> => {
  const response = await fetchWithAuth(`/admin/courses/${courseId}/lessons`);
  return response.json();
};

export const createLesson = async (courseId: string, lessonData: any): Promise<{ lesson: Lesson }> => {
  const response = await fetchWithAuth(`/admin/courses/${courseId}/lessons`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(lessonData),
  });
  return response.json();
};

export const updateLesson = async (courseId: string, lessonId: number, lessonData: any): Promise<{ lesson: Lesson }> => {
  const response = await fetchWithAuth(`/admin/courses/lessons/${lessonId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(lessonData),
  });
  return response.json();
};

export const deleteLesson = async (courseId: string, lessonId: number): Promise<void> => {
  const response = await fetchWithAuth(`/admin/courses/lessons/${lessonId}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete lesson');
};

export const reorderLesson = async (courseId: string, lessonId: number, newOrder: number): Promise<void> => {
  const response = await fetchWithAuth(`/admin/courses/lessons/${lessonId}/reorder`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_index: newOrder }),
  });
  if (!response.ok) throw new Error('Failed to reorder lesson');
};

// --- FILE UPLOAD ---
export interface UploadResponse {
  message: string;
  url: string;
  fileName: string;
  originalName: string;
  size: number;
  mimeType: string;
}

export interface BroadcastMediaRequest {
  message?: string;
  parse_mode?: 'HTML' | 'Markdown';
  media_url?: string;
  media_type?: 'photo' | 'video';
  target?: 'all' | 'premium' | 'non_banned';
}

export interface OnboardingQuestion {
  id: number;
  code: string;
  is_active: boolean;
  trigger: 'on_start';
  question_translations: Record<string, string>;
  type: 'text' | 'single_choice';
  options_translations?: Record<string, Record<string, string>> | null;
  required: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface OnboardingAnswer {
  id: number;
  user_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
  question_code: string;
  question_type: string;
  answer_text?: string | null;
  answer_option_key?: string | null;
  created_at: string;
}

export const broadcastMedia = async (payload: BroadcastMediaRequest): Promise<{ sent: number; failed: number; total: number }> => {
  const response = await api.post('/admin/broadcast-media', payload);
  return response.data;
};

export const getOnboardingQuestions = async (): Promise<{ questions: OnboardingQuestion[] }> => {
  const response = await api.get('/admin/onboarding/questions');
  return response.data;
};

export const createOnboardingQuestion = async (payload: Partial<OnboardingQuestion> & { code: string }): Promise<{ question: OnboardingQuestion }> => {
  const response = await api.post('/admin/onboarding/questions', payload);
  return response.data;
};

export const updateOnboardingQuestion = async (id: number, payload: Partial<OnboardingQuestion>): Promise<{ question: OnboardingQuestion }> => {
  const response = await api.put(`/admin/onboarding/questions/${id}`, payload);
  return response.data;
};

export const deleteOnboardingQuestion = async (id: number): Promise<{ message: string; id: number }> => {
  const response = await api.delete(`/admin/onboarding/questions/${id}`);
  return response.data;
};

export const getOnboardingAnswers = async (): Promise<{ answers: OnboardingAnswer[] }> => {
  const response = await api.get('/admin/onboarding/answers');
  return response.data;
};

export const uploadFile = async (file: File, folder?: string): Promise<UploadResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  if (folder) {
    formData.append('folder', folder);
  }

  const token = localStorage.getItem('admin_token');
  const response = await fetch(`${API_URL}/admin/upload`, {
    method: 'POST',
    headers: {
      'x-admin-token': token || '',
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to upload file');
  }

  return response.json();
};

export default api;