export function requestInstallConfirmation(version: string, confirm: (message: string) => boolean): boolean {
  return confirm(`Install LIVE CUTTER ${version} and restart the application now?`)
}
