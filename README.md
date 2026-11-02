# ONNX Graph Preview

See the structure of an [ONNX](https://onnx.ai) model in your notes. Write the model as text in an
`onnx` code block and it's drawn as a graph in the style of [Netron](https://netron.app), in
Reading view and Live Preview, on desktop and mobile. The plugin only draws models; it never runs
them.

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

## Features

- Graphs in Reading view, Live Preview, embedded notes, hover previews, Canvas cards and exported
  PDFs.
- Operators coloured by kind, as in Netron: layers, activations, pooling, normalisation and more.
- Graphs that flow down or to the right.
- Captions, alignment and alt text for each graph.
- A button to see a model's text without leaving Reading view.
- Follows your theme: graphs stay readable in dark themes.
- Works offline.

## Install

1. In Obsidian, open **Settings → Community plugins** and turn off **Restricted mode** if it's on.
2. Select **Browse**, search for **ONNX Graph Preview**, then select **Install** and **Enable**.

To install by hand instead, download `main.js`, `manifest.json` and `styles.css` from the
[latest release](https://github.com/Reonarudo/onnx-graph-preview/releases/latest) into
`<your vault>/.obsidian/plugins/onnx-graph-preview/`, then enable the plugin.

## Writing models

Put the model in a code block tagged `onnx`, in any of these forms:

- **ONNX text syntax**, as above. The [syntax reference](https://onnx.ai/onnx/repo-docs/Syntax.html)
  describes it.
- **Protobuf text**, as written by `onnx.save` with `format="pbtxt"`.
- **JSON**, as written by `MessageToJson` for a `ModelProto`.

The plugin recognises the form by itself. A binary `.onnx` file can't go in a note; convert it to
text first, for example with `onnx.printer.to_text(model)` in Python.

### What the graph shows

Each operator is a box headed with its type, listing its settings and the weights it uses. Inputs
and outputs are rounded pills, and arrows are labelled with tensor shapes. Placement is automatic.
The branches of `If` and the body of `Loop` are named but not drawn, and functions aren't drawn.

### Captions and other options

Add options in braces after `onnx`:

````markdown
```onnx {caption="Figure 1: The stem" align="center" direction="right"}
stem (float[N, 3, 224, 224] x) => (float[N, 64, 56, 56] y) {
  c = Conv <kernel_shape = [7, 7], strides = [2, 2], pads = [3, 3, 3, 3]> (x, w)
  r = Relu (c)
  y = MaxPool <kernel_shape = [3, 3], strides = [2, 2], pads = [1, 1, 1, 1]> (r)
}
```
````

| Option | What it does |
| --- | --- |
| `direction` | `down` (the default) or `right`: which way the graph flows. |
| `caption` | Text shown under the graph. |
| `align` | `left`, `center` or `right`. |
| `alt` | A description read aloud by screen readers. |
| `class` | A CSS class, for styling the graph with a CSS snippet. |

Put each value in quotes. Values are plain text, not Markdown. If an option is misspelled, it's
ignored and the graph still appears; only a `direction` other than `down` or `right` is shown as
an error.

## Viewing the model text

- **Reading view:** hover over a graph and select the **</>** button in its corner to see the
  text. Select it again to see the graph. Obsidian remembers which graphs you switched, even after
  a restart. **Show every diagram in this note** in the command palette switches them all back.
- **Live Preview:** select Obsidian's own **Edit this block** button, just as for a Mermaid
  diagram.
- **Phones and tablets:** the button is always visible, and a graph wider than the screen scrolls
  sideways so its labels stay readable.

## Dark and light themes

Graphs follow your theme. In a dark theme, boxes turn dark, text and arrows are lightened to read,
and Netron's colours keep their hue. In a light theme, graphs appear on a white card with Netron's
exact colours.

To always show the exact colours on a white card, turn off **Follow dark themes** in the plugin's
settings.

## Settings

| Setting | What it does |
| --- | --- |
| **Layout timeout** | How long laying out a graph may take before it's shown as an error. 3 seconds by default, from 0.5 to 60. |
| **Follow dark themes** | On by default. Turn off to keep every graph on a white card. |
| **Debug logging** | Writes ignored options, and parts of a model that weren't drawn, to the developer console. |

## Commands

| Command | What it does |
| --- | --- |
| **Show every diagram in this note** | Switches every block in the note back from text to graph. |
| **Restart renderer** | Starts the graph engine afresh and redraws open notes. |

## When something goes wrong

- **A model that doesn't parse:** the error appears in place of the graph, quoting the line with a
  caret under the spot where reading stopped.
- **"Layout took longer than…":** the graph hit the **Layout timeout**. Raise the limit in
  settings, or split the model into several blocks.
- **Very large models:** a block may hold up to 1,000,000 characters and 1,000 nodes. Beyond that
  a static drawing stops being readable, and the block says so.

## Privacy

Graphs are drawn on your device, inside Obsidian. The plugin doesn't connect to the internet,
doesn't collect any data, doesn't read or write any files, and never runs a model.

## Credits

Models are read by [Netron](https://github.com/lutzroeder/netron), created by Lutz Roeder, and laid
out by the [Eclipse Layout Kernel](https://www.eclipse.org/elk/) through
[elkjs](https://github.com/kieler/elkjs). The licenses of the software built into this plugin are
listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Released under the [MIT License](LICENSE). To build or change the plugin, see
[DEVELOPMENT.md](DEVELOPMENT.md).
