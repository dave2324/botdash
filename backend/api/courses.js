const express = require('express');
const pool = require('../config/database');
const auth = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// Get available courses for user
router.get('/', auth, async (req, res) => {
  try {
    const { category, difficulty, type, page = 1, limit = 10 } = req.query;
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const offset = (page - 1) * limit;
    
    // Get user details
    const userResult = await pool.query(
      'SELECT points, is_premium, premium_until FROM telegram_users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const user = userResult.rows[0];
    const isPremium = user.is_premium && new Date(user.premium_until) > new Date();
    
    let whereClause = 'WHERE c.is_active = true';
    let queryParams = [];
    let paramCount = 0;
    
    if (category) {
      paramCount++;
      whereClause += ` AND c.category = $${paramCount}`;
      queryParams.push(category);
    }
    
    if (difficulty) {
      paramCount++;
      whereClause += ` AND c.difficulty_level = $${paramCount}`;
      queryParams.push(difficulty);
    }
    
    if (type === 'free') {
      whereClause += ' AND c.is_free = true';
    } else if (type === 'premium') {
      whereClause += ' AND c.require_premium = true';
    } else if (type === 'paid') {
      whereClause += ' AND c.price > 0';
    }
    
    const result = await pool.query(`
      SELECT 
        c.*,
        COUNT(cl.id) as lesson_count,
        COUNT(ucp.user_id) as enrolled_count,
        CASE 
          WHEN ucp_user.user_id IS NOT NULL THEN ucp_user.status
          ELSE 'not_enrolled'
        END as user_enrollment_status,
        CASE 
          WHEN ucp_user.user_id IS NOT NULL THEN ucp_user.progress_percentage
          ELSE 0
        END as user_progress
      FROM courses c
      LEFT JOIN course_lessons cl ON c.id = cl.course_id
      LEFT JOIN user_course_progress ucp ON c.id = ucp.course_id
      LEFT JOIN user_course_progress ucp_user ON c.id = ucp_user.course_id AND ucp_user.user_id = ${userId}
      ${whereClause}
      GROUP BY c.id, ucp_user.user_id, ucp_user.status, ucp_user.progress_percentage
      ORDER BY c.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `, [...queryParams, limit, offset]);
    
    // Get user's additional data for unlock criteria validation
    const additionalDataResult = await pool.query(`
      SELECT
        COUNT(DISTINCT uc.course_id) as completed_courses,
        COALESCE(SUM(ata.cash_awarded), 0) as affiliate_earnings
      FROM user_certificates uc
      LEFT JOIN affiliate_task_attempts ata ON uc.user_id = ata.user_id AND ata.status = 'approved'
      WHERE uc.user_id = $1 AND uc.is_valid = true
    `, [userId]);

    const userData = additionalDataResult.rows[0];

    // Check unlock criteria for each course
    const coursesWithAccess = await Promise.all(result.rows.map(async (course) => {
      let canAccess = true;
      let accessReason = '';

      // Check premium requirement
      if (course.require_premium && !isPremium) {
        canAccess = false;
        accessReason = 'Premium membership required';
      }
      // Check payment requirement
      else if (course.price > 0 && course.user_enrollment_status === 'not_enrolled') {
        canAccess = false;
        accessReason = `Payment required: ${course.price} ETB`;
      }
      // Check advanced unlock criteria
      else if (course.unlock_criteria && Object.keys(course.unlock_criteria).length > 0) {
        const criteria = course.unlock_criteria;

        // Check required points
        if (criteria.required_points && user.points < criteria.required_points) {
          canAccess = false;
          accessReason = `${criteria.required_points} points required (you have ${user.points})`;
        }

        // Check required affiliate earnings
        if (criteria.required_affiliate_earnings && userData.affiliate_earnings < criteria.required_affiliate_earnings) {
          canAccess = false;
          accessReason = `${criteria.required_affiliate_earnings} ETB affiliate earnings required`;
        }

        // Check required completed courses
        if (criteria.required_completed_courses && userData.completed_courses < criteria.required_completed_courses) {
          canAccess = false;
          accessReason = `${criteria.required_completed_courses} completed courses required`;
        }

        // Check prerequisite courses
        if (criteria.prerequisite_course_ids && criteria.prerequisite_course_ids.length > 0) {
          const prerequisiteCheck = await pool.query(`
            SELECT COUNT(*) as completed_prereqs
            FROM user_certificates uc
            WHERE uc.user_id = $1 AND uc.course_id = ANY($2) AND uc.is_valid = true
          `, [userId, criteria.prerequisite_course_ids]);

          const completedPrereqs = parseInt(prerequisiteCheck.rows[0].completed_prereqs);
          if (completedPrereqs < criteria.prerequisite_course_ids.length) {
            canAccess = false;
            accessReason = `Complete prerequisite courses first (${completedPrereqs}/${criteria.prerequisite_course_ids.length})`;
          }
        }

        // Check minimum task completions
        if (criteria.required_task_completions) {
          const taskCompletionCheck = await pool.query(`
            SELECT COUNT(*) as completed_tasks
            FROM user_tasks ut
            WHERE ut.user_id = $1
          `, [userId]);

          const completedTasks = parseInt(taskCompletionCheck.rows[0].completed_tasks);
          if (completedTasks < criteria.required_task_completions) {
            canAccess = false;
            accessReason = `${criteria.required_task_completions} task completions required (you have ${completedTasks})`;
          }
        }
      }

      return {
        ...course,
        can_access: canAccess,
        access_reason: accessReason,
        user_premium: isPremium,
        user_stats: {
          points: user.points,
          completed_courses: userData.completed_courses,
          affiliate_earnings: userData.affiliate_earnings
        }
      };
    }));
    
    const countResult = await pool.query(`
      SELECT COUNT(*) FROM courses c ${whereClause}
    `, queryParams);
    
    const total = parseInt(countResult.rows[0].count);
    
    res.json({
      courses: coursesWithAccess,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      user_info: {
        points: user.points,
        is_premium: isPremium
      }
    });
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single course details
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    // Get course details
    const courseResult = await pool.query(`
      SELECT c.*,
             COUNT(cl.id) as lesson_count,
             COUNT(ucp.user_id) as enrolled_count
      FROM courses c
      LEFT JOIN course_lessons cl ON c.id = cl.course_id
      LEFT JOIN user_course_progress ucp ON c.id = ucp.course_id
      WHERE c.id = $1 AND c.is_active = true
      GROUP BY c.id
    `, [id]);
    
    if (courseResult.rows.length === 0) {
      return res.status(404).json({ message: 'Course not found' });
    }
    
    const course = courseResult.rows[0];
    
    // Get user enrollment status
    const enrollmentResult = await pool.query(`
      SELECT DISTINCT ON (course_id)
        status, progress_percentage, started_at, completed_at
      FROM user_course_progress
      WHERE course_id = $1 AND user_id = $2
      ORDER BY course_id, started_at DESC
    `, [id, userId]);
    
    const userEnrollment = enrollmentResult.rows[0] || null;
    
    // Get lessons (only if user is enrolled or course is free)
    let lessons = [];
    if (userEnrollment || course.is_free) {
      const lessonsResult = await pool.query(`
        SELECT cl.*,
               ucp.status as user_lesson_status,
               ucp.progress_percentage as user_lesson_progress
        FROM course_lessons cl
        LEFT JOIN user_course_progress ucp ON cl.id = ucp.lesson_id AND ucp.user_id = $2
        WHERE cl.course_id = $1
        ORDER BY cl.order_index ASC
      `, [id, userId]);
      lessons = lessonsResult.rows;
    }
    
    res.json({
      course,
      user_enrollment: userEnrollment,
      lessons
    });
  } catch (error) {
    console.error('Error fetching course details:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Enroll in course
router.post('/:id/enroll', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const userId = req.telegramUser?.id;
    if (!userId) {
      await client.query('ROLLBACK');
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    await client.query('BEGIN');
    
    // Check if course exists and is active
    const courseResult = await client.query(
      'SELECT * FROM courses WHERE id = $1 AND is_active = true',
      [id]
    );
    
    if (courseResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Course not found or inactive' });
    }
    
    const course = courseResult.rows[0];
    
    // Check if already enrolled
    const existingEnrollment = await client.query(
      'SELECT * FROM user_course_progress WHERE course_id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (existingEnrollment.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Already enrolled in this course' });
    }
    
    // Check access requirements (implement payment logic here if needed)
    // For now, assume free courses or premium access
    
    // Create enrollment
    const enrollmentResult = await client.query(`
      INSERT INTO user_course_progress (user_id, course_id, status, progress_percentage)
      VALUES ($1, $2, 'in_progress', 0)
      RETURNING *
    `, [userId, id]);
    
    await client.query('COMMIT');
    
    res.json({
      message: 'Successfully enrolled in course',
      enrollment: enrollmentResult.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error enrolling in course:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

// Get all lessons for a course
router.get('/:courseId/lessons', auth, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Check if user is enrolled or course has free preview lessons
    const courseResult = await pool.query(
      'SELECT * FROM courses WHERE id = $1 AND is_active = true',
      [courseId]
    );

    if (courseResult.rows.length === 0) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const course = courseResult.rows[0];

    // Check enrollment status
    const enrollmentResult = await pool.query(
      'SELECT * FROM user_course_progress WHERE course_id = $1 AND user_id = $2',
      [courseId, userId]
    );

    const isEnrolled = enrollmentResult.rows.length > 0;

    // Get all lessons with completion status
    const lessonsResult = await pool.query(`
      SELECT
        cl.*,
        CASE
          WHEN ucp.lesson_id IS NOT NULL AND ucp.status = 'completed' THEN true
          ELSE false
        END as is_completed,
        ucp.completed_at
      FROM course_lessons cl
      LEFT JOIN user_course_progress ucp ON cl.id = ucp.lesson_id AND ucp.user_id = $2
      WHERE cl.course_id = $1
      ORDER BY cl.order_index ASC
    `, [courseId, userId]);

    // Filter lessons based on access rights
    const accessibleLessons = lessonsResult.rows.map(lesson => ({
      ...lesson,
      // Users can access lessons if they're enrolled, if it's a free preview, or if the course is free
      can_access: isEnrolled || lesson.is_free_preview || course.is_free,
      // Only show content if user has access
      content_text: (isEnrolled || lesson.is_free_preview || course.is_free) ? lesson.content_text : null,
      content_url: (isEnrolled || lesson.is_free_preview || course.is_free) ? lesson.content_url : null
    }));

    res.json({
      lessons: accessibleLessons,
      is_enrolled: isEnrolled,
      course_id: parseInt(courseId)
    });
  } catch (error) {
    console.error('Error fetching course lessons:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get lesson details
router.get('/:courseId/lessons/:lessonId', auth, async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    // Check if user is enrolled
    const enrollmentResult = await pool.query(
      'SELECT * FROM user_course_progress WHERE course_id = $1 AND user_id = $2',
      [courseId, userId]
    );
    
    if (enrollmentResult.rows.length === 0) {
      return res.status(403).json({ message: 'Not enrolled in this course' });
    }
    
    // Get lesson details
    const lessonResult = await pool.query(`
      SELECT cl.*,
             ucp.status as user_status,
             ucp.progress_percentage,
             ucp.quiz_score
      FROM course_lessons cl
      LEFT JOIN user_course_progress ucp ON cl.id = ucp.lesson_id AND ucp.user_id = $3
      WHERE cl.id = $1 AND cl.course_id = $2
    `, [lessonId, courseId, userId]);
    
    if (lessonResult.rows.length === 0) {
      return res.status(404).json({ message: 'Lesson not found' });
    }
    
    const lesson = lessonResult.rows[0];
    
    // Get quiz questions if lesson has quiz
    let quizQuestions = [];
    if (lesson.content_type === 'quiz') {
      const quizResult = await pool.query(`
        SELECT id, question, wrong_answers, points, order_index
        FROM course_quizzes
        WHERE lesson_id = $1
        ORDER BY order_index ASC
      `, [lessonId]);

      // Shuffle answer choices for each question
      quizQuestions = quizResult.rows.map(q => {
        const wrongAnswers = Array.isArray(q.wrong_answers) ? q.wrong_answers : [];
        const allAnswers = [q.correct_answer, ...wrongAnswers].sort(() => Math.random() - 0.5);

        return {
          id: q.id,
          question: q.question,
          answer_choices: allAnswers,
          points: q.points,
          order_index: q.order_index
        };
      });
    }
    
    res.json({
      lesson,
      quiz_questions: quizQuestions
    });
  } catch (error) {
    console.error('Error fetching lesson:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark lesson as completed
router.post('/:courseId/lessons/:lessonId/complete', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { courseId, lessonId } = req.params;
    const userId = req.telegramUser?.id;
    if (!userId) {
      await client.query('ROLLBACK');
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const { quiz_answers } = req.body;
    
    await client.query('BEGIN');
    
    // Check enrollment
    const enrollmentResult = await client.query(
      'SELECT * FROM user_course_progress WHERE course_id = $1 AND user_id = $2',
      [courseId, userId]
    );
    
    if (enrollmentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'Not enrolled in this course' });
    }
    
    // Get lesson details
    const lessonResult = await client.query(
      'SELECT * FROM course_lessons WHERE id = $1 AND course_id = $2',
      [lessonId, courseId]
    );
    
    if (lessonResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Lesson not found' });
    }
    
    const lesson = lessonResult.rows[0];
    let quizScore = 0;
    
    // Handle quiz if present
    if (lesson.content_type === 'quiz' && quiz_answers) {
      const quizQuestions = await client.query(
        'SELECT * FROM course_quizzes WHERE lesson_id = $1 ORDER BY order_index ASC',
        [lessonId]
      );
      
      let correctAnswers = 0;
      quizQuestions.rows.forEach((question, index) => {
        if (quiz_answers[index] === question.correct_answer) {
          correctAnswers++;
        }
      });
      
      quizScore = Math.round((correctAnswers / quizQuestions.rows.length) * 100);
    }
    
    // Update or create lesson progress
    await client.query(`
      INSERT INTO user_course_progress (user_id, course_id, lesson_id, status, progress_percentage, quiz_score)
      VALUES ($1, $2, $3, 'completed', 100, $4)
      ON CONFLICT (user_id, course_id, lesson_id)
      DO UPDATE SET status = 'completed', progress_percentage = 100, quiz_score = $4, completed_at = NOW()
    `, [userId, courseId, lessonId, quizScore]);
    
    // Calculate overall course progress
    const progressResult = await client.query(`
      SELECT 
        COUNT(*) as total_lessons,
        COUNT(CASE WHEN ucp.status = 'completed' THEN 1 END) as completed_lessons
      FROM course_lessons cl
      LEFT JOIN user_course_progress ucp ON cl.id = ucp.lesson_id AND ucp.user_id = $2
      WHERE cl.course_id = $1
    `, [courseId, userId]);
    
    const progress = progressResult.rows[0];
    const overallProgress = Math.round((progress.completed_lessons / progress.total_lessons) * 100);
    
    // Update course progress
    await client.query(`
      UPDATE user_course_progress 
      SET progress_percentage = $3, 
          status = CASE WHEN $3 = 100 THEN 'completed' ELSE 'in_progress' END,
          completed_at = CASE WHEN $3 = 100 THEN NOW() ELSE completed_at END
      WHERE user_id = $1 AND course_id = $2 AND lesson_id IS NULL
    `, [userId, courseId, overallProgress]);
    
    // If course is completed, generate certificate if required
    let certificate = null;
    if (overallProgress === 100) {
      const courseDetails = await client.query('SELECT * FROM courses WHERE id = $1', [courseId]);
      const course = courseDetails.rows[0];
      
      if (course.certification_required) {
        const certificateId = uuidv4();
        const verificationCode = Math.random().toString(36).substring(2, 15);
        
        const certResult = await client.query(`
          INSERT INTO user_certificates (user_id, course_id, certificate_id, verification_code)
          VALUES ($1, $2, $3, $4)
          RETURNING *
        `, [userId, courseId, certificateId, verificationCode]);
        
        certificate = certResult.rows[0];
      }
    }
    
    await client.query('COMMIT');
    
    res.json({
      message: 'Lesson completed successfully',
      quiz_score: quizScore,
      course_progress: overallProgress,
      certificate
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error completing lesson:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

// Get user's enrolled courses
router.get('/my/enrollments', auth, async (req, res) => {
  try {
    const userId = parseInt(req.telegramUser?.id);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const { status, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE ucp.user_id = $1 AND ucp.lesson_id IS NULL';
    let queryParams = [userId];
    let paramCount = 1;
    
    if (status) {
      paramCount++;
      whereClause += ` AND ucp.status = $${paramCount}`;
      queryParams.push(status);
    }
    
    const result = await pool.query(`
      SELECT 
        c.*,
        ucp.status as enrollment_status,
        ucp.progress_percentage,
        ucp.started_at,
        ucp.completed_at
      FROM user_course_progress ucp
      JOIN courses c ON ucp.course_id = c.id
      ${whereClause}
      ORDER BY ucp.started_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `, [...queryParams, limit, offset]);
    
    const countResult = await pool.query(`
      SELECT COUNT(*) FROM user_course_progress ucp ${whereClause}
    `, queryParams);
    
    const total = parseInt(countResult.rows[0].count);
    
    res.json({
      enrollments: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching enrollments:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's certificates
router.get('/my/certificates', auth, async (req, res) => {
  try {
    const userId = parseInt(req.telegramUser?.id);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const result = await pool.query(`
      SELECT 
        uc.*,
        c.title as course_title,
        c.category,
        c.difficulty_level
      FROM user_certificates uc
      JOIN courses c ON uc.course_id = c.id
      WHERE uc.user_id = $1 AND uc.is_valid = true
      ORDER BY uc.issued_at DESC
    `, [userId]);
    
    res.json({
      certificates: result.rows
    });
  } catch (error) {
    console.error('Error fetching certificates:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get course categories
router.get('/meta/categories', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        category,
        COUNT(*) as course_count,
        MIN(price) as min_price,
        MAX(price) as max_price
      FROM courses 
      WHERE is_active = true AND category IS NOT NULL AND category != ''
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

// Download certificate PDF
router.get('/certificates/:certificateId/download', auth, async (req, res) => {
  try {
    const { certificateId } = req.params;
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Get certificate details
    const certificateResult = await pool.query(`
      SELECT
        uc.*,
        c.title as course_title,
        c.category,
        c.difficulty_level,
        c.duration_hours,
        tu.first_name,
        tu.last_name,
        tu.username
      FROM user_certificates uc
      JOIN courses c ON uc.course_id = c.id
      JOIN telegram_users tu ON uc.user_id = tu.id
      WHERE uc.certificate_id = $1 AND uc.user_id = $2 AND uc.is_valid = true
    `, [certificateId, userId]);

    if (certificateResult.rows.length === 0) {
      return res.status(404).json({ message: 'Certificate not found' });
    }

    const certificate = certificateResult.rows[0];

    // Create PDF certificate
    const doc = new PDFDocument({
      layout: 'landscape',
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 }
    });

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="certificate-${certificateId}.pdf"`);

    // Pipe the PDF to response
    doc.pipe(res);

    // Certificate header
    doc.fontSize(28)
       .fillColor('#2563eb')
       .text('CERTIFICATE OF COMPLETION', { align: 'center' });

    doc.moveDown(1);

    // Decorative line
    doc.strokeColor('#e5e7eb')
       .lineWidth(2)
       .moveTo(100, doc.y)
       .lineTo(742, doc.y)
       .stroke();

    doc.moveDown(2);

    // Main content
    doc.fontSize(16)
       .fillColor('#374151')
       .text('This is to certify that', { align: 'center' });

    doc.moveDown(1);

    // Student name
    const studentName = `${certificate.first_name || ''} ${certificate.last_name || ''}`.trim() || certificate.username;
    doc.fontSize(24)
       .fillColor('#1f2937')
       .text(studentName, { align: 'center', underline: true });

    doc.moveDown(1);

    // Course completion text
    doc.fontSize(16)
       .fillColor('#374151')
       .text('has successfully completed the course', { align: 'center' });

    doc.moveDown(1);

    // Course title
    doc.fontSize(20)
       .fillColor('#2563eb')
       .text(certificate.course_title, { align: 'center' });

    doc.moveDown(1);

    // Course details
    doc.fontSize(14)
       .fillColor('#6b7280')
       .text(`Category: ${certificate.category}`, { align: 'center' });

    if (certificate.difficulty_level) {
      doc.text(`Difficulty: ${certificate.difficulty_level}`, { align: 'center' });
    }

    if (certificate.duration_hours) {
      doc.text(`Duration: ${certificate.duration_hours} hours`, { align: 'center' });
    }

    doc.moveDown(2);

    // Issue date
    const issueDate = new Date(certificate.issued_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    doc.fontSize(12)
       .fillColor('#374151')
       .text(`Issued on: ${issueDate}`, { align: 'center' });

    doc.moveDown(1);

    // Verification info
    doc.fontSize(10)
       .fillColor('#9ca3af')
       .text(`Certificate ID: ${certificate.certificate_id}`, { align: 'center' });

    doc.text(`Verification Code: ${certificate.verification_code}`, { align: 'center' });

    // Footer
    doc.moveDown(2);
    doc.fontSize(12)
       .fillColor('#6b7280')
       .text('Verified by GameMiniApp Platform', { align: 'center' });

    // Add a simple border
    doc.rect(20, 20, doc.page.width - 40, doc.page.height - 40)
       .strokeColor('#e5e7eb')
       .lineWidth(1)
       .stroke();

    // Finalize the PDF
    doc.end();

  } catch (error) {
    console.error('Error generating certificate:', error);
    res.status(500).json({ message: 'Error generating certificate' });
  }
});

// Submit quiz answers (separate from lesson completion)
router.post('/:courseId/lessons/:lessonId/quiz/submit', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { courseId, lessonId } = req.params;
    const { answers } = req.body; // Array of {question_id, selected_answer}
    const userId = req.telegramUser?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!answers || !Array.isArray(answers)) {
      return res.status(400).json({ message: 'Answers array is required' });
    }

    await client.query('BEGIN');

    // Check enrollment
    const enrollmentResult = await client.query(
      'SELECT * FROM user_course_progress WHERE course_id = $1 AND user_id = $2',
      [courseId, userId]
    );

    if (enrollmentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'Not enrolled in this course' });
    }

    // Get quiz questions with correct answers
    const quizResult = await client.query(`
      SELECT id, question, correct_answer, points
      FROM course_quizzes
      WHERE lesson_id = $1
      ORDER BY order_index ASC
    `, [lessonId]);

    if (quizResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'No quiz found for this lesson' });
    }

    // Grade the quiz
    let totalScore = 0;
    let maxScore = 0;
    const results = [];

    for (const question of quizResult.rows) {
      maxScore += question.points;
      const userAnswer = answers.find(a => a.question_id === question.id);
      const isCorrect = userAnswer && userAnswer.selected_answer === question.correct_answer;

      if (isCorrect) {
        totalScore += question.points;
      }

      results.push({
        question_id: question.id,
        question: question.question,
        user_answer: userAnswer?.selected_answer || null,
        correct_answer: question.correct_answer,
        is_correct: isCorrect,
        points_earned: isCorrect ? question.points : 0
      });
    }

    const percentageScore = Math.round((totalScore / maxScore) * 100);
    const passed = percentageScore >= 70; // 70% passing grade

    // Update lesson progress with quiz score
    await client.query(`
      INSERT INTO user_course_progress (user_id, course_id, lesson_id, status, progress_percentage, quiz_score)
      VALUES ($1, $2, $3, $4, 100, $5)
      ON CONFLICT (user_id, course_id, lesson_id)
      DO UPDATE SET
        status = CASE
          WHEN $4 = 'completed' THEN 'completed'
          WHEN EXCLUDED.quiz_score < $5 THEN 'in_progress'
          ELSE user_course_progress.status
        END,
        progress_percentage = CASE WHEN $4 = 'completed' THEN 100 ELSE 0 END,
        quiz_score = $5,
        completed_at = CASE WHEN $4 = 'completed' THEN NOW() ELSE user_course_progress.completed_at END
    `, [userId, courseId, lessonId, passed ? 'completed' : 'in_progress', percentageScore]);

    await client.query('COMMIT');

    res.json({
      message: passed ? 'Quiz passed successfully!' : 'Quiz completed, but score below passing grade',
      quiz_results: {
        score: totalScore,
        max_score: maxScore,
        percentage: percentageScore,
        passed: passed,
        passing_grade: 70,
        results: results
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error submitting quiz:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

// Verify certificate by verification code (public endpoint)
router.get('/certificates/verify/:verificationCode', async (req, res) => {
  try {
    const { verificationCode } = req.params;

    const result = await pool.query(`
      SELECT
        uc.certificate_id,
        uc.issued_at,
        uc.is_valid,
        c.title as course_title,
        c.category,
        c.difficulty_level,
        tu.first_name,
        tu.last_name,
        tu.username
      FROM user_certificates uc
      JOIN courses c ON uc.course_id = c.id
      JOIN telegram_users tu ON uc.user_id = tu.id
      WHERE uc.verification_code = $1
    `, [verificationCode]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        valid: false,
        message: 'Certificate not found or invalid verification code'
      });
    }

    const certificate = result.rows[0];

    if (!certificate.is_valid) {
      return res.status(400).json({
        valid: false,
        message: 'Certificate has been revoked'
      });
    }

    const studentName = `${certificate.first_name || ''} ${certificate.last_name || ''}`.trim() || certificate.username;

    res.json({
      valid: true,
      certificate: {
        id: certificate.certificate_id,
        student_name: studentName,
        course_title: certificate.course_title,
        category: certificate.category,
        difficulty_level: certificate.difficulty_level,
        issued_at: certificate.issued_at
      }
    });
  } catch (error) {
    console.error('Error verifying certificate:', error);
    res.status(500).json({ message: 'Error verifying certificate' });
  }
});

module.exports = router;