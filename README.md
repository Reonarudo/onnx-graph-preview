# ONNX Graph Preview

Draws ONNX models written as text as Netron-style graphs in Obsidian, in Reading view and Live
Preview. It draws; it never runs a model. A port of the VS Code extension of the same name.

## Usage

Write a model in a code block tagged `onnx`, in the
[ONNX text syntax](https://onnx.ai/onnx/repo-docs/Syntax.html):

````markdown
```onnx
<ir_version: 8, opset_import: ["" : 17]>
cnn (float[N, 3, 32, 32] x) => (float[N, 10] y) {
  c = Conv <kernel_shape = [3, 3], pads = [1, 1, 1, 1]> (x, w)
  r = Relu (c)
  p = GlobalAveragePool (r)
  y = Gemm <transB = 1> (p, fc_w, fc_b)
}
```
````

The same block also reads the protobuf text form of `ModelProto` (what `onnx.save` writes with
`format="pbtxt"`) and the JSON form (`MessageToJson` of a `ModelProto`), told apart by content.
A binary `.onnx` file cannot go in a code block; convert it to one of these first, for instance
with `onnx.printer.to_text(model)`.

Each operator is a box in the style of [Netron](https://github.com/lutzroeder/netron), whose ONNX
reader draws the block: headed with its type on Netron's category colours, with its non-default
attributes and the initializers it reads as rows. Graph inputs and outputs are pills; tensors are
arrows labelled with their shapes. A name that is used but never declared is drawn as an input.
Nested graphs (an `If`'s branches, a `Loop`'s body) are named in the row but not drawn, and
functions are not drawn. Placement and routing are automatic.

## Fence attributes

An `onnx` block may carry an attribute block:

````markdown
```onnx {caption="Figure 1: the stem" align="center" direction="right"}
stem (float[N, 3, 224, 224] x) => (float[N, 64, 56, 56] y) {
  c = Conv <kernel_shape = [7, 7], strides = [2, 2], pads = [3, 3, 3, 3]> (x, w)
  r = Relu (c)
  y = MaxPool <kernel_shape = [3, 3], strides = [2, 2], pads = [1, 1, 1, 1]> (r)
}
```
````

| Attribute | Effect |
| --- | --- |
| `alt` | An accessible name, for readers who cannot see the graph |
| `caption` | Plain text shown beneath the graph |
| `align` | `left`, `center` or `right` |
| `class` | An extra CSS class on the graph's `<svg>`, alongside the built-in `onnx` class |
| `direction` | `down` (the default) or `right`, exactly: which way the graph flows |

Values must be quoted, with single or double quotes; a backslash escapes a matching quote or a
backslash. Values are plain text, never Markdown or HTML. A mistyped or malformed attribute never
costs you the graph: it is ignored; turn on **Debug logging** in the plugin's settings to see what
was ignored in the developer console. The one exception is `direction`: any value but `down` or
`right` is reported in place of the graph.

Attributes are read from the note's text. Where Obsidian renders a block without its note (some
embeds and exports), the graph renders bare.

## Viewing the source

The plugin follows Obsidian's own handling of Mermaid diagrams:

- **Live Preview:** hovering a graph shows Obsidian's **Edit this block** button in its top
  corner, which opens the code block for editing, as for Mermaid. Live Preview always shows the
  graph.
- **Reading view:** hovering a graph shows a button of the same look in the same corner,
  **Show source**, which flips the block to its source text; **Show graph** flips it back. A
  flipped block stays flipped across re-renders, reopening the note and restarting Obsidian, and
  in every Reading view of the note. Two blocks with the same body are told apart by their order.
  **Show every diagram in this note** in the command palette flips them all back.

## Errors and limits

A model that does not parse is reported in place of the graph, quoting the line with a caret
under the column where the reader stopped. Text that is not a model in any of the three forms
says so in one sentence.

Layout has a time budget, **Layout timeout** in the plugin's settings (`onnx.layoutTimeout`, as
the error card names it): 3 seconds by default, 0.5 to 60. A graph that takes longer is reported
as a timeout and not retried until the block changes or the setting does; a change to the setting
restarts the renderer with the new limit. A block may hold 1 000 000 characters and 1000 nodes;
past that, a static drawing stops being readable, and the block is refused with a message saying
so. Drawings are cached, so editing elsewhere in the note costs nothing.

Graphs follow the theme, as Mermaid diagrams do. In a dark theme they sit on the page in
dark-theme colours: lines and text are lightened only as far as needed to read, filled shapes are
darkened, and hues are kept, so Netron's category colours stay recognisable (layers blue,
activations red, pooling green). Operator boxes and input pills turn dark, and each header's type
text is set dark or light to read on its header. In a light theme graphs sit on a white card with
Netron's exact colours. To keep every graph on a white card, turn off **Follow dark themes** in
the plugin's settings. See `docs/adr/0002-dark-theme-colours.md`.

## Settings and commands

- **Layout timeout**: seconds per graph, as above.
- **Follow dark themes** (on by default): in a dark theme, draw graphs in dark-theme colours, as
  above; off keeps the white card.
- **Debug logging**: ignored attributes, and what the reader skipped or did not draw (nested
  graphs, functions), in the developer console.
- **Restart renderer**: a fresh worker and an empty cache; every open note is drawn again.
- **Show every diagram in this note**: flip every block of the active note back to its graph.

## How it renders

Rendering runs in a Web Worker inside Obsidian, built from
[onnx-renderer](https://github.com/Reonarudo/onnx-renderer): Netron's ONNX reader, the
[Eclipse Layout Kernel](https://github.com/kieler/elkjs) (elkjs) for placement and routing, and
the renderer's drawing. Nothing is downloaded, installed or written to disk; the worker is
embedded in `main.js`, which is why `main.js` is about 2 MB (about 530 KB gzipped), most of it
ELK. See `docs/adr/0001-runtime-host.md`.

Desktop only for now.

## Development

Requires Node 22 or newer (see `.nvmrc`).

~~~sh
npm ci
npm run lint        # tsc --noEmit
npm test            # node --test: attributes, toggle, scanner, DOM, cache, host, and the real worker bundle
npm run build       # main.js, with the worker bundle embedded
npm run vault       # link this repo into ../test-vault as an enabled plugin
npm run test:live   # a real Obsidian with a throwaway profile and vault, driven over CDP
~~~

`npm run test:live` needs Obsidian installed (`OBSIDIAN_EXECUTABLE` overrides the path); it
prints where it saved light and dark screenshots.

The renderer is pinned to a release tarball in `package.json` (`.npmrc` sets
`allow-remote=root` for npm 12). To take a new release, edit the URL, run `npm install`, check
`src/worker/entry.ts` and `src/worker/netron.ts` against the release's `src/worker.ts` and
`src/netron.ts`, check that `scripts/worker-bundle.mjs`'s note on elkjs still holds for the
elkjs version it brings, and run the tests.

## Credits

Models are read by [Netron](https://github.com/lutzroeder/netron) by Lutz Roeder, and laid out by
the [Eclipse Layout Kernel](https://www.eclipse.org/elk/) through
[elkjs](https://github.com/kieler/elkjs).
