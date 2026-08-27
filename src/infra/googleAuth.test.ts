/**
 * @vitest-environment jsdom
 *
 * Google sign-in. The real thing needs a browser, a Google account and a popup
 * a test cannot click, so Google Identity Services is stubbed at the boundary
 * the module already declares: `window.google`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleTokenProvider, SCOPE } from './googleAuth';

const GIS_SRC = 'https://accounts.google.com/gsi/client';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

/** What `googleAuth` passes to `initTokenClient`. Restated here because the
    module keeps its Google types private, and the stub is cast into place. */
interface TokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: TokenResponse) => void;
  error_callback?: (error: { type?: string }) => void;
}

/** A stand-in for Google Identity Services that answers whatever the test
    says, and counts how many times it was asked. */
class GisStub {
  prompts = 0;
  scopes: string[] = [];
  clientIds: string[] = [];
  private answer: (
    respond: (response: TokenResponse) => void,
    fail: (type: string) => void,
  ) => void;

  constructor(
    answer: (respond: (response: TokenResponse) => void, fail: (type: string) => void) => void = (
      respond,
    ) => {
      respond({ access_token: 'tok', expires_in: 3600 });
    },
  ) {
    this.answer = answer;
  }

  /** Change what the next prompt replies with. */
  answersWith(
    answer: (respond: (response: TokenResponse) => void, fail: (type: string) => void) => void,
  ): void {
    this.answer = answer;
  }

  install(): void {
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: (config: TokenClientConfig) => {
            this.scopes.push(config.scope);
            this.clientIds.push(config.client_id);
            return {
              requestAccessToken: () => {
                this.prompts += 1;
                this.answer(config.callback, (type) => config.error_callback?.({ type }));
              },
            };
          },
        },
      },
    } as unknown as Window['google'];
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-27T09:00:00+08:00'));
  delete window.google;
  document.head.replaceChildren();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('asking Google for a token', () => {
  it('returns the token the popup came back with', async () => {
    const gis = new GisStub();
    gis.install();

    await expect(new GoogleTokenProvider('client-1').getToken()).resolves.toBe('tok');
    expect(gis.prompts).toBe(1);
  });

  it('asks for the narrow scope, under the id it was built with', async () => {
    const gis = new GisStub();
    gis.install();

    await new GoogleTokenProvider('client-1').getToken();

    expect(gis.scopes).toEqual([SCOPE]);
    expect(gis.clientIds).toEqual(['client-1']);
  });

  it('keeps the token rather than prompting again', async () => {
    const gis = new GisStub();
    gis.install();
    const provider = new GoogleTokenProvider('client-1');

    await provider.getToken();
    await expect(provider.getToken()).resolves.toBe('tok');

    expect(gis.prompts).toBe(1);
  });

  it('shows one prompt for requests that arrive together, not one each', async () => {
    // Five parallel requests behind a single sign-in: queueing five popups is
    // the failure this guards.
    const gis = new GisStub();
    gis.install();
    const provider = new GoogleTokenProvider('client-1');

    const tokens = await Promise.all([
      provider.getToken(),
      provider.getToken(),
      provider.getToken(),
      provider.getToken(),
      provider.getToken(),
    ]);

    expect(tokens).toEqual(['tok', 'tok', 'tok', 'tok', 'tok']);
    expect(gis.prompts).toBe(1);
  });
});

describe('when a token goes stale', () => {
  it('re-asks once the token has expired', async () => {
    const gis = new GisStub();
    gis.install();
    const provider = new GoogleTokenProvider('client-1');
    await provider.getToken();

    vi.advanceTimersByTime(3600 * 1000);
    await provider.getToken();

    expect(gis.prompts).toBe(2);
  });

  it('re-asks a minute early, so a token cannot die in flight', async () => {
    const gis = new GisStub();
    gis.install();
    const provider = new GoogleTokenProvider('client-1');
    await provider.getToken();

    // One second inside the margin: still good.
    vi.advanceTimersByTime((3600 - 60 - 1) * 1000);
    await provider.getToken();
    expect(gis.prompts).toBe(1);

    // One second past it: refreshed rather than handed out.
    vi.advanceTimersByTime(2000);
    await provider.getToken();
    expect(gis.prompts).toBe(2);
  });

  it('treats a reply with no expiry as lasting an hour', async () => {
    const gis = new GisStub((respond) => {
      respond({ access_token: 'tok' });
    });
    gis.install();
    const provider = new GoogleTokenProvider('client-1');
    await provider.getToken();

    vi.advanceTimersByTime((3600 - 60 - 1) * 1000);
    await provider.getToken();
    expect(gis.prompts).toBe(1);
  });

  it('re-asks after forget, even while the token would still be good', async () => {
    const gis = new GisStub();
    gis.install();
    const provider = new GoogleTokenProvider('client-1');
    await provider.getToken();

    provider.forget();
    await provider.getToken();

    expect(gis.prompts).toBe(2);
  });
});

describe('when sign-in does not produce a token', () => {
  it('reports the reason Google gave', async () => {
    const gis = new GisStub((respond) => {
      respond({ error: 'access_denied' });
    });
    gis.install();

    await expect(new GoogleTokenProvider('client-1').getToken()).rejects.toThrow('access_denied');
  });

  it('says so plainly when Google gave no reason', async () => {
    const gis = new GisStub((respond) => {
      respond({});
    });
    gis.install();

    await expect(new GoogleTokenProvider('client-1').getToken()).rejects.toThrow(
      'sign-in did not return a token',
    );
  });

  it('reports a dismissed popup, naming what happened', async () => {
    const gis = new GisStub((_respond, fail) => {
      fail('popup_closed');
    });
    gis.install();

    await expect(new GoogleTokenProvider('client-1').getToken()).rejects.toThrow(
      'sign-in failed or was dismissed (popup_closed)',
    );
  });

  it('still reports a failure that arrived with no type', async () => {
    const gis = new GisStub((_respond, fail) => {
      fail(undefined as unknown as string);
    });
    gis.install();

    await expect(new GoogleTokenProvider('client-1').getToken()).rejects.toThrow('(unknown)');
  });

  it('lets the next call try again after a failure', async () => {
    const gis = new GisStub((respond) => {
      respond({ error: 'access_denied' });
    });
    gis.install();
    const provider = new GoogleTokenProvider('client-1');

    await expect(provider.getToken()).rejects.toThrow('access_denied');
    gis.answersWith((respond) => {
      respond({ access_token: 'tok', expires_in: 3600 });
    });

    await expect(provider.getToken()).resolves.toBe('tok');
    expect(gis.prompts).toBe(2);
  });
});

describe('loading the Google script', () => {
  /** The script the module injected, once it has had a tick to inject it. */
  async function injectedScript(): Promise<HTMLScriptElement> {
    await Promise.resolve();
    const script = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (!script) throw new Error('no script was injected');
    return script;
  }

  it('injects the script when Google is not there yet, and waits for it', async () => {
    const provider = new GoogleTokenProvider('client-1');
    const pending = provider.getToken();

    const script = await injectedScript();
    expect(script.async).toBe(true);

    const gis = new GisStub();
    gis.install();
    script.dispatchEvent(new Event('load'));

    await expect(pending).resolves.toBe('tok');
  });

  it('injects the script once, however many callers are waiting', async () => {
    const provider = new GoogleTokenProvider('client-1');
    const pending = provider.getToken();
    await injectedScript();

    const gis = new GisStub();
    gis.install();
    document
      .querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`)
      ?.dispatchEvent(new Event('load'));
    await pending;

    expect(document.querySelectorAll(`script[src="${GIS_SRC}"]`)).toHaveLength(1);
  });

  it('blames the network when the script will not load', async () => {
    const provider = new GoogleTokenProvider('client-1');
    const pending = provider.getToken();

    (await injectedScript()).dispatchEvent(new Event('error'));

    await expect(pending).rejects.toThrow('could not load Google sign-in');
  });

  it('does not pretend to be signed in when the script loads but Google never appears', async () => {
    const provider = new GoogleTokenProvider('client-1');
    const pending = provider.getToken();

    (await injectedScript()).dispatchEvent(new Event('load'));

    await expect(pending).rejects.toThrow('did not appear');
  });

  it('waits on a script the page already has rather than adding a second', async () => {
    // index.html can carry the tag itself, and a second provider can arrive
    // while the first one's script is still in flight. Either way there is one
    // script, and this caller listens to it.
    const existing = document.createElement('script');
    existing.src = GIS_SRC;
    document.head.append(existing);

    const pending = new GoogleTokenProvider('client-1').getToken();
    await Promise.resolve();
    expect(document.querySelectorAll(`script[src="${GIS_SRC}"]`)).toHaveLength(1);

    new GisStub().install();
    existing.dispatchEvent(new Event('load'));

    await expect(pending).resolves.toBe('tok');
  });

  it('skips the script entirely when Google is already on the page', async () => {
    new GisStub().install();

    await new GoogleTokenProvider('client-1').getToken();

    expect(document.querySelectorAll(`script[src="${GIS_SRC}"]`)).toHaveLength(0);
  });
});
