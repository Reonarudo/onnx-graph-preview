// The DOM each onnx block gets: onnx-markdown-preview's test/markdown.test.ts, ported from HTML
// strings to built nodes. Tests about delegating other fences, the delegated highlighter, VS
// Code's scroll sync (code-line, data-line) and the output channel are gone with the markdown-it
// rule; Obsidian routes blocks by language itself, and the plugin passes `direction` (main.ts,
// asserted live). What the renderer is asked is asserted in worker.test.ts and cache.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RenderResult } from '@reonarudo/onnx-renderer';
import { buildFence, describe, failed, fenceKey, isSourceView, setView, showError, showLoading } from '../src/fence';
import { DARK_TEXT, TEXT_CONTRAST, contrast, parseColor, type Rgb } from '../src/theme';
import { document, fence, rendering } from './helpers';

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const graph = (output = `<svg ${NS} class="onnx" viewBox="-8 -8 110 308"></svg>`): RenderResult => ({ status: 'success', output, notes: [] });
/** What the slot holds for the default graph once its natural width is set from the viewBox. */
const SVG = `<svg ${NS} class="onnx" viewBox="-8 -8 110 308" width="110px"></svg>`;

const LUCIDE = 'xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const ICON_CODE = `<svg ${LUCIDE} class="svg-icon lucide-code-2 onnx-icon-code">` +
  '<path d="m18 16 4-4-4-4"></path><path d="m6 8-4 4 4 4"></path><path d="m14.5 4-5 16"></path></svg>';
const ICON_GRAPH = `<svg ${LUCIDE} class="svg-icon lucide-network onnx-icon-graph">` +
  '<rect x="16" y="16" width="6" height="6" rx="1"></rect><rect x="2" y="16" width="6" height="6" rx="1"></rect><rect x="9" y="2" width="6" height="6" rx="1"></rect>' +
  '<path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"></path><path d="M12 12V8"></path></svg>';
const TOGGLE = `<button class="onnx-toggle clickable-icon" type="button" aria-pressed="false" aria-label="Show source">${ICON_CODE}${ICON_GRAPH}</button>`;

// The DOM contract, asserted exactly once, here.
test('every block is wrapped: toggle first, rendering slot, then the source <pre>', () => {
  assert.equal(fence('onnx', 'm\n', graph()).outerHTML,
    `<div class="onnx-fence" data-fence-key="bd2eb076">${TOGGLE}` +
    `<div class="onnx-rendering">${SVG}</div>` +
    '<pre><code class="language-onnx">m\n</code></pre></div>');
});

test('the error card sits in the rendering slot, with the source <pre> beside it', () => {
  assert.equal(fence('onnx', 'm\n', { status: 'failure', message: 'no' }).outerHTML,
    `<div class="onnx-fence" data-fence-key="bd2eb076">${TOGGLE}` +
    '<div class="onnx-rendering"><div class="onnx-error" role="alert"><pre>no</pre></div></div>' +
    '<pre><code class="language-onnx">m\n</code></pre></div>');
  // A renderer that threw: main.ts shows this card in the slot.
  const parts = buildFence(document.createElement('div'), 'm\n', fenceKey('m\n'));
  showError(parts.rendering, failed('x'));
  assert.equal(rendering(parts.wrapper), '<div class="onnx-error" role="alert"><pre>The graph renderer failed: x</pre></div>');
});

test('the fence key is FNV-1a of the exact body', () => {
  assert.equal(fenceKey('m\n'), 'bd2eb076');
  assert.equal(fenceKey(''), '811c9dc5');
  assert.notEqual(fenceKey('m \n'), 'bd2eb076');
  assert.match(fenceKey('m \n'), /^[0-9a-f]{8}$/);
  // The info string and attributes play no part: same body, same key.
  assert.equal(fence('onnx {caption="c"}', 'm\n', graph()).getAttribute('data-fence-key'), 'bd2eb076');
});

test('the source view is the body as text, never markup', () => {
  const wrapper = fence('onnx {alt="x"}', '<m>\n', graph());
  assert.equal(wrapper.querySelector('pre > code')!.textContent, '<m>\n');
  assert.equal(wrapper.querySelector('pre > code')!.innerHTML, '&lt;m&gt;\n');
});

test('setView flips the wrapper, the button state and its name, and back', () => {
  const wrapper = fence('onnx', 'm', graph());
  const button = wrapper.querySelector('button')!;
  setView(wrapper, true);
  assert.equal(wrapper.getAttribute('data-view'), 'source');
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  assert.equal(button.getAttribute('aria-label'), 'Show graph');
  assert.equal(isSourceView(wrapper), true);
  setView(wrapper, false);
  assert.equal(wrapper.hasAttribute('data-view'), false);
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  assert.equal(button.getAttribute('aria-label'), 'Show source');
});


test('the loading line sits in the rendering slot', () => {
  const parts = buildFence(document.createElement('div'), 'm', fenceKey('m'));
  showLoading(parts.rendering);
  assert.equal(rendering(parts.wrapper), '<p class="onnx-loading" role="status">Laying out the graph…</p>');
});

test('alt, caption, align and class wrap the drawing, as text', () => {
  const wrapper = fence('onnx {alt="A <net>" caption="Fig <1>" align="center" class="x&y"}', 'm\n', graph());
  assert.equal(rendering(wrapper),
    `<figure class="onnx-figure onnx-align-center"><div role="img" aria-label="A <net>"><svg ${NS} class="onnx x&amp;y" viewBox="-8 -8 110 308" width="110px"></svg></div><figcaption>Fig &lt;1&gt;</figcaption></figure>`);
  assert.equal(wrapper.querySelector('figcaption')!.textContent, 'Fig <1>');
  assert.equal(rendering(fence('onnx', 'm\n', graph())), SVG);
});

test('align alone still produces a figure to carry the class', () => {
  assert.equal(rendering(fence('onnx {align="right"}', 'm', graph())), `<figure class="onnx-figure onnx-align-right">${SVG}</figure>`);
});

test('a fence class cannot break out of the class attribute', () => {
  const wrapper = fence(`onnx {class='x" onload="alert(1)"><img src=x onerror=alert(1)>'}`, 'm', graph());
  assert.equal(wrapper.querySelectorAll('img').length, 0);
  const svg = wrapper.querySelector('.onnx-rendering > svg')!;
  assert.equal(svg.getAttribute('onload'), null);
  assert.equal(svg.getAttribute('class'), 'onnx x" onload="alert(1)"><img src=x onerror=alert(1)>');
});

test('the graph keeps its natural width from the viewBox, and an SVG without one is left as is', () => {
  const wide = fence('onnx', 'm', graph(`<svg ${NS} class="onnx" viewBox="-8 -8 412.5 90" font-family="x"></svg>`));
  assert.equal(rendering(wide), `<svg ${NS} class="onnx" viewBox="-8 -8 412.5 90" font-family="x" width="412.5px"></svg>`);
  const bare = fence('onnx', 'm', graph(`<svg ${NS} class="onnx"></svg>`));
  assert.equal(rendering(bare), `<svg ${NS} class="onnx"></svg>`);
});

test('failures are reported in place, as text, with the offending line and a caret under the 1-based column', () => {
  const wrapper = fence('onnx {caption="Not shown"}', 'g (x) => (y) {\n  y = }',
    { status: 'failure', message: 'Unexpected token \'}\'.', line: 2, column: 5 });
  assert.equal(rendering(wrapper), '<div class="onnx-error" role="alert"><pre>Unexpected token \'}\'.\n\n2 │   y = }\n        ^</pre></div>');
  assert.equal(wrapper.querySelectorAll('figcaption').length, 0);
  const plain = fence('onnx', 'm', { status: 'failure', message: 'Unknown direction "<up>": use down or right.' });
  assert.equal(rendering(plain), '<div class="onnx-error" role="alert"><pre>Unknown direction "&lt;up&gt;": use down or right.</pre></div>');
});

test('the caret stays within one past the end of the line, and a line out of range quotes nothing', () => {
  const failure = (line: number, column?: number): RenderResult =>
    column === undefined ? { status: 'failure', message: 'e', line } : { status: 'failure', message: 'e', line, column };
  assert.equal(describe(failure(1, 99) as never, 'ab\r\n'), 'e\n\n1 │ ab\n       ^');
  assert.equal(describe(failure(1, 0) as never, 'ab'), 'e\n\n1 │ ab\n    ^');
  assert.equal(describe(failure(1) as never, 'ab'), 'e\n\n1 │ ab\n    ^');
  assert.equal(describe(failure(5, 1) as never, 'ab'), 'e');
});

test('timeouts and an unavailable renderer explain themselves', () => {
  assert.match(rendering(fence('onnx', 'm', { status: 'timeout', budget: 2500 })),
    /onnx-error[^]*Layout took longer than 2\.5 s \(the Layout timeout setting\)\. Split the model into several fences, or raise the limit\./);
  assert.match(rendering(fence('onnx', 'm', { status: 'unavailable', reason: 'no <worker>' })),
    /could not start: no &lt;worker&gt;\. It will retry on the next render\./);
});

test('attribute text stays text, including quotes, markup and Markdown', () => {
  const wrapper = fence('onnx {alt="<img src=x onerror=alert(1)>" caption="**bold** & \\"quoted\\""}', 'm', graph());
  assert.equal(wrapper.querySelectorAll('img, strong').length, 0);
  assert.equal(wrapper.querySelector('[role="img"]')!.getAttribute('aria-label'), '<img src=x onerror=alert(1)>');
  assert.equal(wrapper.querySelector('figcaption')!.textContent, '**bold** & "quoted"');
});

test('malformed or unknown attributes are ignored and the graph still renders bare', () => {
  assert.equal(rendering(fence('onnx {alt="unterminated}', 'm\n', graph())), SVG);
  assert.equal(rendering(fence('onnx {algin="x"}', 'm\n', graph())), SVG);
});

test('output that is not a well-formed SVG <svg> becomes an error card, not markup', () => {
  for (const output of ['<img src=x onerror=alert(1)>', `<svg ${NS}><unclosed></svg>`, 'plain text', '<html><body/></html>', '<svg class="onnx"></svg>']) {
    const wrapper = fence('onnx', 'm', { status: 'success', output, notes: [] });
    assert.equal(rendering(wrapper), '<div class="onnx-error" role="alert"><pre>The graph renderer failed: it returned a graph that could not be read</pre></div>', output);
  }
});

// Dark-theme colours (src/theme.ts) on Netron's operator boxes: the header's type text reads on the
// header, and the attribute rows, which follow the header in the group, read on the box.
const darkFill = (element: Element): Rgb => {
  const declaration = (element.getAttribute('style') ?? '').split(';').find((part) => part.startsWith('fill:'))!;
  const dark = /, ((?:rgb\([^)]*\))|var\([^)]*\))\)$/.exec(declaration)![1]!;
  return dark === 'var(--text-normal)' ? DARK_TEXT : parseColor(dark)!;
};
const lightFill = (element: Element): string => /^fill:light-dark\((.*), (?:rgb\([^)]*\)|var\([^)]*\))\)$/.exec(
  (element.getAttribute('style') ?? '').split(';').find((part) => part.startsWith('fill:'))!)![1]!;

test('operator rows read on the box and the type on its header in dark colours; light colours stay exact', () => {
  const output = `<svg ${NS} class="onnx" viewBox="0 0 100 60"><g class="node">` +
    '<rect class="box" fill="#fff" stroke="#333"/><path class="header category-layer" fill="rgb(51, 85, 136)"/>' +
    '<text class="type" fill="#fff">Conv</text><text class="attribute" fill="#000"><tspan class="key" fill="#333">pads</tspan> = 1</text>' +
    '<text class="weight" fill="#000">W</text></g>' +
    '<g class="node input"><rect class="pill" fill="#eee" stroke="#333"/><text class="type" fill="#000">x</text><text class="tensor" fill="#555">float32</text></g></svg>';
  const svg = fence('onnx', 'm', graph(output)).querySelector('.onnx-rendering > svg')!;
  const box = darkFill(svg.querySelector('.box')!);
  const header = darkFill(svg.querySelector('.header')!);
  assert.ok(contrast(darkFill(svg.querySelector('.node .type')!), header) >= TEXT_CONTRAST, 'type on header');
  for (const row of svg.querySelectorAll('.attribute, .weight, .key')) {
    assert.ok(contrast(darkFill(row), box) >= TEXT_CONTRAST, `${row.getAttribute('class')} on the box`);
  }
  const pill = darkFill(svg.querySelector('.pill')!);
  for (const text of svg.querySelectorAll('.input text')) assert.ok(contrast(darkFill(text), pill) >= TEXT_CONTRAST);
  assert.equal(lightFill(svg.querySelector('.attribute')!), '#000');
  assert.equal(lightFill(svg.querySelector('.header')!), 'rgb(51, 85, 136)');
  assert.equal(lightFill(svg.querySelector('.node .type')!), '#fff');
});
