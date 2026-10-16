'use strict';
/**
 * SDF font atlas generator.
 * Runs inside the editor panel (needs DOM canvas + FontFace).
 *
 * Distance encoding: alpha = 0.5 on the glyph edge, +-`spread` pixels map to 1.0 / 0.0.
 * Exact 8-bit alpha is preserved because we write the PNG ourselves (no canvas premultiply).
 */
const zlib = require('zlib');

const INF = 1e20;

// ---------- Euclidean distance transform (Felzenszwalb & Huttenlocher) ----------
function edt1d(grid, offset, stride, length, f, v, z) {
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    f[0] = grid[offset];
    for (let q = 1, k = 0, s = 0; q < length; q++) {
        f[q] = grid[offset + q * stride];
        const q2 = q * q;
        do {
            const r = v[k];
            s = (f[q] - f[r] + q2 - r * r) / (q - r) / 2;
        } while (s <= z[k] && --k > -1);
        k++;
        v[k] = q;
        z[k] = s;
        z[k + 1] = INF;
    }
    for (let q = 0, k = 0; q < length; q++) {
        while (z[k + 1] < q) k++;
        const r = v[k];
        const qr = q - r;
        grid[offset + q * stride] = f[r] + qr * qr;
    }
}

function edt2d(grid, w, h) {
    const m = Math.max(w, h);
    const f = new Float64Array(m);
    const v = new Uint16Array(m);
    const z = new Float64Array(m + 1);
    for (let x = 0; x < w; x++) edt1d(grid, x, w, h, f, v, z);
    for (let y = 0; y < h; y++) edt1d(grid, y * w, 1, w, f, v, z);
}

/** alpha (0..255, anti-aliased coverage) -> SDF (0..255) */
function alphaToSDF(alpha, w, h, spread) {
    const n = w * h;
    const outer = new Float64Array(n);
    const inner = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const a = alpha[i * 4 + 3] / 255;
        if (a === 1) { outer[i] = 0; inner[i] = INF; }
        else if (a === 0) { outer[i] = INF; inner[i] = 0; }
        else {
            const d = 0.5 - a;
            outer[i] = d > 0 ? d * d : 0;
            inner[i] = d < 0 ? d * d : 0;
        }
    }
    edt2d(outer, w, h);
    edt2d(inner, w, h);
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
        const d = Math.sqrt(outer[i]) - Math.sqrt(inner[i]); // >0 outside
        const val = 255 * (0.5 - d / (2 * spread));
        out[i] = val < 0 ? 0 : val > 255 ? 255 : Math.round(val);
    }
    return out;
}

// ---------- Shelf packer ----------
function nextPow2(n) { let p = 1; while (p < n) p <<= 1; return p; }

function pack(items, size) {
    let x = 1, y = 1, rowH = 0;
    for (const it of items) {
        if (x + it.gw + 1 > size) { y += rowH + 1; x = 1; rowH = 0; }
        if (y + it.gh + 1 > size) return null;
        it.x = x; it.y = y;
        x += it.gw + 1;
        rowH = Math.max(rowH, it.gh);
    }
    return nextPow2(y + rowH + 1);
}

// ---------- Minimal PNG encoder ----------
const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
}

function encodePNG(w, h, rgba) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
    const stride = w * 4;
    const raw = Buffer.alloc((stride + 1) * h);
    for (let y = 0; y < h; y++) {
        raw[y * (stride + 1)] = 0;
        Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
    }
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        pngChunk('IHDR', ihdr),
        pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        pngChunk('IEND', Buffer.alloc(0)),
    ]);
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const r2 = (n) => Math.round(n * 100) / 100;

// ---------- Main ----------
/**
 * @param {{fontBuffer: ArrayBuffer, name: string, size: number, spread: number,
 *          chars: string, kerning: boolean, onProgress?: (s:string)=>void}} o
 */
async function generate(o) {
    const { fontBuffer, size, spread, kerning } = o;
    const log = o.onProgress || (() => {});

    const family = 'TMPGen_' + Date.now();
    const face = new FontFace(family, fontBuffer);
    await face.load();
    document.fonts.add(face);

    const pad = spread;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(size * 4 + pad * 2);
    canvas.height = Math.ceil(size * 3 + pad * 2);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.font = `${size}px "${family}"`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.fontKerning = 'normal';

    const fm = ctx.measureText('Hg');
    const base = Math.ceil(fm.fontBoundingBoxAscent);
    const lineHeight = Math.ceil(fm.fontBoundingBoxAscent + fm.fontBoundingBoxDescent);

    const set = new Set(Array.from(o.chars).filter((c) => c !== '\n' && c !== '\r' && c !== '\t'));
    set.add(' '); set.add('?');
    const list = Array.from(set);

    const glyphs = [];
    const advances = new Map();
    for (let i = 0; i < list.length; i++) {
        const ch = list[i];
        const m = ctx.measureText(ch);
        const left = m.actualBoundingBoxLeft, right = m.actualBoundingBoxRight;
        const asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent;
        const g = { code: ch.codePointAt(0), xa: r2(m.width), gw: 0, gh: 0, xo: 0, yo: 0, sdf: null };
        advances.set(ch, m.width);
        if (left + right > 0.01 && asc + desc > 0.01) {
            g.gw = Math.ceil(left + right) + pad * 2;
            g.gh = Math.ceil(asc + desc) + pad * 2;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillText(ch, pad + left, pad + asc);
            const img = ctx.getImageData(0, 0, g.gw, g.gh).data;
            g.sdf = alphaToSDF(img, g.gw, g.gh, spread);
            g.xo = r2(-left - pad);
            g.yo = r2(base - (asc + pad));
        }
        glyphs.push(g);
        if (i % 100 === 0) { log(`Rasterizing ${i}/${list.length}`); await tick(); }
    }

    // solid block (used for underline / strikethrough / highlight quads)
    const sb = spread * 2 + 4;
    const solid = { code: -1, gw: sb, gh: sb, sdf: new Uint8Array(sb * sb).fill(255) };

    log('Packing atlas');
    const items = glyphs.filter((g) => g.sdf).concat([solid]).sort((a, b) => b.gh - a.gh);
    let W = 0, H = 0;
    for (const s of [256, 512, 1024, 2048, 4096]) {
        const h = pack(items, s);
        if (h) { W = s; H = h; break; }
    }
    if (!W) throw new Error('Glyphs do not fit into a 4096 atlas. Reduce font size/spread or the character set.');

    const rgba = new Uint8Array(W * H * 4);
    for (const it of items) {
        for (let y = 0; y < it.gh; y++) {
            for (let x = 0; x < it.gw; x++) {
                const o4 = ((it.y + y) * W + it.x + x) * 4;
                rgba[o4] = rgba[o4 + 1] = rgba[o4 + 2] = 255;
                rgba[o4 + 3] = it.sdf[y * it.gw + x];
            }
        }
    }

    const outGlyphs = {};
    for (const g of glyphs) {
        outGlyphs[g.code] = g.sdf ? [g.x, g.y, g.gw, g.gh, g.xo, g.yo, g.xa] : [0, 0, 0, 0, 0, 0, g.xa];
    }

    const kern = [];
    if (kerning && list.length <= 256) {
        log('Measuring kerning');
        await tick();
        const vis = list.filter((c) => c.trim());
        for (const a of vis) {
            for (const b of vis) {
                const d = ctx.measureText(a + b).width - advances.get(a) - advances.get(b);
                if (Math.abs(d) >= 0.25 && Math.abs(d) < size * 0.3) {
                    kern.push([a.codePointAt(0), b.codePointAt(0), r2(d)]);
                }
            }
        }
    }

    return {
        png: encodePNG(W, H, rgba),
        json: {
            version: 1, face: o.name, size, spread, lineHeight, base,
            atlasW: W, atlasH: H,
            solid: { x: solid.x, y: solid.y, s: sb },
            glyphs: outGlyphs,
            kerning: kern,
        },
    };
}

module.exports = { generate };
