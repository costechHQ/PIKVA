import { type NextRequest, NextResponse } from "next/server";

import { contentSecurityPolicy, newNonce } from "@/lib/csp";

/**
 * Give every page view a fresh nonce and a strict Content Security Policy
 * (SRS 21.1). Next.js reads the nonce from the request's policy and adds it
 * to its own scripts; _document passes it on as well. The other security
 * headers stay in next.config.ts.
 */
export function proxy(request: NextRequest) {
  const nonce = newNonce();
  const policy = contentSecurityPolicy(nonce, process.env.NODE_ENV === "development");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: not API answers (JSON) or static files.
      source: "/((?!api|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
