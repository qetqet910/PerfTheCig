import { defineConfig } from 'vite';
import { attachRelay } from './server/relay.js';

// dev 서버에 멀티플레이 릴레이(/ws)를 같이 붙인다 → `npm run dev` 하나로 끝
const relay = () => ({
  name: 'smoking-relay',
  // 로컬 개발은 여러 탭/봇으로 테스트해야 해서 IP 제한 없음
  configureServer(server) { if (server.httpServer) attachRelay(server.httpServer, { maxPerIp: Infinity }); },
  configurePreviewServer(server) { if (server.httpServer) attachRelay(server.httpServer, { maxPerIp: Infinity }); },
});

export default defineConfig({
  plugins: [relay()],
  server: { host: true }, // 같은 와이파이에서 접속 가능
  build: { target: 'esnext' },
});
