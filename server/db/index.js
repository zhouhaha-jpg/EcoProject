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
  if (!row) return null
  return { ...row, data: JSON.parse(row.data) }
}

/**
 * 返回基准数据集（用于方案对比的「基准」列）
 * 始终返回 id 最小的数据集（种子数据），保证所有 What-If 情景的基准一致。
 * What-If 结果会 INSERT 为新行，不会覆盖基准。
 */
export function getDefaultDataset() {
  const row = getDb().prepare('SELECT id, name, data, created_at FROM datasets ORDER BY id ASC LIMIT 1').get()
  if (!row) return null
  return { ...row, data: JSON.parse(row.data) }
}
