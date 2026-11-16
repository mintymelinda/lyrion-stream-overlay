const config = require("./config");

function decode(value = "") {
  try {
    return decodeURIComponent(String(value).replace(/\+/g, "%20"));
  } catch {
    return String(value);
  }
}

class LyrionClient {
  constructor(host, port = config.lyrionHttpPort) {
    this.host = host;
    this.port = port;
    this.baseUrl = `http://${host.includes(":") && !host.startsWith("[") ? `[${host}]` : host}:${port}`;
  }

  async request(playerId, command, timeoutMs = 3500) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const headers = { "content-type": "application/json" };
    if (config.username || config.password) {
      headers.authorization = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;
    }

    try {
      const response = await fetch(`${this.baseUrl}/jsonrpc.js`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          id: 1,
          method: "slim.request",
          params: [playerId || 0, command],
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Lyrion HTTP ${response.status}`);
      const payload = await response.json();
      if (payload.error) throw new Error(String(payload.error));
      return payload.result || {};
    } finally {
      clearTimeout(timeout);
    }
  }

  async serverName() {
    const result = await this.request(0, ["serverstatus", "0", "1"]);
    return decode(result._server_name || result.server_name || result.name || this.host);
  }

  async players() {
    const result = await this.request(0, ["players", "0", "100"]);
    const list = result.players_loop || result.players || [];
    return Array.isArray(list) ? list : [];
  }

  async status(playerId) {
    const result = await this.request(playerId, ["status", "-", "1", "tags:gal"]);
    return {
      title: decode(result.title || result.current_title || ""),
      artist: decode(result.artist || ""),
      album: decode(result.album || ""),
      mode: result.mode || "stop",
      elapsed: Math.max(0, Number(result.time) || 0),
      duration: Math.max(0, Number(result.duration) || 0),
      trackId: String(result.id || result.track_id || ""),
      updatedAt: Date.now(),
    };
  }

  artworkUrl(playerId) {
    return `${this.baseUrl}/music/current/cover.jpg?player=${encodeURIComponent(playerId)}`;
  }
}

module.exports = { LyrionClient, decode };
