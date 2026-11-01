import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAttributes } from '../src/attributes';

test('reads quoted key="value" pairs, in either quote style, with escapes', () => {
  const { attributes, diagnostics } = parseAttributes(`onnx {alt="A \\"net\\"" caption='Figure 1' align="center" class="wide" direction="RIGHT"}`);
  assert.deepEqual(attributes, { alt: 'A "net"', caption: 'Figure 1', align: 'center', class: 'wide', direction: 'RIGHT' });
  assert.deepEqual(diagnostics, []);
});

test('a bare tag has no attributes and nothing to report', () => {
  assert.deepEqual(parseAttributes('onnx'), { attributes: {}, diagnostics: [] });
  assert.deepEqual(parseAttributes('onnx   '), { attributes: {}, diagnostics: [] });
});

test('unknown keys, duplicates and bad alignments are dropped one by one, with a note each', () => {
  const { attributes, diagnostics } = parseAttributes('onnx {algin="x" alt="a" alt="b" align="middle" direction="up"}');
  // The direction is the renderer's to judge (ADR 0008), so even "up" is passed through.
  assert.deepEqual(attributes, { alt: 'a', direction: 'up' });
  assert.deepEqual(diagnostics, [
    'Unknown attribute "algin"; ignored.',
    'Duplicate attribute "alt"; keeping the first value.',
    'Unknown alignment "middle"; ignored.'
  ]);
});

test('a block that is not braces, or not pairs, is ignored whole', () => {
  assert.deepEqual(parseAttributes('onnx alt=x'), { attributes: {}, diagnostics: ['Attributes must be wrapped in braces; ignoring "alt=x".'] });
  const malformed = parseAttributes('onnx {alt="a" caption=unquoted}');
  assert.deepEqual(malformed.attributes, {});
  assert.equal(malformed.diagnostics.length, 1);
  assert.match(malformed.diagnostics[0]!, /^Expected quoted key="value" pairs; ignoring the whole attribute block at "caption=unquoted"\.$/);
});

test('never throws, whatever the info string', () => {
  for (const info of ['onnx {', 'onnx }', 'onnx {"}', 'onnx {=}', 'onnx {a=}', 'onnx {a="\\"}', 'onnx {\u0000}']) {
    assert.doesNotThrow(() => parseAttributes(info), info);
  }
});
