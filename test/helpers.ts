// Helpers the tests share: a DOM, one fence built the way the plugin builds it, and a dense model.
import { Window } from 'happy-dom';
import { installObsidianDom } from './obsidian-dom';
import type { RenderResult } from '@reonarudo/onnx-renderer';
import { parseAttributes } from '../src/attributes';
import { buildFence, fenceKey, showResult } from '../src/fence';

export const window = new Window();
installObsidianDom(window as never);
export const document = window.document as unknown as Document;

/** A fence with info string `info` and `body`, its rendering slot filled with `result`. */
export function fence(info: string, body: string, result: RenderResult): HTMLElement {
  const parts = buildFence(document.createElement('div'), body, fenceKey(body));
  showResult(parts.rendering, result, parseAttributes(info).attributes, body);
  return parts.wrapper;
}

/** The rendering slot's inner HTML, so the exact-markup tests assert only the rendering. */
export function rendering(wrapper: Element): string {
  return wrapper.querySelector('.onnx-rendering')!.innerHTML;
}

/** A dense graph: every one of 16 inputs feeds every one of 16 Sum nodes, 256 edges that take ELK most of a second. */
export const DENSE = (() => {
  const inputs = Array.from({ length: 16 }, (_, i) => `float[1] i${i}`).join(', ');
  const outputs = Array.from({ length: 16 }, (_, i) => `float[1] o${i}`).join(', ');
  const nodes = Array.from({ length: 16 }, (_, i) => `  o${i} = Sum (${Array.from({ length: 16 }, (_, j) => `i${j}`).join(', ')})`);
  return `dense (${inputs}) => (${outputs}) {\n${nodes.join('\n')}\n}`;
})();
