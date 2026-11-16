const config = require("./config");
const { LyrionClient } = require("./lyrion-client");
const { discoverServers } = require("./discovery");

const slug = (value) => String(value || "")
  .trim()
  .replace(/[^\p{L}\p{N}._ -]/gu, "")
  .replace(/\s+/g, "-") || "Lyrion-Server";

class Registry {
  constructor({
    discover = discoverServers,
    createClient = (host, port) => new LyrionClient(host, port),
    serverNameOverride = config.lyrionServerName,
  } = {}) {
    this.discover = discover;
    this.createClient = createClient;
    this.serverNameOverride = serverNameOverride;
    this.servers = new Map();
    this.timer = null;
  }

  async scan() {
    const candidates = await this.discover();
    const resolved = await Promise.all(candidates.map(async ({ host, port, source = "broadcast" }) => {
      const client = this.createClient(host, port);
      try {
        const [info, players] = await Promise.all([client.serverInfo(), client.players()]);
        const name = this.serverNameOverride || info.name || host;
        const uuid = String(info.uuid || "").trim().toLowerCase();
        const identity = uuid || `${host.toLowerCase()}:${port}`;
        const playerMap = new Map();

        for (const player of players) {
          const playerId = player.playerid || player.player_id || player.id;
          const playerName = player.name || player.player_name || playerId;
          if (!playerId || player.isplayer === "0" || player.isplayer === 0) continue;
          const key = slug(playerName);
          playerMap.set(key, {
            id: String(playerId),
            name: String(playerName),
            key,
            connected: String(player.connected ?? player.player_connected ?? "1") !== "0",
          });
        }

        return {
          identity,
          source,
          name,
          uuid,
          host,
          port,
          client,
          players: playerMap,
        };
      } catch (error) {
        console.warn(`[discovery] ${host}:${port} unavailable: ${error.message}`);
        return null;
      }
    }));

    const byIdentity = new Map();
    for (const server of resolved.filter(Boolean)) {
      const existing = byIdentity.get(server.identity);
      if (!existing || (server.source === "configured" && existing.source !== "configured")) {
        byIdentity.set(server.identity, server);
      }
    }

    const next = new Map();
    for (const server of byIdentity.values()) {
      let key = slug(server.name);
      if (next.has(key)) key = `${key}-${server.uuid.slice(0, 8) || slug(server.host)}`;
      server.key = key;
      next.set(key, server);
    }

    this.servers = next;
    return this.list();
  }

  start(intervalMs) {
    this.scan().catch((error) => console.error("[discovery]", error));
    this.timer = setInterval(() => {
      this.scan().catch((error) => console.error("[discovery]", error));
    }, intervalMs);
    this.timer.unref();
  }

  list() {
    return [...this.servers.values()].map((server) => ({
      name: server.name,
      key: server.key,
      players: [...server.players.values()].map(({ name, key, connected }) => ({ name, key, connected })),
    }));
  }

  find(serverKey, playerKey) {
    const server = this.servers.get(serverKey);
    const player = server?.players.get(playerKey);
    return server && player ? { server, player } : null;
  }
}

module.exports = { Registry, slug };
