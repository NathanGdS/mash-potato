# Mash Potato

A lightweight, native desktop API client — your Postman alternative without the bloat.

Built with [Wails v2](https://wails.io/), combining a Go backend with a React/TypeScript frontend into a single self-contained binary.

---

## Features

- **Collections & Requests** — organize requests into collections with full CRUD
- **HTTP Methods** — GET, POST, PUT, PATCH, DELETE, and more
- **Headers & Query Params** — key-value editor with enable/disable toggles
- **Request Body** — supports JSON, Raw, and Form Data body types
- **JSON Beautify** — auto-format request bodies with one click
- **Environments & Variables** — create environments, define variables, and interpolate `{{variable}}` tokens across URLs, headers, params, and bodies
- **Variable Autocomplete** — popover suggestions when typing `{{` anywhere in the editor
- **Response Viewer** — syntax-highlighted JSON, status badges, response headers, duration, and size metrics
- **Copy Response** — copy formatted response to clipboard
- **Resizable Panes** — drag to adjust the editor/response split
- **Persistent Storage** — SQLite database stored in the OS user config directory

---

## Stack

| Layer | Technology |
|---|---|
| Backend | Go 1.21, Wails v2 |
| Database | SQLite (`modernc.org/sqlite` — pure Go, no CGO) |
| Frontend | React 18, TypeScript 5 |
| State | Zustand |
| Build | Vite |

---

## Prerequisites

- [Go 1.21+](https://go.dev/dl/)
- [Node.js 18+](https://nodejs.org/)
- [Wails v2 CLI](https://wails.io/docs/gettingstarted/installation)

Install Wails:

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

Check all dependencies are met:

```bash
wails doctor
```

---

## Development

```bash
# Clone the repo
git clone https://github.com/your-username/mash-potato.git
cd mash-potato

# Start in dev mode (hot-reload for Go + React)
wails dev
```

Or via Makefile:

```bash
make dev
```

---

## Building

```bash
# Production binary
wails build

# Or via Makefile
make build
```

The compiled binary is output to `build/bin/`.

---

## Testing

```bash
# Run all tests (Go + frontend)
make test

# Go tests only
go test ./...

# Frontend tests only
cd frontend && npm run test
```

---

## Project Structure

```
mash-potato/
├── main.go                  # Entry point — initializes DB and Wails app
├── app.go                   # Wails-exposed Go methods (the backend API)
├── interpolator.go          # {{variable}} template interpolation
├── db/                      # SQLite layer
│   ├── db.go                # Init, WAL mode, schema migrations
│   ├── collections.go       # Collection CRUD
│   ├── requests.go          # Request CRUD
│   ├── environments.go      # Environment CRUD
│   └── settings.go          # App settings persistence
├── httpclient/
│   └── client.go            # HTTP request execution with timing/size metrics
└── frontend/src/
    ├── App.tsx               # Root layout
    ├── components/           # UI components
    ├── store/                # Zustand stores
    ├── types/                # TypeScript interfaces
    ├── hooks/                # Custom React hooks
    └── utils/                # Shared utilities (JSON highlighter, var parser)
```

---

## How It Works

The frontend calls Go methods through Wails' auto-generated JS bindings (in `frontend/src/wailsjs/`). All state and async actions live in Zustand stores — components never call the backend directly.

**Request flow:**

1. User clicks Send
2. Frontend calls `SendRequest(id)` via Wails binding
3. Go fetches the request from SQLite
4. Active environment variables are loaded
5. `{{variable}}` tokens are interpolated across all fields
6. HTTP request executes with a 30s timeout
7. Response (status, body, headers, duration, size) is returned to the frontend

---

## Database

SQLite file is stored in the OS user config directory (resolved at runtime). Schema:

```sql
collections(id, name, created_at)
requests(id, collection_id, name, method, url, headers, params, body_type, body, created_at)
environments(id, name, created_at)
environment_variables(id, environment_id, key, value)
settings(key, value)
```

`headers` and `params` are JSON-encoded arrays of `{key, value, enabled}` objects.

---

## Makefile Reference

| Command | Description |
|---|---|
| `make dev` | Start Wails dev mode |
| `make build` | Build production binary |
| `make test` | Run Go + frontend tests |
| `make lint` | Run `go vet` |
| `make generate` | Regenerate Wails JS bindings |
| `make clean` | Remove build artifacts |

---

## License

MIT
