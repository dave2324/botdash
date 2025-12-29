// backend/api/task-utils.js
// Utility to fetch task details for dependencies by type/id
const pool = require('../config/database');

/**
 * Get task details for a dependency (for lock notices, etc)
 * @param {string} type - One of 'channel_join', 'youtube_video', 'quiz'
 * @param {number} id - Task ID
 * @returns {Promise<{id:number, type:string, label:string, extra?:object}|null>}
 */
async function getTaskDependencyDetail(type, id) {
  if (!type || !id) return null;
  switch (type) {
    case 'channel_join': {
      const res = await pool.query('SELECT id, name FROM telegram_channels WHERE id = $1', [id]);
      if (res.rows.length) return { id, type, label: res.rows[0].name };
      break;
    }
    case 'youtube_video': {
      const res = await pool.query('SELECT id, title FROM youtube_tasks WHERE id = $1', [id]);
      if (res.rows.length) return { id, type, label: res.rows[0].title };
      break;
    }
    case 'quiz': {
      const res = await pool.query('SELECT id, title FROM quizzes WHERE id = $1', [id]);
      if (res.rows.length) return { id, type, label: res.rows[0].title };
      break;
    }
    default:
      return null;
  }
  return null;
}

module.exports = { getTaskDependencyDetail };
