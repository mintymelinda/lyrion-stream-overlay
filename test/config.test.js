const test = require("node:test");
const assert = require("node:assert/strict");

function loadConfigWithBrowserPollInterval(value) {
  const original = process.env.BROWSER_POLL_INTERVAL_MS;
  if (value === undefined) delete process.env.BROWSER_POLL_INTERVAL_MS;
  else process.env.BROWSER_POLL_INTERVAL_MS = value;

  const configPath = require.resolve("../src/config");
  delete require.cache[configPath];
  const config = require("../src/config");

  if (original === undefined) delete process.env.BROWSER_POLL_INTERVAL_MS;
  else process.env.BROWSER_POLL_INTERVAL_MS = original;
  delete require.cache[configPath];

  return config;
}

test("browser polling interval defaults to 500 ms when unset", () => {
  assert.equal(loadConfigWithBrowserPollInterval(undefined).browserPollIntervalMs, 500);
});

test("browser polling interval uses the configured environment value", () => {
  assert.equal(loadConfigWithBrowserPollInterval("1250").browserPollIntervalMs, 1250);
});

test("browser polling interval falls back to 500 ms for invalid values", () => {
  assert.equal(loadConfigWithBrowserPollInterval("not-a-number").browserPollIntervalMs, 500);
  assert.equal(loadConfigWithBrowserPollInterval("0").browserPollIntervalMs, 500);
});
