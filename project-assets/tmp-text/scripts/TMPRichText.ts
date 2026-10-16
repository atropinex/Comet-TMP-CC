/**
 * TextMesh-Pro style rich text parser.
 * Supported: <color=#rrggbb[aa]|name> <#rrggbb> <alpha=#aa> <size=24|+4|150%> <b> <i> <u> <s>
 *            <mark=#rrggbbaa> <cspace=2> <voffset=5> <align=left|center|right>
 *            <gradient=#top,#bottom> <link=id> <uppercase> <lowercase> <sup> <sub> <br>
 * Unknown tags are rendered as plain text.
 */
export type RGBA = [number, number, number, number];

export interface TMPStyle {
    color: RGBA;
    size: number;               // absolute px
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strike: boolean;
    mark: RGBA | null;
    cspace: number;             // extra px advance
    voffset: number;            // px
    align: 'left' | 'center' | 'right' | null;
    gradient: [RGBA, RGBA] | null;
    link: string | null;
    caps: 0 | 1 | 2;            // 1 upper, 2 lower
}

export interface TMPChar {
    ch: string;
    style: TMPStyle;
}

const NAMED: Record<string, string> = {
    black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', lime: '#00ff00',
    blue: '#0000ff', yellow: '#ffff00', orange: '#ffa500', purple: '#800080', cyan: '#00ffff',
    magenta: '#ff00ff', grey: '#808080', gray: '#808080', pink: '#ffc0cb', brown: '#a52a2a',
};

export function parseColor(src: string | undefined, fallback: RGBA): RGBA {
    if (!src) return fallback;
    let s = src.trim().replace(/^["']|["']$/g, '').toLowerCase();
    if (NAMED[s]) s = NAMED[s];
    if (s[0] !== '#') return fallback;
    s = s.slice(1);
    if (s.length === 3 || s.length === 4) s = s.split('').map((c) => c + c).join('');
    if (s.length !== 6 && s.length !== 8) return fallback;
    const n = (i: number) => parseInt(s.substr(i, 2), 16) / 255;
    const out: RGBA = [n(0), n(2), n(4), s.length === 8 ? n(6) : 1];
    return out.some(isNaN) ? fallback : out;
}

// sticky so we can match at an index without slicing the string (O(n) overall)
const TAG = /<(\/?)(#[0-9a-f]{3,8}|[a-z-]+)(?:\s*=\s*([^>]*))?>/iy;

function open(name: string, arg: string | undefined, s: TMPStyle, baseSize: number): TMPStyle | null {
    const n: TMPStyle = { ...s };
    switch (name) {
        case 'color': n.color = parseColor(arg, s.color); break;
        case 'alpha': {
            const a = parseInt((arg ?? 'ff').replace('#', ''), 16) / 255;
            n.color = [s.color[0], s.color[1], s.color[2], isNaN(a) ? 1 : a];
            break;
        }
        case 'size': {
            const a = (arg ?? '').trim();
            let v = parseFloat(a);
            if (isNaN(v)) return null;
            if (a.endsWith('%')) v = baseSize * v / 100;
            else if (a[0] === '+' || a[0] === '-') v = s.size + v;
            n.size = Math.max(1, v);
            break;
        }
        case 'b': n.bold = true; break;
        case 'i': n.italic = true; break;
        case 'u': n.underline = true; break;
        case 's': n.strike = true; break;
        case 'mark': n.mark = parseColor(arg ?? '#ffff00', [1, 1, 0, 0.4]); if (!arg) n.mark = [1, 1, 0, 0.4]; break;
        case 'cspace': n.cspace = parseFloat(arg ?? '0') || 0; break;
        case 'voffset': n.voffset = parseFloat(arg ?? '0') || 0; break;
        case 'align': {
            const a = (arg ?? '').replace(/["']/g, '').trim();
            if (a === 'left' || a === 'center' || a === 'right') n.align = a; else return null;
            break;
        }
        case 'gradient': {
            const parts = (arg ?? '').split(',');
            if (parts.length < 2) return null;
            n.gradient = [parseColor(parts[0], s.color), parseColor(parts[1], s.color)];
            break;
        }
        case 'link': n.link = (arg ?? '').replace(/^["']|["']$/g, ''); n.underline = true; break;
        case 'uppercase': case 'allcaps': n.caps = 1; break;
        case 'lowercase': n.caps = 2; break;
        case 'sup': n.voffset = s.voffset + s.size * 0.35; n.size = s.size * 0.6; break;
        case 'sub': n.voffset = s.voffset - s.size * 0.12; n.size = s.size * 0.6; break;
        default: return null;
    }
    return n;
}

export function parseTMP(text: string, baseSize: number, rich: boolean): TMPChar[] {
    const base: TMPStyle = {
        color: [1, 1, 1, 1], size: baseSize, bold: false, italic: false, underline: false, strike: false,
        mark: null, cspace: 0, voffset: 0, align: null, gradient: null, link: null, caps: 0,
    };
    const out: TMPChar[] = [];
    let cur = base;
    const stacks: Record<string, TMPStyle[]> = {};

    let i = 0;
    while (i < text.length) {
        const cp = text.codePointAt(i)!;
        let ch = String.fromCodePoint(cp);

        if (rich && ch === '<') {
            TAG.lastIndex = i;
            const m = TAG.exec(text);
            if (m) {
                const closing = m[1] === '/';
                let name = m[2].toLowerCase();
                let arg = m[3];
                if (name[0] === '#') { arg = name; name = 'color'; }

                if (name === 'br' && !closing) {
                    out.push({ ch: '\n', style: cur });
                    i += m[0].length;
                    continue;
                }
                if (closing) {
                    const st = stacks[name];
                    if (st && st.length) { cur = st.pop()!; i += m[0].length; continue; }
                } else {
                    const next = open(name, arg, cur, baseSize);
                    if (next) {
                        if (!stacks[name]) stacks[name] = [];
                        stacks[name].push(cur);
                        cur = next;
                        i += m[0].length;
                        continue;
                    }
                }
            }
        }

        i += ch.length;
        if (ch === '\r') continue;
        if (cur.caps === 1) ch = ch.toUpperCase(); else if (cur.caps === 2) ch = ch.toLowerCase();
        out.push({ ch, style: cur });
    }
    return out;
}
