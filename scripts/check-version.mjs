import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'))
const changelog = await readFile(path.join(root, 'CHANGELOG.md'), 'utf8')
const numericIdentifier = '(?:0|[1-9]\\d*)'
const nonNumericIdentifier = '[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*'
const prereleaseIdentifier = `(?:${numericIdentifier}|${nonNumericIdentifier})`
const semver = new RegExp(`^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-(${prereleaseIdentifier}(?:\\.${prereleaseIdentifier})*))?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`)

if (typeof pkg.version !== 'string' || !semver.test(pkg.version)) {
  throw new Error(`package.json version must use Semantic Versioning MAJOR.MINOR.PATCH; received ${String(pkg.version)}.`)
}
if (!changelog.includes(`## [${pkg.version}] - `)) {
  throw new Error(`CHANGELOG.md must contain a heading for version ${pkg.version}.`)
}
if (lock.packages?.['']?.version !== pkg.version) {
  throw new Error(`package-lock.json version does not match package.json version ${pkg.version}.`)
}
const releaseTag = process.env.GITHUB_REF_NAME
if (releaseTag && releaseTag.startsWith('v') && releaseTag !== `v${pkg.version}`) {
  throw new Error(`Release tag ${releaseTag} does not match package.json version ${pkg.version}.`)
}
console.log(`Version ${pkg.version} is valid and has a CHANGELOG.md entry.`)
