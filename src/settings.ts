import { PluginSettingTab, type App, type SettingDefinitionItem } from 'obsidian';
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

/** Names and descriptions of the settings. */
const LABELS = {
  layoutTimeout: {
    name: 'Layout timeout',
    desc: 'Seconds allowed to lay out one graph before it is abandoned and reported as a timeout ' +
      `(${TIMEOUT_RANGE.min} to ${TIMEOUT_RANGE.max}). A change restarts the renderer and retries graphs that timed out.`
  },
  followDarkTheme: {
    name: 'Follow dark themes',
    desc: 'In a dark theme, draw graphs on the page in dark-theme colours, as Mermaid diagrams follow the theme: lines and text lightened just enough to read, filled shapes darkened, hues kept. Turn off to keep every graph on a white card with its exact colours.'
  },
  debug: {
    name: 'Debug logging',
    desc: 'Report ignored fence attributes, and what the reader skipped or did not draw, in the developer console.'
  }
} as const;

/** Whether a time limit is in range; the reason it is not, otherwise. */
export function checkTimeout(seconds: number): string | undefined {
  return Number.isFinite(seconds) && seconds >= TIMEOUT_RANGE.min && seconds <= TIMEOUT_RANGE.max
    ? undefined
    : `Enter a number of seconds from ${TIMEOUT_RANGE.min} to ${TIMEOUT_RANGE.max}.`;
}

export class OnnxSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: OnnxPlugin) {
    super(app, plugin);
  }

  /** The settings as definitions: Obsidian draws them, and lists them in settings search. */
  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      { ...LABELS.layoutTimeout, control: { type: 'number', key: 'layoutTimeout', min: TIMEOUT_RANGE.min, max: TIMEOUT_RANGE.max, step: 'any', defaultValue: DEFAULT_SETTINGS.layoutTimeout, validate: checkTimeout } },
      { ...LABELS.followDarkTheme, control: { type: 'toggle', key: 'followDarkTheme', defaultValue: DEFAULT_SETTINGS.followDarkTheme } },
      { ...LABELS.debug, control: { type: 'toggle', key: 'debug', defaultValue: DEFAULT_SETTINGS.debug } }
    ];
  }

  getControlValue(key: string): unknown {
    return this.plugin.settings[key as keyof Settings];
  }

  /** Through the plugin, which validates, restarts the renderer when needed, and keeps the saved flips. */
  async setControlValue(key: string, value: unknown): Promise<void> {
    if (!(key in DEFAULT_SETTINGS)) return;
    const next = readSettings({ ...this.plugin.settings, [key]: value });
    await this.plugin.updateSettings({ [key]: next[key as keyof Settings] });
  }
}
