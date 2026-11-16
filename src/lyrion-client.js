const config = require("./config");

const READ_ONLY_COMMANDS = new Set([
  JSON.stringify(["serverstatus", "0", "1"]),
  JSON.stringify(["pref", "servername", "?"]),
  JSON.stringify(["players", "0", "100"]),
  JSON.stringify(["status", "-", "1", "tags:galtd"]),
]);

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

  async #query(playerId, command, timeoutMs = 3500) {
    if (!READ_ONLY_COMMANDS.has(JSON.stringify(command))) {
      throw new Error("Unsupported Lyrion query; only approved read-only operations are allowed");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/jsonrpc.js`, {
        method: "POST",
        headers: { "content-type": "application/json" },
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

  async serverInfo() {
    const status = await this.#query(0, ["serverstatus", "0", "1"]);
    let preference = {};
    try {
      preference = await this.#query(0, ["pref", "servername", "?"]);
    } catch {
      // Server naming is optional; UUID and player discovery remain usable.
    }

    const name = status.servername || status.server_name || status.name ||
      preference._ || preference.value || preference.servername || this.host;
    const uuid = status.uuid || status.server_uuid || "";

    return {
      name: decode(name),
      uuid: String(uuid).trim(),
    };
  }

  async serverName() {
    return (await this.serverInfo()).name;
  }

  async players() {
    const result = await this.#query(0, ["players", "0", "100"]);
    const list = result.players_loop || result.players || [];
    return Array.isArray(list) ? list : [];
  }

  async status(playerId) {
    const result = await this.#query(playerId, ["status", "-", "1", "tags:galtd"]);
    const current = Array.isArray(result.playlist_loop) ? result.playlist_loop[0] || {} : {};
    return {
      title: decode(result.title || current.title || result.current_title || ""),
      artist: decode(result.artist || current.artist || ""),
      album: decode(result.album || current.album || ""),
      mode: result.mode || "stop",
      elapsed: Math.max(0, Number(result.time) || 0),
      duration: Math.max(0, Number(result.duration || current.duration) || 0),
      trackId: String(result.id || current.id || result.track_id || ""),
      updatedAt: Date.now(),
    };
  }

  artworkUrl(playerId) {
    return `${this.baseUrl}/music/current/cover.jpg?player=${encodeURIComponent(playerId)}`;
  }
}

module.exports = { LyrionClient, decode };
