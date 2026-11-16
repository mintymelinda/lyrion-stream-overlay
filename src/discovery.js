const dgram = require("node:dgram");
const config = require("./config");

function parseConfiguredServer(value) {
  const separator = value.lastIndexOf(":");
  if (separator > 0 && /^\d+$/.test(value.slice(separator + 1))) {
    return { host: value.slice(0, separator), port: Number(value.slice(separator + 1)) };
  }
  return { host: value, port: config.lyrionHttpPort };
}

function discoverBroadcast() {
  return new Promise((resolve) => {
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    const found = new Map();
    const finish = () => {
      try { socket.close(); } catch {}
      resolve([...found.values()]);
    };

    socket.on("error", finish);
    socket.on("message", (message, remote) => {
      if (message[0] !== 0x45) return;
      const fields = message.toString("latin1").split("\x04");
      const announcedPort = Number(fields[1]);
      found.set(remote.address, {
        host: remote.address,
        port: announcedPort > 0 && announcedPort < 65536 ? announcedPort : config.lyrionHttpPort,
        source: "broadcast",
      });
    });

    socket.bind(() => {
      try {
        socket.setBroadcast(true);
        socket.send(Buffer.from("eJSON\0", "binary"), 3483, "255.255.255.255");
      } catch {
        finish();
        return;
      }
      setTimeout(finish, config.discoveryTimeoutMs).unref();
    });
  });
}

async function discoverServers() {
  const discovered = await discoverBroadcast();
  const merged = new Map(discovered.map((server) => [`${server.host}:${server.port}`, server]));
  for (const entry of config.configuredServers) {
    const server = { ...parseConfiguredServer(entry), source: "configured" };
    merged.set(`${server.host}:${server.port}`, server);
  }
  return [...merged.values()];
}

module.exports = { discoverServers, parseConfiguredServer };
