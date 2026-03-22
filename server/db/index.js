/**
 * 数据库初始化与访问
 */
import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync } from 'fs'
import DATASET from './seed.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dirname, 'eco.db')

let db = null

function ensureColumn(database, tableName, columnName, definition) {
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all()
  if (columns.some((column) => column.name === columnName)) return
  database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`)
}

function parseDatasetRow(row) {
  if (!row) return null
  return { ...row, data: JSON.parse(row.data) }
}

function safeParseJson(text, fallback = null) {
  if (text == null || text === '') return fallback
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
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

function isRuntimeDataset(row, datasetType = '') {
  const metaType = row.data?._meta?.datasetType
  const inferredType = metaType
    || (row.name.startsWith('时光回溯 ') ? 'history' : row.name.startsWith('实时优化 ') ? 'realtime' : '')
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
    const insert = database.prepare('INSERT INTO datasets (name, data) VALUES (?, ?)')
    insert.run('默认优化数据集', JSON.stringify(DATASET))
    console.log('[DB] 已插入默认数据集')
  }
}

export function listDatasets() {
  return getDb().prepare('SELECT id, name, created_at FROM datasets ORDER BY created_at DESC').all()
}

export function getDatasetById(id) {
  const row = getDb().prepare('SELECT id, name, data, created_at FROM datasets WHERE id = ?').get(id)
  return parseDatasetRow(row)
}

/**
 * 返回基准数据集（用于方案对比的「基准」列）
 * 始终返回 id 最小的数据集（种子数据），保证所有 What-If 情景的基准一致。
 * What-If 结果会 INSERT 为新行，不会覆盖基准。
 */
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
  const db = getDb()
  const info = db.prepare(`
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
  const db = getDb()
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

  db.prepare(`
    UPDATE emergency_runs
    SET title = ?,
        source = ?,
        severity = ?,
        status = ?,
        degraded = ?,
        baseline_dataset_id = ?,
        emergency_dataset_id = ?,
        baseline_payload = ?,
        event_spec = ?,
        detail_payload = ?,
        explanation = ?,
        applied_at = ?,
        restored_at = ?
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
  const row = getDb()
    .prepare("SELECT * FROM emergency_runs WHERE status = 'applied' ORDER BY id DESC LIMIT 1")
    .get()
  return parseEmergencyRunRow(row)
}

// ─── 对话历史 ─────────────────────────────────────────────────────────────

export function listConversations() {
  return getDb()
    .prepare(
      `SELECT c.id, c.title, c.mode, c.created_at, c.updated_at,
        (SELECT COUNT(*) FROM conversation_messages WHERE conversation_id = c.id) as message_count
       FROM conversations c
       ORDER BY c.updated_at DESC`
    )
    .all()
}

export function getConversation(id) {
  const row = getDb().prepare('SELECT id, title, mode, workspace_state, created_at, updated_at FROM conversations WHERE id = ?').get(id)
  if (!row) return null
  const messages = getDb()
    .prepare('SELECT id, role, content, actions, created_at FROM conversation_messages WHERE conversation_id = ? ORDER BY id ASC')
    .all(id)
    .map((m) => ({ ...m, actions: m.actions ? JSON.parse(m.actions) : undefined }))
  return { ...row, workspaceState: safeParseJson(row.workspace_state, null), messages }
}

export function createConversation(mode = 'agent') {
  const info = getDb().prepare('INSERT INTO conversations (title, mode) VALUES (?, ?)').run('新对话', mode)
  return info.lastInsertRowid
}

export function updateConversation(id, { title, mode, workspaceState }) {
  const db = getDb()
  if (title != null) db.prepare('UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(title, id)
  if (mode != null) db.prepare('UPDATE conversations SET mode = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(mode, id)
  if (workspaceState !== undefined) {
    db.prepare('UPDATE conversations SET workspace_state = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
      workspaceState == null ? null : JSON.stringify(workspaceState),
      id,
    )
  }
}

export function appendMessage(conversationId, { role, content, actions }) {
  const db = getDb()
  db.prepare(
    'INSERT INTO conversation_messages (conversation_id, role, content, actions) VALUES (?, ?, ?, ?)'
  ).run(conversationId, role, content, actions ? JSON.stringify(actions) : null)
  db.prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(conversationId)
}

export function deleteConversation(id) {
  getDb().prepare('DELETE FROM conversations WHERE id = ?').run(id)
}
