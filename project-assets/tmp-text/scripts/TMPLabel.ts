import {
    _decorator, Color, Enum, EventTouch, JsonAsset, NodeEventType, Texture2D,
    UIRenderer, UITransform, Vec2, Vec3, Vec4, view, warn,
} from 'cc';
import { EDITOR } from 'cc/env';
import { parseTMP, RGBA, TMPStyle } from './TMPRichText';

const { ccclass, property, executeInEditMode, menu } = _decorator;

// collapsible sections in the inspector (falls back to tabs on engines without 'section' style)
const grp = (id: string, name: string, order: number) => ({ id, name, displayOrder: order, style: 'section' as const });
const G_FONT = grp('font', 'Font', 1);
const G_TEXT = grp('text', 'Text', 2);
const G_FACE = grp('face', 'Face', 3);
const G_GRAD = grp('gradient', 'Gradient', 4);
const G_OUT = grp('outline', 'Outline', 5);
const G_UND = grp('underlay', 'Underlay (Shadow)', 6);
const G_GLOW = grp('glow', 'Glow', 7);

export enum TMPOverflow { Overflow, Wrap, Shrink, ResizeHeight }
export enum TMPHAlign { Left, Center, Right }
export enum TMPVAlign { Top, Middle, Bottom }
Enum(TMPOverflow); Enum(TMPHAlign); Enum(TMPVAlign);

/* ------------------------------------------------------------------ */
/* Font data (produced by the SDF Font Generator panel)                */
/* ------------------------------------------------------------------ */
interface Glyph { x: number; y: number; w: number; h: number; xo: number; yo: number; xa: number; }

class TMPFontData {
    size = 0; spread = 0; lineHeight = 0; base = 0; atlasW = 1; atlasH = 1;
    solid = { x: 0, y: 0, s: 4 };
    glyphs = new Map<number, Glyph>();
    private _kern = new Map<number, number>();

    static from(j: any): TMPFontData {
        const f = new TMPFontData();
        f.size = j.size; f.spread = j.spread; f.lineHeight = j.lineHeight; f.base = j.base;
        f.atlasW = j.atlasW; f.atlasH = j.atlasH; f.solid = j.solid;
        for (const k of Object.keys(j.glyphs)) {
            const a = j.glyphs[k];
            f.glyphs.set(Number(k), { x: a[0], y: a[1], w: a[2], h: a[3], xo: a[4], yo: a[5], xa: a[6] });
        }
        for (const [a, b, d] of j.kerning || []) f._kern.set(a * 0x110000 + b, d);
        return f;
    }
    kern(a: number, b: number) { return this._kern.get(a * 0x110000 + b) ?? 0; }
}

/* ------------------------------------------------------------------ */
/* Layout helpers                                                      */
/* ------------------------------------------------------------------ */
interface Item {
    nl: boolean; ch: string; code: number; g?: Glyph; st: TMPStyle;
    s: number;      // glyph scale (font px -> screen px)
    kx: number;     // kerning applied before this glyph
    adv: number;    // total advance including kx
    space: boolean; cjk: boolean;
}
interface Line { items: Item[]; w: number; asc: number; desc: number; h: number; }
interface LinkRect { id: string; x0: number; x1: number; y0: number; y1: number; }

/** Collects quads (4 verts each: BL, BR, TL, TR) */
class Layer {
    p: number[] = []; t: number[] = []; c: number[] = [];
    get n() { return this.p.length / 8; }
    quad(x0: number, y0: number, x1: number, y1: number,
        u0: number, v0: number, u1: number, v1: number,
        top: RGBA, bot: RGBA, shear = 0, shearBase = 0) {
        const a = (y0 - shearBase) * shear, b = (y1 - shearBase) * shear;
        this.p.push(x0 + a, y0, x1 + a, y0, x0 + b, y1, x1 + b, y1);
        this.t.push(u0, v1, u1, v1, u0, v0, u1, v0);
        this.c.push(...bot, ...bot, ...top, ...top);
    }
}

/* ------------------------------------------------------------------ */
/* Assembler                                                           */
/* ------------------------------------------------------------------ */
const TMPAssembler: any = {
    createData(comp: TMPLabel) { return comp.requestRenderData(); },

    updateRenderData(comp: TMPLabel) { comp.rebuild(); },

    // vertex colours are baked on rebuild; just rebuild when tint changes
    updateColor(comp: TMPLabel) { comp.markDirty(); },

    fillBuffers(comp: TMPLabel, _renderer: any) {
        const rd: any = comp.renderData;
        const n = comp.quadCount;
        if (!rd || n === 0) return;
        const chunk = rd.chunk;

        if (comp.node.hasChangedFlags || rd.vertDirty) {
            const m = comp.node.worldMatrix;
            const vb = chunk.vb as Float32Array;
            const stride: number = rd.floatStride ?? 9;
            const pos = comp.positions;
            for (let i = 0; i < n * 4; i++) {
                const x = pos[i * 2], y = pos[i * 2 + 1];
                let rhw = m.m03 * x + m.m07 * y + m.m15;
                rhw = rhw ? 1 / rhw : 1;
                const o = i * stride;
                vb[o] = (m.m00 * x + m.m04 * y + m.m12) * rhw;
                vb[o + 1] = (m.m01 * x + m.m05 * y + m.m13) * rhw;
                vb[o + 2] = (m.m02 * x + m.m06 * y + m.m14) * rhw;
            }
            rd.vertDirty = false;
        }

        const meshBuffer = chunk.meshBuffer;
        const ib = meshBuffer.iData;
        let io = meshBuffer.indexOffset;
        const vid0 = chunk.vertexOffset;
        for (let q = 0; q < n; q++) {
            const v = vid0 + q * 4;
            ib[io++] = v; ib[io++] = v + 1; ib[io++] = v + 2;
            ib[io++] = v + 2; ib[io++] = v + 1; ib[io++] = v + 3;
        }
        meshBuffer.indexOffset += n * 6;
        meshBuffer.setDirty?.();
    },
};

const LAYOUT_KEYS = ['text', 'fontSize', 'richText', 'overflow', 'hAlign', 'vAlign',
    'lineSpacing', 'letterSpacing', 'minFontSize', 'fontData', 'atlas'];

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */
@ccclass('TMPLabel')
@menu('TMP/TMPLabel')
@executeInEditMode(true)
export class TMPLabel extends UIRenderer {
    /** emitted on the node when a <link=id> is clicked: (id, label) */
    static readonly LINK_EVENT = 'tmp-link';

    /* ---- font ---- */
    @property({ type: JsonAsset, group: G_FONT, tooltip: 'The .json produced by the SDF Font Generator' })
    fontData: JsonAsset | null = null;
    @property({ type: Texture2D, group: G_FONT, tooltip: 'The .png atlas produced by the SDF Font Generator' })
    atlas: Texture2D | null = null;

    /* ---- text / layout (changes trigger a relayout) ---- */
    @property({ multiline: true, group: G_TEXT })
    text = 'Hello <color=#ffcc00>TMP</color> <b>bold</b> <i>italic</i> <u>under</u>';
    @property({ group: G_TEXT }) fontSize = 40;
    @property({ group: G_TEXT }) richText = true;
    @property({ type: TMPOverflow, group: G_TEXT }) overflow: TMPOverflow = TMPOverflow.Wrap;
    @property({ type: TMPHAlign, group: G_TEXT }) hAlign: TMPHAlign = TMPHAlign.Left;
    @property({ type: TMPVAlign, group: G_TEXT }) vAlign: TMPVAlign = TMPVAlign.Top;
    @property({ group: G_TEXT, tooltip: 'Line height multiplier' }) lineSpacing = 1;
    @property({ group: G_TEXT }) letterSpacing = 0;
    @property({ group: G_TEXT, tooltip: 'Smallest size used by Overflow = Shrink' }) minFontSize = 12;

    /* ---- face ---- */
    @property({ group: G_FACE, slide: true, range: [-1, 1, 0.01], tooltip: 'Thicken (+) or thin (-) the glyphs' })
    faceDilate = 0;
    @property({ group: G_FACE, slide: true, range: [0, 1, 0.01] }) softness = 0;

    /* ---- gradient (across the whole text, multiplies the face colour) ---- */
    @property({ group: G_GRAD }) gradientEnabled = false;
    @property({ type: Color, group: G_GRAD }) gradientColorA = new Color(255, 255, 255, 255);
    @property({ type: Color, group: G_GRAD }) gradientColorB = new Color(255, 120, 0, 255);
    @property({ group: G_GRAD, slide: true, range: [0, 360, 1], tooltip: '0 = A at top -> B at bottom, 90 = A left -> B right' })
    gradientAngle = 0;

    /* ---- outline ---- */
    @property({ type: Color, group: G_OUT }) outlineColor = new Color(0, 0, 0, 255);
    @property({ group: G_OUT, slide: true, range: [0, 1, 0.01], tooltip: '1 = full atlas padding' })
    outlineWidth = 0;

    /* ---- underlay (drop shadow) ---- */
    @property({ type: Color, group: G_UND }) underlayColor = new Color(0, 0, 0, 0);
    @property({ type: Vec2, group: G_UND, tooltip: '-1..1, relative to atlas padding' })
    underlayOffset = new Vec2(0.4, -0.4);
    @property({ group: G_UND, slide: true, range: [-1, 1, 0.01] }) underlayDilate = 0;
    @property({ group: G_UND, slide: true, range: [0, 1, 0.01] }) underlaySoftness = 0.2;

    /* ---- glow ---- */
    @property({ type: Color, group: G_GLOW }) glowColor = new Color(255, 200, 50, 255);
    @property({ group: G_GLOW, slide: true, range: [-1, 1, 0.01] }) glowOffset = 0;
    @property({ group: G_GLOW, slide: true, range: [0, 1, 0.01] }) glowInner = 0;
    @property({ group: G_GLOW, slide: true, range: [0, 1, 0.01], tooltip: '0 disables glow' }) glowOuter = 0;
    @property({ group: G_GLOW, slide: true, range: [0.1, 4, 0.05] }) glowPower = 1;

    /* ---- internal ---- */
    private _font: TMPFontData | null = null;
    private _fontSrc: JsonAsset | null = null;
    private _pos = new Float32Array(0);
    private _quads = 0;
    private _k = 1;
    private _links: LinkRect[] = [];
    private _selfResize = false;
    private _touchOn = false;
    private _warned = false;
    private _lastMat: any = null;
    private _sig: Record<string, any> = {};
    private _gv = new Float32Array(10);
    private _gp = new Float32Array(10);
    private _stv = new Float32Array(24);
    private _stp = new Float32Array(24);
    private _v4 = new Vec4();
    private _tmp3 = new Vec3();
    private _tmp2 = new Vec2();

    get quadCount() { return this._quads; }
    get positions() { return this._pos; }

    /* ---------------- lifecycle ---------------- */
    public __preload() {
        super.__preload?.();
        this._flushAssembler();
    }

    onEnable() {
        super.onEnable();
        this.node.on(NodeEventType.SIZE_CHANGED, this._onSize, this);
        this.node.on(NodeEventType.ANCHOR_CHANGED, this._onSize, this);
        this.markDirty();
    }

    onDisable() {
        this.node.off(NodeEventType.SIZE_CHANGED, this._onSize, this);
        this.node.off(NodeEventType.ANCHOR_CHANGED, this._onSize, this);
        this._setTouch(false);
        super.onDisable();
    }

    protected _flushAssembler() {
        const self = this as any;
        if (self._assembler !== TMPAssembler) {
            this.destroyRenderData();
            self._assembler = TMPAssembler;
        }
        if (!this.renderData) {
            self._renderData = TMPAssembler.createData(this);
            self._renderData.material = this.getRenderMaterial(0);
            this.markForUpdateRenderData();
        }
    }

    protected _canRender() {
        return super._canRender() && !!this.atlas && !!this.fontData && this._quads > 0;
    }

    protected _render(render: any) {
        render.commitComp(this, this.renderData, this.atlas, (this as any)._assembler, null);
    }

    protected update() {
        // layout-affecting props
        let changed = false;
        const sig = this._sig as any;
        for (const k of LAYOUT_KEYS) {
            const v = (this as any)[k];
            if (sig[k] !== v) { sig[k] = v; changed = true; }
        }
        // gradient values are objects/colours -> compare by value
        const g = this._gv;
        g[0] = this.gradientEnabled ? 1 : 0; g[1] = this.gradientAngle;
        const A = this.gradientColorA, B = this.gradientColorB;
        g[2] = A.r; g[3] = A.g; g[4] = A.b; g[5] = A.a; g[6] = B.r; g[7] = B.g; g[8] = B.b; g[9] = B.a;
        for (let i = 0; i < 10; i++) if (g[i] !== this._gp[i]) { this._gp.set(g); changed = true; break; }
        if (changed) this.markDirty();
        this._pollStyle();
    }

    /* ---------------- public API ---------------- */
    /** Force a relayout (normally automatic). */
    markDirty() { this.markForUpdateRenderData(); }

    /** Local-space rect of the link under a UI-space point, or null. */
    hitLink(uiPoint: Vec2): string | null {
        const ut = this.node.getComponent(UITransform)!;
        const p = ut.convertToNodeSpaceAR(this._tmp3.set(uiPoint.x, uiPoint.y, 0), this._tmp3);
        for (const l of this._links) {
            if (p.x >= l.x0 && p.x <= l.x1 && p.y >= l.y0 && p.y <= l.y1) return l.id;
        }
        return null;
    }

    /* ---------------- internals ---------------- */
    private _onSize() { if (!this._selfResize) this.markDirty(); }

    private _getFont(): TMPFontData | null {
        if (this._fontSrc !== this.fontData) {
            this._fontSrc = this.fontData;
            this._font = this.fontData && this.fontData.json ? TMPFontData.from(this.fontData.json) : null;
        }
        return this._font;
    }

    private _setTouch(on: boolean) {
        if (on === this._touchOn) return;
        this._touchOn = on;
        if (on) this.node.on(NodeEventType.TOUCH_END, this._onTouch, this);
        else this.node.off(NodeEventType.TOUCH_END, this._onTouch, this);
    }

    private _onTouch(e: EventTouch) {
        const id = this.hitLink(e.getUILocation(this._tmp2));
        if (id !== null) this.node.emit(TMPLabel.LINK_EVENT, id, this);
    }

    private _tint(c: RGBA): RGBA {
        const t = this.color;
        return [c[0] * t.r / 255, c[1] * t.g / 255, c[2] * t.b / 255, c[3] * t.a / 255];
    }

    /** word-wrap + metrics */
    private _layout(chars: ReturnType<typeof parseTMP>, k: number, maxW: number) {
        const f = this._font!;
        const items: Item[] = [];
        let prev = 0;
        for (const c of chars) {
            const s = (c.style.size / f.size) * k;
            if (c.ch === '\n') {
                items.push({ nl: true, ch: '\n', code: 10, st: c.style, s, kx: 0, adv: 0, space: false, cjk: false });
                prev = 0;
                continue;
            }
            const code = c.ch.codePointAt(0)!;
            const g = f.glyphs.get(code) ?? f.glyphs.get(63);
            const kx = prev ? f.kern(prev, code) * s : 0;
            const adv = kx + (g ? g.xa : f.size * 0.4) * s + (c.style.cspace + this.letterSpacing) * k;
            items.push({ nl: false, ch: c.ch, code, g, st: c.style, s, kx, adv, space: code === 32 || code === 0x3000, cjk: code >= 0x2e80 });
            prev = code;
        }

        const rows: Item[][] = [];
        let cur: Item[] = [];
        let w = 0, brk = -1;
        let hard = false; // true if a word had to be split mid-word
        for (const it of items) {
            if (it.nl) { cur.push(it); rows.push(cur); cur = []; w = 0; brk = -1; continue; }
            if (maxW > 0 && !it.space && cur.length && w + it.adv > maxW) {
                let rest: Item[] = [];
                if (brk >= 0) rest = cur.splice(brk + 1); else hard = true;
                rows.push(cur);
                cur = rest;
                w = rest.reduce((a, b) => a + b.adv, 0);
                brk = -1;
            }
            cur.push(it);
            w += it.adv;
            if (it.space || it.cjk) brk = cur.length - 1;
        }
        rows.push(cur);

        const defS = (this.fontSize / f.size) * k;
        let width = 0, height = 0;
        const lines: Line[] = rows.map((its) => {
            let asc = 0, desc = 0, lw = 0;
            for (const it of its) {
                asc = Math.max(asc, f.base * it.s);
                desc = Math.max(desc, (f.lineHeight - f.base) * it.s);
                lw += it.adv;
            }
            for (let i = its.length - 1; i >= 0 && its[i].space; i--) lw -= its[i].adv; // trim trailing spaces
            if (asc === 0) { asc = f.base * defS; desc = (f.lineHeight - f.base) * defS; }
            const h = (asc + desc) * this.lineSpacing;
            width = Math.max(width, lw);
            height += h;
            return { items: its, w: lw, asc, desc, h };
        });
        return { lines, width, height, hard };
    }

    /** Called by the assembler: layout -> vertex data */
    rebuild() {
        this._quads = 0;
        this._links.length = 0;
        const f = this._getFont();
        const rd: any = this.renderData;
        if (!f || !this.atlas || !rd) return;

        const ut = this.node.getComponent(UITransform)!;
        const chars = parseTMP(this.text, this.fontSize, this.richText);
        this._setTouch(!EDITOR && this.richText && this.text.indexOf('<link') >= 0);

        const wrap = this.overflow !== TMPOverflow.Overflow;
        const boxW = ut.width, boxH = ut.height;

        let k = 1;
        let L = this._layout(chars, 1, wrap ? boxW : 0);
        const fits = (r: { height: number; hard: boolean }) => r.height <= boxH && !r.hard;
        if (this.overflow === TMPOverflow.Shrink && !fits(L)) {
            let lo = Math.min(1, this.minFontSize / Math.max(1, this.fontSize)), hi = 1;
            for (let i = 0; i < 10; i++) {
                const mid = (lo + hi) / 2;
                if (fits(this._layout(chars, mid, boxW))) lo = mid; else hi = mid;
            }
            k = lo;
            L = this._layout(chars, k, boxW);
        }
        this._k = k;

        let W = boxW, H = boxH;
        if (this.overflow === TMPOverflow.Overflow) { W = L.width; H = L.height; }
        else if (this.overflow === TMPOverflow.ResizeHeight) { H = L.height; }
        if (Math.abs(W - ut.width) > 0.01 || Math.abs(H - ut.height) > 0.01) {
            this._selfResize = true;
            ut.setContentSize(W, H);
            this._selfResize = false;
        }

        // ---- emit quads ----
        const ax = ut.anchorX, ay = ut.anchorY;
        const left = -ax * W;
        let top = (1 - ay) * H;
        const free = H - L.height;
        top -= this.vAlign === TMPVAlign.Middle ? free / 2 : this.vAlign === TMPVAlign.Bottom ? free : 0;

        const mark = new Layer(), glyph = new Layer(), deco = new Layer();
        const sU = (f.solid.x + f.solid.s / 2) / f.atlasW, sV = (f.solid.y + f.solid.s / 2) / f.atlasH;
        const alignStr = ['left', 'center', 'right'][this.hAlign];

        for (const ln of L.lines) {
            const baseline = top - (ln.asc + (ln.h - ln.asc - ln.desc) * 0.5);
            const first = ln.items.find((i) => !i.nl);
            const al = first?.st.align ?? alignStr;
            let x = left + (al === 'center' ? (W - ln.w) / 2 : al === 'right' ? W - ln.w : 0);

            for (const it of ln.items) {
                if (it.nl) continue;
                const st = it.st;
                const x0 = x;
                const sz = st.size * k;
                const vo = st.voffset * k;
                const c0 = this._tint(st.gradient ? st.gradient[0] : st.color);
                const c1 = this._tint(st.gradient ? st.gradient[1] : st.color);

                if (st.mark) {
                    const mc = this._tint(st.mark);
                    mark.quad(x0, baseline - ln.desc, x0 + it.adv, baseline + ln.asc, sU, sV, sU, sV, mc, mc);
                }

                const g = it.g;
                if (g && g.w > 0) {
                    const gx = x0 + it.kx + g.xo * it.s;
                    const gy1 = baseline + vo + (f.base - g.yo) * it.s;
                    const u0 = g.x / f.atlasW, v0 = g.y / f.atlasH;
                    const u1 = (g.x + g.w) / f.atlasW, v1 = (g.y + g.h) / f.atlasH;
                    const gw = g.w * it.s, gh = g.h * it.s;
                    const shear = st.italic ? 0.2 : 0, sb = baseline + vo;
                    if (st.bold) {
                        const d = sz * 0.025;
                        glyph.quad(gx - d, gy1 - gh, gx - d + gw, gy1, u0, v0, u1, v1, c0, c1, shear, sb);
                        glyph.quad(gx + d, gy1 - gh, gx + d + gw, gy1, u0, v0, u1, v1, c0, c1, shear, sb);
                    } else {
                        glyph.quad(gx, gy1 - gh, gx + gw, gy1, u0, v0, u1, v1, c0, c1, shear, sb);
                    }
                }

                const thick = Math.max(1, sz * 0.06);
                if (st.underline) {
                    const y1 = baseline - sz * 0.08;
                    deco.quad(x0, y1 - thick, x0 + it.adv, y1, sU, sV, sU, sV, c0, c0);
                }
                if (st.strike) {
                    const y1 = baseline + sz * 0.3 + thick / 2;
                    deco.quad(x0, y1 - thick, x0 + it.adv, y1, sU, sV, sU, sV, c0, c0);
                }
                if (st.link !== null) {
                    this._links.push({ id: st.link, x0, x1: x0 + it.adv, y0: baseline - ln.desc, y1: baseline + ln.asc });
                }
                x = x0 + it.adv;
            }
            top -= ln.h;
        }

        const n = mark.n + glyph.n + deco.n;
        if (n === 0) return;
        const P = mark.p.concat(glyph.p, deco.p);
        const T = mark.t.concat(glyph.t, deco.t);
        const C = mark.c.concat(glyph.c, deco.c);

        if (this.gradientEnabled) this._applyGradient(P, C, glyph.n ? glyph.p : P, mark.n * 4, n * 4);

        rd.dataLength = n * 4;
        rd.resize(n * 4, n * 6);
        const vb = rd.chunk.vb as Float32Array;
        const stride: number = rd.floatStride ?? 9;
        for (let i = 0; i < n * 4; i++) {
            const o = i * stride;
            vb[o + 3] = T[i * 2]; vb[o + 4] = T[i * 2 + 1];
            vb[o + 5] = C[i * 4]; vb[o + 6] = C[i * 4 + 1]; vb[o + 7] = C[i * 4 + 2]; vb[o + 8] = C[i * 4 + 3];
        }
        this._pos = Float32Array.from(P);
        this._quads = n;
        rd.vertDirty = true;
        this._lastMat = null; // re-apply material params after (re)build
    }

    /** Linear gradient over the text bounds; multiplies existing vertex colours. Skips highlight (mark) quads. */
    private _applyGradient(P: number[], C: number[], boundsSrc: number[], from: number, to: number) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let i = 0; i < boundsSrc.length; i += 2) {
            x0 = Math.min(x0, boundsSrc[i]); x1 = Math.max(x1, boundsSrc[i]);
            y0 = Math.min(y0, boundsSrc[i + 1]); y1 = Math.max(y1, boundsSrc[i + 1]);
        }
        const w = Math.max(x1 - x0, 1e-3), h = Math.max(y1 - y0, 1e-3);
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        const ang = this.gradientAngle * Math.PI / 180;
        const dx = Math.sin(ang), dy = -Math.cos(ang);               // 0deg = top -> bottom
        const denom = Math.abs(dx) * w + Math.abs(dy) * h;
        const A = this.gradientColorA, B = this.gradientColorB;
        const a = [A.r / 255, A.g / 255, A.b / 255, A.a / 255];
        const b = [B.r / 255, B.g / 255, B.b / 255, B.a / 255];
        for (let i = from; i < to; i++) {
            let t = ((P[i * 2] - cx) * dx + (P[i * 2 + 1] - cy) * dy) / denom + 0.5;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            for (let c = 0; c < 4; c++) C[i * 4 + c] *= a[c] + (b[c] - a[c]) * t;
        }
    }

    /* ---------------- material parameters ---------------- */
    private _pollStyle() {
        const f = this._getFont();
        if (!f) return;
        const v = this._stv;
        const ws = this.node.getWorldScale(this._tmp3);
        const pxRange = f.spread * (this.fontSize * this._k / f.size) * Math.abs(ws.x) * view.getScaleX();
        let i = 0;
        v[i++] = this.faceDilate; v[i++] = this.softness; v[i++] = this.outlineWidth; v[i++] = pxRange;
        for (const c of [this.outlineColor, this.underlayColor, this.glowColor]) {
            v[i++] = c.r / 255; v[i++] = c.g / 255; v[i++] = c.b / 255; v[i++] = c.a / 255;
        }
        v[i++] = this.underlayOffset.x * f.spread / f.atlasW;
        v[i++] = -this.underlayOffset.y * f.spread / f.atlasH;
        v[i++] = this.underlayDilate; v[i++] = this.underlaySoftness;
        v[i++] = this.glowOffset; v[i++] = this.glowInner; v[i++] = this.glowOuter; v[i++] = this.glowPower;

        if (!this.customMaterial) {
            if (!this._warned) { warn('[TMPLabel] Assign the generated .mtl to "Custom Material".'); this._warned = true; }
            return;
        }
        const mat = this.getMaterialInstance(0);
        if (!mat) return;
        let diff = mat !== this._lastMat;
        for (let j = 0; j < v.length && !diff; j++) if (v[j] !== this._stp[j]) diff = true;
        if (!diff) return;
        this._stp.set(v);
        this._lastMat = mat;

        const p = this._v4;
        mat.setProperty('params', p.set(v[0], v[1], v[2], v[3]));
        mat.setProperty('outlineColor', p.set(v[4], v[5], v[6], v[7]));
        mat.setProperty('underlayColor', p.set(v[8], v[9], v[10], v[11]));
        mat.setProperty('glowColor', p.set(v[12], v[13], v[14], v[15]));
        mat.setProperty('underlay', p.set(v[16], v[17], v[18], v[19]));
        mat.setProperty('glow', p.set(v[20], v[21], v[22], v[23]));
    }
}
