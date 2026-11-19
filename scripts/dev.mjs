import { spawn } from 'node:child_process'

const isWin = process.platform === 'win32'
const api = spawn(process.execPath, ['server.mjs'], { stdio: 'inherit' })
const vite = spawn(isWin ? 'npx.cmd' : 'npx', ['vite'], { stdio: 'inherit', shell: isWin })

function shutdown(code = 0) {
  api.kill()
  vite.kill()
  process.exit(code)
}

api.on('exit', (code) => {
  if (code && code !== 0) shutdown(code)
})
vite.on('exit', (code) => shutdown(code ?? 0))
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
