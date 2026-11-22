import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const releaseDirectory = path.join(root, 'release')
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const artifactName = `LIVE-CUTTER-Setup-${pkg.version}-x64.exe`
const artifactPath = path.join(releaseDirectory, artifactName)
const artifacts = await readdir(releaseDirectory)
if (!artifacts.includes(artifactName)) throw new Error(`Installer not found: ${artifactPath}`)

const hash = createHash('sha256')
const { createReadStream } = await import('node:fs')
await new Promise((resolve, reject) => createReadStream(artifactPath).on('data', (chunk) => hash.update(chunk)).on('end', resolve).on('error', reject))
const docsDirectory = path.join(releaseDirectory, 'documentacao-de-distribuicao')
await mkdir(docsDirectory, { recursive: true })
await copyFile(path.join(root, 'docs', 'DISTRIBUICAO-WINDOWS.md'), path.join(docsDirectory, 'DISTRIBUICAO-WINDOWS.md'))
await copyFile(path.join(root, 'docs', 'ATUALIZACOES.md'), path.join(docsDirectory, 'ATUALIZACOES.md'))
await copyFile(path.join(root, 'docs', 'VALIDACAO-FINAL.md'), path.join(docsDirectory, 'VALIDACAO-FINAL.md'))
await writeFile(path.join(docsDirectory, 'BUILD-INFO.txt'), [
  `Generated (UTC): ${new Date().toISOString()}`,
  `Product: ${pkg.productName ?? 'LIVE CUTTER'}`,
  `Version: ${pkg.version}`,
  `Artifact: ../${artifactName}`,
  `Architecture: Windows x64` ,
  'Installer: NSIS (unsigned; no signing certificate was configured)',
  'Updater: GitHub Releases only when configured with a real repository and Authenticode publisher',
  'Publishing: disabled by dist:win (--publish never)',
  'Automated gate: npm test, TypeScript typecheck, production build (dist:win stops on failure)',
  'Real clip integration: four 1080p cuts and cancellation; see VALIDACAO-FINAL.md',
  'Dependency audit: 0 production findings; 6 moderate build-tool findings; see VALIDACAO-FINAL.md',
  'Clean Windows installation and manual UI: NOT TESTED',
  'Version-to-version update: NOT CONFIGURED',
  `SHA-256: ${hash.digest('hex')}`,
  'yt-dlp: 2026.10.26 (official Windows x64 release; bundled notices are in application resources)',
  'FFmpeg/FFprobe: 9.0.2 (Windows x64 LGPL build; license and build provenance are in application resources)',
  '',
].join('\n'), 'utf8')
console.log(`Prepared release documentation for ${artifactName}`)
