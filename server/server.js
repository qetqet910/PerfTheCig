// 배포용: dist 정적 파일 + /ws 릴레이를 한 포트에서 서빙
//   npm run build && npm start
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachRelay } from './relay.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const PORT = Number(process.env.PORT) || 8787;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(root, url);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
// IP당 동시 접속 수 (기본 1). 같은 회사 친구들이 같이 들어와야 하면 Render 환경변수 MAX_PER_IP를 늘리기
const MAX_PER_IP = Number(process.env.MAX_PER_IP) || 1;
attachRelay(server, { maxPerIp: MAX_PER_IP });
server.listen(PORT, () => console.log(`흡연장 오픈: http://localhost:${PORT}`));
