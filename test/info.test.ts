import { test } from 'node:test';
import assert from 'node:assert/strict';
import { locate, scanFences } from '../src/info';

test('finds onnx fences with their line, info string and body', () => {
  const text = '# T\n\n```onnx {caption="c"}\nbox\narrow\n```\n\ntext\n\n~~~onnx\ncircle\n~~~\n';
  assert.deepEqual(scanFences(text, 'onnx'), [
    { line: 2, info: 'onnx {caption="c"}', body: 'box\narrow' },
    { line: 9, info: 'onnx', body: 'circle' }
  ]);
});

test('only the first word of the info string names the language, as in Obsidian', () => {
  const text = '```Onnx\na\n```\n```onnx2\nb\n```\n```onnx extra\nc\n```\n``` onnx\nd\n```';
  assert.deepEqual(scanFences(text, 'onnx').map((f) => f.body), ['c', 'd']);
});

test('an onnx fence quoted inside another fence is not a fence', () => {
  const text = '````markdown\n```onnx\nbox\n```\n````\n\n```onnx\nreal\n```';
  assert.deepEqual(scanFences(text, 'onnx').map((f) => f.body), ['real']);
});

test('a closing fence must use the same character and be at least as long', () => {
  const text = '````onnx\nbox\n```\n~~~~\n````\n';
  assert.deepEqual(scanFences(text, 'onnx'), [{ line: 0, info: 'onnx', body: 'box\n```\n~~~~' }]);
});

test('a backtick fence whose info contains a backtick is not a fence', () => {
  assert.deepEqual(scanFences('```onnx `x`\nbox\n```', 'onnx'), []);
});

test('an unclosed fence runs to the end of the note', () => {
  assert.deepEqual(scanFences('```onnx\nbox\narrow', 'onnx'), [{ line: 0, info: 'onnx', body: 'box\narrow' }]);
});

test('fences in blockquotes and list items lose their container prefix', () => {
  const quoted = '> ```onnx {alt="q"}\n> box\n> ```\n';
  assert.deepEqual(scanFences(quoted, 'onnx'), [{ line: 0, info: 'onnx {alt="q"}', body: 'box' }]);
  const nested = '- item\n\n    ```onnx\n    box\n      indented\n    ```\n';
  assert.deepEqual(scanFences(nested, 'onnx'), [{ line: 2, info: 'onnx', body: 'box\n  indented' }]);
  // Leaving the blockquote closes the fence.
  assert.deepEqual(scanFences('> ```onnx\n> box\nafter', 'onnx'), [{ line: 0, info: 'onnx', body: 'box' }]);
});

test('CRLF line endings are handled', () => {
  assert.deepEqual(scanFences('```onnx\r\nbox\r\n```\r\n', 'onnx'), [{ line: 0, info: 'onnx', body: 'box' }]);
});

test('locate picks the fence in the section, or the matching body when a section holds several', () => {
  const fences = scanFences('```onnx\na\n```\n- x\n  ```onnx\n  b\n  ```\n- y\n  ```onnx\n  c\n  ```\n', 'onnx');
  assert.equal(locate(fences, 0, 2, 'a'), 0);
  assert.equal(locate(fences, 3, 10, 'c\n'), 2);
  assert.equal(locate(fences, 3, 10, 'b'), 1);
  // No body matches: the first in range.
  assert.equal(locate(fences, 3, 10, 'zzz'), 1);
  assert.equal(locate(fences, 20, 30, 'a'), -1);
});
