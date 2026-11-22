import { defineConfig } from 'vite';
import { attachRelay } from './server/relay.js';

// dev 서버에 멀티플레이 릴레이(/ws)를 같이 붙인다 → `npm run dev` 하나로 끝
const relay = () => ({
  name: 'smoking-relay',
  configureServer(server) { if (server.httpServer) attachRelay(server.httpServer); },
  configurePreviewServer(server) { if (server.httpServer) attachRelay(server.httpServer); },
});

export default defineConfig({
  plugins: [relay()],
  server: { host: true }, // 같은 와이파이에서 접속 가능
  build: { target: 'esnext' },
});
