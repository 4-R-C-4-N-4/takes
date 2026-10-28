// Minimal hash router: '#/screen/param'.
import { isStatic } from './target.js';

export type Route = { screen: 'library' | 'candidates' | 'builder' | 'profiles' | 'lobby' | 'game' | 'join'; param?: string };

// The Lab (candidates) screen doesn't exist in the static build: unknown/removed
// routes fall back to Play.
const VALID: Route['screen'][] = isStatic
  ? ['library', 'builder', 'profiles', 'lobby', 'game', 'join']
  : ['library', 'candidates', 'builder', 'profiles', 'lobby', 'game', 'join'];

export function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '');
  const [screen, param] = clean.split('/');
  if (screen && VALID.includes(screen as Route['screen'])) return { screen: screen as Route['screen'], param };
  return { screen: 'lobby' };
}

export function routeHref(screen: Route['screen'], param?: string): string {
  return `#/${screen}${param ? `/${param}` : ''}`;
}
