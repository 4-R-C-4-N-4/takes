// Minimal hash router: '#/screen/param'.
export type Route = { screen: 'library' | 'builder' | 'profiles' | 'lobby' | 'game' | 'join'; param?: string };

export function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '');
  const [screen, param] = clean.split('/');
  const valid = ['library', 'builder', 'profiles', 'lobby', 'game', 'join'];
  if (screen && valid.includes(screen)) return { screen: screen as Route['screen'], param };
  return { screen: 'library' };
}

export function routeHref(screen: Route['screen'], param?: string): string {
  return `#/${screen}${param ? `/${param}` : ''}`;
}
