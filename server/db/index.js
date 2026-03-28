import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync } from 'fs'
import DATASET from './seed.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dirname, 'eco.db')

let db = null

function safeParseJson(text, fallback = null) {
  if (text == null || text === '') return fallback
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

function ensureColumn(database, tableName, columnName, definition) {
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all()
  if (columns.some((column) => column.name === columnName)) return
  database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`)
}

function parseDatasetRow(row) {
  if (!row) return null
  return { ...row, data: safeParseJson(row.data, {}) }
}

function parseEmergencyRunRow(row) {
  if (!row) return null
  return {
    ...row,
    degraded: Boolean(row.degraded),
    baseline_payload: safeParseJson(row.baseline_payload, null),
    event_spec: safeParseJson(row.event_spec, {}),
    detail_payload: safeParseJson(row.detail_payload, {}),
  }
}

function parseInvestmentRunRow(row) {
  if (!row) return null
  return {
    ...row,
    plan_payload: safeParseJson(row.plan_payload, {}),
  }
}

function parseAnomalyRunRow(row) {
  if (!row) return null
  return {
    ...row,
    baseline_payload: safeParseJson(row.baseline_payload, null),
    event_spec: safeParseJson(row.event_spec, {}),
    detail_payload: safeParseJson(row.detail_payload, {}),
  }
}

function isRuntimeDataset(row, datasetType = '') {
  const metaType = row.data?._meta?.datasetType
  const inferredType = metaType
    || (row.name.startsWith('时光回函 ') ? 'history' : row.name.startsWith('实时优化 ') ? 'realtime' : '')
  if (datasetType) return inferredType === datasetType
  return inferredType === 'realtime' || inferredType === 'history'
}

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
  }
  return db
}

export function initDb() {
  const database = getDb()
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8')
  database.exec(schema)
  ensureColumn(database, 'realtime_data', 'is_forecast', 'is_forecast INTEGER NOT NULL DEFAULT 0')
  ensureColumn(database, 'conversations', 'workspace_state', 'workspace_state TEXT')

  const count = database.prepare('SELECT COUNT(*) as c FROM datasets').get()
  if (count.c === 0) {
    database.prepare('INSERT INTO datasets (name, data) VALUES (?, ?)').run('默认优化数据集', JSON.stringify(DATASET))
    console.log('[DB] inserted seed dataset')
  }
}

export function listDatasets() {
  return getDb().prepare('SELECT id, name, created_at FROM datasets ORDER BY created_at DESC').all()
}

export function getDatasetById(id) {
  const row = getDb().prepare('SELECT id, name, data, created_at FROM datasets WHERE id = ?').get(id)
  return parseDatasetRow(row)
}

export function getDefaultDataset() {
  const row = getDb().prepare('SELECT id, name, data, created_at FROM datasets ORDER BY id ASC LIMIT 1').get()
  return parseDatasetRow(row)
}

export function getLatestRuntimeDataset(datasetType = '', limit = 120) {
  const rows = getDb()
    .prepare('SELECT id, name, data, created_at FROM datasets ORDER BY id DESC LIMIT ?')
    .all(limit)
    .map(parseDatasetRow)
    .filter(Boolean)
  return rows.find((row) => isRuntimeDataset(row, datasetType)) ?? null
}

export function findRuntimeDatasetByViewDate(viewDate, limit = 240) {
  const rows = getDb()
    .prepare('SELECT id, name, data, created_at FROM datasets ORDER BY id DESC LIMIT ?')
    .all(limit)
    .map(parseDatasetRow)
    .filter(Boolean)
  return rows.find((row) => isRuntimeDataset(row) && row.data?._meta?.viewDate === viewDate) ?? null
}

export function listEmergencyRuns(limit = 20) {
  return getDb()
    .prepare('SELECT * FROM emergency_runs ORDER BY id DESC LIMIT ?')
    .all(limit)
    .map(parseEmergencyRunRow)
}

export function getEmergencyRunById(id) {
  const row = getDb().prepare('SELECT * FROM emergency_runs WHERE id = ?').get(id)
  return parseEmergencyRunRow(row)
}

export function createEmergencyRun(record) {
  const info = getDb().prepare(`
    INSERT INTO emergency_runs (
      title, source, severity, status, degraded,
      baseline_dataset_id, emergency_dataset_id, baseline_payload,
      event_spec, detail_payload, explanation
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.title,
    record.source ?? 'manual',
    record.severity ?? 'warning',
    record.status ?? 'planned',
    record.degraded ? 1 : 0,
    record.baseline_dataset_id ?? null,
    record.emergency_dataset_id ?? null,
    record.baseline_payload ? JSON.stringify(record.baseline_payload) : null,
    JSON.stringify(record.event_spec ?? {}),
    JSON.stringify(record.detail_payload ?? {}),
    record.explanation ?? '',
  )
  return Number(info.lastInsertRowid)
}

export function updateEmergencyRun(id, patch = {}) {
  const current = getEmergencyRunById(id)
  if (!current) return null
  const next = {
    title: patch.title ?? current.title,
    source: patch.source ?? current.source,
    severity: patch.severity ?? current.severity,
    status: patch.status ?? current.status,
    degraded: patch.degraded ?? current.degraded,
    baseline_dataset_id: patch.baseline_dataset_id ?? current.baseline_dataset_id ?? null,
    emergency_dataset_id: patch.emergency_dataset_id ?? current.emergency_dataset_id ?? null,
    baseline_payload: patch.baseline_payload ?? current.baseline_payload ?? null,
    event_spec: patch.event_spec ?? current.event_spec ?? {},
    detail_payload: patch.detail_payload ?? current.detail_payload ?? {},
    explanation: patch.explanation ?? current.explanation ?? '',
    applied_at: patch.applied_at ?? current.applied_at ?? null,
    restored_at: patch.restored_at ?? current.restored_at ?? null,
  }

  getDb().prepare(`
    UPDATE emergency_runs
    SET title = ?, source = ?, severity = ?, status = ?, degraded = ?,
        baseline_dataset_id = ?, emergency_dataset_id = ?, baseline_payload = ?,
        event_spec = ?, detail_payload = ?, explanation = ?, applied_at = ?, restored_at = ?
    WHERE id = ?
  `).run(
    next.title,
    next.source,
    next.severity,
    next.status,
    next.degraded ? 1 : 0,
    next.baseline_dataset_id,
    next.emergency_dataset_id,
    next.baseline_payload ? JSON.stringify(next.baseline_payload) : null,
    JSON.stringify(next.event_spec),
    JSON.stringify(next.detail_payload),
    next.explanation,
    next.applied_at,
    next.restored_at,
    id,
  )

  return getEmergencyRunById(id)
}

export function getLatestAppliedEmergencyRun() {
  const row = getDb().prepare("SELECT * FROM emergency_runs WHERE status = 'applied' ORDER BY id DESC LIMIT 1").get()
  return parseEmergencyRunRow(row)
}

export function listInvestmentRuns(limit = 20) {
  return getDb()
    .prepare('SELECT * FROM investment_runs ORDER BY id DESC LIMIT ?')
    .all(limit)
    .map(parseInvestmentRunRow)
}

export function getInvestmentRunById(id) {
  const row = getDb().prepare('SELECT * FROM investment_runs WHERE id = ?').get(id)
  return parseInvestmentRunRow(row)
}

export function createInvestmentRun(record) {
  const info = getDb().prepare(`
    INSERT INTO investment_runs (
      title, source, baseline_dataset_id, plan_payload, explanation
    ) VALUES (?, ?, ?, ?, ?)
  `).run(
    record.title,
    record.source ?? 'manual',
    record.baseline_dataset_id ?? null,
    JSON.stringify(record.plan_payload ?? {}),
    record.explanation ?? '',
  )
  return Number(info.lastInsertRowid)
}

export function listAnomalyRuns(limit = 20) {
  return getDb()
    .prepare('SELECT * FROM anomaly_runs ORDER BY id DESC LIMIT ?')
    .all(limit)
    .map(parseAnomalyRunRow)
}

export function getAnomalyRunById(id) {
  const row = getDb().prepare('SELECT * FROM anomaly_runs WHERE id = ?').get(id)
  return parseAnomalyRunRow(row)
}

export function createAnomalyRun(record) {
  const info = getDb().prepare(`
    INSERT INTO anomaly_runs (
      title, source, severity, status,
      baseline_dataset_id, anomaly_dataset_id, baseline_payload,
      event_spec, detail_payload, explanation
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.title,
    record.source ?? 'manual',
    record.severity ?? 'warning',
    record.status ?? 'planned',
    record.baseline_dataset_id ?? null,
    record.anomaly_dataset_id ?? null,
    record.baseline_payload ? JSON.stringify(record.baseline_payload) : null,
    JSON.stringify(record.event_spec ?? {}),
    JSON.stringify(record.detail_payload ?? {}),
    record.explanation ?? '',
  )
  return Number(info.lastInsertRowid)
}

export function updateAnomalyRun(id, patch = {}) {
  const current = getAnomalyRunById(id)
  if (!current) return null
  const next = {
    title: patch.title ?? current.title,
    source: patch.source ?? current.source,
    severity: patch.severity ?? current.severity,
    status: patch.status ?? current.status,
    baseline_dataset_id: patch.baseline_dataset_id ?? current.baseline_dataset_id ?? null,
    anomaly_dataset_id: patch.anomaly_dataset_id ?? current.anomaly_dataset_id ?? null,
    baseline_payload: patch.baseline_payload ?? current.baseline_payload ?? null,
    event_spec: patch.event_spec ?? current.event_spec ?? {},
    detail_payload: patch.detail_payload ?? current.detail_payload ?? {},
    explanation: patch.explanation ?? current.explanation ?? '',
    applied_at: patch.applied_at ?? current.applied_at ?? null,
    restored_at: patch.restored_at ?? current.restored_at ?? null,
  }

  getDb().prepare(`
    UPDATE anomaly_runs
    SET title = ?, source = ?, severity = ?, status = ?,
        baseline_dataset_id = ?, anomaly_dataset_id = ?, baseline_payload = ?,
        event_spec = ?, detail_payload = ?, explanation = ?, applied_at = ?, restored_at = ?
    WHERE id = ?
  `).run(
    next.title,
    next.source,
    next.severity,
    next.status,
    next.baseline_dataset_id,
    next.anomaly_dataset_id,
    next.baseline_payload ? JSON.stringify(next.baseline_payload) : null,
    JSON.stringify(next.event_spec),
    JSON.stringify(next.detail_payload),
    next.explanation,
    next.applied_at,
    next.restored_at,
    id,
  )

  return getAnomalyRunById(id)
}

export function getLatestAppliedAnomalyRun() {
  const row = getDb().prepare("SELECT * FROM anomaly_runs WHERE status = 'applied' ORDER BY id DESC LIMIT 1").get()
  return parseAnomalyRunRow(row)
}

export function listConversations() {
  return getDb().prepare(`
    SELECT c.id, c.title, c.mode, c.created_at, c.updated_at,
      (SELECT COUNT(*) FROM conversation_messages WHERE conversation_id = c.id) as message_count
    FROM conversations c
    ORDER BY c.updated_at DESC, c.id DESC
  `).all()
}

export function getConversation(id) {
  const row = getDb()
    .prepare('SELECT id, title, mode, workspace_state, created_at, updated_at FROM conversations WHERE id = ?')
    .get(id)
  if (!row) return null
  const messages = getDb()
    .prepare('SELECT id, role, content, actions, created_at FROM conversation_messages WHERE conversation_id = ? ORDER BY id ASC')
    .all(id)
    .map((message) => ({ ...message, actions: safeParseJson(message.actions, undefined) }))
  return { ...row, workspaceState: safeParseJson(row.workspace_state, null), messages }
}

export function createConversation(mode = 'agent') {
  const info = getDb().prepare('INSERT INTO conversations (title, mode) VALUES (?, ?)').run('新对话', mode)
  return Number(info.lastInsertRowid)
}

export function updateConversation(id, { title, mode, workspaceState }) {
  const database = getDb()
  if (title != null) {
    database.prepare('UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(title, id)
  }
  if (mode != null) {
    database.prepare('UPDATE conversations SET mode = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(mode, id)
  }
  if (workspaceState !== undefined) {
    database.prepare('UPDATE conversations SET workspace_state = ? WHERE id = ?').run(
      workspaceState == null ? null : JSON.stringify(workspaceState),
      id,
    )
  }
}

export function appendMessage(conversationId, { role, content, actions }) {
  const database = getDb()
  database.prepare(
    'INSERT INTO conversation_messages (conversation_id, role, content, actions) VALUES (?, ?, ?, ?)',
  ).run(conversationId, role, content, actions ? JSON.stringify(actions) : null)
  database.prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(conversationId)
}

export function deleteConversation(id) {
  getDb().prepare('DELETE FROM conversations WHERE id = ?').run(id)
}

// ── LLM Provider CRUD ──────────────────────────────────────

export function listLLMProviders() {
  return getDb().prepare('SELECT * FROM llm_providers ORDER BY is_active DESC, updated_at DESC').all()
}

export function getLLMProvider(id) {
  return getDb().prepare('SELECT * FROM llm_providers WHERE id = ?').get(id)
}

export function getActiveLLMProvider() {
  return getDb().prepare('SELECT * FROM llm_providers WHERE is_active = 1').get() || null
}

export function createLLMProvider({ name, base_url, api_key, model, api_format, auth_header, model_mapping, notes }) {
  const info = getDb().prepare(
    `INSERT INTO llm_providers (name, base_url, api_key, model, api_format, auth_header, model_mapping, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    name, base_url, api_key,
    model || 'gpt-4',
    api_format || 'openai',
    auth_header || 'Authorization',
    model_mapping ? JSON.stringify(model_mapping) : null,
    notes || '',
  )
  return Number(info.lastInsertRowid)
}

export function updateLLMProvider(id, fields) {
  const db = getDb()
  const allowed = ['name', 'base_url', 'api_key', 'model', 'api_format', 'auth_header', 'model_mapping', 'notes']
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      const value = key === 'model_mapping' && typeof fields[key] === 'object'
        ? JSON.stringify(fields[key])
        : fields[key]
      db.prepare(`UPDATE llm_providers SET ${key} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(value, id)
    }
  }
}

export function deleteLLMProvider(id) {
  getDb().prepare('DELETE FROM llm_providers WHERE id = ?').run(id)
}

export function activateLLMProvider(id) {
  const db = getDb()
  db.prepare('UPDATE llm_providers SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE is_active = 1').run()
  db.prepare('UPDATE llm_providers SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id)
}
