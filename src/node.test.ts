import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import { toNodeHandler } from "./node";

function mockReq(method: string, url: string, body: string): IncomingMessage {
  const req = {
    method,
    url,
    headers: { host: "localhost", "content-type": "application/json" },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(body);
    },
  };
  return req as unknown as IncomingMessage;
}

function mockRes() {
  return {
    statusCode: 0,
    headers: {} as Record<string, string>,
    chunks: [] as Buffer[],
    headersSent: false,
    setHeader(k: string, v: string) {
      this.headers[k.toLowerCase()] = v;
    },
    write(c: Uint8Array) {
      this.chunks.push(Buffer.from(c));
      return true;
    },
    end(c?: Uint8Array) {
      if (c) this.chunks.push(Buffer.from(c));
    },
    body() {
      return Buffer.concat(this.chunks).toString();
    },
  };
}

describe("toNodeHandler", () => {
  it("adapts a Node request/response to a fetch handler", async () => {
    let seenUrl = "";
    let seenBody = "";
    const handler = toNodeHandler(async (request) => {
      seenUrl = request.url;
      seenBody = await request.text();
      return new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    });
    const res = mockRes();
    await handler(
      mockReq("POST", "/v1/chat/completions", '{"a":1}'),
      res as unknown as ServerResponse,
    );
    expect(seenUrl).toContain("/v1/chat/completions");
    expect(seenBody).toBe('{"a":1}');
    expect(res.statusCode).toBe(201);
    expect(res.headers["content-type"]).toBe("application/json");
    expect(res.body()).toContain("ok");
  });

  it("streams a chunked response body through to the Node response", async () => {
    const handler = toNodeHandler(async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const enc = new TextEncoder();
          controller.enqueue(enc.encode("data: a\n\n"));
          controller.enqueue(enc.encode("data: b\n\n"));
          controller.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    });
    const res = mockRes();
    await handler(mockReq("POST", "/", "{}"), res as unknown as ServerResponse);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("text/event-stream");
    expect(res.body()).toBe("data: a\n\ndata: b\n\n");
  });
});
