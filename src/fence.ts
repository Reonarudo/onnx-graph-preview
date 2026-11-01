import type { RenderResult } from '@reonarudo/onnx-renderer';
import type { FenceAttributes } from './attributes';
import { DARK_TEXT, TEXT_CONTRAST, TEXT_ON_PAGE, inkColor, parseColor, readableOn, themeSvg, type Rgb } from './theme';

/**
 * The DOM every onnx code block gets: the port of onnx-markdown-preview's markdown.ts, built as
 * nodes rather than HTML strings. Text from the note (captions, alt text, the source view, error
 * messages and the line they quote) only ever becomes text nodes or attribute values. The graph is
 * the renderer's output, built with xmldom from Netron's model and the ELK layout; it is parsed as
 * XML, never as HTML.
 *
 *   div.onnx-fence[data-fence-key][data-view?]
 *     button.onnx-toggle   both glyphs; the stylesheet shows the one naming the other view.
 *                          Reading view only: in Live Preview Obsidian's own "Edit this block"
 *                          button serves, as for Mermaid, and the stylesheet hides this one.
 *     div.onnx-rendering   the graph (in a figure when captioned or aligned), or an error card
 *     pre > code.language-onnx   the fence body, hidden until the reader flips the fence
 */

/** The class on every graph's root `<svg>`, and the prefix of every class the stylesheet selects. */
export const BASE_CLASS = 'onnx';

/**
 * The library's plain-text result as the words shown in place of a graph. A failure echoes the
 * line it names from `source`, with a caret under the column, so the author need not count.
 */
export function describe(result: Exclude<RenderResult, { status: 'success' }>, source: string): string {
  if (result.status === 'timeout') {
    const seconds = (result.budget / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 });
    return `Layout took longer than ${seconds} s (the Layout timeout setting). ` +
      'Split the model into several fences, or raise the limit.';
  }
  if (result.status === 'unavailable') {
    return `The graph renderer could not start: ${result.reason}. It will retry on the next render.`;
  }
  const lines = source.split('\n');
  const text = result.line !== undefined ? lines[result.line - 1]?.replace(/\r$/, '') : undefined;
  if (text === undefined || result.line === undefined) return result.message;
  const gutter = `${result.line} │ `;
  // Columns are 1-based. One past the end is allowed: that is where the reader points when a token
  // is missing.
  const column = Math.min(Math.max((result.column ?? 1) - 1, 0), text.length + 1);
  return `${result.message}\n\n${gutter}${text}\n${' '.repeat(gutter.length + column)}^`;
}

/** The words for a renderer that threw instead of answering. */
export function failed(cause: string): string {
  return `The graph renderer failed: ${cause}`;
}

/** The fence key: FNV-1a, 32-bit, of the exact body, as eight hex digits. */
export function fenceKey(body: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) {
    hash ^= body.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

// Both glyphs ship; the stylesheet shows the one naming the view a click leads to. They are the
// Lucide icons Obsidian draws its own block buttons with: `code-2`, as on the "Edit this block"
// button Mermaid and every rendered code block get in Live Preview, and `network` for the way back.
const LUCIDE = 'xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const ICON_CODE = `<svg ${LUCIDE} class="svg-icon lucide-code-2 ${BASE_CLASS}-icon-code">` +
  '<path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg>';
const ICON_GRAPH = `<svg ${LUCIDE} class="svg-icon lucide-network ${BASE_CLASS}-icon-graph">` +
  '<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/>' +
  '<path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/></svg>';

/** The button's name in each view: what a click shows. */
const LABEL_SHOW_SOURCE = 'Show source';
const LABEL_SHOW_RENDERING = 'Show graph';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** An SVG document's root, imported into `doc`, or nothing when the markup is not a well-formed SVG `<svg>`. */
function parseSvg(doc: Document, markup: string): Element | undefined {
  const Parser = doc.defaultView?.DOMParser ?? DOMParser;
  const parsed = new Parser().parseFromString(markup, 'image/svg+xml');
  const root = parsed.documentElement;
  if (!root || root.localName !== 'svg' || root.namespaceURI !== SVG_NS) return undefined;
  if (parsed.getElementsByTagName('parsererror').length > 0) return undefined;
  return doc.importNode(root, true);
}

/** The two halves of a `light-dark(<light>, <dark>)` fill in an element's style, if it has one. */
function fillPair(element: Element): { light: string; dark: string } | undefined {
  const declaration = (element.getAttribute('style') ?? '').split(';').find((part) => part.trim().startsWith('fill:'));
  const match = declaration && /^\s*fill:\s*light-dark\((.*), ((?:rgb\([^)]*\))|var\([^)]*\))\)\s*$/.exec(declaration);
  return match ? { light: match[1]!, dark: match[2]! } : undefined;
}

const darkRgb = (value: string): Rgb | undefined => value === 'var(--text-normal)' ? DARK_TEXT : parseColor(value);

/**
 * Netron's operator boxes, after `themeSvg`: a node group holds the box, then the coloured
 * header, then the header's type text and the attribute and weight rows. themeSvg checks every
 * text against the last filled shape before it, the header, but only the type text sits on the
 * header; the rows sit on the box. They are checked against the box here instead.
 */
function themeOperatorRows(svg: Element): void {
  for (const node of svg.querySelectorAll('g.node')) {
    const box = node.querySelector(':scope > rect.box');
    const boxDark = box && fillPair(box) && darkRgb(fillPair(box)!.dark);
    if (!boxDark) continue;
    for (const row of node.querySelectorAll(':scope > text:not(.type)')) {
      const pair = fillPair(row);
      const light = pair && parseColor(pair.light);
      if (!pair || !light) continue;
      const ink = inkColor(light, TEXT_ON_PAGE);
      const readable = readableOn(ink.rgb, boxDark, TEXT_CONTRAST);
      const dark = readable.rgb === ink.rgb ? ink.value : readable.value;
      const style = (row.getAttribute('style') ?? '').split(';').filter((part) => part.trim() && !part.trim().startsWith('fill:'));
      row.setAttribute('style', [...style, `fill:light-dark(${pair.light}, ${dark})`].join(';'));
    }
  }
}

export interface FenceParts {
  wrapper: HTMLElement;
  button: HTMLButtonElement;
  rendering: HTMLElement;
}

/**
 * The wrapper with its toggle, an empty rendering slot, and the source view, built inside
 * `parent` (the element Obsidian hands the code block processor) with Obsidian's `createEl`, so
 * every element belongs to the window the block is drawn in, pop-out windows included.
 */
export function buildFence(parent: HTMLElement, body: string, key: string): FenceParts {
  const wrapper = parent.createDiv({ cls: `${BASE_CLASS}-fence`, attr: { 'data-fence-key': key } });
  // `clickable-icon` is Obsidian's own icon-button class, so the button takes the app's look.
  const button = wrapper.createEl('button', {
    cls: `${BASE_CLASS}-toggle clickable-icon`,
    attr: { type: 'button', 'aria-pressed': 'false', 'aria-label': LABEL_SHOW_SOURCE }
  });
  for (const icon of [ICON_CODE, ICON_GRAPH]) button.append(parseSvg(wrapper.doc, icon)!);
  const rendering = wrapper.createDiv({ cls: `${BASE_CLASS}-rendering` });
  wrapper.createEl('pre').createEl('code', { cls: `language-${BASE_CLASS}`, text: body });
  return { wrapper, button, rendering };
}

/** Flip a wrapper between its rendering and its source view. */
export function setView(wrapper: Element, source: boolean): void {
  if (source) wrapper.setAttribute('data-view', 'source');
  else wrapper.removeAttribute('data-view');
  const button = wrapper.querySelector(`.${BASE_CLASS}-toggle`);
  button?.setAttribute('aria-pressed', source ? 'true' : 'false');
  button?.setAttribute('aria-label', source ? LABEL_SHOW_RENDERING : LABEL_SHOW_SOURCE);
}

export function isSourceView(wrapper: Element): boolean {
  return wrapper.getAttribute('data-view') === 'source';
}

/** A status line while a layout is slow to arrive. */
export function showLoading(rendering: HTMLElement): void {
  rendering.empty();
  rendering.createEl('p', { cls: `${BASE_CLASS}-loading`, attr: { role: 'status' }, text: 'Laying out the graph…' });
}

/** An error card in place of the graph. */
export function showError(rendering: HTMLElement, text: string): void {
  rendering.empty();
  rendering.createDiv({ cls: `${BASE_CLASS}-error`, attr: { role: 'alert' } }).createEl('pre', { text });
}

/**
 * Put the graph in `rendering`: in a figure when captioned or aligned, with the alt text as an
 * accessible name inside the figure, so a caption stays outside the image role.
 */
function place(rendering: HTMLElement, graph: Element, attributes: FenceAttributes): void {
  const figure = attributes.caption === undefined && attributes.align === undefined
    ? rendering
    : rendering.createEl('figure', {
      cls: attributes.align ? `${BASE_CLASS}-figure ${BASE_CLASS}-align-${attributes.align}` : `${BASE_CLASS}-figure`
    });
  const holder = attributes.alt === undefined ? figure : figure.createDiv({ attr: { role: 'img', 'aria-label': attributes.alt } });
  holder.append(graph);
  if (attributes.caption !== undefined) figure.createEl('figcaption', { text: attributes.caption });
}

/**
 * The library's result in the rendering slot: the graph, or an error card quoting `source` (the
 * body the renderer was given). Notes are not shown; the caller logs them.
 */
export function showResult(rendering: HTMLElement, result: RenderResult, attributes: FenceAttributes, source: string): void {
  if (result.status !== 'success') {
    showError(rendering, describe(result, source));
    return;
  }
  const doc = rendering.ownerDocument;
  const svg = parseSvg(doc, result.output);
  if (!svg) {
    showError(rendering, failed('it returned a graph that could not be read'));
    return;
  }
  // Every colour gets its dark-theme counterpart; the stylesheet decides which one shows.
  themeSvg(svg);
  themeOperatorRows(svg);
  // The renderer emits a viewBox and no size, so a small graph would otherwise stretch to the
  // column; its units are pixels. The stylesheet still scales a wide one down.
  const width = svg.getAttribute('viewBox')?.trim().split(/[\s,]+/)[2];
  if (width !== undefined && /^[0-9.]+$/.test(width)) svg.setAttribute('width', `${width}px`);
  // The author's class joins the root's `onnx` class, so the stylesheet's sizing still applies.
  if (attributes.class) svg.setAttribute('class', `${svg.getAttribute('class') ?? ''} ${attributes.class}`.trim());
  rendering.empty();
  place(rendering, svg, attributes);
}
