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

function parseDatasetRow(row) {
  if (!row) return null
  return { ...row, data: JSON.parse(row.data) }
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
  const row = getDb().prepare('SELECT id, title, mode, created_at, updated_at FROM conversations WHERE id = ?').get(id)
  if (!row) return null
  const messages = getDb()
    .prepare('SELECT id, role, content, actions, created_at FROM conversation_messages WHERE conversation_id = ? ORDER BY id ASC')
    .all(id)
    .map((m) => ({ ...m, actions: m.actions ? JSON.parse(m.actions) : undefined }))
  return { ...row, messages }
}

export function createConversation(mode = 'agent') {
  const info = getDb().prepare('INSERT INTO conversations (title, mode) VALUES (?, ?)').run('新对话', mode)
  return info.lastInsertRowid
}

export function updateConversation(id, { title, mode }) {
  const db = getDb()
  if (title != null) db.prepare('UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(title, id)
  if (mode != null) db.prepare('UPDATE conversations SET mode = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(mode, id)
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
