# 0002: Dark-theme colours by role, not by inverting the drawing

Status: accepted, 2026-11-01.

## Context

Mermaid diagrams in Obsidian follow the theme. The plugins first did the same with
`filter: invert(1) hue-rotate(180deg)`, which keeps every label's contrast with its own box but
flips every colour, readable or not: gnuplot's yellow line turned dark olive, SMILES chlorine a dark
green, light-blue and orange lines went dim. A Graphviz graph's own background could not be told
from the renderer's default.

## Decision

`src/theme.ts` gives each colour in the drawing a dark counterpart by its role, computed once when
the plugin inserts the SVG, in OKLab so hue is kept:

- **Ink** (strokes, the `color` property, dark marks such as arrowheads, dark text): lightened
  only as far as needed to read on Obsidian's dark page, 3:1 for lines and marks, 5:1 for text
  (4.5 plus a margin for text on a darkened pastel box). Near-black greys become `--text-normal`.
- **Areas** (fills of L 0.4 and up, gradient stops): lightness mirrored between white and the
  page, so paper becomes the page and pale boxes become dark ones.
- **Knockout text** (near-white text, L 0.75 and up with almost no colour, drawn on a dark fill):
  mirrored like an area. Coloured light text, such as a bright green atom label, is ink.
- A fill set on a group that holds text counts as text, so a group colouring its labels reaches
  the text target.
- Text inside a group that also holds a filled shape is checked against that shape's dark fill;
  near-black marks such as arrowheads never count as what a label sits on.

Each colour is written as `light-dark(<original>, <dark>)`, the original text kept verbatim, and
the stylesheet sets the drawing's `color-scheme` to `dark` only in a dark theme with "Follow dark
themes" on. Switching theme or setting needs no re-render; the light theme and the white card are
exactly the renderer's colours.

## Consequences

- Readable colours stay as they are; only what would not read changes.
- The dark targets are measured against Obsidian's default dark page (#1e1e1e) and text
  (#dadada); a custom theme with a much lighter dark background gets less margin.
- Colours the module cannot parse (`url()`, `currentColor`, unknown names) are left alone; so is
  anything a renderer sets in an embedded `<style>`, unless the plugin handles it.
- Flat drawings (pikchr) have no groups, so text on a dark author-chosen fill relies on the
  knockout rule.

## ONNX specifics

Netron's drawing, as onnx-renderer emits it, groups each operator as a white box (`#fff`, outline
`#333`), then its header in the category colour, then the header's type text in white (knockout)
and the attribute and weight rows in black, with `#333` keys. Inputs and outputs are `#eee` pills
with black names and `#555` tensor types; shape labels sit on white chips beside the wires. It
has no stylesheet and no background of its own.

- The theme module checks text in a group against the last filled shape before it, which here is
  the header for every text in the operator. Only the type text sits on the header; the rows sit
  on the box, and were pushed dark on the dark box (1.1 to 2.5:1). `themeOperatorRows` in
  `src/fence.ts` checks the rows against the box instead, leaving `src/theme.ts` identical
  across the plugins.
- Headers are areas or, when dark (activation red, the uncategorised grey), ink lightened to 3:1;
  the type text is then set dark or light to reach 4.5:1 on its header. Measured in Obsidian's
  default dark theme: Conv (layer) 5.25:1, Relu (activation, the weakest) 4.57:1, operator rows
  11.9:1, wires 15:1. `test/worker.test.ts` checks every text of a real graph on what it sits on.
