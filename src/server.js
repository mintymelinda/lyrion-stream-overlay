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

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function sendOverlay(response) {
  fs.readFile(path.join(publicDir, "index.html"), (error, contents) => {
    if (error) {
      response.writeHead(500).end("Overlay unavailable");
      return;
    }
    response.writeHead(200, { "content-type": mime[".html"], "cache-control": "no-cache" });
    response.end(contents);
  });
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
      const artwork = await fetch(match.server.client.artworkUrl(match.player.id), { signal: AbortSignal.timeout(5000) });
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

  const segments = url.pathname.split("/").filter(Boolean).map((part) => {
    try { return decodeURIComponent(part); } catch { return ""; }
  });
  if (segments.length === 1) {
    const serverEntry = registry.list().find((item) => item.key.toLowerCase() === segments[0].toLowerCase());
    if (serverEntry) {
      const links = serverEntry.players.map((player) =>
        `<li><a href="/${encodeURIComponent(serverEntry.key)}/${encodeURIComponent(player.key)}">${escapeHtml(player.name)}</a><span>${player.connected ? "Connected" : "Disconnected"}</span></li>`,
      ).join("");
      const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(serverEntry.name)} · Lyrion Overlay</title><style>body{margin:0;padding:32px;background:#11151c;color:#f5f7fb;font:16px system-ui,sans-serif}main{max-width:680px;margin:auto}h1{font-size:24px}ul{padding:0;list-style:none}li{display:flex;justify-content:space-between;gap:16px;padding:14px 0;border-bottom:1px solid #343b48}a{color:#fff;text-decoration:none;font-weight:600}span{color:#aab3c2;font-size:13px}</style></head><body><main><h1>${escapeHtml(serverEntry.name)}</h1><p>Select a player to open its browser overlay.</p><ul>${links || "<li>No players found yet.</li>"}</ul></main></body></html>`;
      response.writeHead(200, { "content-type": mime[".html"], "cache-control": "no-store" });
      response.end(html);
      return;
    }
  }
  if (segments.length === 2) return sendOverlay(response);

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
