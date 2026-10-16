'use strict';
const fs = require('fs');
const path = require('path');
const { generate } = require('../../lib/sdf-generator');

const ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('');
const EFFECT_URLS = [
    'db://assets/tmp-text/effects/tmp-sdf.effect', // project-assets/tmp-text copied into <project>/assets/
];

async function createMaterial(url) {
    let uuid = null;
    for (const u of EFFECT_URLS) {
        try { uuid = await Editor.Message.request('asset-db', 'query-uuid', u); } catch (e) { /* next */ }
        if (uuid) break;
    }
    if (!uuid) return false;
    const mtl = {
        __type__: 'cc.Material', _name: '', _objFlags: 0, __editorExtras__: {}, _native: '',
        _effectAsset: { __uuid__: uuid, __expectedType__: 'cc.EffectAsset' },
        _techIdx: 0, _defines: [{}],
        _states: [{ rasterizerState: {}, depthStencilState: {}, blendState: { targets: [{}] } }],
        _props: [{}],
    };
    try {
        await Editor.Message.request('asset-db', 'create-asset', url, JSON.stringify(mtl, null, 2), { overwrite: false });
        return true;
    } catch (e) {
        return false;
    }
}

module.exports = Editor.Panel.define({
    template: `
<div class="root">
  <ui-prop><ui-label slot="label">Font file</ui-label>
    <div slot="content" class="row"><ui-input id="font" placeholder=".ttf / .otf"></ui-input><ui-button id="browse">...</ui-button></div>
  </ui-prop>
  <ui-prop><ui-label slot="label">Name</ui-label><ui-input slot="content" id="name"></ui-input></ui-prop>
  <ui-prop><ui-label slot="label" tooltip="Rasterization size. 48-64 is a good default.">Sample size</ui-label>
    <ui-num-input slot="content" id="size" min="16" max="160" step="1"></ui-num-input></ui-prop>
  <ui-prop><ui-label slot="label" tooltip="Pixels of distance field around each glyph. Bigger = thicker outlines / glow possible.">Spread (padding)</ui-label>
    <ui-num-input slot="content" id="spread" min="2" max="32" step="1"></ui-num-input></ui-prop>
  <ui-prop><ui-label slot="label">Output folder</ui-label><ui-input slot="content" id="folder"></ui-input></ui-prop>
  <ui-prop><ui-label slot="label">Kerning (sets up to 256 chars)</ui-label><ui-checkbox slot="content" id="kerning"></ui-checkbox></ui-prop>
  <div class="row"><ui-label>Characters</ui-label><ui-button id="ascii">Reset to ASCII</ui-button></div>
  <ui-textarea id="chars"></ui-textarea>
  <ui-button id="run" class="run">Generate</ui-button>
  <div id="status"></div>
</div>`,
    style: `
.root { padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.row { display: flex; gap: 6px; align-items: center; justify-content: space-between; }
.row ui-input { flex: 1; }
#chars { width: 100%; height: 160px; }
.run { margin-top: 6px; height: 28px; }
#status { margin-top: 6px; opacity: .85; white-space: pre-wrap; }`,
    $: {
        font: '#font', browse: '#browse', name: '#name', size: '#size', spread: '#spread',
        folder: '#folder', kerning: '#kerning', chars: '#chars', ascii: '#ascii', run: '#run', status: '#status',
    },
    ready() {
        const $ = this.$;
        const status = (s) => { $.status.textContent = s; };

        $.name.value = 'MyFont';
        $.size.value = 48;
        $.spread.value = 8;
        $.folder.value = 'fonts';
        $.kerning.value = true;
        $.chars.value = ASCII;

        $.ascii.addEventListener('confirm', () => { $.chars.value = ASCII; });

        $.browse.addEventListener('confirm', async () => {
            const r = await Editor.Dialog.select({
                title: 'Select font', type: 'file',
                filters: [{ name: 'Fonts', extensions: ['ttf', 'otf', 'woff', 'woff2'] }],
            });
            if (r.canceled || !r.filePaths[0]) return;
            $.font.value = r.filePaths[0];
            $.name.value = path.basename(r.filePaths[0], path.extname(r.filePaths[0])).replace(/[^\w-]/g, '_');
        });

        $.run.addEventListener('confirm', async () => {
            try {
                const fontPath = $.font.value;
                if (!fontPath || !fs.existsSync(fontPath)) return status('Pick a font file first.');
                const name = ($.name.value || 'MyFont').replace(/[^\w-]/g, '_');
                const folder = ($.folder.value || 'fonts').replace(/^[\\/]+|[\\/]+$/g, '').replace(/\\/g, '/');

                const buf = fs.readFileSync(fontPath);
                const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

                status('Starting...');
                const res = await generate({
                    fontBuffer: ab, name,
                    size: Number($.size.value), spread: Number($.spread.value),
                    chars: $.chars.value, kerning: !!$.kerning.value,
                    onProgress: status,
                });

                const outDir = path.join(Editor.Project.path, 'assets', folder);
                fs.mkdirSync(outDir, { recursive: true });
                fs.writeFileSync(path.join(outDir, name + '.png'), res.png);
                fs.writeFileSync(path.join(outDir, name + '.json'), JSON.stringify(res.json));

                status('Importing assets...');
                try { await Editor.Message.request('asset-db', 'refresh-asset', `db://assets/${folder}`); }
                catch (e) { await Editor.Message.request('asset-db', 'refresh-asset', 'db://assets'); }

                const okMat = await createMaterial(`db://assets/${folder}/${name}.mtl`);
                status(
                    `Done: assets/${folder}/${name}.png (${res.json.atlasW}x${res.json.atlasH}), ${name}.json` +
                    (okMat ? `, ${name}.mtl` : '\nCould not auto-create the material - create one from the tmp-sdf effect by hand.')
                );
            } catch (e) {
                console.error(e);
                status('Error: ' + (e && e.message ? e.message : e));
            }
        });
    },
    close() {},
});
