// Resolves the websocket URL for the current page (dev proxy or prod same-origin).
export function wsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}
