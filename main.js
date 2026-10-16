'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'project-assets', 'tmp-text');

function copyDir(src, dst) {
    fs.mkdirSync(dst, { recursive: true });
    for (const name of fs.readdirSync(src)) {
        const s = path.join(src, name), d = path.join(dst, name);
        if (fs.statSync(s).isDirectory()) copyDir(s, d);
        else fs.copyFileSync(s, d);
    }
}

/** Copies TMPLabel + shader into <project>/assets/tmp-text and imports them. */
async function install(force) {
    const dst = path.join(Editor.Project.path, 'assets', 'tmp-text');
    const ver = require('./package.json').version;
    const verFile = path.join(dst, '.tmp-version');
    const exists = fs.existsSync(path.join(dst, 'scripts', 'TMPLabel.ts'));
    const upToDate = exists && fs.existsSync(verFile) && fs.readFileSync(verFile, 'utf8') === ver;
    if (upToDate && !force) return false;
    copyDir(SRC, dst);
    fs.writeFileSync(verFile, ver);
    console.log('[tmp-text] Installed runtime scripts to ' + dst);
    try {
        await Editor.Message.request('asset-db', 'refresh-asset', 'db://assets/tmp-text');
    } catch (e) {
        try { await Editor.Message.request('asset-db', 'refresh-asset', 'db://assets'); } catch (e2) { /* editor will pick it up on focus */ }
    }
    return true;
}

exports.methods = {
    openGenerator() {
        Editor.Panel.open('tmp-text');
    },
    async installRuntime() {
        const did = await install(true);
        console.log(did ? '[tmp-text] Runtime scripts (re)installed.' : '[tmp-text] Nothing to do.');
    },
};

exports.load = function () {
    // asset-db may not be ready yet when the extension loads
    setTimeout(() => { install(false).catch((e) => console.warn('[tmp-text] auto-install failed:', e)); }, 3000);
};
exports.unload = function () {};
