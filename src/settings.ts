import { PluginSettingTab, Setting, type App } from 'obsidian';
import type OnnxPlugin from './main';

export interface Settings {
  /** onnx.layoutTimeout: seconds allowed to lay out one graph. */
  layoutTimeout: number;
  /** In dark themes, draw graphs in their dark-theme colours (src/theme.ts), as Mermaid follows the theme; off keeps the white card. */
  followDarkTheme: boolean;
  /** Log ignored fence attributes and the reader's notes to the developer console. */
  debug: boolean;
}

export const DEFAULT_SETTINGS: Settings = { layoutTimeout: 3, followDarkTheme: true, debug: false };

export const TIMEOUT_RANGE = { min: 0.5, max: 60 } as const;

/** Settings as stored: a time limit out of range is clamped to it, as the VS Code extension does; anything else unreadable is the default. */
export function readSettings(stored: unknown): Settings {
  const value = (stored && typeof stored === 'object' ? stored : {}) as Partial<Record<keyof Settings, unknown>>;
  const timeout = value.layoutTimeout;
  return {
    layoutTimeout: typeof timeout === 'number' && Number.isFinite(timeout)
      ? Math.min(TIMEOUT_RANGE.max, Math.max(TIMEOUT_RANGE.min, timeout))
      : DEFAULT_SETTINGS.layoutTimeout,
    followDarkTheme: typeof value.followDarkTheme === 'boolean' ? value.followDarkTheme : DEFAULT_SETTINGS.followDarkTheme,
    debug: typeof value.debug === 'boolean' ? value.debug : DEFAULT_SETTINGS.debug
  };
}

/** The layout budget in milliseconds. */
export function budget(settings: Settings): number {
  return Math.round(settings.layoutTimeout * 1000);
}

export class OnnxSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: OnnxPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const settings = this.plugin.settings;

    new Setting(containerEl)
      .setName('Layout timeout')
      .setDesc('Seconds allowed to lay out one graph before it is abandoned and reported as a timeout ' +
        `(${TIMEOUT_RANGE.min} to ${TIMEOUT_RANGE.max}). A change restarts the renderer and retries graphs that timed out.`)
      .addText((text) => text
        .setPlaceholder(String(DEFAULT_SETTINGS.layoutTimeout))
        .setValue(String(settings.layoutTimeout))
        .onChange(async (raw) => {
          const seconds = Number(raw);
          if (raw.trim() === '' || !Number.isFinite(seconds) || seconds < TIMEOUT_RANGE.min || seconds > TIMEOUT_RANGE.max) return;
          await this.plugin.updateSettings({ layoutTimeout: seconds });
        }));

    new Setting(containerEl)
      .setName('Follow dark themes')
      .setDesc('In a dark theme, draw graphs on the page in dark-theme colours, as Mermaid diagrams follow the theme: lines and text lightened just enough to read, filled shapes darkened, hues kept. Turn off to keep every graph on a white card with its exact colours.')
      .addToggle((toggle) => toggle
        .setValue(settings.followDarkTheme)
        .onChange(async (value) => this.plugin.updateSettings({ followDarkTheme: value })));

    new Setting(containerEl)
      .setName('Debug logging')
      .setDesc('Report ignored fence attributes, and what the reader skipped or did not draw, in the developer console.')
      .addToggle((toggle) => toggle
        .setValue(settings.debug)
        .onChange(async (value) => this.plugin.updateSettings({ debug: value })));
  }
}
