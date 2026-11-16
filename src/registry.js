const { LyrionClient } = require("./lyrion-client");
const { discoverServers } = require("./discovery");

const slug = (value) => String(value || "")
  .trim()
  .replace(/[^\p{L}\p{N}._ -]/gu, "")
  .replace(/\s+/g, "-") || "Lyrion-Server";

class Registry {
  constructor() {
    this.servers = new Map();
    this.timer = null;
  }

  async scan() {
    const candidates = await discoverServers();
    const next = new Map();

    await Promise.all(candidates.map(async ({ host, port }) => {
      const client = new LyrionClient(host, port);
      try {
        const [name, players] = await Promise.all([client.serverName(), client.players()]);
        const serverKey = slug(name);
        const server = { name, key: serverKey, host, port, client, players: new Map() };

        for (const player of players) {
          const playerId = player.playerid || player.player_id || player.id;
          const playerName = player.name || player.player_name || playerId;
          if (!playerId || player.isplayer === "0") continue;
          const key = slug(playerName);
          server.players.set(key, {
            id: String(playerId),
            name: String(playerName),
            key,
            connected: String(player.connected ?? player.player_connected ?? "1") !== "0",
          });
        }
        next.set(serverKey, server);
      } catch (error) {
        console.warn(`[discovery] ${host}:${port} unavailable: ${error.message}`);
      }
    }));

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

module.exports = { Registry };
