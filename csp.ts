/**
 * The Content-Security-Policy the production build ships with.
 *
 * It is written into index.html as a <meta> tag at build time (GitHub Pages
 * cannot send response headers). The privacy test reads this same list, so the
 * policy that is tested is the policy that is shipped.
 *
 * `connect-src 'none'` is the line that matters most: it blocks fetch, XHR,
 * WebSocket, EventSource and sendBeacon. `worker-src 'none'` is there because
 * a worker loaded from a file does not inherit a <meta> policy, so the app
 * uses no workers at all.
 */
export const CSP_DIRECTIVES: Readonly<Record<string, string>> = {
  'default-src': "'none'",
  'script-src': "'self'",
  'style-src': "'self'",
  'img-src': "'self'",
  'font-src': "'self'",
  'connect-src': "'none'",
  'worker-src': "'none'",
  'object-src': "'none'",
  'base-uri': "'none'",
  'form-action': "'none'",
};

export const CSP = Object.entries(CSP_DIRECTIVES)
  .map(([name, value]) => `${name} ${value}`)
  .join('; ');
