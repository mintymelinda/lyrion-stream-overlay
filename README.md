# Lyrion Stream Overlay

A lightweight Docker-hosted browser source for showing the currently playing track on any player connected to a Lyrion Music Server (formerly Logitech Media Server).

## Features

- Discovers Lyrion servers using the native UDP broadcast discovery request on port **3483** (`eJSON\\0`).
- Queries server/player names and playback state through the Lyrion JSON-RPC CLI endpoint (`/jsonrpc.js`).
- Creates one overlay route per discovered server and player:
  - `http://localhost:8081/BigStorageParty/` — server landing page with links to its players.
  - `http://localhost:8081/BigStorageParty/SqueezeLite-X` — player overlay.
- Displays album art, track title, artist, elapsed time, remaining time, and a progress bar.
- Polls player status every two seconds; the browser animates progress locally between updates.
- Re-discovers servers periodically and automatically recovers when a server/player returns.
- No npm dependencies or frontend build step.
- Uses unauthenticated, read-only Lyrion queries; no Lyrion credentials are required.

## Quick start

This project supports the standalone legacy Docker Compose command:

```sh
cp .env.example .env
docker-compose -f docker-compose.yaml up -d --build
```

Open a server route to choose a player, then use its player route as an OBS browser source, for example:

```
http://localhost:8081/BigStorageParty/SqueezeLite-X
```

The first discovery scan runs at startup. Allow a few seconds for servers to respond. The default host port is 8081; change `HOST_PORT` in `.env` if that port is occupied.

## Docker networking and discovery

Lyrion's broadcast discovery uses UDP port 3483. Docker's default bridge network does not reliably forward LAN broadcast packets. For Linux hosts, the most reliable configuration is host networking: uncomment `network_mode: host` in `docker-compose.yaml` and remove the `ports` mapping (the service listens on its internal `PORT`, default 8080). With host networking, the container shares the host network namespace.

If host networking is unavailable (including some Docker Desktop configurations), set `LYRION_SERVERS` in `.env` to a comma-separated list of Lyrion server addresses, for example:

```dotenv
LYRION_SERVERS=192.168.1.20,192.168.1.21:9001
```

This bypasses broadcast discovery and directly queries the configured servers. The container still needs network access to each server's HTTP port.

## Configuration

Copy `.env.example` to `.env` and adjust:

| Variable | Default | Description |
| --- | ---: | --- |
| `PORT` | `8080` | HTTP port inside the container; leave at 8080 with the supplied bridge-network mapping |
| `HOST_PORT` | `8081` | NAS/host port published by Docker Compose; change this if the port is occupied |
| `DISCOVERY_INTERVAL_MS` | `30000` | Time between server discovery scans |
| `DISCOVERY_TIMEOUT_MS` | `1500` | How long to wait for UDP discovery responses |
| `POLL_INTERVAL_MS` | `2000` | Backend player status polling interval |
| `LYRION_HTTP_PORT` | `9000` | Default Lyrion web/JSON-RPC port |
| `LYRION_SERVERS` | empty | Optional comma-separated server hostnames/IPs, with optional port |

The overlay connects to Lyrion without credentials and performs only the read operations required for server discovery, player status, metadata and artwork. It does not expose playback controls or a generic JSON-RPC proxy. The server may still permit control commands to other unauthenticated clients; this application deliberately never sends them.

## Routes and API

- `/` — default waiting page; open a discovered server route to choose a player.
- `/health` — container health check.
- `/api/servers` — discovered servers and players.
- `/api/track?server=<server-key>&player=<player-key>` — current player status.
- `/api/art?server=<server-key>&player=<player-key>` — proxied current album artwork.

Server and player URL segments are generated from their Lyrion names (whitespace becomes hyphens). The actual route should use the resulting key if a name contains punctuation.

## Development

Requires Node.js 22 or newer.

```sh
cp .env.example .env
node src/server.js
```

The application uses only Node.js built-in modules and browser APIs. No install/build command is required. Run `npm test` to execute the automated tests.

## Notes

- Discovery is based on Lyrion's LAN UDP broadcast protocol. Some VLANs, Wi-Fi client isolation, firewalls, and container network modes block broadcast discovery; use `LYRION_SERVERS` in those environments.
- Browser overlay updates are driven by backend JSON-RPC polling, while elapsed time is animated client-side every 250 ms.
- Artwork is proxied through this service so the OBS browser source does not need direct access to the Lyrion server.
