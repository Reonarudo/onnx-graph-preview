# Changelog

## 0.1.3 (2026-11-01)

- Settings come only from Obsidian's declarative settings definitions; the older `display()`
  method, needed only before Obsidian 1.13, is gone (the minimum is 1.14.4).

## 0.1.2 (2026-11-01)

- Releases are built by GitHub Actions from the tagged commit, with signed build provenance
  attestations for `main.js`, `manifest.json` and `styles.css`. Check a download with
  `gh attestation verify main.js -R Reonarudo/onnx-graph-preview`.
- Releases carry only the files Obsidian installs; `SHA256SUMS` is gone, as the attestations
  cover it.

## 0.1.1 (2026-11-01)

- The minimum Obsidian version is now 1.14.4, the version every check ran against; 1.5.0 was
  never tested.

## 0.1.0 (2026-11-01)

First version, ported from the VS Code extension
[onnx-graph-preview](https://github.com/Reonarudo/onnx-markdown-preview) 0.3.0.

- `onnx` code blocks holding a model in the ONNX text syntax, the protobuf text form or the JSON
  form are drawn as Netron-style graphs in Reading view and Live Preview.
- Graphs follow dark themes as Mermaid's do: each colour gets a dark-theme counterpart by its
  role (lines and text lightened only as needed, filled shapes darkened, hues kept), switching
  with the theme without a re-render; a setting keeps them on a white card instead.
- Attribute blocks on the fence: `alt`, `caption`, `align`, `class`, `direction`.
- In Reading view, a button on every block flips it between the graph and its source. It looks
  and sits like Obsidian's own "Edit this block" button and appears on hover. Flips are
  remembered per note, follow renames, and apply in every Reading view of the note.
- In Live Preview the block always shows its graph, and Obsidian's own "Edit this block" button
  opens it for editing, as for Mermaid.
- Parse errors quote the line with a caret; time-outs, the 1 000 000-character and 1000-node
  limits and the 4 MiB output limit behave as in the VS Code extension.
- Rendering runs in a Web Worker inside Obsidian, from onnx-renderer 1.0.0's Netron reader, ELK
  layout and drawing; no Node install is needed.
- Settings: layout timeout (changing it restarts the renderer and retries graphs that timed out),
  following dark themes, debug logging; listed in Obsidian's settings search (1.13 and later).
- The renderer starts with the first graph drawn, not when Obsidian starts.
- Graphs draw in embedded notes, hover previews, Canvas and PDF export, and are built with
  Obsidian's DOM helpers, so pop-out windows get their own elements.
- On an Obsidian whose Chromium lacks `light-dark()`, graphs keep their white card.
- Mobile: the plugin is no longer desktop-only; on touch devices the source button stays visible,
  and on phones a wide graph keeps its natural size and scrolls sideways.
- Commands: restart the renderer; show every diagram in the current note.
