import { spawn } from 'node:child_process'
import type { ChildProcess, SpawnOptions } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { Readable } from 'node:stream'

export type ProcessStream = 'stdout' | 'stderr'
export type ProcessLineHandler = (stream: ProcessStream, line: string) => void
export type SpawnFunction = (command: string, args: string[], options: SpawnOptions) => ChildProcess

export class ChildProcessError extends Error {
  readonly exitCode: number | null
  readonly stderr: string
  readonly code: 'NOT_FOUND' | 'EXIT' | 'TIMEOUT' | 'CANCELLED' | 'OUTPUT_LIMIT'

  constructor(code: ChildProcessError['code'], message: string, exitCode: number | null = null, stderr = '') {
    super(message)
    this.name = 'ChildProcessError'
    this.code = code
    this.exitCode = exitCode
    this.stderr = stderr
  }
}

export interface RunProcessOptions {
  signal?: AbortSignal
  timeoutMs?: number
  outputLimitBytes?: number
  onLine?: ProcessLineHandler
  spawnProcess?: SpawnFunction
}

export interface ProcessResult { stdout: string; stderr: string; exitCode: number }

function attachLines(stream: Readable | null, kind: ProcessStream, onLine: ProcessLineHandler | undefined, onText: (text: string) => void): void {
  if (!stream) return
  const reader = createInterface({ input: stream })
  reader.on('line', (line) => {
    onText(kind === 'stdout' ? `${line}\n` : `${line}\n`)
    onLine?.(kind, line)
  })
}

function terminateTree(child: ChildProcess): void {
  if (process.platform === 'win32' && child.pid) {
    try {
      const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
        windowsHide: true,
        stdio: 'ignore',
      })
      killer.once('error', () => child.kill())
      killer.once('close', (code) => { if (code !== 0) child.kill() })
      killer.unref()
    } catch {
      child.kill()
    }
  } else if (process.platform !== 'win32' && child.pid) {
    try { process.kill(-child.pid, 'SIGTERM') } catch { child.kill('SIGTERM') }
  } else {
    child.kill()
  }
}

export function runChildProcess(command: string, args: string[], options: RunProcessOptions = {}): Promise<ProcessResult> {
  const spawnProcess = options.spawnProcess ?? spawn
  const stdio: SpawnOptions['stdio'] = ['ignore', 'pipe', 'pipe']
  const spawnOptions: SpawnOptions = {
    windowsHide: true,
    stdio,
    ...(process.platform !== 'win32' ? { detached: true } : {}),
  }

  return new Promise((resolve, reject) => {
    let child: ChildProcess
    try {
      child = spawnProcess(command, args, spawnOptions)
    } catch {
      reject(new ChildProcessError('NOT_FOUND', 'The required media tool could not be started.'))
      return
    }

    let stdout = ''
    let stderr = ''
    let outputBytes = 0
    let settled = false
    let cancelRequested = options.signal?.aborted ?? false
    let timedOut = false
    const settle = (callback: () => void) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      options.signal?.removeEventListener('abort', abort)
      callback()
    }
    const abort = () => {
      if (settled || cancelRequested) return
      cancelRequested = true
      terminateTree(child)
    }
    const timer = options.timeoutMs ? setTimeout(() => {
      timedOut = true
      terminateTree(child)
    }, options.timeoutMs) : undefined

    if (cancelRequested) terminateTree(child)
    else options.signal?.addEventListener('abort', abort, { once: true })

    const collect = (stream: ProcessStream) => (text: string) => {
      outputBytes += Buffer.byteLength(text, 'utf8')
      if (outputBytes > (options.outputLimitBytes ?? 8 * 1024 * 1024)) {
        terminateTree(child)
        return
      }
      if (stream === 'stdout') stdout += text
      else if (stderr.length < 16_000) stderr += text.slice(0, 16_000 - stderr.length)
    }
    attachLines(child.stdout, 'stdout', options.onLine, collect('stdout'))
    attachLines(child.stderr, 'stderr', options.onLine, collect('stderr'))
    child.once('error', (error: NodeJS.ErrnoException) => {
      settle(() => reject(new ChildProcessError(error.code === 'ENOENT' ? 'NOT_FOUND' : 'EXIT',
        error.code === 'ENOENT' ? 'The required media tool was not found.' : 'The media process could not start.', null, stderr)))
    })
    child.once('close', (code) => {
      settle(() => {
        if (cancelRequested) {
          reject(new ChildProcessError('CANCELLED', 'The operation was cancelled.', code, stderr))
        } else if (timedOut) {
          reject(new ChildProcessError('TIMEOUT', 'The media process timed out.', code, stderr))
        } else if (outputBytes > (options.outputLimitBytes ?? 8 * 1024 * 1024)) {
          reject(new ChildProcessError('OUTPUT_LIMIT', 'The media process produced too much diagnostic output.', code, stderr))
        } else if (code !== 0) {
          reject(new ChildProcessError('EXIT', 'The media process returned an error.', code, stderr))
        } else {
          resolve({ stdout, stderr, exitCode: 0 })
        }
      })
    })
  })
}
