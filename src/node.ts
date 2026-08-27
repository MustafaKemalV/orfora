/**
 * A Node adapter for the fetch-style gateway handler. `orforaHandler` is a Web
 * `(Request) => Promise<Response>`, which drops onto Vercel edge, Bun, and Deno as-is;
 * Node's http server (and Express / Fastify) speaks `IncomingMessage`/`ServerResponse`
 * instead. `toNodeHandler` bridges the two, including streaming responses.
 *
 *   import { createServer } from "node:http";
 *   import { orforaHandler } from "orfora/gateway";
 *   import { toNodeHandler } from "orfora/node";
 *   createServer(toNodeHandler(orforaHandler({ embed, forward }))).listen(3000);
 */

import type { IncomingMessage, ServerResponse } from "node:http";

/** Build a Web Request from a Node IncomingMessage (headers, method, and body). */
async function nodeToWebRequest(req: IncomingMessage): Promise<Request> {
  const host = req.headers.host ?? "localhost";
  const url = `http://${host}${req.url ?? "/"}`;
  const method = req.method ?? "GET";

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else if (value !== undefined) headers.set(key, value);
  }

  let body: Buffer | undefined;
  if (method !== "GET" && method !== "HEAD") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    body = Buffer.concat(chunks);
  }

  return new Request(url, {
    method,
    headers,
    body: body && body.length > 0 ? body : undefined,
  });
}

/** Write a Web Response back to a Node ServerResponse, streaming the body through. */
async function webResponseToNode(
  response: Response,
  res: ServerResponse,
): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  if (!response.body) {
    res.end();
    return;
  }
  const reader = response.body.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) res.write(Buffer.from(value));
  }
  res.end();
}

/**
 * Wraps a fetch-style handler (like `orforaHandler`) into a Node request listener, so it
 * mounts on `http.createServer`, Express, or Fastify. Streaming responses (SSE) pass
 * through chunk by chunk. The returned function is async, but Node ignores its return
 * value; it is awaitable so callers and tests can wait for completion.
 */
export function toNodeHandler(
  handler: (request: Request) => Promise<Response>,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    try {
      const request = await nodeToWebRequest(req);
      const response = await handler(request);
      await webResponseToNode(response, res);
    } catch {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
      }
      res.end(
        JSON.stringify({
          error: { message: "internal error", type: "orfora_node_error" },
        }),
      );
    }
  };
}
