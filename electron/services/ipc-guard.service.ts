export function isTrustedRenderer(
  mainSender: unknown,
  sender: unknown,
  windowDestroyed: boolean,
  senderFrame: unknown,
  mainFrame: unknown,
): boolean {
  return mainSender !== null && mainSender !== undefined && !windowDestroyed
    && sender === mainSender && senderFrame !== null && senderFrame !== undefined
    && mainFrame !== null && mainFrame !== undefined && senderFrame === mainFrame
}
