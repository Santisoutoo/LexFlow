import { describe, expect, it } from 'vitest';

import { consumeSse, StreamIdleTimeoutError } from './chat';

describe('consumeSse idle timeout', () => {
  it('rejects when the stream stalls beyond the idle window', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: text\ndata: {"delta":"x"}\n\n'));
      },
      pull() {
        return new Promise(() => {
          /* never resolves — simulates a hung provider */
        });
      },
    });

    await expect(async () => {
      for await (const chunk of consumeSse(stream, undefined, 50)) {
        void chunk;
      }
    }).rejects.toBeInstanceOf(StreamIdleTimeoutError);
  });
});
