-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.deposits (
  id integer NOT NULL DEFAULT nextval('deposits_id_seq'::regclass),
  user_id bigint NOT NULL,
  transaction_id character varying NOT NULL UNIQUE,
  amount_etb numeric NOT NULL,
  points_received integer NOT NULL,
  conversion_rate numeric NOT NULL,
  payment_method character varying DEFAULT 'telebirr'::character varying,
  status character varying NOT NULL DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying, 'cancelled'::character varying]::text[])),
  telebirr_reference character varying,
  telebirr_response jsonb,
  created_at timestamp without time zone DEFAULT now(),
  completed_at timestamp without time zone,
  failed_at timestamp without time zone,
  failure_reason text,
  chapa_checkout_url text,
  chapa_reference character varying,
  chapa_response jsonb,
  user_email character varying,
  CONSTRAINT deposits_pkey PRIMARY KEY (id),
  CONSTRAINT deposits_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.telegram_users(id)
);
CREATE TABLE public.premium_payments (
  id integer NOT NULL DEFAULT nextval('premium_payments_id_seq'::regclass),
  user_id bigint NOT NULL,
  amount numeric NOT NULL,
  currency character varying DEFAULT 'ETB'::character varying,
  payment_reference character varying,
  provider character varying NOT NULL,
  provider_tx_id character varying,
  status character varying NOT NULL DEFAULT 'pending'::character varying,
  payment_method character varying,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT premium_payments_pkey PRIMARY KEY (id),
  CONSTRAINT premium_payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.telegram_users(id)
);
CREATE TABLE public.promotion_pricing_tiers (
  id integer NOT NULL DEFAULT nextval('promotion_pricing_tiers_id_seq'::regclass),
  product_id integer NOT NULL,
  view_count integer NOT NULL,
  points_reward integer,
  cash_reward numeric,
  description text,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT promotion_pricing_tiers_pkey PRIMARY KEY (id),
  CONSTRAINT promotion_pricing_tiers_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.promotion_products(id)
);
CREATE TABLE public.promotion_products (
  id integer NOT NULL DEFAULT nextval('promotion_products_id_seq'::regclass),
  name character varying NOT NULL,
  description text NOT NULL,
  image_url text,
  is_active boolean DEFAULT true,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  product_link text,
  CONSTRAINT promotion_products_pkey PRIMARY KEY (id)
);
CREATE TABLE public.promotion_submissions (
  id integer NOT NULL DEFAULT nextval('promotion_submissions_id_seq'::regclass),
  user_id bigint NOT NULL,
  product_id integer NOT NULL,
  platform character varying NOT NULL,
  content_url text NOT NULL,
  claimed_views integer NOT NULL,
  claimed_likes integer,
  claimed_comments integer,
  proof_url text,
  status character varying NOT NULL DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying]::text[])),
  admin_notes text,
  points_awarded integer,
  cash_awarded numeric,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  reviewed_at timestamp without time zone,
  reviewed_by bigint,
  CONSTRAINT promotion_submissions_pkey PRIMARY KEY (id),
  CONSTRAINT promotion_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.telegram_users(id),
  CONSTRAINT promotion_submissions_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.promotion_products(id)
);
CREATE TABLE public.quiz_questions (
  id integer NOT NULL DEFAULT nextval('quiz_questions_id_seq'::regclass),
  quiz_id integer NOT NULL,
  question_text text NOT NULL,
  correct_answer text NOT NULL,
  wrong_answers ARRAY NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT quiz_questions_pkey PRIMARY KEY (id),
  CONSTRAINT quiz_questions_quiz_id_fkey FOREIGN KEY (quiz_id) REFERENCES public.quizzes(id)
);
CREATE TABLE public.quizzes (
  id integer NOT NULL DEFAULT nextval('quizzes_id_seq'::regclass),
  title character varying NOT NULL,
  hashtags ARRAY DEFAULT '{}'::text[],
  points_per_question integer DEFAULT 10,
  is_active boolean DEFAULT true,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  require_finish_task_id integer,
  require_finish_task_type character varying,
  category character varying DEFAULT 'Math'::character varying,
  CONSTRAINT quizzes_pkey PRIMARY KEY (id)
);
CREATE TABLE public.referrals (
  id integer NOT NULL DEFAULT nextval('referrals_id_seq'::regclass),
  referrer_id bigint NOT NULL,
  referred_id bigint NOT NULL,
  points_awarded integer DEFAULT 0,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT referrals_pkey PRIMARY KEY (id),
  CONSTRAINT referrals_referred_id_fkey FOREIGN KEY (referred_id) REFERENCES public.telegram_users(id),
  CONSTRAINT referrals_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES public.telegram_users(id)
);
CREATE TABLE public.settings (
  id integer NOT NULL DEFAULT nextval('settings_id_seq'::regclass),
  key character varying NOT NULL UNIQUE,
  value text NOT NULL,
  description text,
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT settings_pkey PRIMARY KEY (id)
);
CREATE TABLE public.spin_wheel_rewards (
  id integer NOT NULL DEFAULT nextval('spin_wheel_rewards_id_seq'::regclass),
  label text NOT NULL,
  points integer NOT NULL,
  color character varying NOT NULL DEFAULT '#FFFFFF'::character varying,
  probability numeric NOT NULL DEFAULT 1.0,
  is_active boolean DEFAULT true,
  position integer NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT spin_wheel_rewards_pkey PRIMARY KEY (id)
);
CREATE TABLE public.spins (
  id integer NOT NULL DEFAULT nextval('spins_id_seq'::regclass),
  user_id bigint NOT NULL,
  result character varying NOT NULL,
  points_awarded integer DEFAULT 0,
  created_at timestamp without time zone DEFAULT now(),
  reward_id integer,
  CONSTRAINT spins_pkey PRIMARY KEY (id),
  CONSTRAINT spins_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.telegram_users(id),
  CONSTRAINT spins_reward_id_fkey FOREIGN KEY (reward_id) REFERENCES public.spin_wheel_rewards(id)
);
CREATE TABLE public.task_progress (
  id integer NOT NULL DEFAULT nextval('task_progress_id_seq'::regclass),
  user_id bigint NOT NULL,
  task_type character varying NOT NULL,
  task_id integer NOT NULL,
  status character varying NOT NULL DEFAULT 'pending'::character varying,
  points_earned integer DEFAULT 0,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  metadata jsonb,
  CONSTRAINT task_progress_pkey PRIMARY KEY (id),
  CONSTRAINT task_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.telegram_users(id)
);
CREATE TABLE public.tasks (
  id integer NOT NULL DEFAULT nextval('tasks_id_seq'::regclass),
  type character varying NOT NULL,
  description text NOT NULL,
  points integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT tasks_pkey PRIMARY KEY (id)
);
CREATE TABLE public.telegram_channels (
  id integer NOT NULL DEFAULT nextval('telegram_channels_id_seq'::regclass),
  name character varying NOT NULL,
  link text NOT NULL,
  is_public boolean DEFAULT true,
  disabled boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT now(),
  expires_at timestamp with time zone,
  require_finish_task_id integer,
  require_finish_task_type character varying,
  title character varying,
  is_private boolean DEFAULT false,
  promotion_id integer,
  require_premium boolean DEFAULT false,
  CONSTRAINT telegram_channels_pkey PRIMARY KEY (id),
  CONSTRAINT fk_telegram_channels_promotion FOREIGN KEY (promotion_id) REFERENCES public.user_submitted_promotions(id)
);
CREATE TABLE public.telegram_users (
  id bigint NOT NULL,
  username character varying,
  first_name character varying NOT NULL,
  last_name character varying,
  language_code character varying DEFAULT 'en'::character varying,
  points integer DEFAULT 0,
  referral_code character varying UNIQUE,
  created_at timestamp without time zone DEFAULT now(),
  last_active timestamp without time zone DEFAULT now(),
  photo_url text,
  is_banned boolean DEFAULT false,
  is_premium boolean DEFAULT false,
  premium_until timestamp without time zone,
  premium_subscription_id character varying,
  premium_payment_reference character varying,
  locked_points integer DEFAULT 0,
  promotion_blacklisted boolean DEFAULT false,
  promotion_blacklisted_reason text,
  CONSTRAINT telegram_users_pkey PRIMARY KEY (id)
);
CREATE TABLE public.transaction_logs (
  id integer NOT NULL DEFAULT nextval('transaction_logs_id_seq'::regclass),
  user_id bigint NOT NULL,
  transaction_type character varying NOT NULL CHECK (transaction_type::text = ANY (ARRAY['deposit'::character varying, 'withdrawal'::character varying, 'reward'::character varying, 'deduction'::character varying, 'refund'::character varying]::text[])),
  transaction_id character varying NOT NULL,
  points_before integer NOT NULL,
  points_after integer NOT NULL,
  points_change integer NOT NULL,
  description text,
  metadata jsonb,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT transaction_logs_pkey PRIMARY KEY (id),
  CONSTRAINT transaction_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.telegram_users(id)
);
CREATE TABLE public.user_promotion_engagements (
  id integer NOT NULL DEFAULT nextval('user_promotion_engagements_id_seq'::regclass),
  user_id bigint NOT NULL,
  promotion_id integer NOT NULL,
  engagement_type character varying NOT NULL CHECK (engagement_type::text = ANY (ARRAY['view'::character varying, 'join'::character varying]::text[])),
  points_awarded integer DEFAULT 0,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT user_promotion_engagements_pkey PRIMARY KEY (id),
  CONSTRAINT user_promotion_engagements_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.user_submitted_promotions(id),
  CONSTRAINT user_promotion_engagements_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.telegram_users(id)
);
CREATE TABLE public.user_quiz_attempts (
  id integer NOT NULL DEFAULT nextval('user_quiz_attempts_id_seq'::regclass),
  user_id bigint NOT NULL,
  quiz_id integer NOT NULL,
  score integer NOT NULL DEFAULT 0,
  completed_at timestamp without time zone DEFAULT now(),
  correct_answers integer NOT NULL DEFAULT 0,
  total_questions integer NOT NULL DEFAULT 0,
  CONSTRAINT user_quiz_attempts_pkey PRIMARY KEY (id),
  CONSTRAINT user_quiz_attempts_quiz_id_fkey FOREIGN KEY (quiz_id) REFERENCES public.quizzes(id),
  CONSTRAINT user_quiz_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.telegram_users(id)
);
CREATE TABLE public.user_submitted_promotions (
  id integer NOT NULL DEFAULT nextval('user_submitted_promotions_id_seq'::regclass),
  user_id bigint NOT NULL,
  type character varying NOT NULL CHECK (type::text = ANY (ARRAY['channel_join'::character varying, 'video_boost'::character varying]::text[])),
  title character varying NOT NULL,
  description text NOT NULL,
  target_url text NOT NULL,
  target_views_joins integer NOT NULL,
  budget_points integer,
  budget_cash numeric,
  expires_at timestamp without time zone NOT NULL,
  status character varying NOT NULL DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying, 'approved'::character varying, 'declined'::character varying, 'active'::character varying, 'completed'::character varying, 'expired'::character varying, 'budget_exhausted'::character varying]::text[])),
  admin_notes text,
  current_views_joins integer DEFAULT 0,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  approved_at timestamp without time zone,
  declined_at timestamp without time zone,
  activated_at timestamp without time zone,
  cost_per_action integer,
  reward_per_action integer,
  admin_profit_per_action integer,
  promotion_data jsonb DEFAULT '{}'::jsonb,
  promotion_stats jsonb DEFAULT '{"held_balance": 0, "total_engagements": 0, "total_admin_profit": 0, "total_points_distributed": 0}'::jsonb,
  validation_questions jsonb,
  require_premium boolean DEFAULT false,
  CONSTRAINT user_submitted_promotions_pkey PRIMARY KEY (id),
  CONSTRAINT user_submitted_promotions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.telegram_users(id)
);
CREATE TABLE public.user_tasks (
  id integer NOT NULL DEFAULT nextval('user_tasks_id_seq'::regclass),
  user_id bigint NOT NULL,
  task_id integer NOT NULL,
  completed_at timestamp without time zone DEFAULT now(),
  points_awarded integer DEFAULT 0,
  CONSTRAINT user_tasks_pkey PRIMARY KEY (id),
  CONSTRAINT user_tasks_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id),
  CONSTRAINT user_tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.telegram_users(id)
);
CREATE TABLE public.user_withdrawal_accounts (
  id integer NOT NULL DEFAULT nextval('user_withdrawal_accounts_id_seq'::regclass),
  user_id bigint NOT NULL,
  account_type character varying NOT NULL DEFAULT 'telebirr'::character varying,
  account_number character varying NOT NULL,
  account_name character varying,
  is_verified boolean DEFAULT false,
  is_default boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  is_active boolean DEFAULT true,
  deleted_at timestamp without time zone,
  CONSTRAINT user_withdrawal_accounts_pkey PRIMARY KEY (id),
  CONSTRAINT user_withdrawal_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.telegram_users(id)
);
CREATE TABLE public.withdrawals (
  id integer NOT NULL DEFAULT nextval('withdrawals_id_seq'::regclass),
  user_id bigint NOT NULL,
  transaction_id character varying NOT NULL UNIQUE,
  points_deducted integer NOT NULL,
  amount_etb numeric NOT NULL,
  conversion_rate numeric NOT NULL,
  withdrawal_account_id integer,
  account_number character varying NOT NULL,
  account_type character varying DEFAULT 'telebirr'::character varying,
  status character varying NOT NULL DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying, 'approved'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying, 'rejected'::character varying]::text[])),
  admin_notes text,
  telebirr_reference character varying,
  telebirr_response jsonb,
  created_at timestamp without time zone DEFAULT now(),
  processed_at timestamp without time zone,
  completed_at timestamp without time zone,
  failed_at timestamp without time zone,
  failure_reason text,
  processed_by bigint,
  chapa_transfer_id character varying,
  chapa_response jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT withdrawals_pkey PRIMARY KEY (id),
  CONSTRAINT withdrawals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.telegram_users(id),
  CONSTRAINT withdrawals_withdrawal_account_id_fkey FOREIGN KEY (withdrawal_account_id) REFERENCES public.user_withdrawal_accounts(id)
);
CREATE TABLE public.youtube_question_responses (
  id integer NOT NULL DEFAULT nextval('youtube_question_responses_id_seq'::regclass),
  user_id bigint NOT NULL,
  question_id integer NOT NULL,
  answer text NOT NULL,
  is_correct boolean NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT youtube_question_responses_pkey PRIMARY KEY (id),
  CONSTRAINT youtube_question_responses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.telegram_users(id),
  CONSTRAINT youtube_question_responses_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.youtube_questions(id)
);
CREATE TABLE public.youtube_questions (
  id integer NOT NULL DEFAULT nextval('youtube_questions_id_seq'::regclass),
  youtube_task_id integer NOT NULL,
  question text NOT NULL,
  correct_answer text NOT NULL,
  wrong_answers ARRAY NOT NULL DEFAULT '{}'::text[],
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT youtube_questions_pkey PRIMARY KEY (id),
  CONSTRAINT youtube_questions_youtube_task_id_fkey FOREIGN KEY (youtube_task_id) REFERENCES public.youtube_tasks(id)
);
CREATE TABLE public.youtube_tasks (
  id integer NOT NULL DEFAULT nextval('youtube_tasks_id_seq'::regclass),
  youtube_url text NOT NULL,
  title text NOT NULL,
  thumbnail text,
  added_at timestamp without time zone DEFAULT now(),
  expires_at timestamp without time zone,
  disabled boolean DEFAULT false,
  completed_user_ids ARRAY DEFAULT '{}'::integer[],
  video_duration integer,
  require_finish_task_id integer,
  require_finish_task_type character varying,
  promotion_id integer,
  description text,
  channel_title character varying,
  require_premium boolean DEFAULT false,
  vpn_countries ARRAY DEFAULT '{}'::text[],
  CONSTRAINT youtube_tasks_pkey PRIMARY KEY (id),
  CONSTRAINT fk_youtube_tasks_promotion FOREIGN KEY (promotion_id) REFERENCES public.user_submitted_promotions(id)
);