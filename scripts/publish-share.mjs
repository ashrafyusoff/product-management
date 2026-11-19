import fs from 'node:fs/promises'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..')

const args = process.argv.slice(2)
const syncDb = args.includes('--sync-db')
const targetArg = args.find((a) => !a.startsWith('--'))
const targetDir = targetArg || process.env.NXP_SHARE_DIR

if (!targetDir) {
  console.error('Usage: npm run publish:share -- "\\\\server\\share\\product-management" [--sync-db]')
  console.error('   or: set NXP_SHARE_DIR=\\\\server\\share\\product-management && npm run publish:share')
  process.exit(1)
}

const FILES_TO_COPY = [
  'server.mjs',
  'package.json',
  'start-app.bat',
  'index.html',
  'tsconfig.json',
  'vite.config.ts',
  'tailwind.config.js',
  'postcss.config.js',
]

const DIRS_TO_COPY = ['dist', 'src', 'scripts']

async function exists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

console.log('[1/4] Building production bundle...')
execSync('npm run build', { cwd: ROOT_DIR, stdio: 'inherit' })

console.log(`[2/4] Ensuring target folder exists: ${targetDir}`)
await fs.mkdir(targetDir, { recursive: true })

console.log('[3/4] Copying app build, server, and source files...')
for (const file of FILES_TO_COPY) {
  const src = path.join(ROOT_DIR, file)
  if (await exists(src)) {
    await fs.copyFile(src, path.join(targetDir, file))
  }
}

for (const dir of DIRS_TO_COPY) {
  const src = path.join(ROOT_DIR, dir)
  if (await exists(src)) {
    await fs.cp(src, path.join(targetDir, dir), { recursive: true, force: true })
  }
}

console.log('[4/4] Handling data/db.json...')
const localDb = path.join(ROOT_DIR, 'data', 'db.json')
const remoteDataDir = path.join(targetDir, 'data')
const remoteDb = path.join(remoteDataDir, 'db.json')
await fs.mkdir(remoteDataDir, { recursive: true })

if (await exists(localDb)) {
  const remoteExists = await exists(remoteDb)
  if (!remoteExists || syncDb) {
    await fs.copyFile(localDb, remoteDb)
    console.log(`Copied data/db.json -> ${remoteDb}`)
  } else {
    console.log(`Kept existing ${remoteDb} (pass --sync-db to overwrite it with local data/db.json).`)
  }
} else {
  console.log('No local data/db.json found yet; server.mjs will create one on first run.')
}

console.log('Publish complete!')
