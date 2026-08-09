# Server / Client Port Conflict Fix

## Expected local behaviour

| Application | URL | Expected display |
|---|---|---|
| React client | `http://localhost:3000` | Full Leave Management System website |
| Express server | `http://localhost:3001` | `Welcome to the Innovare Leave Management System API.` |
| API health check | `http://localhost:3001/health` | JSON status response |

## Changes made

1. The Express `/` route explicitly returns `text/plain`, so the backend cannot look like the React website.
2. A `/health` endpoint was added for a clear API check.
3. Server startup validates that `APP_PORT` and the port in `CLIENT_URL` are different.
4. Server startup prints both the API and client URLs.
5. A clear `EADDRINUSE` message is shown when the API port is occupied.
6. Vite now uses `strictPort: true`, preventing it from silently changing from port 3000 to port 3001.
7. Automated route tests verify that `/` is plain text and contains no client HTML.

## Correct environment values

`server/.env`:

```env
APP_PORT=3001
CLIENT_URL=http://localhost:3000
```

`client/.env`:

```env
VITE_API_BASE_URL=http://localhost:3001
```

## Start commands

Backend terminal:

```bash
cd server
npm install
npm start
```

Client terminal:

```bash
cd client
npm install
npm run dev
```
