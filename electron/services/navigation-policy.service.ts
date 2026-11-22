export function isAllowedNavigation(
  target: string,
  appEntryUrl: string,
  devServerUrl: string | undefined,
  isMainFrame: boolean,
): boolean {
  if (!isMainFrame) return false
  if (!devServerUrl) return target === appEntryUrl
  try {
    return new URL(target).origin === new URL(devServerUrl).origin
  } catch {
    return false
  }
}
