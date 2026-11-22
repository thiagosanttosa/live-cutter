import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { runChildProcess } from '../electron/services/process.service.ts'

describe('media child process control', () => {
  it('terminates the requested child when its operation is cancelled', async () => {
    const controller = new AbortController()
    const operation = runChildProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      signal: controller.signal,
      timeoutMs: 5_000,
    })
    setTimeout(() => controller.abort(), 100)
    await assert.rejects(operation, (error) => error.code === 'CANCELLED')
  })

  it('stops a child that exceeds its configured output limit', async () => {
    await assert.rejects(
      runChildProcess(process.execPath, ['-e', "console.log('x'.repeat(10000))"], { outputLimitBytes: 128 }),
      (error) => error.code === 'OUTPUT_LIMIT',
    )
  })
})
