/**
 * HttpClient transport: HTTP/1.1, identified user agent, redirect modes, non-2xx returned.
 * Local servers only. Run: npm test
 */
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { errorMessage, HttpClient } from "./fetch.mjs";

const USER_AGENT = "NortheastFlankMonitor-collector/0.1";

type Seen = { url: string | undefined; userAgent: string | undefined; acceptEncoding: string | undefined };

function listen(handler: (req: IncomingMessage, res: ServerResponse, seen: Seen[]) => void): Promise<{ server: Server; origin: string; seen: Seen[] }> {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    seen.push({
      url: req.url,
      userAgent: req.headers["user-agent"],
      acceptEncoding: req.headers["accept-encoding"],
    });
    handler(req, res, seen);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, origin: `http://127.0.0.1:${port}`, seen });
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

function client(): HttpClient {
  return new HttpClient(USER_AGENT, 5_000, 0);
}

test("follow lands on the final body; same-host stops at another host; non-2xx is returned", async () => {
  const final = await listen((req, res) => {
    res.writeHead(req.url === "/robots.txt" ? 404 : 200, { "Content-Type": "text/plain" });
    res.end(req.url === "/robots.txt" ? "" : "arrived");
  });
  const start = await listen((req, res) => {
    if (req.url === "/robots.txt") {
      res.writeHead(404);
      res.end();
      return;
    }
    if (req.url === "/go") {
      res.writeHead(302, { Location: `${final.origin}/page` });
      res.end("redirect-body");
      return;
    }
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("denied");
  });

  try {
    const http = client();
    const followed = await http.get(`${start.origin}/go`);
    assert.equal(followed.status, 200);
    assert.equal(followed.body, "arrived");
    assert.equal(final.seen.filter((s) => s.url === "/page").length, 1);

    const stopped = await http.get(`${start.origin}/go`, { redirect: "same-host" });
    assert.equal(stopped.status, 302);
    assert.equal(stopped.body, "redirect-body");
    assert.equal(final.seen.filter((s) => s.url === "/page").length, 1, "a cross-host redirect is not followed");

    const denied = await http.get(`${start.origin}/missing`);
    assert.deepEqual(denied, { status: 403, body: "denied" });

    const requests = [...start.seen, ...final.seen];
    assert.ok(requests.every((s) => s.userAgent === USER_AGENT));
    assert.ok(requests.every((s) => s.acceptEncoding === undefined));
  } finally {
    await close(start.server);
    await close(final.server);
  }
});

test("a request that never answers is reported as timed out", async () => {
  const hung = await listen((req, res) => {
    if (req.url === "/robots.txt") {
      res.writeHead(404);
      res.end();
    }
  });
  try {
    const http = new HttpClient(USER_AGENT, 200, 0);
    await assert.rejects(() => http.get(`${hung.origin}/page`), (error: unknown) => {
      assert.equal(errorMessage(error), "request timed out");
      return true;
    });
  } finally {
    await close(hung.server);
  }
});
