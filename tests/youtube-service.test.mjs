import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { runYtDlp, queryVideo } from '../electron/services/youtube.service.ts'

function fakeChild() {
  const child = new EventEmitter()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.killedByTimeout = false
  child.kill = () => { child.killedByTimeout = true; return true }
  return child
}

describe('yt-dlp service process handling', () => {
  it('passes separate arguments and collects JSON stdout', async () => {
    const child = fakeChild()
    let command
    let receivedArgs
    const running = runYtDlp('yt-dlp.exe', ['--dump-single-json', '--', 'https://youtu.be/abc123'], 1000,
      (executable, args) => { command = executable; receivedArgs = args; return child })
    child.stdout.write('{"id":"abc123"}')
    child.stdout.end()
    child.emit('close', 0)
    assert.equal(await running, '{"id":"abc123"}')
    assert.equal(command, 'yt-dlp.exe')
    assert.deepEqual(receivedArgs, ['--dump-single-json', '--', 'https://youtu.be/abc123'])
  })

  it('kills a timed out child process', async () => {
    const child = fakeChild()
    await assert.rejects(runYtDlp('yt-dlp.exe', [], 10, () => child), /timed out/)
    assert.equal(child.killedByTimeout, true)
  })

  it('reports when the executable cannot be started', async () => {
    const child = fakeChild()
    const running = runYtDlp('missing-yt-dlp.exe', [], 1000, () => child)
    child.emit('error', Object.assign(new Error('not found'), { code: 'ENOENT' }))
    await assert.rejects(running, /yt-dlp is not installed/)
  })

  it('turns a connection failure into a network error', async () => {
    const child = fakeChild()
    const running = runYtDlp('yt-dlp.exe', ['--dump-single-json'], 1000, () => child)
    child.stderr.end('ERROR: Unable to download webpage: connection timed out')
    child.emit('close', 1)
    await assert.rejects(running, /Could not reach YouTube/)
  })

  it('rejects invalid URLs before spawning a process', async () => {
    let spawned = false
    const result = await queryVideo('yt-dlp.exe', 'https://example.com/video', async () => { spawned = true; return '' })
    assert.equal(result.ok, false)
    assert.equal(spawned, false)
  })

  it('normalizes a successful response and handles malformed JSON', async () => {
    const publicUrl = 'https://youtu.be/abc123'
    const success = await queryVideo('yt-dlp.exe', publicUrl, async (_exe, args) =>
      args.includes('--version') ? '2026.10.26' : JSON.stringify({ id: 'abc123', title: 'Demo', formats: [] }))
    assert.equal(success.ok, true)
    if (success.ok) assert.equal(success.data.title, 'Demo')

    const malformed = await queryVideo('yt-dlp.exe', publicUrl, async (_exe, args) =>
      args.includes('--version') ? '2026.10.26' : 'not-json')
    assert.equal(malformed.ok, false)
    if (!malformed.ok) assert.equal(malformed.error.code, 'METADATA_PARSE')
  })

  it('rejects an unsupported yt-dlp version before querying a video', async () => {
    let calls = 0
    const result = await queryVideo('yt-dlp.exe', 'https://youtu.be/abc123', async () => {
      calls += 1
      return '2020.01.01'
    })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.code, 'YTDLP_INCOMPATIBLE')
    assert.equal(calls, 1)
  })
})
