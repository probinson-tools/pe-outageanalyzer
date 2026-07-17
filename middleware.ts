import { NextRequest, NextResponse } from 'next/server';

function isAuthorized(request: NextRequest): boolean {
  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;

  if (!user || !password) return true;

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Basic ')) return false;

  // Malformed Authorization headers (e.g. from scanners/bots probing the
  // site) make atob() throw — treat that as unauthorized rather than
  // crashing the whole middleware invocation.
  try {
    const [reqUser, reqPassword] = atob(authHeader.slice('Basic '.length)).split(':');
    return reqUser === user && reqPassword === password;
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  if (isAuthorized(request)) {
    // Links from pe-commandcenter embed credentials and carry a ?login=1
    // marker. Redirect to the same URL without the marker: the Location
    // header has no userinfo, so the browser loads the page from a clean
    // URL and no asset request carries embedded credentials.
    if (request.nextUrl.searchParams.has('login')) {
      const url = request.nextUrl.clone();
      url.searchParams.delete('login');
      // A Location-header redirect can't be used here: Next/Vercel rewrite
      // same-origin Locations to relative ("/"), and browsers resolve a
      // relative Location against the credentialed URL, carrying the
      // userinfo over. Instead serve a tiny interstitial that client-side
      // replaces the URL with the absolute clean one. Build the public
      // origin from forwarded headers (nextUrl can report the internal
      // host behind Vercel's proxy).
      const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
      const host =
        request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host;
      const clean = `${proto}://${host}${url.pathname}${url.search}`;
      const attr = clean.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      const html = `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${attr}"><script>location.replace(${JSON.stringify(clean)})</script></head><body><a href="${attr}">Continue</a></body></html>`;
      return new NextResponse(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
    return NextResponse.next();
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Outage Analyzer"' },
  });
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
};
