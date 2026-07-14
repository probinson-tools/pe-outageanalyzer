'use client';
import { useEffect } from 'react';

/**
 * pe-commandcenter links here with embedded Basic Auth credentials
 * (https://user:pass@host/...). The browser keeps those credentials as
 * part of window.location for the loaded document, which makes any
 * same-origin fetch() of a relative URL fail with "is an url with
 * embedded credentials." The browser already cached the Basic Auth for
 * this origin from the initial navigation, so it's safe to strip the
 * userinfo from the visible URL without re-authenticating.
 */
export default function StripUrlCredentials() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.username || url.password) {
      url.username = '';
      url.password = '';
      window.history.replaceState(null, '', url.toString());
    }
  }, []);

  return null;
}
