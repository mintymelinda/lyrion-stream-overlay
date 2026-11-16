const number = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

module.exports = {
  port: number(process.env.PORT, 8080),
  discoveryIntervalMs: number(process.env.DISCOVERY_INTERVAL_MS, 30_000),
  discoveryTimeoutMs: number(process.env.DISCOVERY_TIMEOUT_MS, 1_500),
  browserPollIntervalMs: number(process.env.BROWSER_POLL_INTERVAL_MS, 500),
  lyrionHttpPort: number(process.env.LYRION_HTTP_PORT, 9000),
  lyrionServerName: (process.env.LYRION_SERVER_NAME || "").trim(),
  configuredServers: (process.env.LYRION_SERVERS || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean),
};
