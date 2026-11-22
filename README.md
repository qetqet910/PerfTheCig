# G밸리 흡연장

구로디지털단지 코오롱싸이언스밸리 1차·2차 사이 흡연구역을 Three.js로 옮긴 멀티플레이 웹 3D.
친구들이랑 같은 주소로 접속해서 같이 담배 피우는(?) 공간.

## 로컬 실행

```bash
npm install
npm run dev          # http://localhost:5179  (멀티플레이 서버 /ws 포함)
```

같은 와이파이의 다른 기기에서는 터미널에 찍히는 `Network: http://<IP>:5179` 주소로 접속.

테스트 봇 (혼자서 멀티 확인용):

```bash
node scripts/bot.mjs ws://127.0.0.1:5179/ws 옆팀대리
```

## 조작

흡연은 마우스만으로 전부 된다.

| 상황 | 좌클릭 | 우클릭 |
|---|---|---|
| 담배 없음 | 꺼내 물고 불붙이기 (갑이 비었으면 옆 사람한테 한 개비 빌리기) | |
| 피우는 중 | **꾹** 빨기 → 떼면 후~ (너무 오래 빨면 기침) / **톡** 재 털기 (재떨이 앞이면 재떨이에) | **꾹** 빨기 → 떼면 도넛 / **톡** 끄고 버리기 (재떨이 앞이면 비벼 끄기) |
| 다 핌 | 꽁초 버리기 (재떨이 근처면 재떨이에) | 동일 |

| 키 | 동작 |
|---|---|
| WASD / Shift | 이동 / 달리기 |
| Enter | 채팅 |
| F | 1인칭 ↔ 3인칭 |
| (보조) G / E / Q / X | 물기·버리기 / 빨기 / 도넛 / 재 털기 |

비는 항상 오고, 흡연구역은 비 가림막 아래라 안 젖는다.

## 친구들한테 공유하기 (Render 배포)

Netlify·Vercel은 웹소켓 서버를 못 돌려서 멀티가 안 됨 → **Render** 하나에 화면 + 멀티 서버를 같이 올린다.

1. 이 폴더를 GitHub 저장소로 올린다.
2. [render.com](https://render.com) 가입 → **New → Blueprint** → 저장소 선택.
   `render.yaml`을 자동으로 읽어서 설정이 끝난다.
   (Blueprint 대신 **New → Web Service**로 해도 됨: Build `npm install --include=dev && npm run build`, Start `npm start`)
3. 배포가 끝나면 `https://gvalley-smoking.onrender.com` 같은 주소가 나온다. 이걸 공유하면 끝.

무료 플랜 주의: 15분 동안 아무도 없으면 서버가 잠들고, 다음 사람이 들어올 때 깨어나는 데 30초~1분 걸린다.
잠들면 바닥에 버린 꽁초 기록도 초기화된다.

### 화면을 Netlify에 따로 두고 싶다면

멀티 서버만 Render에 올리고, Netlify 빌드 환경변수에 `VITE_WS_URL=wss://<render 주소>/ws`를 넣으면 된다.

## 구조

```
server/relay.js       멀티플레이 릴레이 (위치·흡연 상태·이벤트·채팅, 바닥 꽁초 기억)
server/server.js      배포용: dist 정적 파일 + /ws
src/main.js           씬 조립, 멀티, HUD, 루프
src/office.js         직장인 요소 (자리 비운 시간, 팀장님 카톡, 단톡방)
src/smoke/smoker.js   흡연 상태 머신 (꺼내기→불붙이기→타들어감→재→꽁초)
src/smoke/props.js    담배·라이터 메시
src/player/           1인칭 컨트롤러, 2D 충돌
src/world/kolon.js    코오롱 1·2차 타워 + 길가 디테일 (주차장 진입로, 캐노피, 소나무, 전봇대…)
src/world/smokingArea.js  통로 흡연구역 소품
src/world/avatar.js   SD 캐릭터 (절차적 모델 + IK)
src/world/people.js   NPC 직장인
src/world/city.js     OSM 건물/도로 → 밤 도시
src/fx/               연기·도넛·재 파티클, 비, 후처리, 효과음
```

지도 데이터 © OpenStreetMap contributors. 길가 디테일은 카카오 로드뷰(2025.07)를 참고했고, 1·2차 사이 통로 폭과 흡연구역 배치는 추정.
