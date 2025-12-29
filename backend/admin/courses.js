const express = require('express');
const pool = require('../config/database');
const { adminAuth } = require('./auth');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Get all courses
router.get('/', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, category, status } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE 1=1';
    let queryParams = [];
    let paramCount = 0;
    
    if (category) {
      paramCount++;
      whereClause += ` AND c.category = $${paramCount}`;
      queryParams.push(category);
    }
    
    if (status !== undefined) {
      paramCount++;
      whereClause += ` AND c.is_active = $${paramCount}`;
      queryParams.push(status === 'active');
    }
    
    const result = await pool.query(`
      SELECT 
        c.*,
        COUNT(cl.id) as lesson_count,
        COUNT(ucp.user_id) as enrolled_count,
        COUNT(CASE WHEN ucp.status = 'completed' THEN 1 END) as completed_count
      FROM courses c
      LEFT JOIN course_lessons cl ON c.id = cl.course_id
      LEFT JOIN user_course_progress ucp ON c.id = ucp.course_id
      ${whereClause}
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `, [...queryParams, limit, offset]);
    
    const countResult = await pool.query(`
      SELECT COUNT(*) FROM courses c ${whereClause}
    `, queryParams);
    
    const total = parseInt(countResult.rows[0].count);
    
    res.json({
      courses: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Redirect /stats to /stats/overview for backward compatibility
router.get('/stats', adminAuth, (req, res) => {
  res.redirect('/admin/courses/stats/overview');
});

// Get course statistics (MUST be before /:id route)
router.get('/stats/overview', adminAuth, async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_courses,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_courses,
        COUNT(CASE WHEN is_free = true THEN 1 END) as free_courses,
        COUNT(CASE WHEN require_premium = true THEN 1 END) as premium_courses
      FROM courses
    `);
    
    const enrollmentStats = await pool.query(`
      SELECT 
        COUNT(DISTINCT user_id) as total_enrolled_users,
        COUNT(*) as total_enrollments,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_enrollments
      FROM user_course_progress
    `);
    
    const certificateStats = await pool.query(`
      SELECT COUNT(*) as total_certificates
      FROM user_certificates
      WHERE is_valid = true
    `);
    
    res.json({
      courses: stats.rows[0],
      enrollments: enrollmentStats.rows[0],
      certificates: certificateStats.rows[0]
    });
  } catch (error) {
    console.error('Error fetching course stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single course with lessons
router.get('/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get course details
    const courseResult = await pool.query(`
      SELECT c.*,
             COUNT(DISTINCT cl.id) as lesson_count,
             COUNT(DISTINCT ucp.user_id) as enrolled_count,
             COUNT(CASE WHEN ucp.status = 'completed' THEN 1 END) as completed_count
      FROM courses c
      LEFT JOIN course_lessons cl ON c.id = cl.course_id
      LEFT JOIN user_course_progress ucp ON c.id = ucp.course_id
      WHERE c.id = $1
      GROUP BY c.id
    `, [id]);
    
    if (courseResult.rows.length === 0) {
      return res.status(404).json({ message: 'Course not found' });
    }
    
    // Get lessons
    const lessonsResult = await pool.query(`
      SELECT cl.*,
             COUNT(cq.id) as quiz_count
      FROM course_lessons cl
      LEFT JOIN course_quizzes cq ON cl.id = cq.lesson_id
      WHERE cl.course_id = $1
      GROUP BY cl.id
      ORDER BY cl.order_index ASC
    `, [id]);
    
    // Get recent enrollments
    const enrollmentsResult = await pool.query(`
      SELECT DISTINCT ON (ucp.user_id)
        ucp.user_id,
        ucp.status,
        ucp.progress_percentage,
        ucp.started_at,
        ucp.completed_at,
        tu.username,
        tu.first_name,
        tu.last_name,
        tu.photo_url
      FROM user_course_progress ucp
      JOIN telegram_users tu ON ucp.user_id = tu.id
      WHERE ucp.course_id = $1
      ORDER BY ucp.user_id, ucp.started_at DESC
      LIMIT 20
    `, [id]);
    
    res.json({
      course: courseResult.rows[0],
      lessons: lessonsResult.rows,
      recent_enrollments: enrollmentsResult.rows
    });
  } catch (error) {
    console.error('Error fetching course:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new course with Supabase thumbnail URL
router.post('/', adminAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    console.log('Request body:', req.body); // Debug request body
    
    const {
      title, description, category, difficulty_level, price, duration_hours,
      is_free, require_premium, unlock_criteria, certification_required, thumbnailUrl
    } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({ message: 'Title and description are required' });
    }
    
    await client.query('BEGIN');
    
    // Parse unlock_criteria if it's a string
    let parsedUnlockCriteria = {};
    if (unlock_criteria) {
      try {
        parsedUnlockCriteria = typeof unlock_criteria === 'string' 
          ? JSON.parse(unlock_criteria) 
          : unlock_criteria;
      } catch (e) {
        parsedUnlockCriteria = {};
      }
    }
    
    const courseResult = await client.query(`
      INSERT INTO courses (
        title, description, category, difficulty_level, price, duration_hours,
        is_free, require_premium, unlock_criteria, certification_required, thumbnail_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      title, description, category, difficulty_level, price || 0, duration_hours || 0,
      is_free !== false, require_premium === true, parsedUnlockCriteria, 
      certification_required === true, thumbnailUrl
    ]);
    
    await client.query('COMMIT');
    
    res.status(201).json({
      message: 'Course created successfully',
      course: courseResult.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating course:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

// Update course with Supabase thumbnail URL
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title, description, category, difficulty_level, price, duration_hours,
      is_free, require_premium, unlock_criteria, certification_required, is_active, thumbnailUrl
    } = req.body;
    
    // Parse unlock_criteria if it's a string
    let parsedUnlockCriteria = undefined;
    if (unlock_criteria !== undefined) {
      try {
        parsedUnlockCriteria = typeof unlock_criteria === 'string' 
          ? JSON.parse(unlock_criteria) 
          : unlock_criteria;
      } catch (e) {
        parsedUnlockCriteria = {};
      }
    }
    
    const result = await pool.query(`
      UPDATE courses SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        category = COALESCE($3, category),
        difficulty_level = COALESCE($4, difficulty_level),
        price = COALESCE($5, price),
        duration_hours = COALESCE($6, duration_hours),
        is_free = COALESCE($7, is_free),
        require_premium = COALESCE($8, require_premium),
        unlock_criteria = COALESCE($9, unlock_criteria),
        certification_required = COALESCE($10, certification_required),
        thumbnail_url = COALESCE($11, thumbnail_url),
        is_active = COALESCE($12, is_active),
        updated_at = NOW()
      WHERE id = $13
      RETURNING *
    `, [
      title, description, category, difficulty_level, price, duration_hours,
      is_free, require_premium, parsedUnlockCriteria, certification_required,
      thumbnailUrl, is_active, id
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Course not found' });
    }
    
    res.json({
      message: 'Course updated successfully',
      course: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating course:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete course
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM courses WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Course not found' });
    }
    
    res.json({ message: 'Course deleted successfully' });
  } catch (error) {
    console.error('Error deleting course:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Lesson management routes

// Get lessons by course ID
router.get('/:courseId/lessons', adminAuth, async (req, res) => {
  try {
    const { courseId } = req.params;

    const result = await pool.query(`
      SELECT cl.*,
             COUNT(cq.id) as quiz_count
      FROM course_lessons cl
      LEFT JOIN course_quizzes cq ON cl.id = cq.lesson_id
      WHERE cl.course_id = $1
      GROUP BY cl.id
      ORDER BY cl.order_index ASC
    `, [courseId]);

    res.json({
      lessons: result.rows
    });
  } catch (error) {
    console.error('Error fetching lessons:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create lesson with Supabase content file URL
router.post('/:courseId/lessons', adminAuth, async (req, res) => {
  try {
    const { courseId } = req.params;
    const {
      title, description, content_type, content_url, content_text,
      order_index, duration_minutes, is_required, content_file_url
    } = req.body;
    
    if (!title || !content_type) {
      return res.status(400).json({ message: 'Title and content type are required' });
    }
    
    let finalContentUrl = content_file_url || content_url;
    
    const result = await pool.query(`
      INSERT INTO course_lessons (
        course_id, title, description, content_type, content_url, content_text,
        order_index, duration_minutes, is_required
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      courseId, title, description, content_type, finalContentUrl, content_text,
      order_index || 1, duration_minutes || 0, is_required !== false
    ]);
    
    res.status(201).json({
      message: 'Lesson created successfully',
      lesson: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating lesson:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update lesson with Supabase content file URL
router.put('/lessons/:lessonId', adminAuth, async (req, res) => {
  try {
    const { lessonId } = req.params;
    const {
      title, description, content_type, content_url, content_text,
      order_index, duration_minutes, is_required, content_file_url
    } = req.body;
    
    let finalContentUrl = content_file_url || content_url;
    
    const result = await pool.query(`
      UPDATE course_lessons SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        content_type = COALESCE($3, content_type),
        content_url = COALESCE($4, content_url),
        content_text = COALESCE($5, content_text),
        order_index = COALESCE($6, order_index),
        duration_minutes = COALESCE($7, duration_minutes),
        is_required = COALESCE($8, is_required)
      WHERE id = $9
      RETURNING *
    `, [
      title, description, content_type, finalContentUrl, content_text,
      order_index, duration_minutes, is_required, lessonId
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Lesson not found' });
    }
    
    res.json({
      message: 'Lesson updated successfully',
      lesson: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating lesson:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete lesson
router.delete('/lessons/:lessonId', adminAuth, async (req, res) => {
  try {
    const { lessonId } = req.params;

    const result = await pool.query('DELETE FROM course_lessons WHERE id = $1 RETURNING *', [lessonId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    res.json({ message: 'Lesson deleted successfully' });
  } catch (error) {
    console.error('Error deleting lesson:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Reorder lesson
router.put('/lessons/:lessonId/reorder', adminAuth, async (req, res) => {
  try {
    const { lessonId } = req.params;
    const { order_index } = req.body;

    if (order_index === undefined) {
      return res.status(400).json({ message: 'order_index is required' });
    }

    const result = await pool.query(`
      UPDATE course_lessons SET
        order_index = $1
      WHERE id = $2
      RETURNING *
    `, [order_index, lessonId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    res.json({
      message: 'Lesson reordered successfully',
      lesson: result.rows[0]
    });
  } catch (error) {
    console.error('Error reordering lesson:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Quiz management for lessons

// Add quiz to lesson
router.post('/lessons/:lessonId/quizzes', adminAuth, async (req, res) => {
  try {
    const { lessonId } = req.params;
    const { questions } = req.body;
    
    if (!questions || !Array.isArray(questions)) {
      return res.status(400).json({ message: 'Questions array is required' });
    }
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const addedQuestions = [];
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (!q.question || !q.correct_answer) {
          throw new Error(`Question ${i + 1} is missing required fields`);
        }
        
        const result = await client.query(`
          INSERT INTO course_quizzes (
            lesson_id, question, correct_answer, wrong_answers, points, order_index
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `, [
          lessonId, q.question, q.correct_answer, 
          q.wrong_answers || [], q.points || 1, i + 1
        ]);
        
        addedQuestions.push(result.rows[0]);
      }
      
      await client.query('COMMIT');
      
      res.status(201).json({
        message: 'Quiz questions added successfully',
        questions: addedQuestions
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error adding quiz questions:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});


// Get course categories
router.get('/meta/categories', adminAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        category,
        COUNT(*) as course_count,
        AVG(price) as avg_price
      FROM courses 
      WHERE category IS NOT NULL AND category != ''
      GROUP BY category
      ORDER BY course_count DESC
    `);
    
    res.json({
      categories: result.rows
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get quiz questions for a lesson
router.get('/:courseId/lessons/:lessonId/quiz', adminAuth, async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;

    // Verify lesson belongs to course
    const lessonCheck = await pool.query(
      'SELECT id FROM course_lessons WHERE id = $1 AND course_id = $2',
      [lessonId, courseId]
    );

    if (lessonCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    const result = await pool.query(`
      SELECT * FROM course_quizzes
      WHERE lesson_id = $1
      ORDER BY order_index ASC
    `, [lessonId]);

    res.json({
      quiz_questions: result.rows
    });
  } catch (error) {
    console.error('Error fetching quiz questions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create or update quiz questions for a lesson
router.put('/:courseId/lessons/:lessonId/quiz', adminAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { courseId, lessonId } = req.params;
    const { questions } = req.body;

    if (!questions || !Array.isArray(questions)) {
      return res.status(400).json({ message: 'Questions array is required' });
    }

    await client.query('BEGIN');

    // Verify lesson belongs to course
    const lessonCheck = await client.query(
      'SELECT id FROM course_lessons WHERE id = $1 AND course_id = $2',
      [lessonId, courseId]
    );

    if (lessonCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Lesson not found' });
    }

    // Delete existing quiz questions
    await client.query('DELETE FROM course_quizzes WHERE lesson_id = $1', [lessonId]);

    // Insert new questions
    const addedQuestions = [];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];

      if (!q.question || !q.correct_answer) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: `Question ${i + 1} is missing required fields (question, correct_answer)`
        });
      }

      const result = await client.query(`
        INSERT INTO course_quizzes (
          lesson_id, question, correct_answer, wrong_answers, points, order_index
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [
        lessonId, q.question, q.correct_answer,
        q.wrong_answers || [], q.points || 1, i + 1
      ]);

      addedQuestions.push(result.rows[0]);
    }

    // Update lesson to be quiz type if it wasn't already
    await client.query(`
      UPDATE course_lessons
      SET content_type = 'quiz', updated_at = NOW()
      WHERE id = $1 AND content_type != 'quiz'
    `, [lessonId]);

    await client.query('COMMIT');

    res.json({
      message: 'Quiz questions updated successfully',
      questions: addedQuestions
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating quiz questions:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

// Delete a specific quiz question
router.delete('/:courseId/lessons/:lessonId/quiz/:questionId', adminAuth, async (req, res) => {
  try {
    const { courseId, lessonId, questionId } = req.params;

    // Verify the question belongs to the lesson and course
    const questionCheck = await pool.query(`
      SELECT cq.id FROM course_quizzes cq
      JOIN course_lessons cl ON cq.lesson_id = cl.id
      WHERE cq.id = $1 AND cl.id = $2 AND cl.course_id = $3
    `, [questionId, lessonId, courseId]);

    if (questionCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Quiz question not found' });
    }

    await pool.query('DELETE FROM course_quizzes WHERE id = $1', [questionId]);

    res.json({ message: 'Quiz question deleted successfully' });
  } catch (error) {
    console.error('Error deleting quiz question:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;