const test = require("node:test");
const assert = require("node:assert/strict");
const { LyrionClient, decode } = require("../src/lyrion-client");

test("decode handles LMS percent-encoded metadata", () => {
  assert.equal(decode("The%20Clash%20%26%20The%20Damned"), "The Clash & The Damned");
  assert.equal(decode("plain+text"), "plain text");
});

test("status requests the full metadata tag set without authentication", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  let request;
  global.fetch = async (url, options) => {
    request = { url, body: JSON.parse(options.body), headers: options.headers };
    return {
      ok: true,
      json: async () => ({
        result: {
          mode: "play",
          time: "42.5",
          duration: "210",
          playlist_loop: [{
            id: "track-123",
            title: "Midnight City",
            artist: "M83",
            album: "Hurry Up, We're Dreaming",
            genre: "Electronic",
          }],
        },
      }),
    };
  };

  const client = new LyrionClient("192.0.2.10", 9000);
  const status = await client.status("aa:bb:cc:dd:ee:ff");

  assert.equal(request.url, "http://192.0.2.10:9000/jsonrpc.js");
  assert.deepEqual(request.body.params, ["aa:bb:cc:dd:ee:ff", ["status", "-", "1", "tags:galtd"]]);
  assert.deepEqual(request.headers, { "content-type": "application/json" });
  assert.equal(status.title, "Midnight City");
  assert.equal(status.artist, "M83");
  assert.equal(status.album, "Hurry Up, We're Dreaming");
  assert.equal(status.elapsed, 42.5);
  assert.equal(status.duration, 210);
  assert.equal(status.mode, "play");
  assert.equal(status.trackId, "track-123");
});

test("players uses the read-only players query without authentication", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  let request;
  global.fetch = async (url, options) => {
    request = { body: JSON.parse(options.body), headers: options.headers };
    return {
      ok: true,
      json: async () => ({ result: { players_loop: [{ playerid: "aa:bb", name: "SqueezeLite-X" }] } }),
    };
  };

  const client = new LyrionClient("192.0.2.10");
  assert.deepEqual(await client.players(), [{ playerid: "aa:bb", name: "SqueezeLite-X" }]);
  assert.deepEqual(request.body.params, [0, ["players", "0", "100"]]);
  assert.deepEqual(request.headers, { "content-type": "application/json" });
});

test("serverInfo extracts UUID and falls back when Lyrion omits its display name", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const commands = [];
  global.fetch = async (url, options) => {
    const command = JSON.parse(options.body).params[1];
    commands.push(command);
    const result = command[0] === "serverstatus"
      ? { uuid: "423047be-4c80-4b78-a845-8acf440ca965", ip: "172.20.0.5", httpport: "9000" }
      : { _p2: null };
    return { ok: true, json: async () => ({ result }) };
  };

  const client = new LyrionClient("192.0.2.10");
  assert.deepEqual(await client.serverInfo(), {
    name: "192.0.2.10",
    uuid: "423047be-4c80-4b78-a845-8acf440ca965",
  });
  assert.deepEqual(commands, [["serverstatus", "0", "1"], ["pref", "servername", "?"]]);
});

test("serverInfo keeps working when the optional preference query fails", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async (url, options) => {
    const command = JSON.parse(options.body).params[1];
    if (command[0] === "pref") throw new Error("preference unavailable");
    return {
      ok: true,
      json: async () => ({ result: { uuid: "server-uuid", servername: "Music Server" } }),
    };
  };

  const client = new LyrionClient("192.0.2.10");
  assert.deepEqual(await client.serverInfo(), { name: "Music Server", uuid: "server-uuid" });
  assert.equal(await client.serverName(), "Music Server");
});

test("artwork URL is a direct read-only cover request", () => {
  const client = new LyrionClient("192.0.2.10", 9000);
  assert.equal(
    client.artworkUrl("aa:bb:cc:dd:ee:ff"),
    "http://192.0.2.10:9000/music/current/cover.jpg?player=aa%3Abb%3Acc%3Add%3Aee%3Aff",
  );
});
