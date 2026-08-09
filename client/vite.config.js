import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 3000,
    // Fail loudly if 3000 is already taken, instead of silently starting on
    // 3001/3002/... By default Vite just increments the port and prints the new
    // one — easy to miss, and it breaks the links inside invitation and
    // password-reset emails, which are built from CLIENT_URL (http://localhost:3000).
    // Clicking those then gives "localhost refused to connect" because nothing is
    // listening on 3000. Port 3001 is also reserved for the Express API.
    strictPort: true
  }
})
