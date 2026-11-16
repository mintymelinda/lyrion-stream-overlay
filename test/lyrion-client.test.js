const test = require("node:test");
const assert = require("node:assert/strict");
const { LyrionClient, decode } = require("../src/lyrion-client");

test("decode handles LMS percent-encoded metadata", () => {
  assert.equal(decode("The%20Clash%20%26%20The%20Damned"), "The Clash & The Damned");
  assert.equal(decode("plain+text"), "plain text");
});

test("status maps current track metadata and playback progress", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  let request;
  global.fetch = async (url, options) => {
    request = { url, body: JSON.parse(options.body) };
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
          }],
        },
      }),
    };
  };

  const client = new LyrionClient("192.0.2.10", 9000);
  const status = await client.status("aa:bb:cc:dd:ee:ff");

  assert.equal(request.url, "http://192.0.2.10:9000/jsonrpc.js");
  assert.deepEqual(request.body.params, ["aa:bb:cc:dd:ee:ff", ["status", "-", "1", "tags:tal"]]);
  assert.equal(status.title, "Midnight City");
  assert.equal(status.artist, "M83");
  assert.equal(status.album, "Hurry Up, We're Dreaming");
  assert.equal(status.elapsed, 42.5);
  assert.equal(status.duration, 210);
  assert.equal(status.mode, "play");
  assert.equal(status.trackId, "track-123");
});

test("players reads the players_loop returned by JSON-RPC", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ result: { players_loop: [{ playerid: "aa:bb", name: "SqueezeLite-X" }] } }),
  });

  const client = new LyrionClient("192.0.2.10");
  assert.deepEqual(await client.players(), [{ playerid: "aa:bb", name: "SqueezeLite-X" }]);
});
