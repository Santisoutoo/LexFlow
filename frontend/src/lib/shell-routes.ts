/**
 * Route predicates for shell chrome that must stay honest.
 *
 * Right-rail toggle and print/export only apply on surfaces that actually
 * mount a rail or render printable document content.
 */

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * True when the current page mounts a contextual `<RightRail>`.
 *
 * Law detail + diff share `/laws/…`; graph is `/graph`; chat includes
 * `/chat/:threadId`.
 */
export function hasContextualRightRail(pathname: string): boolean {
  return pathname.startsWith('/laws/') || matchesPrefix(pathname, '/graph') || matchesPrefix(pathname, '/chat');
}

const PRINTABLE_EXACT = new Set([
  '/',
  '/home',
  '/explorer',
  '/search',
  '/settings',
  '/dashboards',
  '/editor',
  '/communities',
]);

const PRINTABLE_PREFIXES = ['/explorer', '/search', '/settings', '/dashboards', '/editor', '/laws', '/communities'];

/**
 * True when `window.print()` is a useful "export page as PDF".
 *
 * Canvas (`/graph`) and the chat transcript are not printable documents —
 * the palette omits the command there instead of lying.
 */
export function isPrintableRoute(pathname: string): boolean {
  if (PRINTABLE_EXACT.has(pathname)) return true;
  return PRINTABLE_PREFIXES.some((prefix) => pathname.startsWith(`${prefix}/`));
}
