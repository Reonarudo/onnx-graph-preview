// The live run: a real Obsidian, launched with a throwaway profile and a throwaway vault holding
// the built plugin and examples/view-toggle.md, driven over the Chrome DevTools Protocol. Covers
// what the unit tests cannot: the processor in Reading view and Live Preview, attributes
// (direction included) recovered from the note, the worker with ELK and Netron inside Obsidian,
// the layout timeout setting's restart, and the toggle's persistence across re-render, reopen
// and plugin reload.
//
// Usage: npm run build && npm run test:live
// Set OBSIDIAN_EXECUTABLE to use an Obsidian other than /Applications/Obsidian.app.
// Screenshots (light and dark, both views) are written to the directory it prints.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const BASE = 'onnx';
const FIXTURE = {
  file: 'examples/view-toggle.md',
  /** onnx blocks in the note, in document order. */
  fences: 10,
  /** Positions of the two blocks with identical bodies. */
  twins: [5, 6],
  /** Position of the block with a parse error. */
  broken: 3,
  /** Position of the block with direction="up". */
  badDirection: 9,
  /** Positions of a block laid out down (the default) and one with direction="right". */
  down: 0,
  sideways: 1
};
const ERRORS = [FIXTURE.broken, FIXTURE.badDirection];
/** Every one of 32 inputs feeds every one of 32 Sum nodes: 1024 edges, seconds of ELK. */
const DENSE = (() => {
  const n = 32;
  const inputs = Array.from({ length: n }, (_, i) => `float[1] i${i}`).join(', ');
  const outputs = Array.from({ length: n }, (_, i) => `float[1] o${i}`).join(', ');
  const nodes = Array.from({ length: n }, (_, i) => `  o${i} = Sum (${Array.from({ length: n }, (_, j) => `i${j}`).join(', ')})`);
  return `dense (${inputs}) => (${outputs}) {\n${nodes.join('\n')}\n}`;
})();
const SMALL = 'g (float[1] x) => (float[1] y) { y = Relu (x) }';
const EXECUTABLE = process.env.OBSIDIAN_EXECUTABLE ?? '/Applications/Obsidian.app/Contents/MacOS/Obsidian';

const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const root = await mkdtemp(join(tmpdir(), `${BASE}-live-`));
const vault = join(root, 'vault');
const shots = join(root, 'screenshots');
const pluginDir = join(vault, '.obsidian', 'plugins', manifest.id);
await mkdir(pluginDir, { recursive: true });
await mkdir(shots);
for (const file of ['main.js', 'manifest.json', 'styles.css']) await cp(file, join(pluginDir, file));
await cp(FIXTURE.file, join(vault, 'view-toggle.md'));
await writeFile(join(vault, 'other.md'), '# Another note\n');
await writeFile(join(vault, '.obsidian', 'community-plugins.json'), JSON.stringify([manifest.id]));
await writeFile(join(vault, '.obsidian', 'app.json'), JSON.stringify({ defaultViewMode: 'preview', livePreview: true }));

const app = spawn(EXECUTABLE, [`--user-data-dir=${join(root, 'profile')}`, '--remote-debugging-port=0'], { stdio: ['ignore', 'ignore', 'pipe'] });
const endpoint = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Obsidian did not open a DevTools port')), 30000);
  app.stderr.on('data', (chunk) => {
    const found = /DevTools listening on (ws:\/\/\S+)/.exec(String(chunk));
    if (found) { clearTimeout(timer); resolve(found[1]); }
  });
  app.on('exit', (code) => reject(new Error(`Obsidian exited with ${code}`)));
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let browser;
let page;
const checks = [];
async function check(name, body) {
  await body();
  checks.push(name);
  console.log(`ok ${checks.length} - ${name}`);
}

/** The window whose URL contains `fragment`, once it exists. */
async function windowWith(fragment) {
  for (let i = 0; i < 120; i++) {
    const found = browser.contexts().flatMap((context) => context.pages()).find((p) => p.url().includes(fragment));
    if (found) return found;
    await sleep(250);
  }
  throw new Error(`no window at ${fragment}`);
}

/** Wrapper states in document order: view, key, and what the rendering slot holds. */
const state = (scope) => page.evaluate(({ base, scope }) => {
  const container = scope === 'live'
    ? app.workspace.activeLeaf.view.containerEl.querySelector('.markdown-source-view')
    : app.workspace.activeLeaf.view.containerEl.querySelector('.markdown-reading-view');
  return [...container.querySelectorAll(`.${base}-fence`)].map((fence) => {
    const slot = fence.querySelector(`.${base}-rendering`);
    return {
      view: fence.getAttribute('data-view') ?? 'rendering',
      key: fence.getAttribute('data-fence-key'),
      holds: slot.querySelector(':scope > svg, :scope > figure, :scope > div[role="img"]') ? 'diagram'
        : slot.querySelector(`.${base}-error`) ? 'error'
        : slot.querySelector(`.${base}-loading`) ? 'loading' : 'empty',
      caption: slot.querySelector('figcaption')?.textContent ?? null,
      align: [...(slot.querySelector('figure')?.classList ?? [])].find((name) => name.startsWith(`${base}-align-`)) ?? null,
      alt: slot.querySelector('[role="img"]')?.getAttribute('aria-label') ?? null,
      error: slot.querySelector(`.${base}-error pre`)?.textContent ?? null,
      width: slot.querySelector('svg')?.getAttribute('width') ?? null,
      viewBox: slot.querySelector('svg')?.getAttribute('viewBox') ?? null,
      card: slot.querySelector(`svg.${base}`) ? getComputedStyle(slot.querySelector(`svg.${base}`)).backgroundColor : null,
      sourceShown: getComputedStyle(fence.querySelector(':scope > pre')).display !== 'none',
      renderingShown: getComputedStyle(slot).display !== 'none'
    };
  });
}, { base: BASE, scope });

/** Reading view renders sections lazily; scroll through so every block is drawn, and wait until none is loading. */
async function settle(scope, count = FIXTURE.fences) {
  for (let i = 0; i < 80; i++) {
    await page.evaluate((scope) => {
      const view = app.workspace.activeLeaf.view;
      const scroller = scope === 'live'
        ? view.containerEl.querySelector('.cm-scroller')
        : view.containerEl.querySelector('.markdown-preview-view');
      scroller.scrollTop = scroller.scrollHeight;
    }, scope);
    await sleep(100);
    const fences = await state(scope);
    if (fences.length === count && fences.every((fence) => fence.holds !== 'loading' && fence.holds !== 'empty')) {
      return fences;
    }
  }
  const last = await state(scope);
  throw new Error(`${scope}: expected ${count} settled blocks, have ${JSON.stringify(last.map((fence) => fence.holds))}`);
}

const click = (scope, position) => page.evaluate(({ base, scope, position }) => {
  const selector = scope === 'live' ? '.markdown-source-view' : '.markdown-reading-view';
  const container = app.workspace.activeLeaf.view.containerEl.querySelector(selector);
  const button = container.querySelectorAll(`.${base}-fence > .${base}-toggle`)[position];
  button.scrollIntoView({ block: 'center' });
  const rect = button.getBoundingClientRect();
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  const hit = document.elementFromPoint(x, y);
  return { x, y, hit: hit === button || button.contains(hit) ? null : `${hit?.tagName}.${hit?.className}` };
}, { base: BASE, scope, position }).then(async ({ x, y, hit }) => {
  if (hit) throw new Error(`block ${position}'s toggle is covered by ${hit}`);
  await page.mouse.click(x, y);
  await sleep(50);
});

const setMode = (mode) => page.evaluate(async (mode) => {
  const leaf = app.workspace.activeLeaf;
  const viewState = leaf.getViewState();
  viewState.state.mode = mode === 'live' ? 'source' : 'preview';
  viewState.state.source = false;
  await leaf.setViewState(viewState);
}, mode);

const storedToggles = async () => {
  await sleep(400);
  const data = JSON.parse(await readFile(join(pluginDir, 'data.json'), 'utf8').catch(() => '{}'));
  return data.toggles?.['view-toggle.md'] ?? null;
};

const views = (fences) => fences.map((fence, index) => fence.view === 'source' ? index : -1).filter((index) => index >= 0);

try {
  browser = await chromium.connectOverCDP(endpoint);
  const starter = await windowWith('starter');
  await starter.evaluate((path) => require('electron').ipcRenderer.sendSync('vault-open', path, false), vault);
  page = await windowWith('index.html');
  // Tall enough for the whole note: Reading view keeps only the sections near the viewport.
  await page.setViewportSize({ width: 1200, height: 9000 });
  await page.waitForFunction(() => window.app?.workspace?.layoutReady, null, { timeout: 30000 });
  await page.evaluate(() => app.changeTheme('obsidian'));
  await page.evaluate(async (id) => {
    await app.plugins.setEnable(true);
    await app.plugins.enablePluginAndSave(id);
  }, manifest.id);
  await page.waitForFunction((id) => !!app.plugins.plugins[id], manifest.id, { timeout: 10000 });
  // A fresh vault greets with a modal (trust prompt or welcome); it would sit over every block.
  for (let i = 0; i < 10; i++) {
    const title = await page.evaluate(() => document.querySelector('.modal-container')?.textContent?.slice(0, 80) ?? null);
    if (title === null) break;
    console.log(`# dismissing modal: ${title}`);
    await page.keyboard.press('Escape');
    await sleep(200);
  }
  await check('the renderer does not start until a diagram is drawn', async () => {
    assert.equal(await page.evaluate((id) => !!app.plugins.plugins[id].host, manifest.id), false);
  });

  await page.evaluate(async () => {
    const file = app.vault.getAbstractFileByPath('view-toggle.md');
    await app.workspace.getLeaf(false).openFile(file, { state: { mode: 'preview' } });
  });

  let fences = await settle('reading');
  await check('Reading view draws every onnx block, wrapped, and no other fence', async () => {
    assert.equal(fences.length, FIXTURE.fences);
    const unclaimed = await page.evaluate((base) => document.querySelectorAll(`.markdown-reading-view pre > code.language-json`).length
      - document.querySelectorAll(`.${base}-fence code.language-json`).length, BASE);
    assert.equal(unclaimed, 1);
    fences.forEach((fence, index) => {
      if (ERRORS.includes(index)) assert.equal(fence.holds, 'error');
      else assert.equal(fence.holds, 'diagram', `block ${index}`);
      assert.equal(fence.view, 'rendering');
      assert.equal(fence.renderingShown, true);
      assert.equal(fence.sourceShown, false);
    });
  });

  await check('attributes are read from the note, including in a list item and a callout', async () => {
    assert.equal(fences[1].caption, 'Figure 1: a basic residual block');
    assert.equal(fences[1].align, `${BASE}-align-center`);
    assert.equal(fences[2].alt, 'a two-node graph');
    assert.equal(fences[2].align, `${BASE}-align-right`);
    assert.equal(fences[7].caption, 'Inside a list item');
    assert.equal(fences[8].caption, 'Inside a callout');
    assert.equal(fences[8].align, `${BASE}-align-center`);
    assert.equal(fences[FIXTURE.broken].error, "Unexpected token '}'.\n\n3 │ }\n    ^");
    assert.equal(fences[FIXTURE.badDirection].error, 'Unknown direction "up": use down or right.');
  });

  await check('direction reaches the renderer, and every graph sits at its natural width', async () => {
    const box = (fence) => fence.viewBox.trim().split(/\s+/).map(Number);
    const [, , downWidth, downHeight] = box(fences[FIXTURE.down]);
    const [, , sideWidth, sideHeight] = box(fences[FIXTURE.sideways]);
    assert.ok(downHeight > downWidth, fences[FIXTURE.down].viewBox);
    assert.ok(sideWidth > sideHeight, fences[FIXTURE.sideways].viewBox);
    for (const fence of fences.filter((fence) => fence.holds === 'diagram')) {
      assert.equal(fence.width, `${box(fence)[2]}px`);
    }
  });

  await check('identical bodies share a fence key', async () => {
    const [a, b] = FIXTURE.twins;
    assert.equal(fences[a].key, fences[b].key);
    assert.equal(new Set(fences.map((fence) => fence.key)).size, FIXTURE.fences - 1);
  });

  await check('graphs take dark-theme colours by default, readable on the page and on their boxes, and the setting keeps the white card', async () => {
    // Section 1's graph: Conv (layer, blue header) with attribute rows, Relu (activation, the
    // darkest header), input pills with tensor types, wires with shape labels on chips.
    const look = () => page.evaluate((base) => {
      const svg = document.querySelectorAll(`.markdown-reading-view svg.${base}`)[0];
      const node = (type) => [...svg.querySelectorAll('g.node')].find((g) => g.querySelector('text.type')?.textContent === type);
      const conv = node('Conv');
      const relu = node('Relu');
      const input = svg.querySelector('g.node.input');
      const chip = svg.querySelector('g.edge rect.label-box');
      const fill = (element) => getComputedStyle(element).fill;
      const css = getComputedStyle(svg);
      return {
        background: css.backgroundColor, filter: css.filter, scheme: css.colorScheme,
        page: getComputedStyle(document.querySelector('.markdown-reading-view .markdown-preview-view')).backgroundColor,
        convHeader: fill(conv.querySelector('.header')), convType: fill(conv.querySelector('text.type')),
        convBox: fill(conv.querySelector('.box')), convRow: fill(conv.querySelector('text.attribute')),
        convKey: fill(conv.querySelector('tspan.key')),
        reluHeader: fill(relu.querySelector('.header')), reluType: fill(relu.querySelector('text.type')),
        pill: fill(input.querySelector('.pill')), pillName: fill(input.querySelector('text.type')), pillTensor: fill(input.querySelector('text.tensor')),
        chip: fill(chip), chipText: fill(chip.parentElement.querySelector('text.label')),
        wire: getComputedStyle(svg.querySelector('path.wire')).stroke, arrow: fill(svg.querySelector('path.arrow')),
        outline: getComputedStyle(conv.querySelector('.box')).stroke
      };
    }, BASE);
    const channels = (css) => (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const luminance = (css) => {
      const [r, g, b] = channels(css).map((c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (x, y) => { const [a, b] = [luminance(x), luminance(y)].sort((p, q) => q - p); return (a + 0.05) / (b + 0.05); };
    const followed = await look();
    assert.equal(followed.background, 'rgba(0, 0, 0, 0)');
    assert.equal(followed.filter, 'none');
    assert.equal(followed.scheme, 'dark');
    for (const [text, on] of [['convType', 'convHeader'], ['reluType', 'reluHeader'], ['convRow', 'convBox'], ['convKey', 'convBox'],
      ['pillName', 'pill'], ['pillTensor', 'pill'], ['chipText', 'chip'], ['chipText', 'page'], ['convRow', 'page']]) {
      assert.ok(contrast(followed[text], followed[on]) >= 4.5, `${text} ${followed[text]} on ${on} ${followed[on]}`);
    }
    for (const line of ['wire', 'arrow', 'outline']) {
      assert.ok(contrast(followed[line], followed.page) >= 3, `${line} ${followed[line]} on ${followed.page}`);
    }
    assert.ok(luminance(followed.convBox) < 0.05, `the white box goes dark: ${followed.convBox}`);
    const [r, , b] = channels(followed.convHeader);
    assert.ok(b > r, `the layer header stays blue: ${followed.convHeader}`);
    console.log(`# dark: Conv type ${contrast(followed.convType, followed.convHeader).toFixed(2)}:1, Relu type ${contrast(followed.reluType, followed.reluHeader).toFixed(2)}:1, rows ${contrast(followed.convRow, followed.convBox).toFixed(2)}:1, wires ${contrast(followed.wire, followed.page).toFixed(2)}:1`);
    await page.evaluate((id) => app.plugins.plugins[id].updateSettings({ followDarkTheme: false }), manifest.id);
    const card = await look();
    assert.equal(card.background, 'rgb(255, 255, 255)');
    assert.equal(card.filter, 'none');
    assert.equal(card.convHeader, 'rgb(51, 85, 136)', 'Netron\'s own colour, exactly');
    assert.equal(card.convType, 'rgb(255, 255, 255)');
    assert.equal(card.convBox, 'rgb(255, 255, 255)');
    assert.equal(card.convRow, 'rgb(0, 0, 0)');
    assert.equal(card.reluHeader, 'rgb(112, 41, 33)');
    assert.equal(card.pill, 'rgb(238, 238, 238)');
    await page.screenshot({ path: join(shots, 'reading-dark-card.png') });
    await page.evaluate((id) => app.plugins.plugins[id].updateSettings({ followDarkTheme: true }), manifest.id);
    assert.equal((await look()).scheme, 'dark');
  });

  await check('without light-dark() support the original colours still draw', async () => {
    // What a Chromium without light-dark() does: every declaration using it is dropped.
    const fallback = await page.evaluate((base) => {
      const svg = document.querySelectorAll(`.markdown-reading-view svg.${base}`)[0].cloneNode(true);
      for (const element of [svg, ...svg.querySelectorAll('*')]) {
        const style = element.getAttribute('style');
        if (style) element.setAttribute('style', style.split(';').filter((part) => !part.includes('light-dark(')).join(';'));
      }
      document.body.append(svg);
      const conv = [...svg.querySelectorAll('g.node')].find((g) => g.querySelector('text.type')?.textContent === 'Conv');
      const out = {
        header: getComputedStyle(conv.querySelector('.header')).fill, type: getComputedStyle(conv.querySelector('text.type')).fill,
        row: getComputedStyle(conv.querySelector('text.attribute')).fill, box: getComputedStyle(conv.querySelector('.box')).fill,
        wire: getComputedStyle(svg.querySelector('path.wire')).stroke
      };
      svg.remove();
      return out;
    }, BASE);
    assert.deepEqual(fallback, { header: 'rgb(51, 85, 136)', type: 'rgb(255, 255, 255)', row: 'rgb(0, 0, 0)', box: 'rgb(255, 255, 255)', wire: 'rgb(0, 0, 0)' });
  });

  await page.screenshot({ path: join(shots, 'reading-dark.png') });

  const [first, second] = FIXTURE.twins;
  await check('a click flips only that block, and a second click flips it back', async () => {
    await click('reading', second);
    fences = await state('reading');
    assert.deepEqual(views(fences), [second]);
    assert.equal(fences[second].sourceShown, true);
    assert.equal(fences[second].renderingShown, false);
    await click('reading', FIXTURE.broken);
    await click('reading', FIXTURE.broken);
    assert.deepEqual(views(await state('reading')), [second]);
    assert.deepEqual(await storedToggles(), [{ key: fences[second].key, ordinal: 1, index: second }]);
  });

  await page.screenshot({ path: join(shots, 'reading-flipped.png') });

  await check('a flip survives a re-render of the view', async () => {
    await page.evaluate(() => app.workspace.activeLeaf.view.previewMode.rerender(true));
    assert.deepEqual(views(await settle('reading')), [second]);
  });

  await check('a flip survives closing and reopening the note', async () => {
    await page.evaluate(async () => {
      const leaf = app.workspace.activeLeaf;
      await leaf.openFile(app.vault.getAbstractFileByPath('other.md'));
      await leaf.openFile(app.vault.getAbstractFileByPath('view-toggle.md'), { state: { mode: 'preview' } });
    });
    assert.deepEqual(views(await settle('reading')), [second]);
  });

  await check('a flip survives reloading the plugin', async () => {
    await page.evaluate(async (id) => {
      await app.plugins.disablePlugin(id);
      await app.plugins.enablePlugin(id);
    }, manifest.id);
    await page.evaluate(() => app.workspace.activeLeaf.view.previewMode.rerender(true));
    assert.deepEqual(views(await settle('reading')), [second]);
  });

  await check('Live Preview always shows the graph and leaves the corner to Obsidian\'s edit button', async () => {
    await setMode('live');
    const live = await settle('live');
    assert.equal(live[8].caption, 'Inside a callout');
    // The flip saved in Reading view does not apply here, as Mermaid has no source view either.
    live.forEach((fence, index) => {
      assert.equal(fence.renderingShown, true, `block ${index}`);
      assert.equal(fence.sourceShown, false, `block ${index}`);
    });
    const corner = await page.evaluate((base) => {
      const block = document.querySelectorAll('.markdown-source-view .cm-preview-code-block')[0];
      block.scrollIntoView({ block: 'center' });
      const toggle = block.querySelector(`.${base}-toggle`);
      const edit = block.querySelector('.edit-block-button').getBoundingClientRect();
      return { toggle: getComputedStyle(toggle).display, x: edit.left + edit.width / 2, y: edit.top + edit.height / 2 };
    }, BASE);
    assert.equal(corner.toggle, 'none');
    await page.mouse.move(corner.x, corner.y);
    await sleep(200);
    const under = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.edit-block-button'), corner);
    assert.equal(under, true);
  });

  await page.screenshot({ path: join(shots, 'live-dark.png') });

  await check('Obsidian\'s edit button opens the fence for editing, as for Mermaid', async () => {
    await page.evaluate(() => app.workspace.activeLeaf.view.editor.setCursor({ line: 0, ch: 0 }));
    await sleep(200);
    const button = await page.evaluate(() => {
      const block = document.querySelectorAll('.markdown-source-view .cm-preview-code-block')[0];
      block.scrollIntoView({ block: 'center' });
      const r = block.querySelector('.edit-block-button').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.move(button.x, button.y);
    await sleep(150);
    await page.mouse.click(button.x, button.y);
    await sleep(300);
    const editing = await page.evaluate(() => {
      const editor = app.workspace.activeLeaf.view.editor;
      return { line: editor.getLine(editor.getCursor().line - 1), selection: editor.getSelection() };
    });
    assert.match(editing.line, /^```onnx/);
    assert.match(editing.selection, /c = Conv <kernel_shape = \[3, 3\]/);
    await page.evaluate(() => app.workspace.activeLeaf.view.editor.setCursor({ line: 0, ch: 0 }));
  });

  await check('in Reading view the button appears on hover, dressed as Obsidian\'s, and names what it shows', async () => {
    await setMode('reading');
    const fences = await settle('reading');
    assert.deepEqual(views(fences), [second]);
    const look = (position) => page.evaluate(({ base, position }) => {
      const fence = document.querySelectorAll(`.markdown-reading-view .${base}-fence`)[position];
      const button = fence.querySelector(`.${base}-toggle`);
      const f = fence.getBoundingClientRect();
      const b = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      return { opacity: style.opacity, background: style.backgroundColor, label: button.getAttribute('aria-label'),
        inset: [Math.round(f.right - b.right), Math.round(b.top - f.top)], size: [Math.round(b.width), Math.round(b.height)] };
    }, { base: BASE, position });
    await page.mouse.move(1, 1);
    await sleep(200);
    const away = await look(first);
    assert.equal(away.opacity, '0');
    assert.equal(away.label, 'Show source');
    assert.deepEqual(away.inset, [4, 4]);
    assert.deepEqual(away.size, [28, 24]);
    assert.equal(away.background, 'rgba(0, 0, 0, 0)');
    const box = await page.evaluate(({ base, position }) => {
      const fence = document.querySelectorAll(`.markdown-reading-view .${base}-fence`)[position];
      fence.scrollIntoView({ block: 'center' });
      const r = fence.getBoundingClientRect();
      return { x: r.left + 40, y: r.top + r.height / 2, top: r.top };
    }, { base: BASE, position: first });
    await page.mouse.move(box.x, box.y);
    await sleep(200);
    assert.equal((await look(first)).opacity, '1');
    await page.screenshot({ path: join(shots, 'reading-hover-button.png'), clip: { x: box.x - 40, y: box.top - 20, width: 760, height: 200 } });
    assert.equal((await look(second)).label, 'Show graph');
  });

  await page.screenshot({ path: join(shots, 'reading-hover.png') });

  await check('a flip reaches the same note open in a second Reading view, and flipping back clears the saved data', async () => {
    await page.evaluate(async () => {
      const file = app.vault.getAbstractFileByPath('view-toggle.md');
      const original = app.workspace.activeLeaf;
      const split = app.workspace.getLeaf('split');
      await split.openFile(file, { state: { mode: 'preview' } });
      app.workspace.setActiveLeaf(original, { focus: true });
    });
    await sleep(1500);
    const otherViews = () => page.evaluate((base) => {
      const leaves = app.workspace.getLeavesOfType('markdown').filter((leaf) => leaf !== app.workspace.activeLeaf);
      return [...leaves[0].view.containerEl.querySelectorAll(`.markdown-reading-view .${base}-fence`)]
        .flatMap((fence, index) => fence.getAttribute('data-view') === 'source' ? [index] : []);
    }, BASE);
    assert.deepEqual(await otherViews(), [second]);
    await click('reading', second);
    assert.deepEqual(views(await state('reading')), []);
    await sleep(300);
    assert.deepEqual(await otherViews(), []);
    assert.equal(await storedToggles(), null);
    await page.evaluate(() => {
      for (const leaf of app.workspace.getLeavesOfType('markdown')) if (leaf !== app.workspace.activeLeaf) leaf.detach();
    });
  });

  await check('the command shows every diagram in the note again', async () => {
    await click('reading', FIXTURE.broken);
    assert.deepEqual(views(await state('reading')), [FIXTURE.broken]);
    await page.evaluate((id) => app.commands.executeCommandById(`${id}:reset-source-views`), manifest.id);
    assert.deepEqual(views(await state('reading')), []);
    assert.equal(await storedToggles(), null);
  });

  await check('the light theme draws the same', async () => {
    await page.evaluate(() => app.changeTheme('moonstone'));
    const light = await settle('reading');
    assert.equal(light.filter((fence) => fence.holds === 'diagram').length, FIXTURE.fences - ERRORS.length);
    const lightLook = await page.evaluate((base) => {
      const svg = document.querySelector(`.markdown-reading-view svg.${base}`);
      const css = getComputedStyle(svg);
      return { scheme: css.colorScheme, filter: css.filter, background: css.backgroundColor,
        header: getComputedStyle(svg.querySelector('.header')).fill, row: getComputedStyle(svg.querySelector('text.attribute')).fill };
    }, BASE);
    assert.deepEqual(lightLook, { scheme: 'light', filter: 'none', background: 'rgb(255, 255, 255)', header: 'rgb(51, 85, 136)', row: 'rgb(0, 0, 0)' });
    for (const fence of light.filter((fence) => fence.holds === 'diagram')) assert.equal(fence.card, 'rgb(255, 255, 255)');
    assert.deepEqual(views(light), []);
    await page.screenshot({ path: join(shots, 'reading-light.png') });
  });

  await check('a hover preview of a link to the note draws its graphs with their attributes', async () => {
    await writeFile(join(vault, 'links.md'), '# Links\n\nSee [[view-toggle]] for graphs.\n');
    await sleep(500);
    await page.evaluate(async () => {
      const preview = app.internalPlugins.plugins['page-preview'];
      if (!preview.enabled) await preview.enable();
      await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath('links.md'), { state: { mode: 'preview' } });
    });
    await sleep(800);
    const link = await page.evaluate(() => {
      const a = app.workspace.activeLeaf.view.containerEl.querySelector('.markdown-reading-view a.internal-link');
      a.scrollIntoView({ block: 'center' });
      const r = a.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.move(link.x - 80, link.y);
    await page.mouse.move(link.x, link.y, { steps: 5 });
    // The popover lays out only the sections near its own small viewport, and these graphs are
    // tall: scroll it, and collect each block once it is drawn.
    const seen = new Map();
    for (let i = 0; i < 60; i++) {
      await sleep(250);
      const now = await page.evaluate((base) => {
        const scroller = document.querySelector('.hover-popover .markdown-preview-view');
        const blocks = [...document.querySelectorAll(`.hover-popover .${base}-fence`)].map((fence) => ({
          key: fence.getAttribute('data-fence-key'),
          drawn: !!fence.querySelector(`.${base}-rendering svg.${base}, .${base}-error`),
          caption: fence.querySelector('figcaption')?.textContent ?? null }));
        if (scroller) scroller.scrollTop += 250;
        return blocks;
      }, BASE);
      for (const block of now) if (block.drawn) seen.set(`${block.key}|${block.caption}`, block);
      const blocks = [...seen.values()];
      if (blocks.length >= 3 && blocks.some((block) => block.caption === 'Figure 1: a basic residual block')) break;
    }
    const blocks = [...seen.values()];
    assert.ok(blocks.length >= 3, `${blocks.length} blocks drawn in the preview`);
    assert.ok(blocks.some((block) => block.caption === 'Figure 1: a basic residual block'));
    await page.mouse.move(5, 5);
    await page.evaluate(async () => {
      await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath('view-toggle.md'), { state: { mode: 'preview' } });
    });
    await settle('reading');
  });

  await check('Export to PDF prints every graph, drawn, with its caption, in light colours and without the button', async () => {
    const pdf = join(root, 'export.pdf');
    // The native save dialog cannot be driven: answer it with a path. Obsidian prints from a window
    // of its own (window.open, as for pop-outs); while it exists, record what it holds. The last
    // record is what was printed.
    await page.evaluate((pdf) => {
      Object.defineProperty(require('@electron/remote').dialog, 'showSaveDialog', {
        configurable: true, writable: true, value: async () => ({ canceled: false, filePath: pdf })
      });
      window.__printed = null;
      window.__printWindow = null;
      const open = window.open;
      window.__restoreOpen = () => { window.open = open; };
      window.open = (...args) => (window.__printWindow = open.apply(window, args));
      window.__printWatch = setInterval(() => {
        const print = window.__printWindow?.document;
        if (!print || !print.querySelector('[class$="-fence"]')) return;
        window.__printed = [...print.querySelectorAll('[class$="-fence"]')].map((fence) => {
          const svg = fence.querySelector('svg:not(.svg-icon)');
          const button = fence.querySelector('button');
          const view = fence.ownerDocument.defaultView;
          return { drawn: !!svg || !!fence.querySelector('[class$="-error"]'), caption: fence.querySelector('figcaption')?.textContent ?? null,
            scheme: svg ? view.getComputedStyle(svg).colorScheme : null, button: button ? view.getComputedStyle(button).opacity : null };
        });
      }, 50);
    }, pdf);
    await page.evaluate(() => app.commands.executeCommandById('workspace:export-pdf'));
    await sleep(800);
    await page.evaluate(() => [...document.querySelectorAll('.modal-container button')].find((button) => /export/i.test(button.textContent)).click());
    let written = false;
    for (let i = 0; i < 60 && !written; i++) {
      await sleep(250);
      written = (await readFile(pdf).catch(() => null))?.length > 1000;
    }
    const printed = await page.evaluate(() => { clearInterval(window.__printWatch); return window.__printed; });
    await page.evaluate(() => window.__restoreOpen());
    assert.ok(written, 'the PDF was written');
    assert.equal(printed?.length, FIXTURE.fences);
    assert.ok(printed.every((block) => block.drawn), JSON.stringify(printed));
    assert.ok(printed.some((block) => block.caption === 'Figure 1: a basic residual block'));
    assert.ok(printed.every((block) => block.scheme === null || block.scheme === 'light'), 'printed in light colours');
    assert.ok(printed.every((block) => block.button === null || block.button === '0'), 'no button on paper');
  });

  await check('settings come from definitions, so Obsidian lists them, and a change keeps the saved flips', async () => {
    await click('reading', FIXTURE.broken);
    const shown = await page.evaluate(async (id) => {
      app.setting.open();
      app.setting.openTabById(id);
      await new Promise((resolve) => setTimeout(resolve, 800));
      const names = [...app.setting.activeTab.containerEl.querySelectorAll('.setting-item-name')].map((el) => el.textContent);
      const numberField = !!app.setting.activeTab.containerEl.querySelector('input[type="number"][min="0.5"][max="60"]');
      const tab = app.setting.pluginTabs.find((one) => one.id === id);
      await tab.setControlValue('debug', true);
      app.setting.close();
      return { names, numberField, debug: app.plugins.plugins[id].settings.debug, defined: tab.getSettingDefinitions().map((item) => item.control?.key) };
    }, manifest.id);
    assert.deepEqual(shown.names, ['Layout timeout', 'Follow dark themes', 'Debug logging']);
    assert.equal(shown.numberField, true, 'drawn from the definitions: the layout timeout is a number field');
    assert.deepEqual(shown.defined, ['layoutTimeout', 'followDarkTheme', 'debug']);
    assert.equal(shown.debug, true);
    const saved = await storedToggles();
    assert.equal(saved?.length, 1, 'the flip made before the change is still saved');
    await click('reading', FIXTURE.broken);
    await page.evaluate((id) => app.plugins.plugins[id].updateSettings({ debug: false }), manifest.id);
  });

  await check('in Obsidian\'s phone emulation the plugin loads, graphs draw, and the button shows without hover and flips on a tap', async () => {
    const reloaded = async () => {
      for (let i = 0; i < 80; i++) {
        await sleep(250);
        const next = browser.contexts().flatMap((context) => context.pages()).find((p) => p.url().includes('index.html'));
        if (next && await next.evaluate(() => window.app?.workspace?.layoutReady === true).catch(() => false)) return next;
      }
      throw new Error('Obsidian did not come back after switching emulation');
    };
    await page.evaluate(() => app.emulateMobile(true)).catch(() => {});
    page = await reloaded();
    await page.setViewportSize({ width: 430, height: 6000 });
    const phone = await page.evaluate((id) => ({ mobile: document.body.classList.contains('is-mobile'), loaded: !!app.plugins.plugins[id] }), manifest.id);
    assert.deepEqual(phone, { mobile: true, loaded: true });
    await page.evaluate(async () => {
      await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath('view-toggle.md'), { state: { mode: 'preview' } });
    });
    let fences = [];
    for (let i = 0; i < 60; i++) {
      await sleep(250);
      fences = await page.evaluate((base) => [...document.querySelectorAll(`.workspace-leaf.mod-active .markdown-reading-view .${base}-fence`)].map((fence) => ({
        drawn: !!fence.querySelector(`.${base}-rendering svg.${base}, .${base}-error`),
        button: getComputedStyle(fence.querySelector(`.${base}-toggle`)).opacity })), BASE);
      if (fences.length === FIXTURE.fences && fences.every((fence) => fence.drawn)) break;
    }
    assert.equal(fences.length, FIXTURE.fences);
    assert.ok(fences.every((fence) => fence.drawn && fence.button === '1'), JSON.stringify(fences));
    await page.screenshot({ path: join(shots, 'phone.png') });
    // A wide graph keeps its natural size on a phone and its slot scrolls sideways, so its labels
    // stay legible; a narrow one is untouched.
    const widths = await page.evaluate((base) => [...document.querySelectorAll(`.workspace-leaf.mod-active .markdown-reading-view .${base}-fence`)].map((fence) => {
      const svg = fence.querySelector(`svg.${base}`);
      const slot = fence.querySelector(`.${base}-rendering`);
      return svg ? { natural: parseFloat(svg.getAttribute('width')), drawn: Math.round(svg.getBoundingClientRect().width), slot: slot.clientWidth, scrolls: slot.scrollWidth > slot.clientWidth } : null;
    }), BASE);
    const wide = widths.filter((one) => one && one.natural > one.slot);
    assert.ok(wide.length >= 2, JSON.stringify(widths));
    for (const one of wide) {
      assert.ok(Math.abs(one.drawn - one.natural) <= 1, `drawn at natural width: ${JSON.stringify(one)}`);
      assert.equal(one.scrolls, true);
    }
    const tap = async () => {
      const box = await page.evaluate((base) => {
        const button = document.querySelectorAll(`.workspace-leaf.mod-active .markdown-reading-view .${base}-toggle`)[0];
        button.scrollIntoView({ block: 'center' });
        const r = button.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }, BASE);
      await page.mouse.click(box.x, box.y);
      await sleep(200);
      return page.evaluate((base) => document.querySelectorAll(`.workspace-leaf.mod-active .markdown-reading-view .${base}-fence`)[0].getAttribute('data-view'), BASE);
    };
    assert.equal(await tap(), 'source');
    assert.equal(await tap(), null);
    await page.evaluate(() => app.emulateMobile(false)).catch(() => {});
    page = await reloaded();
    await page.setViewportSize({ width: 1200, height: 9000 });
    assert.equal(await page.evaluate(() => document.body.classList.contains('is-mobile')), false);
  });

  await check('a layout past the timeout is a timeout card; changing the setting restarts the worker and clears the cache', async () => {
    const run = await page.evaluate(async ({ id, dense, small }) => {
      const plugin = app.plugins.plugins[id];
      await plugin.updateSettings({ layoutTimeout: 0.5 });
      // The restart left no renderer; the next graph starts one.
      const cache = plugin.renderer();
      const host = plugin.host;
      const timedOut = await cache.render({ source: dense });
      const cached = await cache.render({ source: dense });
      let started = performance.now();
      await plugin.updateSettings({ layoutTimeout: 3 });
      const settingMs = Math.round(performance.now() - started);
      const fresh = { host: plugin.host !== host, cache: plugin.cache !== cache };
      const old = await host.render({ source: small });
      started = performance.now();
      const first = await plugin.renderer().render({ source: small + ' ' });
      const startMs = Math.round(performance.now() - started);
      started = performance.now();
      const second = await plugin.renderer().render({ source: small + '  ' });
      const renderMs = Math.round(performance.now() - started);
      return { timedOut, same: cached === timedOut, fresh, old, first: first.status, second: second.status, settingMs, startMs, renderMs };
    }, { id: manifest.id, dense: DENSE, small: SMALL });
    assert.deepEqual(run.timedOut, { status: 'timeout', budget: 500 });
    assert.equal(run.same, true);
    assert.deepEqual(run.fresh, { host: true, cache: true });
    assert.deepEqual(run.old, { status: 'unavailable', reason: 'the renderer was stopped' });
    assert.equal(run.first, 'success');
    assert.equal(run.second, 'success');
    console.log(`# setting change: ${run.settingMs} ms; fresh worker to first graph: ${run.startMs} ms (behind the note's own re-render, engine start and warm-up included); next graph: ${run.renderMs} ms`);
    const data = JSON.parse(await readFile(join(pluginDir, 'data.json'), 'utf8'));
    assert.equal(data.settings.layoutTimeout, 3);
    assert.equal((await settle('reading')).filter((fence) => fence.holds === 'diagram').length, FIXTURE.fences - ERRORS.length);
  });

  await check('the renderer runs in a browser Worker and stops with the plugin', async () => {
    const stopped = await page.evaluate(async ({ id, small }) => {
      const plugin = app.plugins.plugins[id];
      const host = plugin.host;
      await app.plugins.disablePlugin(id);
      return { hadHost: !!host, after: await host.render({ source: small }) };
    }, { id: manifest.id, small: SMALL });
    assert.equal(stopped.hadHost, true);
    assert.deepEqual(stopped.after, { status: 'unavailable', reason: 'the renderer was stopped' });
  });

  console.log(`\n${checks.length} live checks passed. Screenshots: ${shots}`);
} catch (error) {
  await page?.screenshot({ path: 'test-live-failure.png' }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  app.kill();
  await sleep(500);
  await rm(join(root, 'profile'), { recursive: true, force: true }).catch(() => {});
}
