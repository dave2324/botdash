const fs = require('fs');
const path = require('path');

/**
 * Simple decision-tree flow engine.
 *
 * - Flow definition is JSON: { id, start, nodes: { [nodeId]: node } }
 * - Node types: text | single_choice | end
 * - State is persisted in Postgres (flow_sessions)
 */
class FlowEngine {
  constructor({ pool, bot, logger, flowsDir = path.join(__dirname, '..', 'flows') }) {
    this.pool = pool;
    this.bot = bot;
    this.logger = logger;
    this.flowsDir = flowsDir;
    this.flowCache = new Map();
  }

  loadFlow(flowId) {
    if (this.flowCache.has(flowId)) return this.flowCache.get(flowId);

    // Load flow from backend/flows/<flowId>.json
    const fileName = flowId.endsWith('.json') ? flowId.replace(/\.json$/, '') : flowId;
    const filePath = path.join(this.flowsDir, `${fileName}.json`);
    const raw = fs.readFileSync(filePath, 'utf8');
    const flow = JSON.parse(raw);
    this.flowCache.set(flowId, flow);
    return flow;
  }

  t(translations, lang, fallback = '') {
    if (!translations) return fallback;
    return translations[lang] ?? translations.en ?? fallback;
  }

  async ensureTables() {
    // No-op. Tables are created via migration.
  }

  async getSession(chatId) {
    const res = await this.pool.query(
      `SELECT * FROM flow_sessions WHERE telegram_chat_id = $1 LIMIT 1`,
      [String(chatId)]
    );
    return res.rows[0] || null;
  }

  async startFlow({ chatId, userId, flowId, lang = 'en' }) {
    const flow = this.loadFlow(flowId);

    await this.pool.query(
      `INSERT INTO flow_sessions (telegram_chat_id, user_id, flow_id, current_node_id, answers, history, updated_at)
       VALUES ($1, $2, $3, $4, '{}'::jsonb, '[]'::jsonb, NOW())
       ON CONFLICT (telegram_chat_id)
       DO UPDATE SET user_id = EXCLUDED.user_id, flow_id = EXCLUDED.flow_id, current_node_id = EXCLUDED.current_node_id,
                    answers = '{}'::jsonb, history = '[]'::jsonb, updated_at = NOW()`,
      [String(chatId), userId ? String(userId) : null, flow.id, flow.start]
    );

    await this.renderCurrent({ chatId, lang });
  }

  async stopFlow(chatId) {
    await this.pool.query('DELETE FROM flow_sessions WHERE telegram_chat_id = $1', [String(chatId)]);
  }

  async back({ chatId, lang = 'en' }) {
    const session = await this.getSession(chatId);
    if (!session) return false;

    const history = Array.isArray(session.history) ? session.history : [];
    if (history.length === 0) return false;

    const prev = history[history.length - 1];
    const newHistory = history.slice(0, -1);

    await this.pool.query(
      `UPDATE flow_sessions SET current_node_id = $1, history = $2::jsonb, updated_at = NOW() WHERE telegram_chat_id = $3`,
      [String(prev), JSON.stringify(newHistory), String(chatId)]
    );

    await this.renderCurrent({ chatId, lang });
    return true;
  }

  async renderCurrent({ chatId, lang = 'en' }) {
    const session = await this.getSession(chatId);
    if (!session) return;

    const flow = this.loadFlow(session.flow_id);
    const nodeId = session.current_node_id;
    const node = flow.nodes[nodeId];

    if (!node) {
      await this.bot.sendMessage(chatId, '⚠️ Flow configuration error: missing node.');
      return;
    }

    const text = this.t(node.text, lang, '');

    if (node.type === 'single_choice') {
      const inline_keyboard = (node.options || []).map((opt) => [
        {
          text: this.t(opt.label, lang, String(opt.key)),
          callback_data: `flow:${flow.id}:${nodeId}:${opt.key}`
        }
      ]);

      // Add back button
      inline_keyboard.push([{ text: '⬅️ Back', callback_data: `flowback:${flow.id}` }]);

      await this.bot.sendMessage(chatId, text || 'Please choose:', {
        reply_markup: { inline_keyboard }
      });
      return;
    }

    if (node.type === 'end') {
      // End flow
      if (text) await this.bot.sendMessage(chatId, text);
      await this.stopFlow(chatId);
      return;
    }

    // text
    await this.bot.sendMessage(chatId, text || 'Please type your answer:');
  }

  async transition({ chatId, lang = 'en', answer }) {
    const session = await this.getSession(chatId);
    if (!session) return false;

    const flow = this.loadFlow(session.flow_id);
    const nodeId = session.current_node_id;
    const node = flow.nodes[nodeId];
    if (!node) return false;

    const answers = session.answers || {};
    const history = Array.isArray(session.history) ? session.history : [];

    let nextNodeId = null;

    if (node.type === 'single_choice') {
      const opt = (node.options || []).find((o) => String(o.key) === String(answer));
      if (!opt) {
        await this.bot.sendMessage(chatId, 'Please choose one of the provided options.');
        return true;
      }

      if (node.saveAs) answers[node.saveAs] = String(answer);
      nextNodeId = opt.next;
    } else if (node.type === 'text') {
      if (node.saveAs) answers[node.saveAs] = String(answer ?? '').trim();
      nextNodeId = node.next;
    } else if (node.type === 'end') {
      await this.stopFlow(chatId);
      return true;
    }

    if (!nextNodeId) {
      await this.bot.sendMessage(chatId, '⚠️ Flow configuration error: missing next node.');
      await this.stopFlow(chatId);
      return true;
    }

    history.push(nodeId);

    await this.pool.query(
      `UPDATE flow_sessions SET current_node_id = $1, answers = $2::jsonb, history = $3::jsonb, updated_at = NOW() WHERE telegram_chat_id = $4`,
      [String(nextNodeId), JSON.stringify(answers), JSON.stringify(history), String(chatId)]
    );

    await this.renderCurrent({ chatId, lang });
    return true;
  }
}

module.exports = { FlowEngine };
