/**
 * Google sign-in in the browser, per ADR 0002.
 *
 * Uses Google Identity Services' token flow: no client secret, no redirect, a
 * short-lived access token held in memory only. When the token expires the next
 * request asks for a fresh one, silently if Google still has consent.
 */

/** Anything that can supply a current access token. Lets the gateway be tested
    without a browser or a Google account. */
export interface TokenProvider {
  getToken(): Promise<string>;
  /** Drop the cached token so the next call re-asks Google. */
  forget(): void;
}

/** Access only to files this app created — the narrow scope from ADR 0002,
    held by ADR 0004. */
export const SCOPE = 'https://www.googleapis.com/auth/drive.file';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}

interface GoogleIdentityServices {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
        error_callback?: (error: { type?: string }) => void;
      }): TokenClient;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client';

/** Load the Google Identity Services script once. */
function loadGis(): Promise<GoogleIdentityServices> {
  if (window.google) return Promise.resolve(window.google);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    const script = existing ?? document.createElement('script');
    script.addEventListener('load', () => {
      const gis = window.google;
      if (gis) resolve(gis);
      else reject(new Error('Google Identity Services loaded but did not appear'));
    });
    script.addEventListener('error', () =>
      reject(new Error('could not load Google sign-in — check the network')),
    );
    if (!existing) {
      script.src = GIS_SRC;
      script.async = true;
      document.head.append(script);
    }
  });
}

/** Tokens are refreshed this many milliseconds before they actually expire, so
    a request never leaves with a token that dies in flight. */
const EXPIRY_MARGIN_MS = 60_000;

export class GoogleTokenProvider implements TokenProvider {
  private token: string | null = null;
  private expiresAt = 0;
  private pending: Promise<string> | null = null;

  constructor(private readonly clientId: string) {}

  forget(): void {
    this.token = null;
    this.expiresAt = 0;
  }

  getToken(): Promise<string> {
    if (this.token && Date.now() < this.expiresAt) return Promise.resolve(this.token);
    // Several parallel requests must share one sign-in prompt, not queue five.
    this.pending ??= this.request().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async request(): Promise<string> {
    const gis = await loadGis();
    return new Promise<string>((resolve, reject) => {
      const client = gis.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: SCOPE,
        callback: (response) => {
          if (!response.access_token) {
            reject(new Error(response.error ?? 'sign-in did not return a token'));
            return;
          }
          this.token = response.access_token;
          this.expiresAt = Date.now() + (response.expires_in ?? 3600) * 1000 - EXPIRY_MARGIN_MS;
          resolve(response.access_token);
        },
        error_callback: (error) => {
          reject(new Error(`sign-in failed or was dismissed (${error.type ?? 'unknown'})`));
        },
      });
      client.requestAccessToken();
    });
  }
}
