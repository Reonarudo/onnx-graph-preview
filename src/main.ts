import {
  MarkdownRenderChild, MarkdownView, Plugin, TFile, debounce,
  type MarkdownPostProcessorContext
} from 'obsidian';
import type { RenderInput } from '@reonarudo/onnx-renderer';
import WORKER_SOURCE from 'virtual:render-worker';
import { parseAttributes, type FenceAttributes } from './attributes';
import { createCache, type CachedRender } from './cache';
import { BASE_CLASS, buildFence, failed, fenceKey, isSourceView, setView, showError, showLoading, showResult } from './fence';
import { createHost, type Host, type WorkerLike } from './host';
import { locate, scanFences } from './info';
import { DEFAULT_SETTINGS, OnnxSettingTab, budget, readSettings, type Settings } from './settings';
import { ToggleStore } from './toggle';

/** The language word Obsidian matches for this plugin's code blocks. */
const WORD = 'onnx';

/** A slow layout shows a status line after this long; a fast one never flickers. */
const LOADING_DELAY_MS = 150;

/** Body class that turns on the dark-theme inversion in styles.css. */
const FOLLOW_DARK_CLASS = `${BASE_CLASS}-follow-dark`;

/** Where a code block sits in its note: its attributes, and its place among the note's onnx fences. */
interface Placement {
  attributes: FenceAttributes;
  diagnostics: string[];
  /** Fence keys of every onnx fence in the note, in order, and this block's index among them. */
  keys?: string[];
  index?: number;
}

/** One rendered code block; Obsidian unloads it when the block leaves the view or the note changes. */
class FenceChild extends MarkdownRenderChild {
  live = true;

  constructor(el: HTMLElement, private readonly forget: () => void) {
    super(el);
  }

  onunload(): void {
    this.live = false;
    this.forget();
  }
}

/** A drawn block, so a flip in one view of a note reaches the same block in its other views. */
interface Drawn {
  notePath: string;
  wrapper: HTMLElement;
  /** Re-read the block's place in the note and show the remembered view. */
  sync(): Promise<void>;
}

/** A fence's first line, for labelling what is logged about it. */
function label(source: string): string {
  const first = source.trim().split('\n', 1)[0]!.trim();
  return first.length > 60 ? `${first.slice(0, 59)}…` : first;
}

export default class OnnxPlugin extends Plugin {
  settings: Settings = DEFAULT_SETTINGS;
  private toggles!: ToggleStore;
  /** The renderer, started by the first graph drawn (`renderer()`), not at load. */
  private host: Host | undefined;
  private cache: CachedRender | undefined;
  private workerUrl: string | undefined;
  private readonly drawn = new Set<Drawn>();
  private readonly saveSoon = debounce(() => void this.persist(), 200, true);

  async onload(): Promise<void> {
    const data = (await this.loadData()) as { settings?: unknown; toggles?: unknown } | null;
    this.settings = readSettings(data?.settings);
    this.toggles = new ToggleStore(data?.toggles, () => this.saveSoon());


    this.registerMarkdownCodeBlockProcessor(WORD, (source, el, ctx) => this.process(source, el, ctx));
    this.addSettingTab(new OnnxSettingTab(this.app, this));

    this.addCommand({
      id: 'restart-renderer',
      name: 'Restart renderer',
      callback: () => this.restart()
    });
    this.addCommand({
      id: 'reset-source-views',
      name: 'Show every diagram in this note',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) {
          this.toggles.clear(file.path);
          for (const drawn of this.drawn) if (drawn.notePath === file.path) setView(drawn.wrapper, false);
        }
        return true;
      }
    });

    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => this.toggles.rename(oldPath, file.path)));
    this.registerEvent(this.app.vault.on('delete', (file) => this.toggles.clear(file.path)));

    this.applyTheme(document);
    this.registerEvent(this.app.workspace.on('window-open', (win) => this.applyTheme(win.doc)));
  }

  onunload(): void {
    this.host?.dispose();
    this.host = undefined;
    if (this.workerUrl) URL.revokeObjectURL(this.workerUrl);
    document.body.classList.remove(FOLLOW_DARK_CLASS);
    void this.persist();
  }

  async updateSettings(change: Partial<Settings>): Promise<void> {
    const before = this.settings;
    this.settings = readSettings({ ...before, ...change });
    await this.persist();
    // The budget is taken once per host, as the library takes it once per runtime; a fresh host
    // with a fresh cache retries the graphs that timed out under the old one.
    if (this.settings.layoutTimeout !== before.layoutTimeout) this.restart();
    if (change.followDarkTheme !== undefined) this.applyTheme(document);
  }

  private async persist(): Promise<void> {
    await this.saveData({ settings: this.settings, toggles: this.toggles.toJSON() });
  }

  /**
   * The renderer, started on first use: a vault with no onnx blocks never starts the worker or
   * loads Netron and ELK.
   */
  private renderer(): CachedRender {
    if (this.cache) return this.cache;
    this.workerUrl ??= URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
    const url = this.workerUrl;
    const host = createHost(
      () => new Worker(url, { name: 'onnx-graph-preview' }) as unknown as WorkerLike,
      { timeout: budget(this.settings) }
    );
    this.host = host;
    this.cache = createCache((input) => host.render(input).then((result) => {
      // What the reader skipped or did not draw never reaches the note; heard once per fresh render.
      if (result.status === 'success') for (const note of result.notes) this.log(`${label(input.source)}: ${note}`);
      return result;
    }));
    return this.cache;
  }

  /**
   * Stop the worker and forget every result; the next graph starts a fresh worker with the
   * current settings, and every open note is drawn again.
   */
  private restart(): void {
    this.host?.dispose();
    this.host = undefined;
    this.cache = undefined;
    this.rerender();
  }

  private rerender(): void {
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      if (leaf.view instanceof MarkdownView) leaf.view.previewMode.rerender(true);
    }
  }

  private applyTheme(doc: Document): void {
    doc.body.classList.toggle(FOLLOW_DARK_CLASS, this.settings.followDarkTheme);
  }

  private log(message: string): void {
    if (this.settings.debug) console.debug(`[${this.manifest.id}] ${message}`);
  }

  private async process(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<void> {
    const parts = buildFence(el, source, fenceKey(source));
    const drawn: Drawn = {
      notePath: ctx.sourcePath,
      wrapper: parts.wrapper,
      sync: async () => {
        const now = await this.place(source, el, ctx);
        if (now.keys && now.index !== undefined) setView(parts.wrapper, this.toggles.isFlipped(ctx.sourcePath, now.keys, now.index));
      }
    };
    const child = new FenceChild(el, () => this.drawn.delete(drawn));
    ctx.addChild(child);
    this.drawn.add(drawn);

    child.registerDomEvent(parts.button, 'mousedown', (event) => {
      // In Live Preview a click inside the block would move the cursor into it and swap the
      // widget for its Markdown; the toggle is a reader's control, so it keeps the widget.
      event.preventDefault();
      event.stopPropagation();
    });
    child.registerDomEvent(parts.button, 'click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const flipped = !isSourceView(parts.wrapper);
      setView(parts.wrapper, flipped);
      // Placed again on click: the note may have changed since this block was drawn.
      void this.place(source, el, ctx).then((now) => {
        if (!now.keys || now.index === undefined) return;
        this.toggles.set(ctx.sourcePath, now.keys, now.index, flipped);
        // The note's other views (Reading view kept beside Live Preview, a split, a pop-out) follow.
        for (const other of this.drawn) if (other !== drawn && other.notePath === ctx.sourcePath) void other.sync();
      });
    });

    const placement = await this.place(source, el, ctx);
    if (!child.live) return;
    for (const diagnostic of placement.diagnostics) this.log(`${ctx.sourcePath}: ${diagnostic}`);
    if (placement.keys && placement.index !== undefined) {
      parts.wrapper.setAttribute('data-fence-key', placement.keys[placement.index]!);
      if (this.toggles.isFlipped(ctx.sourcePath, placement.keys, placement.index)) setView(parts.wrapper, true);
    }

    // The direction goes to the renderer exactly as written, and only when given.
    const input: RenderInput = { source };
    if (placement.attributes.direction !== undefined) input.direction = placement.attributes.direction;

    const slow = window.setTimeout(() => {
      if (child.live && !parts.rendering.hasChildNodes()) showLoading(parts.rendering);
    }, LOADING_DELAY_MS);
    try {
      const result = await this.renderer().render(input);
      if (child.live) showResult(parts.rendering, result, placement.attributes, source);
    } catch (error) {
      // The host throws only for programmer errors; the block shows it rather than staying blank.
      const cause = error instanceof Error ? error.message : String(error);
      this.log(`ONNX render failed: ${cause}`);
      if (child.live) showError(parts.rendering, failed(cause));
    } finally {
      window.clearTimeout(slow);
    }
  }

  /**
   * The block's attributes and position, from the note text Obsidian has for this section, or
   * from the file when there is none (a block can be rendered outside a note view). Without
   * either, the block renders bare and its flips are not remembered.
   */
  private async place(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<Placement> {
    const section = ctx.getSectionInfo(el);
    let text: string | undefined = section?.text;
    if (text === undefined) {
      const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
      if (file instanceof TFile) text = await this.app.vault.cachedRead(file);
    }
    if (text === undefined) return { attributes: {}, diagnostics: [] };
    const fences = scanFences(text, WORD);
    const index = section
      ? locate(fences, section.lineStart, section.lineEnd, source)
      : locate(fences, 0, Number.MAX_SAFE_INTEGER, source);
    if (index < 0) return { attributes: {}, diagnostics: [] };
    const { attributes, diagnostics } = parseAttributes(fences[index]!.info);
    return { attributes, diagnostics, keys: fences.map((fence) => fence.body).map(fenceKey), index };
  }
}
