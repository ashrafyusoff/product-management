import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 3001)
const HOST = process.env.HOST || '0.0.0.0'
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data')
const DB_FILE = path.join(DATA_DIR, 'db.json')
const DIST_DIR = path.join(__dirname, 'dist')
// Task attachments are stored as real files (not inside db.json) to keep the DB small.
const ATTACH_DIR = path.join(DATA_DIR, 'attachments')
const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024

const ATTACH_MIME = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.msg': 'application/vnd.ms-outlook',
  '.eml': 'message/rfc822',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.zip': 'application/zip',
}

function safeFileName(name) {
  const cleaned = String(name || 'file').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim().slice(0, 180)
  return cleaned || 'file'
}

function readRawBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    req.on('data', (chunk) => {
      total += chunk.length
      if (total > limit) {
        reject(new Error(`Attachment exceeds ${Math.round(limit / 1048576)} MB limit`))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

const EMPTY_DB = {
  projects: [],
  workstreams: [],
  tasks: [],
  milestones: [],
  activityLogs: [],
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

async function ensureDbFile() {
  await fs.mkdir(DATA_DIR, { recursive: true })
  try {
    await fs.access(DB_FILE)
  } catch {
    await fs.writeFile(DB_FILE, JSON.stringify(EMPTY_DB, null, 2), 'utf-8')
  }
}

async function readDb() {
  await ensureDbFile()
  const raw = await fs.readFile(DB_FILE, 'utf-8')
  try {
    const parsed = JSON.parse(raw)
    return {
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      workstreams: Array.isArray(parsed.workstreams) ? parsed.workstreams : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      milestones: Array.isArray(parsed.milestones) ? parsed.milestones : [],
      activityLogs: Array.isArray(parsed.activityLogs) ? parsed.activityLogs : [],
    }
  } catch {
    return { ...EMPTY_DB }
  }
}

let writeQueue = Promise.resolve()

function writeDb(payload) {
  const normalized = {
    projects: Array.isArray(payload?.projects) ? payload.projects : [],
    workstreams: Array.isArray(payload?.workstreams) ? payload.workstreams : [],
    tasks: Array.isArray(payload?.tasks) ? payload.tasks : [],
    milestones: Array.isArray(payload?.milestones) ? payload.milestones : [],
    activityLogs: Array.isArray(payload?.activityLogs) ? payload.activityLogs : [],
  }
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true })
    const tmpFile = `${DB_FILE}.tmp`
    await fs.writeFile(tmpFile, JSON.stringify(normalized, null, 2), 'utf-8')
    await fs.rename(tmpFile, DB_FILE)
  })
  return writeQueue
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(data))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

async function serveStatic(reqPath, res) {
  const safePath = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, '')
  let filePath = path.join(DIST_DIR, safePath === '/' ? 'index.html' : safePath)
  try {
    const stat = await fs.stat(filePath)
    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html')
  } catch {
    filePath = path.join(DIST_DIR, 'index.html')
  }
  try {
    const data = await fs.readFile(filePath)
    const ext = path.extname(filePath).toLowerCase()
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' })
    res.end(data)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Build not found. Run "npm run build" first or use "npm run dev" for development.')
  }
}

const server = http.createServer(async (req, res) => {
  const urlPath = (req.url || '/').split('?')[0]

  try {
    if (urlPath === '/api/health' && req.method === 'GET') {
      await ensureDbFile()
      return sendJson(res, 200, { ok: true, dbFile: DB_FILE })
    }

    if (urlPath === '/api/db' && req.method === 'GET') {
      const data = await readDb()
      return sendJson(res, 200, data)
    }

    if ((urlPath === '/api/db' && req.method === 'PUT') || (urlPath === '/api/db' && req.method === 'POST')) {
      const body = await readBody(req)
      const parsed = JSON.parse(body || '{}')
      await writeDb(parsed)
      return sendJson(res, 200, { ok: true })
    }

    // ---- Task attachments ----
    if (urlPath === '/api/attachments' && req.method === 'POST') {
      const url = new URL(req.url || '/', 'http://localhost')
      const name = safeFileName(url.searchParams.get('name'))
      const buf = await readRawBody(req, MAX_ATTACHMENT_BYTES)
      const id = randomUUID()
      const dir = path.join(ATTACH_DIR, id)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(path.join(dir, name), buf)
      return sendJson(res, 200, {
        id,
        name,
        size: buf.length,
        type: req.headers['content-type'] || 'application/octet-stream',
      })
    }

    const attMatch = urlPath.match(/^\/api\/attachments\/([A-Za-z0-9-]{8,64})$/)
    if (attMatch) {
      const dir = path.join(ATTACH_DIR, attMatch[1])
      if (req.method === 'GET') {
        const files = await fs.readdir(dir).catch(() => [])
        if (files.length === 0) return sendJson(res, 404, { error: 'Attachment not found' })
        const name = files[0]
        const data = await fs.readFile(path.join(dir, name))
        const type = ATTACH_MIME[path.extname(name).toLowerCase()] || 'application/octet-stream'
        const url = new URL(req.url || '/', 'http://localhost')
        const inline = /^(image\/|application\/pdf|text\/)/.test(type) && url.searchParams.get('download') !== '1'
        res.writeHead(200, {
          'Content-Type': type,
          'Content-Length': data.length,
          'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`,
          'Cache-Control': 'no-store',
        })
        return res.end(data)
      }
      if (req.method === 'DELETE') {
        await fs.rm(dir, { recursive: true, force: true })
        return sendJson(res, 200, { ok: true })
      }
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      return await serveStatic(urlPath, res)
    }

    res.writeHead(405)
    res.end('Method Not Allowed')
  } catch (err) {
    console.error('[server]', err)
    sendJson(res, 500, { error: err instanceof Error ? err.message : 'Internal server error' })
  }
})

await ensureDbFile()
server.listen(PORT, HOST, () => {
  console.log(`[Product Management] Local DB file: ${DB_FILE}`)
  console.log(`[Product Management] Local:   http://localhost:${PORT}`)
  console.log(`[Product Management] Network: http://${os.hostname()}:${PORT}`)
})
