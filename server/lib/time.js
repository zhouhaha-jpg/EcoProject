const BEIJING_TIME_ZONE = 'Asia/Shanghai'

function getFormatter(options) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BEIJING_TIME_ZONE,
    hour12: false,
    ...options,
  })
}

function getParts(dateLike = new Date()) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike)
  const parts = getFormatter({
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)

  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
}

export function getBeijingDate(dateLike = new Date()) {
  const { year, month, day } = getParts(dateLike)
  return `${year}-${month}-${day}`
}

export function formatBeijingDateTime(dateLike = new Date()) {
  const { year, month, day, hour, minute, second } = getParts(dateLike)
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

export function parseSqliteUtcTimestamp(timestamp) {
  if (!timestamp) return null
  const normalized = String(timestamp).includes('T')
    ? String(timestamp)
    : `${String(timestamp).replace(' ', 'T')}Z`
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatSqliteUtcToBeijing(timestamp) {
  const date = parseSqliteUtcTimestamp(timestamp)
  return date ? formatBeijingDateTime(date) : ''
}

export { BEIJING_TIME_ZONE }
