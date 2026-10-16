# TMP Text (SDF text for Cocos Creator 3.8.x)

## Install
1. Copy this folder to `<project>/extensions/tmp-text` (or import the zip) and enable it in Extension Manager.
2. On load the extension copies the runtime (TMPLabel + shader) to `<project>/assets/tmp-text` automatically.
   Re-run via **Panel > TMP Text > Install / Update Runtime Scripts** to repair or update.
3. Menu **Panel > TMP Text > SDF Font Generator**.

## Workflow
1. Generator: pick a TTF/OTF, size 48-64, spread 8, charset -> **Generate**.
   Produces `Name.png` (SDF atlas), `Name.json` (metrics) and `Name.mtl` (material) in `assets/<folder>/`.
2. Add component **TMP/TMPLabel** to a node (with UITransform).
3. Assign `Font Data` = json, `Atlas` = png (the Texture2D sub-asset), `Custom Material` = mtl.

## Tags
`<color=#rrggbb[aa]|name>` `<#rrggbb>` `<alpha=#aa>` `<size=24|+4|150%>` `<b>` `<i>` `<u>` `<s>`
`<mark=#rrggbbaa>` `<cspace=2>` `<voffset=5>` `<align=left|center|right>` `<gradient=#top,#bottom>`
`<link=id>` `<uppercase>` `<lowercase>` `<sup>` `<sub>` `<br>`

Link clicks: `node.on(TMPLabel.LINK_EVENT, (id, label) => ...)`.

## Notes
- Outline/underlay/glow are per-component (material instance), not per-character.
- Bold is a double strike, italic is a vertex shear (SDF has no real bold/italic variants).
- Use a texture with Filter Mode = Bilinear, Mipmap = none, Premultiply Alpha = off.
