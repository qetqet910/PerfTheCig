// OSM Overpass raw -> compact local-meter JSON
// origin: 구로디지털단지역 인근
import fs from 'node:fs';
const [,, inPath, outPath] = process.argv;
const LAT0 = 37.4853, LON0 = 126.9016;
const R = 6378137;
const mPerLat = (Math.PI / 180) * R;
const mPerLon = mPerLat * Math.cos(LAT0 * Math.PI / 180);
const toXZ = ({ lat, lon }) => [
  +((lon - LON0) * mPerLon).toFixed(2),
  +(-(lat - LAT0) * mPerLat).toFixed(2), // three.js: -Z = north
];
const raw = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const buildings = [], roads = [];
for (const el of raw.elements) {
  if (el.type !== 'way' || !el.geometry) continue;
  const t = el.tags || {};
  const pts = el.geometry.map(toXZ);
  if (t.building) {
    let h = parseFloat(t.height);
    const lv = parseFloat(t['building:levels']);
    if (!h && lv) h = lv * 3.4;
    buildings.push({ p: pts, h: h || null, lv: lv || null, name: t.name || null });
  } else if (t.highway) {
    const w = { motorway: 20, trunk: 18, primary: 16, secondary: 13, tertiary: 10, residential: 7, service: 5, footway: 2.5, pedestrian: 4, path: 2, steps: 2 }[t.highway] ?? 5;
    roads.push({ p: pts, w, k: t.highway });
  }
}
fs.writeFileSync(outPath, JSON.stringify({ origin: [LAT0, LON0], buildings, roads }));
console.log(`buildings ${buildings.length} (with height ${buildings.filter(b => b.h).length}), roads ${roads.length}`);
console.log('named:', buildings.filter(b => b.name).map(b => `${b.name}(${b.h ?? '?'})`).slice(0, 40).join(', '));
