const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { adminAuth } = require('./auth');

function requireIntParam(value, name, res) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) {
    res.status(400).json({ message: `Invalid ${name}` });
    return null;
  }
  return n;
}

// Helpers
const now = () => new Date().toISOString();

async function getPublishedVersion(flowId) {
  const res = await pool.query(
    `SELECT * FROM flow_versions WHERE flow_id = $1 AND status = 'published' LIMIT 1`,
    [flowId]
  );
  return res.rows[0] || null;
}

// Fetch published flow by slug (used by bot)
router.get('/by-slug/:slug/published', adminAuth, async (req, res) => {
  const slug = String(req.params.slug);
  try {
    const flowRes = await pool.query('SELECT * FROM flows WHERE slug=$1 AND is_active=TRUE', [slug]);
    if (flowRes.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    const flow = flowRes.rows[0];

    const verRes = await pool.query(
      `SELECT * FROM flow_versions WHERE flow_id=$1 AND status='published' LIMIT 1`,
      [flow.id]
    );
    if (verRes.rows.length === 0) return res.status(404).json({ message: 'No published version' });
    const version = verRes.rows[0];

    const nodesRes = await pool.query(
      `SELECT * FROM flow_nodes WHERE flow_version_id=$1 ORDER BY sort_order ASC, id ASC`,
      [version.id]
    );
    const nodeIds = nodesRes.rows.map(n => n.id);
    const optsRes = nodeIds.length
      ? await pool.query(
          `SELECT * FROM flow_options WHERE flow_node_id = ANY($1::int[]) ORDER BY sort_order ASC, id ASC`,
          [nodeIds]
        )
      : { rows: [] };

    res.json({ flow, version, nodes: nodesRes.rows, options: optsRes.rows });
  } catch (e) {
    console.error('Error fetching published flow by slug', e);
    res.status(500).json({ message: 'Failed to fetch published flow' });
  }
});

// List flows
router.get('/', adminAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.*, 
              (SELECT json_build_object('id', fv.id, 'version', fv.version, 'start_node_key', fv.start_node_key, 'status', fv.status)
               FROM flow_versions fv WHERE fv.flow_id = f.id AND fv.status='published' LIMIT 1) AS published
       FROM flows f
       ORDER BY f.id DESC`
    );
    res.json({ flows: result.rows });
  } catch (e) {
    console.error('Error listing flows', e);
    res.status(500).json({ message: 'Failed to list flows' });
  }
});

// Create flow (creates v1 draft)
router.post('/', adminAuth, async (req, res) => {
  const { slug, title, description } = req.body || {};
  if (!slug || !title) return res.status(400).json({ message: 'slug and title are required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const flowRes = await client.query(
      `INSERT INTO flows (slug, title, description, updated_at) VALUES ($1,$2,$3,NOW()) RETURNING *`,
      [slug, title, description || null]
    );
    const flow = flowRes.rows[0];

    const verRes = await client.query(
      `INSERT INTO flow_versions (flow_id, version, status, start_node_key, updated_at)
       VALUES ($1, 1, 'draft', NULL, NOW()) RETURNING *`,
      [flow.id]
    );
    await client.query('COMMIT');
    res.json({ flow, version: verRes.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error creating flow', e);
    res.status(500).json({ message: 'Failed to create flow' });
  } finally {
    client.release();
  }
});

// Get flow with versions
router.get('/:id', adminAuth, async (req, res) => {
  const id = requireIntParam(req.params.id, 'id', res);
  if (id === null) return;
  try {
    const flowRes = await pool.query('SELECT * FROM flows WHERE id=$1', [id]);
    if (flowRes.rows.length === 0) return res.status(404).json({ message: 'Not found' });

    const versionsRes = await pool.query(
      `SELECT * FROM flow_versions WHERE flow_id=$1 ORDER BY version DESC`,
      [id]
    );
    res.json({ flow: flowRes.rows[0], versions: versionsRes.rows });
  } catch (e) {
    console.error('Error fetching flow', e);
    res.status(500).json({ message: 'Failed to fetch flow' });
  }
});

// Create a new draft version (clone from latest)
router.post('/:id/versions', adminAuth, async (req, res) => {
  const flowId = requireIntParam(req.params.id, 'id', res);
  if (flowId === null) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const latestRes = await client.query(
      `SELECT * FROM flow_versions WHERE flow_id=$1 ORDER BY version DESC LIMIT 1`,
      [flowId]
    );
    if (latestRes.rows.length === 0) return res.status(404).json({ message: 'Flow has no versions' });
    const latest = latestRes.rows[0];

    const newVersionNumber = latest.version + 1;
    const newVerRes = await client.query(
      `INSERT INTO flow_versions (flow_id, version, status, start_node_key, updated_at)
       VALUES ($1,$2,'draft',$3,NOW()) RETURNING *`,
      [flowId, newVersionNumber, latest.start_node_key]
    );
    const newVer = newVerRes.rows[0];

    // Clone nodes
    const nodesRes = await client.query(
      `SELECT * FROM flow_nodes WHERE flow_version_id=$1 ORDER BY id ASC`,
      [latest.id]
    );
    const nodeIdMap = new Map();
    for (const n of nodesRes.rows) {
      const ins = await client.query(
        `INSERT INTO flow_nodes (flow_version_id, node_key, type, prompt_i18n, help_i18n, save_as, required, validation, next_node_key, sort_order, updated_at)
         VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8::jsonb,$9,$10,NOW()) RETURNING id`,
        [newVer.id, n.node_key, n.type, JSON.stringify(n.prompt_i18n || { en: '' }), JSON.stringify(n.help_i18n || {}), n.save_as, n.required, JSON.stringify(n.validation || {}), n.next_node_key, n.sort_order]
      );
      nodeIdMap.set(n.id, ins.rows[0].id);
    }

    // Clone options
    const optsRes = await client.query(
      `SELECT o.* FROM flow_options o JOIN flow_nodes n ON n.id=o.flow_node_id WHERE n.flow_version_id=$1 ORDER BY o.id ASC`,
      [latest.id]
    );
    for (const o of optsRes.rows) {
      const newNodeId = nodeIdMap.get(o.flow_node_id);
      if (!newNodeId) continue;
      await client.query(
        `INSERT INTO flow_options (flow_node_id, option_key, label_i18n, value, next_node_key, sort_order, updated_at)
         VALUES ($1,$2,$3::jsonb,$4,$5,$6,NOW())`,
        [newNodeId, o.option_key, JSON.stringify(o.label_i18n || { en: '' }), o.value, o.next_node_key, o.sort_order]
      );
    }

    await client.query('COMMIT');
    res.json({ version: newVer });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error creating new version', e);
    res.status(500).json({ message: 'Failed to create new version' });
  } finally {
    client.release();
  }
});

// Get version content
router.get('/:id/versions/:versionId', adminAuth, async (req, res) => {
  const versionId = parseInt(req.params.versionId, 10);
  try {
    const verRes = await pool.query('SELECT * FROM flow_versions WHERE id=$1', [versionId]);
    if (verRes.rows.length === 0) return res.status(404).json({ message: 'Not found' });

    const nodesRes = await pool.query(
      `SELECT * FROM flow_nodes WHERE flow_version_id=$1 ORDER BY sort_order ASC, id ASC`,
      [versionId]
    );

    const nodeIds = nodesRes.rows.map(n => n.id);
    const optsRes = nodeIds.length
      ? await pool.query(
          `SELECT * FROM flow_options WHERE flow_node_id = ANY($1::int[]) ORDER BY sort_order ASC, id ASC`,
          [nodeIds]
        )
      : { rows: [] };

    res.json({ version: verRes.rows[0], nodes: nodesRes.rows, options: optsRes.rows });
  } catch (e) {
    console.error('Error fetching flow version', e);
    res.status(500).json({ message: 'Failed to fetch flow version' });
  }
});

// Upsert node
router.put('/versions/:versionId/nodes/:nodeKey', adminAuth, async (req, res) => {
  const versionId = requireIntParam(req.params.versionId, 'versionId', res);
  if (versionId === null) return;
  const nodeKey = String(req.params.nodeKey);
  const {
    type,
    prompt_i18n,
    help_i18n,
    save_as,
    required,
    validation,
    next_node_key,
    sort_order
  } = req.body || {};

  if (!type) return res.status(400).json({ message: 'type is required' });

  try {
    const result = await pool.query(
      `INSERT INTO flow_nodes (flow_version_id, node_key, type, prompt_i18n, help_i18n, save_as, required, validation, next_node_key, sort_order, updated_at)
       VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8::jsonb,$9,$10,NOW())
       ON CONFLICT (flow_version_id, node_key)
       DO UPDATE SET type=EXCLUDED.type, prompt_i18n=EXCLUDED.prompt_i18n, help_i18n=EXCLUDED.help_i18n,
                    save_as=EXCLUDED.save_as, required=EXCLUDED.required, validation=EXCLUDED.validation,
                    next_node_key=EXCLUDED.next_node_key, sort_order=EXCLUDED.sort_order, updated_at=NOW()
       RETURNING *`,
      [
        versionId,
        nodeKey,
        type,
        JSON.stringify(prompt_i18n || { en: '' }),
        JSON.stringify(help_i18n || {}),
        save_as || null,
        required !== undefined ? !!required : true,
        JSON.stringify(validation || {}),
        next_node_key || null,
        sort_order || 0
      ]
    );
    res.json({ node: result.rows[0] });
  } catch (e) {
    console.error('Error upserting node', e);
    res.status(500).json({ message: 'Failed to upsert node' });
  }
});

// Delete node
router.delete('/versions/:versionId/nodes/:nodeKey', adminAuth, async (req, res) => {
  const versionId = requireIntParam(req.params.versionId, 'versionId', res);
  if (versionId === null) return;
  const nodeKey = String(req.params.nodeKey);
  try {
    const result = await pool.query(
      `DELETE FROM flow_nodes WHERE flow_version_id=$1 AND node_key=$2 RETURNING id`,
      [versionId, nodeKey]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (e) {
    console.error('Error deleting node', e);
    res.status(500).json({ message: 'Failed to delete node' });
  }
});

// Upsert option
router.put('/nodes/:nodeId/options/:optionKey', adminAuth, async (req, res) => {
  const nodeId = requireIntParam(req.params.nodeId, 'nodeId', res);
  if (nodeId === null) return;
  const optionKey = String(req.params.optionKey);
  const { label_i18n, value, next_node_key, sort_order } = req.body || {};

  try {
    const result = await pool.query(
      `INSERT INTO flow_options (flow_node_id, option_key, label_i18n, value, next_node_key, sort_order, updated_at)
       VALUES ($1,$2,$3::jsonb,$4,$5,$6,NOW())
       ON CONFLICT (flow_node_id, option_key)
       DO UPDATE SET label_i18n=EXCLUDED.label_i18n, value=EXCLUDED.value, next_node_key=EXCLUDED.next_node_key,
                    sort_order=EXCLUDED.sort_order, updated_at=NOW()
       RETURNING *`,
      [nodeId, optionKey, JSON.stringify(label_i18n || { en: '' }), value || null, next_node_key || null, sort_order || 0]
    );
    res.json({ option: result.rows[0] });
  } catch (e) {
    console.error('Error upserting option', e);
    res.status(500).json({ message: 'Failed to upsert option' });
  }
});

router.delete('/nodes/:nodeId/options/:optionKey', adminAuth, async (req, res) => {
  const nodeId = requireIntParam(req.params.nodeId, 'nodeId', res);
  if (nodeId === null) return;
  const optionKey = String(req.params.optionKey);
  try {
    const result = await pool.query(
      `DELETE FROM flow_options WHERE flow_node_id=$1 AND option_key=$2 RETURNING id`,
      [nodeId, optionKey]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (e) {
    console.error('Error deleting option', e);
    res.status(500).json({ message: 'Failed to delete option' });
  }
});

// Set start node for a version
router.post('/versions/:versionId/start', adminAuth, async (req, res) => {
  const versionId = requireIntParam(req.params.versionId, 'versionId', res);
  if (versionId === null) return;
  const { start_node_key } = req.body || {};
  if (!start_node_key) return res.status(400).json({ message: 'start_node_key is required' });
  try {
    const result = await pool.query(
      `UPDATE flow_versions SET start_node_key=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [String(start_node_key), versionId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json({ version: result.rows[0] });
  } catch (e) {
    console.error('Error setting start node', e);
    res.status(500).json({ message: 'Failed to set start node' });
  }
});

// Reorder nodes (expects [{node_key, sort_order}])
router.post('/versions/:versionId/nodes/reorder', adminAuth, async (req, res) => {
  const versionId = requireIntParam(req.params.versionId, 'versionId', res);
  if (versionId === null) return;
  const { items } = req.body || {};
  if (!Array.isArray(items)) return res.status(400).json({ message: 'items[] required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const it of items) {
      await client.query(
        `UPDATE flow_nodes SET sort_order=$1, updated_at=NOW() WHERE flow_version_id=$2 AND node_key=$3`,
        [parseInt(it.sort_order ?? 0, 10), versionId, String(it.node_key)]
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'Reordered' });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error reordering nodes', e);
    res.status(500).json({ message: 'Failed to reorder' });
  } finally {
    client.release();
  }
});

// Reorder options for a node (expects [{option_key, sort_order}])
router.post('/nodes/:nodeId/options/reorder', adminAuth, async (req, res) => {
  const nodeId = requireIntParam(req.params.nodeId, 'nodeId', res);
  if (nodeId === null) return;
  const { items } = req.body || {};
  if (!Array.isArray(items)) return res.status(400).json({ message: 'items[] required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const it of items) {
      await client.query(
        `UPDATE flow_options SET sort_order=$1, updated_at=NOW() WHERE flow_node_id=$2 AND option_key=$3`,
        [parseInt(it.sort_order ?? 0, 10), nodeId, String(it.option_key)]
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'Reordered' });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error reordering options', e);
    res.status(500).json({ message: 'Failed to reorder' });
  } finally {
    client.release();
  }
});

// Validate a version (basic: start node exists, all next keys exist)
router.get('/versions/:versionId/validate', adminAuth, async (req, res) => {
  const versionId = requireIntParam(req.params.versionId, 'versionId', res);
  if (versionId === null) return;
  try {
    const verRes = await pool.query('SELECT * FROM flow_versions WHERE id=$1', [versionId]);
    if (verRes.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    const version = verRes.rows[0];

    const nodesRes = await pool.query('SELECT * FROM flow_nodes WHERE flow_version_id=$1', [versionId]);
    const nodes = nodesRes.rows;
    const keys = new Set(nodes.map(n => n.node_key));

    const errors = [];
    if (!version.start_node_key) errors.push('start_node_key is not set');
    else if (!keys.has(version.start_node_key)) errors.push(`start_node_key '${version.start_node_key}' does not exist`);

    for (const n of nodes) {
      if (n.next_node_key && !keys.has(n.next_node_key)) errors.push(`node '${n.node_key}' points to missing next_node_key '${n.next_node_key}'`);
    }

    const nodeIds = nodes.map(n => n.id);
    if (nodeIds.length) {
      const optsRes = await pool.query('SELECT * FROM flow_options WHERE flow_node_id = ANY($1::int[])', [nodeIds]);
      for (const o of optsRes.rows) {
        if (o.next_node_key && !keys.has(o.next_node_key)) {
          errors.push(`option '${o.option_key}' points to missing next_node_key '${o.next_node_key}'`);
        }
      }
    }

    res.json({ ok: errors.length === 0, errors });
  } catch (e) {
    console.error('Error validating flow version', e);
    res.status(500).json({ message: 'Failed to validate' });
  }
});

// Publish a version
router.post('/versions/:versionId/publish', adminAuth, async (req, res) => {
  const versionId = requireIntParam(req.params.versionId, 'versionId', res);
  if (versionId === null) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const verRes = await client.query('SELECT * FROM flow_versions WHERE id=$1', [versionId]);
    if (verRes.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    const ver = verRes.rows[0];

    // Unpublish existing
    await client.query(
      `UPDATE flow_versions SET status='archived', updated_at=NOW() WHERE flow_id=$1 AND status='published'`,
      [ver.flow_id]
    );

    // Publish target
    await client.query(
      `UPDATE flow_versions SET status='published', updated_at=NOW() WHERE id=$1`,
      [versionId]
    );

    await client.query('COMMIT');
    res.json({ message: 'Published' });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error publishing flow version', e);
    res.status(500).json({ message: 'Failed to publish' });
  } finally {
    client.release();
  }
});

module.exports = router;
