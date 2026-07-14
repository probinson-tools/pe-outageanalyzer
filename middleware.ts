import { NextRequest, NextResponse } from 'next/server';

function isAuthorized(request: NextRequest): boolean {
  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;

  if (!user || !password) return true;

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Basic ')) return false;

  const [reqUser, reqPassword] = atob(authHeader.slice('Basic '.length)).split(':');
  return reqUser === user && reqPassword === password;
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
      return NextResponse.redirect(url);
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
