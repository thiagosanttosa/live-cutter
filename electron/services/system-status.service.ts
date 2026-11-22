import { access, mkdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { SystemComponentStatus, SystemStatus } from '../../src/types/video.ts'
import { runChildProcess } from './process.service.ts'

type RunCommand = typeof runChildProcess

function compareDatedVersion(actual: string, minimum: string): number | null {
  const left = actual.match(/^\d{4}\.\d{2}\.\d{2}(?:\.\d+)?$/)?.[0].split('.').map(Number)
  const right = minimum.split('.').map(Number)
  if (!left) return null
  for (let index = 0; index < right.length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0) return Math.sign(difference)
  }
  return 0
}

function compareNumericVersion(actual: string, minimum: string): number | null {
  const left = actual.match(/\d+(?:\.\d+){1,2}/)?.[0].split('.').map(Number)
  const right = minimum.split('.').map(Number)
  if (!left) return null
  for (let index = 0; index < right.length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0) return Math.sign(difference)
  }
  return 0
}

async function checkExecutable(
  executable: string | null,
  label: string,
  args: string[],
  run: RunCommand,
  minimum: string,
  comparison: (actual: string, minimum: string) => number | null,
): Promise<SystemComponentStatus & { output: string }> {
  if (!executable) return { available: false, version: null, message: `${label} executable is missing from the application resources.`, output: '' }
  try {
    if (path.isAbsolute(executable) || executable.includes(path.sep)) await access(executable)
    const result = await run(executable, args, { timeoutMs: 15_000, outputLimitBytes: 2 * 1024 * 1024 })
    const output = `${result.stdout}\n${result.stderr}`
    const version = label === 'yt-dlp'
      ? result.stdout.trim().split(/\s+/)[0]
      : new RegExp(`^${label} version\\s+(\\S+)`, 'm').exec(output)?.[1] ?? null
    const supported = version ? comparison(version, minimum) : null
    if (!version) return { available: false, version: null, message: `${label} ran but did not report a recognizable version.`, output }
    if (supported === null || supported < 0) {
      return { available: false, version, message: `${label} ${version} is incompatible; version ${minimum} or newer is required.`, output }
    }
    return { available: true, version, message: `${label} is available and compatible.`, output }
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown execution error.'
    return { available: false, version: null, message: `${label} could not run: ${detail}`, output: '' }
  }
}

export async function collectSystemStatus(
  input: { appVersion: string; ytDlp: string | null; ffmpeg: string | null; ffprobe: string | null; outputDirectory: string },
  run: RunCommand = runChildProcess,
): Promise<SystemStatus> {
  const [ytDlp, ffmpeg, ffprobe] = await Promise.all([
    checkExecutable(input.ytDlp, 'yt-dlp', ['--ignore-config', '--version'], run, '2024.08.06', compareDatedVersion),
    checkExecutable(input.ffmpeg, 'ffmpeg', ['-version'], run, '6.0', compareNumericVersion),
    checkExecutable(input.ffprobe, 'ffprobe', ['-version'], run, '6.0', compareNumericVersion),
  ])

  if (ffmpeg.available) {
    try {
      const encoders = await run(input.ffmpeg!, ['-hide_banner', '-encoders'], { timeoutMs: 20_000, outputLimitBytes: 8 * 1024 * 1024 })
      const output = `${encoders.stdout}\n${encoders.stderr}`
      if (!(/\blibx264\b/.test(output) || /\bh264_mf\b/.test(output)) || !/\baac\b/.test(output)) {
        ffmpeg.available = false
        ffmpeg.message = 'FFmpeg runs, but this build lacks a supported H.264 encoder or AAC audio encoder.'
      }
    } catch (error) {
      ffmpeg.available = false
      ffmpeg.message = `FFmpeg encoder check failed: ${error instanceof Error ? error.message : 'unknown error'}`
    }
  }

  let outputFolder: SystemStatus['outputFolder']
  try {
    await mkdir(input.outputDirectory, { recursive: true })
    const folder = await stat(input.outputDirectory)
    if (!folder.isDirectory()) throw new Error('The configured path is not a directory.')
    const testFile = path.join(input.outputDirectory, `.live-cutter-check-${randomUUID()}.tmp`)
    try { await writeFile(testFile, 'ok', { flag: 'wx' }) }
    finally { await rm(testFile, { force: true }) }
    outputFolder = { path: input.outputDirectory, available: true, message: 'The folder exists and is writable.' }
  } catch (error) {
    outputFolder = {
      path: input.outputDirectory,
      available: false,
      message: `The output folder is not writable: ${error instanceof Error ? error.message : 'unknown error'}`,
    }
  }

  const dependenciesReady = ytDlp.available && ffmpeg.available && ffprobe.available && outputFolder.available
  return {
    app: { available: dependenciesReady, version: input.appVersion, message: dependenciesReady ? 'Application and required local resources are ready.' : 'One or more required tools or folders need attention.' },
    ytDlp: { available: ytDlp.available, version: ytDlp.version, message: ytDlp.message },
    ffmpeg: { available: ffmpeg.available, version: ffmpeg.version, message: ffmpeg.message },
    ffprobe: { available: ffprobe.available, version: ffprobe.version, message: ffprobe.message },
    outputFolder,
  }
}
