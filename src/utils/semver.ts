interface ParsedVersion { major: number; minor: number; patch: number; prerelease: (string | number)[] }

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

function parseVersion(value: string): ParsedVersion | null {
  const match = VERSION_PATTERN.exec(value)
  if (!match) return null
  const numeric = match.slice(1, 4).map(Number)
  if (numeric.some((part) => !Number.isSafeInteger(part))) return null
  const prerelease = match[4]?.split('.').map((part) => {
    if (/^\d+$/.test(part)) return part.length > 1 && part.startsWith('0') ? null : Number(part)
    return part
  }) ?? []
  if (prerelease.some((part) => part === null || (typeof part === 'number' && !Number.isSafeInteger(part)))) return null
  return { major: numeric[0], minor: numeric[1], patch: numeric[2], prerelease: prerelease as (string | number)[] }
}

export function isSemanticVersion(value: string): boolean { return parseVersion(value) !== null }

export function compareSemanticVersions(leftValue: string, rightValue: string): number {
  const left = parseVersion(leftValue)
  const right = parseVersion(rightValue)
  if (!left || !right) throw new Error('Both values must be valid Semantic Versioning versions.')
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1
  }
  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    if (left.prerelease.length === right.prerelease.length) return 0
    return left.prerelease.length === 0 ? 1 : -1
  }
  const length = Math.max(left.prerelease.length, right.prerelease.length)
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.prerelease[index]
    const rightPart = right.prerelease[index]
    if (leftPart === undefined || rightPart === undefined) return leftPart === rightPart ? 0 : leftPart === undefined ? -1 : 1
    if (leftPart === rightPart) continue
    if (typeof leftPart === 'number' && typeof rightPart !== 'number') return -1
    if (typeof leftPart !== 'number' && typeof rightPart === 'number') return 1
    return leftPart < rightPart ? -1 : 1
  }
  return 0
}
