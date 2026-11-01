# The view toggle

In Reading view, hovering an `onnx` code block below shows a button in its top corner that flips it between the graph and the block's source. In Live Preview the same corner holds Obsidian's own "Edit this block" button, as for Mermaid. This note is the fixture for `npm run test:live` and the document for the manual checklist: open it in Reading view and in Live Preview, in a light and a dark theme.

## 1. A plain fence

```onnx
g (float[N, 3, 32, 32] x) => (float[N, 10] y) {
  c = Conv <kernel_shape = [3, 3], pads = [1, 1, 1, 1]> (x, w, b)
  r = Relu (c)
  p = MaxPool <kernel_shape = [2, 2], strides = [2, 2]> (r)
  f = Flatten (p)
  y = Gemm <transB = 1> (f, fc_w, fc_b)
}
```

## 2. Captioned, centred, laid out to the right: the button stays at the column edge

```onnx {caption="Figure 1: a basic residual block" align="center" direction="right"}
block (float[N, 64, 56, 56] x) => (float[N, 64, 56, 56] y) {
  c1 = Conv <kernel_shape = [3, 3], pads = [1, 1, 1, 1]> (x, w1)
  r1 = Relu (c1)
  c2 = Conv <kernel_shape = [3, 3], pads = [1, 1, 1, 1]> (r1, w2)
  s = Add (c2, x)
  y = Relu (s)
}
```

## 3. Right-aligned with alt: the card stops short of the button

```onnx {alt="a two-node graph" align="right"}
tiny (float[1] x) => (float[1] y) {
  h = Relu (x)
  y = Relu (h)
}
```

## 4. Error card: the line is quoted with a caret, and the source view shows the body alone

```onnx
g (float[1] x) => (float[1] y) {
  y = Relu (x
}
```

## 5. Long lines and a tall body: horizontal scroll, height jump

```onnx
attention (float[B, T, 512] x, bool mask) => (float[B, T, 512] y) {
  q = MatMul (x, wq)
  k = MatMul (x, wk)
  v = MatMul (x, wv)
  kt = Transpose <perm = [0, 2, 1]> (k)
  scores = MatMul (q, kt)
  scaled = Div (scores, scale)
  masked = If <then_branch = yes () => (float[B, T, T] t) { t = Where (mask, scaled, neg_inf) }, else_branch = no () => (float[B, T, T] e) { e = Identity (scaled) }> (mask)
  p = Softmax <axis = -1> (masked)
  y = MatMul (p, v)
}
```

## 6. Two identical bodies: flip the second one only, then edit this heading

```onnx
same (float[1] x) => (float[1] y) {
  y = Relu (x)
}
```

```onnx
same (float[1] x) => (float[1] y) {
  y = Relu (x)
}
```

## 7. An ordinary fence: no toggle, Obsidian's own copy button

```json
{ "compare": "Obsidian's copy button on hover, no view toggle" }
```

## 8. In a list item and a callout: attributes still apply

- A list item holding a graph:

    ```onnx {caption="Inside a list item"}
    listed (float[1] x) => (float[1] y) { y = Sigmoid (x) }
    ```

> [!note] A callout
> ```onnx {caption="Inside a callout" align="center"}
> quoted (float[1] x) => (float[1] y) { y = Tanh (x) }
> ```

## 9. Quirks: a direction other than `down` or `right` is an error card

```onnx {direction="up"}
up (float[1] x) => (float[1] y) { y = Relu (x) }
```

The `direction` attribute reaches the renderer exactly as written, so `up` (or `Right`) is reported in place of the graph, unlike other attribute mistakes, which are ignored. The nested branches of the `If` in section 5 are named but not drawn; with **Debug logging** on, that note appears in the developer console. A graph that exceeds the layout timeout shows a timeout card, which the toggle treats like any error card. 
