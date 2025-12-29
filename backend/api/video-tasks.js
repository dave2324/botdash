const express = require('express');
const pool = require('../config/database');
const { getYouTubeVideoInfo, getVideoDurationInSeconds } = require('../youtube');
const { getTaskDependencyDetail } = require('./task-utils');

const router = express.Router();

// GET /api/video-tasks
router.get('/', async (req, res) => {
  try {
    // req.telegramUser is set by the auth middleware
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Get active video tasks and check if user has completed them
    const result = await pool.query(
      `SELECT
        yt.*,
        CASE
          WHEN tp.status = 'completed' THEN true
          ELSE false
        END as completed,
        CASE
          WHEN tp.status IS NOT NULL THEN tp.status
          ELSE 'not_started'
        END as status,
        COALESCE(tp.points_earned, 0) as points_earned,
        tp.metadata,
        (SELECT COUNT(*) FROM youtube_questions WHERE youtube_task_id = yt.id) as question_count,
        yt.require_finish_task_id,
        yt.require_finish_task_type,
        (SELECT COUNT(*) FROM task_progress WHERE task_id = yt.id AND task_type = 'youtube_video' AND status = 'completed') as completion_count
       FROM youtube_tasks yt
       LEFT JOIN task_progress tp ON
         tp.task_id = yt.id AND
         tp.task_type = 'youtube_video' AND
         tp.user_id = $1
       WHERE yt.disabled = FALSE
         AND (yt.expires_at IS NULL OR yt.expires_at > NOW())
         AND (yt.completion_limit IS NULL OR
              (SELECT COUNT(*) FROM task_progress WHERE task_id = yt.id AND task_type = 'youtube_video' AND status = 'completed') < yt.completion_limit OR
              tp.status = 'completed')
       ORDER BY yt.added_at DESC`,
      [userId]
    );

    // Add isLocked flag and filter tasks based on task dependencies
    const tasks = await Promise.all(result.rows.map(async (task) => {
      let isLocked = false;
      let require_finish_task_detail = null;
      if (task.require_finish_task_id && task.require_finish_task_type) {
        const taskCompletion = await pool.query(
          `SELECT 1 FROM task_progress WHERE user_id = $1 AND task_id = $2 AND task_type = $3 AND status = 'completed'`,
          [userId, task.require_finish_task_id, task.require_finish_task_type]
        );
        if (taskCompletion.rows.length === 0) {
          isLocked = true;
        }
        require_finish_task_detail = await getTaskDependencyDetail(task.require_finish_task_type, task.require_finish_task_id);
      }
      return { ...task, isLocked, require_finish_task_detail };
    }));

    res.json({ tasks });
  } catch (error) {
    console.error('Error fetching video tasks:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/video-tasks/:id
router.get('/:id', async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const taskId = parseInt(req.params.id);
    if (isNaN(taskId)) {
      return res.status(400).json({ message: 'Invalid task ID' });
    }

    // Get task details
    const taskResult = await pool.query(
      `SELECT 
        yt.*,
        CASE 
          WHEN tp.status = 'completed' THEN true 
          ELSE false 
        END as completed,
        CASE 
          WHEN tp.status IS NOT NULL THEN tp.status
          ELSE 'not_started'
        END as status,
        tp.metadata,
        yt.require_finish_task_id,
        yt.require_finish_task_type
       FROM youtube_tasks yt
       LEFT JOIN task_progress tp ON 
         tp.task_id = yt.id AND 
         tp.task_type = 'youtube_video' AND 
         tp.user_id = $1
       WHERE yt.id = $2 AND yt.disabled = FALSE
         AND (yt.expires_at IS NULL OR yt.expires_at > NOW())`,
      [userId, taskId]
    );

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ message: 'Task not found or expired' });
    }

    const task = taskResult.rows[0];
    let isLocked = false;
    let require_finish_task_detail = null;
    if (task.require_finish_task_id && task.require_finish_task_type) {
      const taskCompletion = await pool.query(
        `SELECT 1 FROM task_progress WHERE user_id = $1 AND task_id = $2 AND task_type = $3 AND status = 'completed'`,
        [userId, task.require_finish_task_id, task.require_finish_task_type]
      );
      if (taskCompletion.rows.length === 0) {
        isLocked = true;
      }
      require_finish_task_detail = await getTaskDependencyDetail(task.require_finish_task_type, task.require_finish_task_id);
    }

    // Get questions if task is not completed
    let questions = [];
    if (task.status !== 'completed') {
      const questionResult = await pool.query(
        `SELECT 
          q.id, 
          q.question, 
          q.wrong_answers, 
          q.correct_answer,
          q.question_type,
          q.max_attempts,
          q.cooldown_seconds,
          (
            SELECT COUNT(*) FROM youtube_question_responses 
            WHERE question_id = q.id AND user_id = $1 AND is_correct = false
          ) as failed_attempts,
          (
            SELECT MAX(cooldown_until) FROM youtube_question_responses
            WHERE question_id = q.id AND user_id = $1 AND cooldown_until > NOW()
          ) as cooldown_until
         FROM youtube_questions q 
         WHERE q.youtube_task_id = $2`,
        [userId, taskId]
      );

      questions = questionResult.rows.map(q => {
        // Calculate attempts left
        const attemptsMade = parseInt(q.failed_attempts) || 0;
        const maxAttempts = parseInt(q.max_attempts) || 3;
        const attemptsLeft = Math.max(0, maxAttempts - attemptsMade);
        
        // For multiple-choice questions
        if (q.question_type === 'multiple_choice' || !q.question_type) {
          // Filter out null/undefined/empty wrong answers
          const wrongAnswers = Array.isArray(q.wrong_answers)
            ? q.wrong_answers.filter(a => typeof a === 'string' && a.trim() !== '')
            : [];
          // Only add correct answer if it's a non-empty string
          const correctAnswer = (typeof q.correct_answer === 'string' && q.correct_answer.trim() !== '')
            ? q.correct_answer
            : null;
          // Build answers array
          const answers = correctAnswer
            ? [...wrongAnswers, correctAnswer]
            : [...wrongAnswers];
            
          return {
            id: q.id,
            question: q.question,
            question_type: q.question_type || 'multiple_choice',
            answers: answers.sort(() => Math.random() - 0.5),
            attempts_left: attemptsLeft,
            cooldown_until: q.cooldown_until
          };
        } 
        // For short answer questions
        else if (q.question_type === 'short_answer') {
          return {
            id: q.id,
            question: q.question,
            question_type: 'short_answer',
            answers: [], // No multiple choices for short answer
            attempts_left: attemptsLeft,
            cooldown_until: q.cooldown_until
          };
        }
      });
    }

    res.json({ 
      task: { ...task, isLocked, require_finish_task_detail },
      questions
    });
  } catch (error) {
    console.error('Error fetching video task:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/video-tasks/:id/start
router.post('/:id/start', async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const taskId = parseInt(req.params.id);
    if (isNaN(taskId)) {
      return res.status(400).json({ message: 'Invalid task ID' });
    }

    // Check if task exists and is active, and hasn't reached completion limit
    const taskResult = await pool.query(
      `SELECT yt.*,
       (SELECT COUNT(*) FROM task_progress WHERE task_id = yt.id AND task_type = 'youtube_video' AND status = 'completed') as completion_count
       FROM youtube_tasks yt
       WHERE yt.id = $1 AND yt.disabled = FALSE AND (yt.expires_at IS NULL OR yt.expires_at > NOW())
       AND (yt.completion_limit IS NULL OR
            (SELECT COUNT(*) FROM task_progress WHERE task_id = yt.id AND task_type = 'youtube_video' AND status = 'completed') < yt.completion_limit)`,
      [taskId]
    );

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ message: 'Task not found, expired, or reached completion limit' });
    }

    const task = taskResult.rows[0];

    // Check if user has already completed this task using task_progress
    const completionCheck = await pool.query(
      'SELECT status FROM task_progress WHERE user_id = $1 AND task_id = $2 AND task_type = $3',
      [userId, taskId, 'youtube_video']
    );

    if (completionCheck.rows.length > 0 && completionCheck.rows[0].status === 'completed') {
      return res.status(400).json({ message: 'Task already completed' });
    }

    // Get video duration - use from DB if available, otherwise fetch from YouTube
    let videoDuration = task.video_duration || 0;
    
    // Only fetch from YouTube API if duration is not available in DB
    if (!videoDuration && task.youtube_url) {
      try {
        const youtubeMatch = task.youtube_url.match(/(?:v=|youtu\.be\/|\/shorts\/)([\w-]{11})/);
        const videoId = youtubeMatch;
        if (videoId && videoId[1]) {
          const videoInfo = await getYouTubeVideoInfo(videoId[1]);
          videoDuration = getVideoDurationInSeconds(videoInfo.duration_seconds);
          
          // Update the task with the fetched duration for future use
          await pool.query(
            'UPDATE youtube_tasks SET video_duration = $1 WHERE id = $2',
            [videoDuration, taskId]
          );
        }
      } catch (err) {
        console.error('Error fetching video info:', err);
        // Continue with default duration (0)
      }
    }

    // Create metadata with start time and video duration
    const metadata = {
      started_at: new Date().toISOString(),
      video_duration: videoDuration,
      required_watch_time: videoDuration
    };

    // Create or update task progress
    const result = await pool.query(
      `INSERT INTO task_progress 
        (user_id, task_type, task_id, status, points_earned, updated_at, metadata)
       VALUES ($1, 'youtube_video', $2, 'pending', 0, NOW(), $3)
       ON CONFLICT (user_id, task_type, task_id)
       DO UPDATE SET 
         status = 'pending',
         updated_at = NOW(),
         metadata = $3
       RETURNING *`,
      [userId, taskId, metadata]
    );

    res.json({ 
      message: 'Task started',
      taskProgress: result.rows[0]
    });
  } catch (error) {
    console.error('Error starting video task:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/video-tasks/:id/complete
router.post('/:id/complete', async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const taskId = parseInt(req.params.id);
    if (isNaN(taskId)) {
      return res.status(400).json({ message: 'Invalid task ID' });
    }

    // Get user's answers if provided
    const { answers } = req.body;

    // Check if task exists and is active, and hasn't reached completion limit
    const taskResult = await pool.query(
      `SELECT yt.*,
       (SELECT COUNT(*) FROM task_progress WHERE task_id = yt.id AND task_type = 'youtube_video' AND status = 'completed') as completion_count
       FROM youtube_tasks yt
       WHERE yt.id = $1 AND yt.disabled = FALSE AND (yt.expires_at IS NULL OR yt.expires_at > NOW())
       AND (yt.completion_limit IS NULL OR
            (SELECT COUNT(*) FROM task_progress WHERE task_id = yt.id AND task_type = 'youtube_video' AND status = 'completed') < yt.completion_limit)`,
      [taskId]
    );

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ message: 'Task not found, expired, or reached completion limit' });
    }

    const task = taskResult.rows[0];

    // Check if user has already completed this task using task_progress
    const completionCheck = await pool.query(
      'SELECT status FROM task_progress WHERE user_id = $1 AND task_id = $2 AND task_type = $3',
      [userId, taskId, 'youtube_video']
    );

    if (completionCheck.rows.length > 0 && completionCheck.rows[0].status === 'completed') {
      return res.status(400).json({ message: 'Task already completed' });
    }

    // Get task progress to check started_at and video duration
    const progressResult = await pool.query(
      `SELECT * FROM task_progress 
       WHERE user_id = $1 AND task_id = $2 AND task_type = 'youtube_video'`,
      [userId, taskId]
    );

    if (progressResult.rows.length === 0) {
      return res.status(400).json({ message: 'Task not started yet' });
    }

    const progress = progressResult.rows[0];
    const metadata = progress.metadata || {};

    if (!metadata.started_at) {
      return res.status(400).json({ message: 'Task not properly started' });
    }

    // Calculate time spent watching the video
    const startedAt = new Date(metadata.started_at);
    const currentTime = new Date();
    const watchTimeSecs = Math.floor((currentTime - startedAt) / 1000);
    const requiredWatchTime = metadata.required_watch_time || 0;

    // Check if enough time has passed
    if (watchTimeSecs < requiredWatchTime) {
      const remainingTime = Math.ceil(requiredWatchTime - watchTimeSecs);
      return res.status(400).json({ 
        message: `You need to watch the full video. Please wait ${remainingTime} more seconds.`,
        remaining_seconds: remainingTime
      });
    }

    // Check if this task has validation questions
    const questionsResult = await pool.query(
      `SELECT 
        q.*, 
        (
          SELECT COUNT(*) FROM youtube_question_responses 
          WHERE question_id = q.id AND user_id = $1 AND is_correct = false
        ) as failed_attempts,
        (
          SELECT MAX(cooldown_until) FROM youtube_question_responses
          WHERE question_id = q.id AND user_id = $1 AND cooldown_until > NOW()
        ) as cooldown_until
       FROM youtube_questions q 
       WHERE q.youtube_task_id = $2`,
      [userId, taskId]
    );

    // Start a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // If there are questions, validate the answers
      let allAnswersCorrect = true;
      let incorrectQuestions = [];
      let questionsOnCooldown = [];
      
      if (questionsResult.rows.length > 0) {
        // If no answers were provided but questions exist
        if (!answers || !Array.isArray(answers) || answers.length === 0) {
          await client.query('ROLLBACK');
          
          // Return the questions to the client
          const clientQuestions = questionsResult.rows.map(q => ({
            id: q.id,
            question: q.question,
            answers: [...q.wrong_answers, q.correct_answer].sort(() => Math.random() - 0.5)
          }));
          
          return res.status(400).json({ 
            message: 'Please answer all questions to complete this task',
            questions: clientQuestions
          });
        }
        
        // Check if all required questions are answered
        const questionIds = questionsResult.rows.map(q => q.id);
        const answeredIds = answers.map(a => a.question_id);
        const missingQuestionIds = questionIds.filter(id => !answeredIds.includes(id));
        
        if (missingQuestionIds.length > 0) {
          await client.query('ROLLBACK');
          
          // Get the missing questions
          const missingQuestions = questionsResult.rows
            .filter(q => missingQuestionIds.includes(q.id))
            .map(q => ({
              id: q.id,
              question: q.question,
              answers: [...q.wrong_answers, q.correct_answer].sort(() => Math.random() - 0.5)
            }));
          
          return res.status(400).json({ 
            message: 'Please answer all questions to complete this task',
            questions: missingQuestions
          });
        }
        
        // Check each answer
        for (const answer of answers) {
          const question = questionsResult.rows.find(q => q.id === answer.question_id);
          
          if (!question) {
            continue; // Skip if question not found
          }
          
          const isCorrect = answer.answer.toLowerCase() === question.correct_answer.toLowerCase();
          
          // Record the response
          await client.query(
            `INSERT INTO youtube_question_responses 
              (user_id, question_id, answer, is_correct)
             VALUES ($1, $2, $3, $4)`,
            [userId, question.id, answer.answer, isCorrect]
          );
          
          if (!isCorrect) {
            allAnswersCorrect = false;
            incorrectQuestions.push({
              id: question.id,
              question: question.question,
              answers: [...question.wrong_answers, question.correct_answer].sort(() => Math.random() - 0.5)
            });
          }
        }
        
        // If any answer is incorrect
        if (!allAnswersCorrect) {
          await client.query('ROLLBACK');
          return res.status(400).json({ 
            message: 'Some answers are incorrect. Please watch the video and try again.',
            success: false,
            incorrectQuestions
          });
        }
      }

            // Check if this video task is part of a user promotion by directly checking the promotion_id column
      // First get the task with its promotion_id and make sure the promotion is valid
      const videoTaskResult = await client.query(
        `SELECT yt.id as task_id, yt.promotion_id, 
               usp.id, usp.status, usp.current_views_joins, usp.target_views_joins, 
               usp.expires_at, usp.reward_per_action, usp.cost_per_action, usp.admin_profit_per_action,
               usp.user_id
         FROM youtube_tasks yt
         LEFT JOIN user_submitted_promotions usp ON yt.promotion_id = usp.id
         WHERE yt.id = $1 
           AND yt.promotion_id IS NOT NULL
           AND usp.id IS NOT NULL
           AND (usp.status = 'active' OR usp.status = 'approved')
           AND usp.current_views_joins < usp.target_views_joins
           AND usp.expires_at > NOW()`,
        [taskId]
      );
      
      // Check if promotion_id exists and is valid
      const isUserPromotion = videoTaskResult.rows.length > 0;
                             
      // We already have the promotion data from videoTaskResult
      let promotionResult = { rows: [] };
      if (isUserPromotion) {
        // Just reuse the data we already have
        promotionResult = {
          rows: [videoTaskResult.rows[0]]
        };
      }
      
      // Fetch points reward from settings
      const settingsResult = await client.query(
        `SELECT value FROM settings WHERE key = 'points_on_video_task_completion'`
      );
      let POINTS_REWARD = parseInt(settingsResult.rows[0]?.value) || 0;
      
      // For user promotions, use the promotion-specific reward
      if (isUserPromotion && promotionResult.rows.length > 0) {
        const promotion = promotionResult.rows[0];
        
        // Check if user already completed this promotion task
        const alreadyCompletedCheck = await client.query(
          `SELECT 1 FROM user_promotion_engagements 
           WHERE user_id = $1 AND promotion_id = $2 AND engagement_type = $3`,
          [userId, promotion.id, 'view']
        );
        
        if (alreadyCompletedCheck.rows.length > 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ 
            message: 'You have already completed this promotion task',
            success: false
          });
        }
        
        // Get promotion owner info to update their locked points
        const promoterResult = await client.query(
          `SELECT id, locked_points FROM telegram_users WHERE id = $1`,
          [promotion.user_id]
        );
        
        if (promoterResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ 
            message: 'Promotion owner account not found',
            success: false
          });
        }
        
        const promoter = promoterResult.rows[0];
        const costPerAction = promotion.cost_per_action || 0;
        const rewardPerAction = promotion.reward_per_action || 0;
        const adminProfit = promotion.admin_profit_per_action || costPerAction - rewardPerAction;
        
        // Make sure promoter has enough locked points
        if (promoter.locked_points < costPerAction) {
          await client.query('ROLLBACK');
          return res.status(400).json({ 
            message: 'This promotion has reached its budget limit',
            success: false
          });
        }
        
        // 1. Reduce locked points from promoter
        await client.query(
          `UPDATE telegram_users SET locked_points = locked_points - $1 WHERE id = $2`,
          [costPerAction, promotion.user_id]
        );
        
        // 2. Insert engagement record
        if (promotion && promotion.id) {
          await client.query(
            `INSERT INTO user_promotion_engagements 
              (user_id, promotion_id, engagement_type, points_awarded)
             VALUES ($1, $2, $3, $4)`,
            [userId, promotion.id, 'view', rewardPerAction]
          );
        } else {
          // This should never happen as we already checked for valid promotion,
          // but adding as an extra safeguard
          await client.query('ROLLBACK');
          return res.status(400).json({ 
            message: 'Invalid promotion data',
            success: false
          });
        }
        
        // 3. Update promotion stats
        await client.query(
          `UPDATE user_submitted_promotions 
           SET current_views_joins = current_views_joins + 1,
               promotion_stats = jsonb_set(
                 jsonb_set(
                   jsonb_set(
                     jsonb_set(
                       COALESCE(promotion_stats, '{}'::jsonb),
                       '{total_engagements}',
                       (COALESCE((promotion_stats->>'total_engagements')::int, 0) + 1)::text::jsonb
                     ),
                     '{total_points_distributed}',
                     (COALESCE((promotion_stats->>'total_points_distributed')::int, 0) + $1)::text::jsonb
                   ),
                   '{total_admin_profit}',
                   (COALESCE((promotion_stats->>'total_admin_profit')::int, 0) + $2)::text::jsonb
                 ),
                 '{held_balance}',
                 (COALESCE((promotion_stats->>'held_balance')::int, 0) - $3)::text::jsonb
               ),
               updated_at = NOW(),
               status = CASE 
                 WHEN current_views_joins + 1 >= target_views_joins THEN 'completed'
                 ELSE status 
               END
           WHERE id = $4`,
          [rewardPerAction, adminProfit, costPerAction, promotion.id]
        );
        
        // Set the points reward to the promotion reward
        POINTS_REWARD = rewardPerAction;
        
        // Update task progress to link with promotion
        await client.query(
          `UPDATE task_progress 
           SET metadata = jsonb_set(metadata, '{promotion_id}', $1::text::jsonb) 
           WHERE user_id = $2 AND task_id = $3 AND task_type = 'youtube_video'`,
          [promotion.id.toString(), userId, taskId]
        );
      }

      if (POINTS_REWARD > 0) {
        await client.query(
          'SELECT add_points_to_user($1, $2)',
          [userId, POINTS_REWARD]
        );
      }

      // Update metadata to include completion info
      const updatedMetadata = {
        ...metadata,
        completed_at: currentTime.toISOString(),
        actual_watch_time: watchTimeSecs,
        answers_correct: allAnswersCorrect,
        answers: answers
      };

      const progressUpdateResult = await client.query(
        `UPDATE task_progress 
         SET status = 'completed', 
             points_earned = $3,
             updated_at = NOW(),
             metadata = $4
         WHERE user_id = $1 
           AND task_id = $2 
           AND task_type = 'youtube_video'
         RETURNING *`,
        [userId, taskId, POINTS_REWARD, updatedMetadata]
      );

      // Insert into user_tasks for analytics/consistency
      // Only insert if points were awarded AND it's not a user promotion
      if (POINTS_REWARD > 0 && !isUserPromotion) {
        await client.query(
          `INSERT INTO user_tasks (user_id, task_id, completed_at, points_awarded)
           VALUES ($1, (SELECT id FROM tasks WHERE type = 'video' AND is_active = TRUE LIMIT 1), NOW(), $2)
           ON CONFLICT (user_id, task_id) DO NOTHING`,
          [userId, POINTS_REWARD]
        );
      }

      await client.query('COMMIT');

      res.json({
        message: 'Task completed successfully',
        points_earned: POINTS_REWARD,
        taskProgress: progressUpdateResult.rows[0],
        success: true
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error completing video task:', error);
    
    // Format error response for cooldown questions
    if (error.cooldownQuestions && Array.isArray(error.cooldownQuestions)) {
      return res.status(429).json({
        message: 'Some questions are on cooldown. Please wait and try again.',
        cooldownQuestions: error.cooldownQuestions
      });
    }
    
    // Format error response for incorrect questions
    if (error.incorrectQuestions && Array.isArray(error.incorrectQuestions)) {
      return res.status(400).json({
        message: 'Some answers are incorrect. Please try again.',
        incorrectQuestions: error.incorrectQuestions
      });
    }
    
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
