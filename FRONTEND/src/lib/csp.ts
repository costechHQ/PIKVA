/**
 * The Content Security Policy (SRS 21.1): only this site's scripts, and only
 * the ones Next.js marks with this request's nonce, may run, so injected
 * markup cannot run script. Used by src/proxy.ts.
 */

/** A fresh, unguessable nonce for one page view. */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * The policy for one page view. Development loosens only what the dev server
 * needs: React's eval-based debugging, and the dev server's own style tags.
 */
export function contentSecurityPolicy(nonce: string, isDev: boolean): string {
  const directives = [
    "default-src 'self'",
    // strict-dynamic: scripts the nonce'd scripts load (page chunks, the QR scanner) may run too.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Browsers ignore 'unsafe-inline' when a nonce is present, so dev uses it without one.
    isDev ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    // Pupil and pickup person photos may come from any https host; the parent QR is inline SVG.
    "img-src 'self' https: data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ];
  return directives.join("; ");
}
