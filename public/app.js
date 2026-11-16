(() => {
  const byId = (id) => document.getElementById(id);
  const state = { server: "", player: "", track: null, receivedAt: 0 };
  const params = window.location.pathname.split("/").filter(Boolean);
  const requestedServer = params[0] || "";
  const requestedPlayer = params[1] || "";
  const DEFAULT_POLL_MS = 500;

  function formatTime(seconds) {
    const value = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const remainder = value % 60;
    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}` : `${minutes}:${String(remainder).padStart(2, "0")}`;
  }

  function showError(message) {
    byId("error").hidden = !message;
    byId("error").textContent = message || "";
  }

  async function resolvePlayer() {
    const response = await fetch("/api/servers", { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load discovered Lyrion servers");
    const servers = await response.json();
    const server = servers.find((item) => item.key.toLowerCase() === requestedServer.toLowerCase());
    if (!server) throw new Error(`Waiting for Lyrion server “${requestedServer}”…`);
    const player = server.players.find((item) => item.key.toLowerCase() === requestedPlayer.toLowerCase());
    if (!player) throw new Error(`Waiting for player “${requestedPlayer}”…`);
    state.server = server.key;
    state.player = player.key;
    byId("server-player").textContent = `${server.name} / ${player.name}`;
  }

  async function poll() {
    try {
      if (!state.server || !state.player) await resolvePlayer();
      const query = new URLSearchParams({ server: state.server, player: state.player });
      const response = await fetch(`/api/track?${query}`, { cache: "no-store" });
      const track = await response.json();
      if (!response.ok) throw new Error(track.error || "Player status unavailable");
      const changed = !state.track || state.track.trackId !== track.trackId ||
        state.track.title !== track.title || state.track.artist !== track.artist;
      state.track = track;
      state.receivedAt = Date.now();
      byId("title").textContent = track.title || (track.mode === "stop" ? "Nothing playing" : "Unknown track");
      byId("artist").textContent = track.artist || track.album || "";
      if (changed && track.artwork) byId("artwork").src = track.artwork;
      byId("artwork").onerror = () => { byId("artwork").src = "/placeholder.svg"; };
      showError("");
      renderProgress();
    } catch (error) {
      showError(error.message);
      if (error.message.includes("not found")) {
        state.server = "";
        state.player = "";
      }
    }
  }

  function renderProgress() {
    if (!state.track) return;
    const duration = Number(state.track.duration) || 0;
    const elapsed = Math.max(0, Number(state.track.elapsed) + (state.track.mode === "play" ? (Date.now() - state.receivedAt) / 1000 : 0));
    byId("elapsed").textContent = formatTime(elapsed);
    byId("remaining").textContent = `-${formatTime(Math.max(0, duration - elapsed))}`;
    byId("progress-fill").style.width = `${duration > 0 ? Math.min(100, elapsed / duration * 100) : 0}%`;
  }

  async function start() {
    let pollIntervalMs = DEFAULT_POLL_MS;
    try {
      const response = await fetch("/api/config", { cache: "no-store" });
      if (response.ok) {
        const config = await response.json();
        const configuredInterval = Number(config.browserPollIntervalMs);
        if (Number.isFinite(configuredInterval) && configuredInterval > 0) pollIntervalMs = configuredInterval;
      }
    } catch {
      // Keep the browser usable with the default interval if configuration cannot be loaded.
    }
    poll();
    setInterval(poll, pollIntervalMs);
    setInterval(renderProgress, 250);
  }

  start();
})();
