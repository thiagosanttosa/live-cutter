import assert from 'node:assert/strict'
import test from 'node:test'
import { isAllowedNavigation } from '../electron/services/navigation-policy.service.ts'

const appEntry = 'file:///C:/Program%20Files/LIVE%20CUTTER/dist/index.html'

test('navigation policy permits only the packaged app entry in the main frame', () => {
  assert.equal(isAllowedNavigation(appEntry, appEntry, undefined, true), true)
  assert.equal(isAllowedNavigation('file:///C:/Users/test/other.html', appEntry, undefined, true), false)
  assert.equal(isAllowedNavigation('file://attacker.invalid/page.html', appEntry, undefined, true), false)
  assert.equal(isAllowedNavigation(appEntry, appEntry, undefined, false), false)
})

test('development navigation stays on the configured Vite origin and main frame', () => {
  const devServer = 'http://localhost:5173'
  assert.equal(isAllowedNavigation(`${devServer}/`, appEntry, devServer, true), true)
  assert.equal(isAllowedNavigation('http://attacker.invalid/', appEntry, devServer, true), false)
  assert.equal(isAllowedNavigation(`${devServer}/`, appEntry, devServer, false), false)
  assert.equal(isAllowedNavigation('not a URL', appEntry, devServer, true), false)
})
