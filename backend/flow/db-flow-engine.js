/**
 * DB-backed flow engine.
 * Loads the published flow version from Postgres, then runs it like a decision tree.
 *
 * Supported node types:
 * - text
 * - single_choice
 * - multi_choice
 * - number
 * - date
 * - file (expects user to send photo/video/document)
 * - end
 */

class DbFlowEngine {
  constructor({ pool, bot, logger }) {
    this.pool = pool;
    this.bot = bot;
    this.logger = logger;
    this.flowCache = new Map(); // key: versionId
  }

  t(i18n, lang, fallback = '') {
    if (!i18n) return fallback;
    return i18n[lang] ?? i18n.en ?? fallback;
  }

  async getSession(chatId) {
    const res = await this.pool.query('SELECT * FROM flow_sessions WHERE telegram_chat_id=$1 LIMIT 1', [String(chatId)]);
    return res.rows[0] || null;
  }

  async stopFlow(chatId) {
    await this.pool.query('DELETE FROM flow_sessions WHERE telegram_chat_id=$1', [String(chatId)]);
  }

  async loadPublishedFlowBySlug(slug) {
    // cache by slug+published version id to reduce DB work
    const flowRes = await this.pool.query('SELECT * FROM flows WHERE slug=$1 AND is_active=TRUE LIMIT 1', [slug]);
    if (!flowRes.rows.length) return null;
    const flow = flowRes.rows[0];

    const verRes = await this.pool.query(
      `SELECT * FROM flow_versions WHERE flow_id=$1 AND status='published' LIMIT 1`,
      [flow.id]
    );
    if (!verRes.rows.length) return null;
    const version = verRes.rows[0];

    if (this.flowCache.has(version.id)) {
      return this.flowCache.get(version.id);
    }

    const nodesRes = await this.pool.query(
      `SELECT * FROM flow_nodes WHERE flow_version_id=$1 ORDER BY sort_order ASC, id ASC`,
      [version.id]
    );

    const nodeIds = nodesRes.rows.map(n => n.id);
    const optsRes = nodeIds.length
      ? await this.pool.query(
          `SELECT * FROM flow_options WHERE flow_node_id = ANY($1::int[]) ORDER BY sort_order ASC, id ASC`,
          [nodeIds]
        )
      : { rows: [] };

    const nodesByKey = new Map();
    for (const n of nodesRes.rows) nodesByKey.set(n.node_key, n);

    const optionsByNodeKey = new Map();
    for (const o of optsRes.rows) {
      const node = nodesRes.rows.find(n => n.id === o.flow_node_id);
      if (!node) continue;
      const list = optionsByNodeKey.get(node.node_key) || [];
      list.push(o);
      optionsByNodeKey.set(node.node_key, list);
    }

    // sort options
    for (const [k, list] of optionsByNodeKey.entries()) {
      list.sort((a,b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      optionsByNodeKey.set(k, list);
    }

    const compiled = {
      flow,
      version,
      nodesByKey,
      optionsByNodeKey,
      start: version.start_node_key
    };

    this.flowCache.set(version.id, compiled);
    return compiled;
  }

  async getChoiceLabel({ slug, nodeKey, optionKey, lang = 'en' }) {
    const compiled = await this.loadPublishedFlowBySlug(slug);
    if (!compiled) return optionKey;
    const opts = compiled.optionsByNodeKey.get(nodeKey) || [];
    const o = opts.find((x) => String(x.option_key) === String(optionKey));
    if (!o) return optionKey;
    return this.t(o.label_i18n, lang, optionKey);
  }

  async startFlow({ chatId, userId, slug, lang = 'en' }) {
    const compiled = await this.loadPublishedFlowBySlug(slug);
    if (!compiled) {
      await this.bot.sendMessage(chatId, '⚠️ No published flow is configured.');
      return;
    }
    if (!compiled.start) {
      await this.bot.sendMessage(chatId, '⚠️ Flow has no start node. Ask admin to set start_node_key.');
      return;
    }

    await this.pool.query(
      `INSERT INTO flow_sessions (telegram_chat_id, user_id, flow_id, flow_version_id, current_node_id, answers, history, updated_at)
       VALUES ($1,$2,$3,$4,$5,'{}'::jsonb,'[]'::jsonb,NOW())
       ON CONFLICT (telegram_chat_id)
       DO UPDATE SET user_id=EXCLUDED.user_id, flow_id=EXCLUDED.flow_id, flow_version_id=EXCLUDED.flow_version_id,
                     current_node_id=EXCLUDED.current_node_id, answers='{}'::jsonb, history='[]'::jsonb, updated_at=NOW()`,
      [String(chatId), userId ? String(userId) : null, compiled.flow.slug, compiled.version.id, String(compiled.start)]
    );

    await this.renderCurrent({ chatId, lang });
  }

  async back({ chatId, lang = 'en' }) {
    const session = await this.getSession(chatId);
    if (!session) return false;
    const history = Array.isArray(session.history) ? session.history : [];
    if (!history.length) return false;

    const prev = history[history.length - 1];
    const newHistory = history.slice(0, -1);

    await this.pool.query(
      `UPDATE flow_sessions SET current_node_id=$1, history=$2::jsonb, updated_at=NOW() WHERE telegram_chat_id=$3`,
      [String(prev), JSON.stringify(newHistory), String(chatId)]
    );
    await this.renderCurrent({ chatId, lang });
    return true;
  }

  validateNodeInput(node, input) {
    const validation = node.validation || {};
    if (node.required && (input === null || input === undefined || String(input).trim() === '')) {
      return 'This answer is required.';
    }

    if (node.type === 'number') {
      const num = Number(input);
      if (Number.isNaN(num)) return 'Please enter a valid number.';
      if (validation.min !== undefined && num < validation.min) return `Minimum is ${validation.min}.`;
      if (validation.max !== undefined && num > validation.max) return `Maximum is ${validation.max}.`;
    }

    if (node.type === 'date') {
      // Expect YYYY-MM-DD
      const s = String(input).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return 'Please enter a date in YYYY-MM-DD format.';
    }

    return null;
  }

  async renderCurrent({ chatId, lang = 'en' }) {
    const session = await this.getSession(chatId);
    if (!session) return;

    const compiled = await this.loadPublishedFlowBySlug(session.flow_id);
    if (!compiled) {
      await this.bot.sendMessage(chatId, '⚠️ Flow not available.');
      await this.stopFlow(chatId);
      return;
    }

    const nodeKey = session.current_node_id;
    const node = compiled.nodesByKey.get(nodeKey);

    if (!node) {
      await this.bot.sendMessage(chatId, '⚠️ Flow error: missing node.');
      await this.stopFlow(chatId);
      return;
    }

    const text = this.t(node.prompt_i18n, lang, '');

    // Back button always available
    const backBtn = { text: '⬅️ Back', callback_data: `flowback:${session.flow_id}` };

    if (node.type === 'single_choice') {
      const opts = compiled.optionsByNodeKey.get(node.node_key) || [];
      // Put all options in ONE ROW
      const inline_keyboard = [
        opts.map((o) => ({
          text: this.t(o.label_i18n, lang, o.option_key),
          callback_data: `flow:${session.flow_id}:${node.node_key}:${o.option_key}`
        }))
      ];
      inline_keyboard.push([backBtn]);

      await this.bot.sendMessage(chatId, text || 'Please choose:', { reply_markup: { inline_keyboard } });
      return;
    }

    if (node.type === 'multi_choice') {
      // Multi-choice is done via toggle buttons: store in session.answers[node.save_as] array.
      const opts = compiled.optionsByNodeKey.get(node.node_key) || [];
      const answers = session.answers || {};
      const key = node.save_as || node.node_key;
      const selected = Array.isArray(answers[key]) ? answers[key] : [];

      // Put all toggles in ONE ROW
      const inline_keyboard = [
        opts.map((o) => {
          const isSel = selected.includes(o.option_key);
          const label = `${isSel ? '✅ ' : ''}${this.t(o.label_i18n, lang, o.option_key)}`;
          return { text: label, callback_data: `flowmulti:${session.flow_id}:${node.node_key}:${o.option_key}` };
        })
      ];

      // Keep actions on their own row
      inline_keyboard.push([
        { text: 'Continue ➡️', callback_data: `flowmultidone:${session.flow_id}:${node.node_key}` },
        backBtn
      ]);

      await this.bot.sendMessage(chatId, text || 'Select one or more:', { reply_markup: { inline_keyboard } });
      return;
    }

    if (node.type === 'file') {
      await this.bot.sendMessage(chatId, (text || 'Please send a file (photo/video/document).') + '\n\nYou can send: photo, video, or document.');
      return;
    }

    if (node.type === 'end') {
      if (text) await this.bot.sendMessage(chatId, text);
      await this.stopFlow(chatId);
      return;
    }

    // text/number/date
    await this.bot.sendMessage(chatId, text || 'Please type your answer:');
  }

  async transition({ chatId, lang = 'en', answer, media }) {
    const session = await this.getSession(chatId);
    if (!session) return false;

    const compiled = await this.loadPublishedFlowBySlug(session.flow_id);
    if (!compiled) return false;

    const nodeKey = session.current_node_id;
    const node = compiled.nodesByKey.get(nodeKey);
    if (!node) return false;

    const answers = session.answers || {};
    const history = Array.isArray(session.history) ? session.history : [];

    const saveKey = node.save_as || node.node_key;
    let nextKey = null;

    if (node.type === 'single_choice') {
      const opts = compiled.optionsByNodeKey.get(node.node_key) || [];
      const opt = opts.find(o => String(o.option_key) === String(answer));
      if (!opt) {
        await this.bot.sendMessage(chatId, 'Please choose one of the options.');
        return true;
      }
      answers[saveKey] = opt.value ?? opt.option_key;
      nextKey = opt.next_node_key;
    } else if (node.type === 'text' || node.type === 'number' || node.type === 'date') {
      const err = this.validateNodeInput(node, answer);
      if (err) {
        await this.bot.sendMessage(chatId, err);
        return true;
      }
      answers[saveKey] = String(answer).trim();
      nextKey = node.next_node_key;
    } else if (node.type === 'file') {
      if (!media || !media.type || !media.file_id) {
        await this.bot.sendMessage(chatId, 'Please send a photo/video/document for this step.');
        return true;
      }
      answers[saveKey] = { type: media.type, file_id: media.file_id, file_unique_id: media.file_unique_id };
      nextKey = node.next_node_key;
    } else if (node.type === 'end') {
      await this.stopFlow(chatId);
      return true;
    } else if (node.type === 'multi_choice') {
      // handled via flowmulti callbacks
      return true;
    }

    if (!nextKey) {
      // No next step configured: silently stop the flow (no user-facing error)
      await this.stopFlow(chatId);
      return true;
    }

    history.push(nodeKey);

    await this.pool.query(
      `UPDATE flow_sessions SET current_node_id=$1, answers=$2::jsonb, history=$3::jsonb, updated_at=NOW() WHERE telegram_chat_id=$4`,
      [String(nextKey), JSON.stringify(answers), JSON.stringify(history), String(chatId)]
    );

    await this.renderCurrent({ chatId, lang });
    return true;
  }

  async toggleMulti({ chatId, lang = 'en', nodeKey, optionKey }) {
    const session = await this.getSession(chatId);
    if (!session) return false;

    const compiled = await this.loadPublishedFlowBySlug(session.flow_id);
    if (!compiled) return false;

    const node = compiled.nodesByKey.get(nodeKey);
    if (!node || node.type !== 'multi_choice') return false;

    const answers = session.answers || {};
    const saveKey = node.save_as || node.node_key;
    const selected = Array.isArray(answers[saveKey]) ? answers[saveKey] : [];
    const idx = selected.indexOf(optionKey);
    if (idx >= 0) selected.splice(idx, 1);
    else selected.push(optionKey);

    answers[saveKey] = selected;

    await this.pool.query(
      `UPDATE flow_sessions SET answers=$1::jsonb, updated_at=NOW() WHERE telegram_chat_id=$2`,
      [JSON.stringify(answers), String(chatId)]
    );

    await this.renderCurrent({ chatId, lang });
    return true;
  }

  async completeMulti({ chatId, lang = 'en', nodeKey }) {
    const session = await this.getSession(chatId);
    if (!session) return false;

    const compiled = await this.loadPublishedFlowBySlug(session.flow_id);
    if (!compiled) return false;

    const node = compiled.nodesByKey.get(nodeKey);
    if (!node || node.type !== 'multi_choice') return false;

    const answers = session.answers || {};
    const saveKey = node.save_as || node.node_key;
    const selected = Array.isArray(answers[saveKey]) ? answers[saveKey] : [];
    if (node.required && selected.length === 0) {
      await this.bot.sendMessage(chatId, 'Please select at least one option.');
      return true;
    }

    const nextKey = node.next_node_key;
    if (!nextKey) {
      // No next step configured: silently stop the flow (no user-facing error)
      await this.stopFlow(chatId);
      return true;
    }

    const history = Array.isArray(session.history) ? session.history : [];
    history.push(session.current_node_id);

    await this.pool.query(
      `UPDATE flow_sessions SET current_node_id=$1, history=$2::jsonb, updated_at=NOW() WHERE telegram_chat_id=$3`,
      [String(nextKey), JSON.stringify(history), String(chatId)]
    );

    await this.renderCurrent({ chatId, lang });
    return true;
  }
}

module.exports = { DbFlowEngine };
