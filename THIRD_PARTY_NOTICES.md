# Third-party notices

The plugin's own TypeScript, tests, build scripts and styles are MIT licensed (see `LICENSE`).
This does not relicense the software embedded in `main.js`.

`main.js` embeds a Web Worker bundle, minified by esbuild, built from the following. The exact
versions are locked in `package-lock.json`. Licence texts are reproduced in full in the renderer
package (`node_modules/@reonarudo/onnx-renderer/licenses/`) and in elkjs
(`node_modules/elkjs/LICENSE.md`).

## ONNX renderer

[onnx-renderer](https://github.com/Reonarudo/onnx-renderer) 1.0.0 (MIT) supplies the model
reading glue, the layout preparation and the drawing (`dist/render.js` and the modules it
imports).

## Netron

The ONNX reader is [Netron](https://github.com/lutzroeder/netron) 9.3.1 by Lutz Roeder (MIT),
as vendored unmodified by onnx-renderer (`vendor/netron/`: `onnx.js`, `onnx-proto.js`,
`protobuf.js`, `text.js`, `json.js`), with operator metadata derived from Netron's
`onnx-metadata.json` (embedded as text). The renderer's `THIRD_PARTY_NOTICES.md` and
`vendor/netron/provenance.json` give the commit and checksums.

## elkjs (Eclipse Layout Kernel)

[`elkjs`](https://github.com/kieler/elkjs) 0.12.0, the JavaScript build of the Eclipse Layout
Kernel by Kiel University and the ELK contributors, places every node and routes every edge. It is
dual-licensed EPL-2.0 OR GPL-3.0-or-later and is used here under the **Eclipse Public License
2.0**. Its `lib/elk.bundled.js` is embedded unmodified, minified with the rest of the worker.
Source: <https://github.com/kieler/elkjs> and <https://github.com/eclipse/elk>.

## xmldom

[`@xmldom/xmldom`](https://github.com/xmldom/xmldom) 0.9.12 (MIT), which the renderer uses to
build and serialise each graph.
