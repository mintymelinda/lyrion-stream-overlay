const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const config = require("./config");
const { Registry } = require("./registry");

const registry = new Registry();
const publicDir = path.resolve(__dirname, "../public");
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

function decodePathPart(value) {
  try { return decodeURIComponent(value); } catch { return ""; }
}

async function handle(request, response) {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname === "/health") return sendJson(response, 200, { status: "ok" });
  if (url.pathname === "/api/servers") return sendJson(response, 200, registry.list());

  if (url.pathname === "/api/track") {
    const match = registry.find(url.searchParams.get("server"), url.searchParams.get("player"));
    if (!match) return sendJson(response, 404, { error: "Server or player not found" });
    try {
      const track = await match.server.client.status(match.player.id);
      track.artwork = `/api/art?server=${encodeURIComponent(match.server.key)}&player=${encodeURIComponent(match.player.key)}&v=${encodeURIComponent(track.trackId || track.title)}`;
      track.server = match.server.name;
      track.player = match.player.name;
      return sendJson(response, 200, track);
    } catch (error) {
      return sendJson(response, 502, { error: "Unable to read player status", detail: error.message });
    }
  }

  if (url.pathname === "/api/art") {
    const match = registry.find(url.searchParams.get("server"), url.searchParams.get("player"));
    if (!match) return sendJson(response, 404, { error: "Player not found" });
    try {
      const headers = {};
      if (config.username || config.password) {
        headers.authorization = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;
      }
      const artwork = await fetch(match.server.client.artworkUrl(match.player.id), { headers, signal: AbortSignal.timeout(5000) });
      if (!artwork.ok) return sendJson(response, 404, { error: "Artwork unavailable" });
      response.writeHead(artwork.status, {
        "content-type": artwork.headers.get("content-type") || "image/jpeg",
        "cache-control": "no-store",
      });
      return response.end(Buffer.from(await artwork.arrayBuffer()));
    } catch {
      return sendJson(response, 502, { error: "Artwork unavailable" });
    }
  }

  const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const filePath = path.resolve(publicDir, requested);
  if (!filePath.startsWith(publicDir + path.sep) && filePath !== path.join(publicDir, "index.html")) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, contents) => {
    if (error) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, {
      "content-type": mime[path.extname(filePath)] || "application/octet-stream",
      "cache-control": "no-cache",
    });
    response.end(contents);
  });
}

const server = http.createServer((request, response) => {
  handle(request, response).catch((error) => {
    console.error("[http]", error);
    if (!response.headersSent) sendJson(response, 500, { error: "Internal server error" });
    else response.destroy();
  });
});

server.listen(config.port, "0.0.0.0", () => {
  console.log(`Lyrion Stream Overlay listening on :${config.port}`);
  registry.start(config.discoveryIntervalMs);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
