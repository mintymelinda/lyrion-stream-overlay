const test = require("node:test");
const assert = require("node:assert/strict");
const { Registry } = require("../src/registry");

const serverUuid = "423047be-4c80-4b78-a845-8acf440ca965";
const players = [
  { playerid: "18:c0:4d:07:6c:90", name: "Mindy-PC", connected: 1, isplayer: 1 },
  { playerid: "b0:41:6f:0c:13:f4", name: "Squeezelite-X", connected: 1, isplayer: 1 },
];

function createClient(host, port, info = { name: host, uuid: serverUuid }) {
  return {
    host,
    port,
    serverInfo: async () => info,
    players: async () => players,
  };
}

test("registry deduplicates broadcast and configured addresses by Lyrion UUID", async () => {
  const registry = new Registry({
    discover: async () => [
      { host: "172.27.0.1", port: 9000, source: "broadcast" },
      { host: "192.168.0.128", port: 9000, source: "configured" },
    ],
    createClient: (host, port) => createClient(host, port),
  });

  const servers = await registry.scan();
  assert.equal(servers.length, 1);
  assert.equal(servers[0].name, "192.168.0.128");
  assert.equal(servers[0].players.length, 2);
  assert.equal(registry.find(servers[0].key, "Squeezelite-X").player.id, "b0:41:6f:0c:13:f4");
  assert.equal(registry.servers.get(servers[0].key).host, "192.168.0.128");
});

test("registry applies an explicit display-name override", async () => {
  const registry = new Registry({
    discover: async () => [{ host: "192.168.0.128", port: 9000, source: "configured" }],
    createClient: (host, port) => createClient(host, port, { name: host, uuid: serverUuid }),
    serverNameOverride: "BigStorageParty",
  });

  const servers = await registry.scan();
  assert.equal(servers.length, 1);
  assert.equal(servers[0].name, "BigStorageParty");
  assert.equal(servers[0].key, "BigStorageParty");
});

test("registry keeps distinct servers with the same display name addressable", async () => {
  const registry = new Registry({
    discover: async () => [
      { host: "192.0.2.10", port: 9000 },
      { host: "192.0.2.11", port: 9000 },
    ],
    createClient: (host, port) => createClient(host, port, {
      name: "Music Server",
      uuid: host.endsWith(".10") ? "server-one" : "server-two",
    }),
  });

  const servers = await registry.scan();
  assert.equal(servers.length, 2);
  assert.notEqual(servers[0].key, servers[1].key);
  assert.ok(servers.every((server) => server.name === "Music Server"));
});
