/** A scripted `fetch` for tests: records every call, replies from a queue.
    Lets the Sheets transport be exercised with no network and no Google. */
import type { TokenProvider } from './googleAuth';
import type { FetchLike } from './sheetsApi';

export interface RecordedCall {
  url: string;
  method: string;
  body: unknown;
}

export interface StubReply {
  status?: number;
  body?: unknown;
}

export class FetchStub {
  readonly calls: RecordedCall[] = [];
  private readonly replies: StubReply[];

  constructor(replies: StubReply[] = []) {
    this.replies = [...replies];
  }

  readonly fetch: FetchLike = (url, init) => {
    const rawBody = init.body;
    this.calls.push({
      url,
      method: init.method ?? 'GET',
      body: typeof rawBody === 'string' ? JSON.parse(rawBody) : undefined,
    });
    const reply = this.replies.shift() ?? {};
    const status = reply.status ?? 200;
    return Promise.resolve(
      new Response(JSON.stringify(reply.body ?? {}), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  };
}

/** A TokenProvider that hands out predictable tokens and counts re-asks. */
export class StubTokens implements TokenProvider {
  forgotten = 0;
  private issued = 0;

  getToken(): Promise<string> {
    this.issued += 1;
    return Promise.resolve(`token-${this.issued}`);
  }

  forget(): void {
    this.forgotten += 1;
  }
}
