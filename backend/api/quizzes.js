
const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Get available quizzes for user
const { getTaskDependencyDetail } = require('./task-utils');
router.get('/', async (req, res) => {
  try {
    if (!req.telegramUser) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const userId = req.telegramUser.id;

    const result = await pool.query(`
      SELECT 
        q.id,
        q.title,
        q.hashtags,
        q.points_per_question,
        COUNT(qq.id) as question_count,
        COALESCE(ua.score, 0) as user_score,
        CASE 
          WHEN ua.id IS NOT NULL THEN true 
          ELSE false 
        END as completed,
        q.require_finish_task_id,
        q.require_finish_task_type
      FROM quizzes q
      LEFT JOIN quiz_questions qq ON q.id = qq.quiz_id
      LEFT JOIN user_quiz_attempts ua ON ua.quiz_id = q.id AND ua.user_id = $1
      WHERE q.is_active = true
      GROUP BY q.id, ua.id, ua.score, q.require_finish_task_id, q.require_finish_task_type
      ORDER BY q.created_at DESC
    `, [userId]);

    // Add isLocked flag and filter quizzes based on task dependencies
    const quizzes = await Promise.all(result.rows.map(async (quiz) => {
      let isLocked = false;
      let require_finish_task_detail = null;
      if (quiz.require_finish_task_id && quiz.require_finish_task_type) {
        const taskCompletion = await pool.query(
          `SELECT 1 FROM task_progress WHERE user_id = $1 AND task_id = $2 AND task_type = $3 AND status = 'completed'`,
          [userId, quiz.require_finish_task_id, quiz.require_finish_task_type]
        );
        if (taskCompletion.rows.length === 0) {
          isLocked = true;
        }
        require_finish_task_detail = await getTaskDependencyDetail(quiz.require_finish_task_type, quiz.require_finish_task_id);
      }
      return { ...quiz, isLocked, require_finish_task_detail };
    }));

    res.json({ quizzes });
  } catch (error) {
    console.error('Error fetching quizzes:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/quizzes/categories - Get unique quiz categories
router.get('/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT DISTINCT category FROM quizzes ORDER BY category ASC');
    const categories = result.rows.map(row => row.category || 'Uncategorized');
    res.json({ categories });
  } catch (error) {
    console.error('Error fetching quiz categories:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single quiz for user
router.get('/:id', async (req, res) => {
  try {
    if (!req.telegramUser) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id } = req.params;
    const userId = req.telegramUser.id;

    // Get quiz details, including dependency information
    const quizResult = await pool.query(
      'SELECT id, title, hashtags, points_per_question, require_finish_task_id, require_finish_task_type FROM quizzes WHERE id = $1 AND is_active = true',
      [id]
    );

    if (quizResult.rows.length === 0) {
      return res.status(404).json({ message: 'Quiz not found or inactive' });
    }

    const quiz = quizResult.rows[0];

    // Check task dependency
    let isLocked = false;
    let require_finish_task_detail = null;
    if (quiz.require_finish_task_id && quiz.require_finish_task_type) {
      const taskCompletion = await pool.query(
        `SELECT 1 FROM task_progress WHERE user_id = $1 AND task_id = $2 AND task_type = $3 AND status = 'completed'`,
        [userId, quiz.require_finish_task_id, quiz.require_finish_task_type]
      );
      if (taskCompletion.rows.length === 0) {
        isLocked = true;
      }
      require_finish_task_detail = await getTaskDependencyDetail(quiz.require_finish_task_type, quiz.require_finish_task_id);
    }

    if (isLocked) {
      return res.status(400).json({
        message: 'Complete the previous task first',
        require_finish_task_id: quiz.require_finish_task_id,
        require_finish_task_type: quiz.require_finish_task_type,
        require_finish_task_detail,
        isLocked: true
      });
    }

    // Check if user has already completed this quiz
    const attemptResult = await pool.query(
      `SELECT 
        uqa.id, 
        uqa.score, 
        uqa.correct_answers,
        uqa.total_questions,
        uqa.completed_at,
        tp.metadata
      FROM user_quiz_attempts uqa
      LEFT JOIN task_progress tp ON 
        tp.user_id = uqa.user_id AND 
        tp.task_type = 'quiz' AND 
        tp.task_id = uqa.quiz_id
      WHERE uqa.quiz_id = $1 AND uqa.user_id = $2`,
      [id, userId]
    );

    if (attemptResult.rows.length > 0) {
      const attempt = attemptResult.rows[0];
      let previousAttempt = {
        score: attempt.score,
        correct_answers: attempt.correct_answers,
        total_questions: attempt.total_questions,
        completed_at: attempt.completed_at,
        answer_details: []
      };
      
      // If we have metadata with answer details, include it
      if (attempt.metadata && attempt.metadata.answer_details) {
        // Get question texts for the answer details
        const questionIds = attempt.metadata.answer_details.map(detail => detail.question_id);
        
        if (questionIds.length > 0) {
          const questionsResult = await pool.query(
            'SELECT id, question_text FROM quiz_questions WHERE id = ANY($1::int[])',
            [questionIds]
          );
          
          // Create a map of question_id to question_text
          const questionTexts = {};
          questionsResult.rows.forEach(q => {
            questionTexts[q.id] = q.question_text;
          });
          
          // Add question_text to each answer detail
          previousAttempt.answer_details = attempt.metadata.answer_details.map(detail => ({
            ...detail,
            question_text: questionTexts[detail.question_id] || 'Question'
          }));
        } else {
          previousAttempt.answer_details = attempt.metadata.answer_details;
        }
      }
      
      return res.status(400).json({ 
        message: 'Quiz already completed',
        score: attempt.score,
        previousAttempt
      });
    }

    // Check if there's an in-progress attempt in task_progress
    const progressResult = await pool.query(
      `SELECT id, status, metadata FROM task_progress 
       WHERE user_id = $1 AND task_type = 'quiz' AND task_id = $2`,
      [userId, id]
    );
    
    let inProgressData = null;
    if (progressResult.rows.length > 0 && progressResult.rows[0].status === 'in_progress') {
      inProgressData = progressResult.rows[0].metadata || {};
    }

    const questionsResult = await pool.query(`
      SELECT 
        id,
        question_text,
        correct_answer,
        wrong_answers,
        -- Randomize answer order
        array_to_json(
          array(
            SELECT unnest(array_append(wrong_answers, correct_answer))
            ORDER BY random()
          )
        ) as answers
      FROM quiz_questions 
      WHERE quiz_id = $1
      ORDER BY random()
    `, [id]);

    // If there's no in-progress attempt, create one
    if (!inProgressData) {
      await pool.query(
        `INSERT INTO task_progress (user_id, task_type, task_id, status, metadata, updated_at)
         VALUES ($1, 'quiz', $2, 'in_progress', $3, NOW())
         ON CONFLICT (user_id, task_type, task_id) 
         DO UPDATE SET status = 'in_progress', metadata = $3, updated_at = NOW()`,
        [userId, id, JSON.stringify({ started_at: new Date() })]
      );
    }

    res.json({
      quiz: {
        ...quiz,
        questions: questionsResult.rows.map(q => ({
          id: q.id,
          question_text: q.question_text,
          answers: q.answers
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching quiz:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Submit quiz answers
router.post('/:id/submit', async (req, res) => {
  const client = await pool.connect();
  try {
    if (!req.telegramUser) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id } = req.params;
    const { answers } = req.body;

    if (!answers || !Array.isArray(answers)) {
      return res.status(400).json({ message: 'Invalid answers format' });
    }

    await client.query('BEGIN');

    // Check if quiz exists and is active
    const quizResult = await client.query(
      'SELECT id, points_per_question FROM quizzes WHERE id = $1 AND is_active = true',
      [id]
    );

    if (quizResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Quiz not found or inactive' });
    }

    // Check if user has already completed this quiz
    const attemptResult = await client.query(
      'SELECT id FROM user_quiz_attempts WHERE quiz_id = $1 AND user_id = $2',
      [id, req.telegramUser.id]
    );

    if (attemptResult.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Quiz already completed' });
    }

    // Get correct answers
    const questionsResult = await client.query(
      'SELECT id, correct_answer FROM quiz_questions WHERE quiz_id = $1',
      [id]
    );

    const questions = questionsResult.rows;
    const pointsPerQuestion = quizResult.rows[0].points_per_question;

    // Calculate score
    let correctAnswers = 0;
    const answerDetails = [];
    
    answers.forEach(answer => {
      const question = questions.find(q => q.id === answer.question_id);
      if (question) {
        const isCorrect = question.correct_answer.toLowerCase() === answer.answer.toLowerCase();
        if (isCorrect) correctAnswers++;
        
        answerDetails.push({
          question_id: answer.question_id,
          user_answer: answer.answer,
          correct_answer: question.correct_answer,
          is_correct: isCorrect
        });
      }
    });

    const score = correctAnswers * pointsPerQuestion;
    const totalQuestions = questions.length;
    const percentageCorrect = (correctAnswers / totalQuestions) * 100;

    // Record attempt
    await client.query(
      'INSERT INTO user_quiz_attempts (user_id, quiz_id, score, correct_answers, total_questions) VALUES ($1, $2, $3, $4, $5)',
      [req.telegramUser.id, id, score, correctAnswers, totalQuestions]
    );

    // Update task_progress
    const metadata = {
      completed_at: new Date(),
      score,
      correct_answers: correctAnswers,
      total_questions: totalQuestions,
      percentage_correct: percentageCorrect,
      answer_details: answerDetails
    };
    
    await client.query(
      `UPDATE task_progress 
       SET status = 'completed', 
           points_earned = $1,
           metadata = $2,
           updated_at = NOW()
       WHERE user_id = $3 AND task_type = 'quiz' AND task_id = $4`,
      [score, JSON.stringify(metadata), req.telegramUser.id, id]
    );

    // Add points to user
    if (score > 0) {
      await client.query(
        'SELECT add_points_to_user($1, $2)',
        [req.telegramUser.id, score]
      );
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      score,
      correctAnswers,
      totalQuestions,
      percentageCorrect,
      pointsAwarded: score,
      answerDetails
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error submitting quiz:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

// Get user's quiz history
router.get('/history', async (req, res) => {
  try {
    if (!req.telegramUser) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const result = await pool.query(`
      SELECT 
        uqa.id,
        uqa.quiz_id,
        q.title,
        q.hashtags,
        uqa.score,
        uqa.correct_answers,
        uqa.total_questions,
        uqa.completed_at,
        tp.metadata
      FROM user_quiz_attempts uqa
      JOIN quizzes q ON uqa.quiz_id = q.id
      LEFT JOIN task_progress tp ON 
        tp.user_id = uqa.user_id AND 
        tp.task_type = 'quiz' AND 
        tp.task_id = uqa.quiz_id
      WHERE uqa.user_id = $1
      ORDER BY uqa.completed_at DESC
    `, [req.telegramUser.id]);

    res.json({ history: result.rows });
  } catch (error) {
    console.error('Error fetching quiz history:', error);
    res.status(500).json({ message: 'Server error' });
  }
});




module.exports = router; 