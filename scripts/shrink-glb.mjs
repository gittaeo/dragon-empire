// GLB 텍스처를 maxSize(기본 1024)로 줄여 다시 쓴다. 지오메트리는 그대로.
// 사용: node scripts/shrink-glb.mjs in.glb out.glb [maxSize]   (sharp 필요)
// 알파를 쓰는 머티리얼(BLEND/MASK)의 baseColor는 PNG 유지, 나머지는 JPEG q88.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const sharp = createRequire(import.meta.url)('sharp'); // NODE_PATH로 찾을 수 있게 require 사용

const [, , inPath, outPath, maxArg] = process.argv;
const maxSize = +(maxArg || 1024);
const buf = fs.readFileSync(inPath);
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
let off = 12, json, bin;
while (off < buf.length) {
  const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4), data = buf.subarray(off + 8, off + 8 + len);
  if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8')); else if (type === 0x004e4942) bin = data;
  off += 8 + len;
}
const alphaImages = new Set();
for (const m of json.materials || []) {
  if (m.alphaMode && m.alphaMode !== 'OPAQUE') {
    const t = m.pbrMetallicRoughness?.baseColorTexture; if (t) alphaImages.add(json.textures[t.index].source);
  }
}
const views = json.bufferViews.map(v => Buffer.from(bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength)));
for (const [i, img] of (json.images || []).entries()) {
  if (img.bufferView === undefined) continue;
  const src = views[img.bufferView], meta = await sharp(src).metadata();
  let pipe = sharp(src);
  if (Math.max(meta.width, meta.height) > maxSize) pipe = pipe.resize({ width: maxSize, height: maxSize, fit: 'inside' });
  const png = alphaImages.has(i);
  views[img.bufferView] = png ? await pipe.png({ compressionLevel: 9 }).toBuffer() : await pipe.jpeg({ quality: 88 }).toBuffer();
  img.mimeType = png ? 'image/png' : 'image/jpeg';
}
// bufferView 재배치(4바이트 정렬)
const parts = []; let cursor = 0;
json.bufferViews.forEach((v, i) => {
  const pad = (4 - (cursor % 4)) % 4; if (pad) { parts.push(Buffer.alloc(pad)); cursor += pad; }
  v.byteOffset = cursor; v.byteLength = views[i].length; parts.push(views[i]); cursor += views[i].length;
});
const binOut = Buffer.concat([...parts, Buffer.alloc((4 - (cursor % 4)) % 4)]);
json.buffers = [{ byteLength: binOut.length }];
let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)]);
const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binOut.length, 8);
const chunk = (type, data) => { const h = Buffer.alloc(8); h.writeUInt32LE(data.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, data]); };
fs.writeFileSync(outPath, Buffer.concat([header, chunk(0x4e4f534a, jsonBuf), chunk(0x004e4942, binOut)]));
console.log(`${inPath} ${(buf.length / 1e6).toFixed(2)}MB → ${outPath} ${(fs.statSync(outPath).size / 1e6).toFixed(2)}MB, images ${(json.images || []).length}, alpha ${alphaImages.size}`);
