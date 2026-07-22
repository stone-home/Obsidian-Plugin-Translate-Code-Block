import { App, DropdownComponent, PluginSettingTab, Setting } from "obsidian";
import TranslateBlockPlugin from "./main";
import { LANGUAGE_OPTIONS, resolveLanguage } from "./languages";
import { parseModelList, resolveModel } from "./models";

export interface TranslateBlockSettings {
	endpointUrl: string;
	/** Newline-separated model names for dropdowns. */
	modelsRaw: string;
	defaultModel: string;
	defaultPrompt: string;
	defaultSourceLang: string;
	defaultTargetLang: string;
	pollIntervalMs: number;
	maxAttempts: number;
	timeoutMs: number;
	maxChars: number;
	/**
	 * Extra HTTP headers as a newline-separated list of `Key: Value` pairs.
	 */
	extraHeadersRaw: string;
	/** When enabled, debug logs are printed to the console. */
	debug: boolean;
}

export const MIN_POLL_INTERVAL_MS = 500;

export const DEFAULT_SETTINGS: TranslateBlockSettings = {
	endpointUrl: "http://localhost:13434/api/chat",
	modelsRaw: "llama3",
	defaultModel: "llama3",
	defaultPrompt:
		"You are a translator. The user's next message is the exact text to translate. Translate it from {{sourceLang}} to {{targetLang}}. Reply with nothing but the translated text—no explanations, no \"please provide\" or meta-commentary.",
	defaultSourceLang: "auto",
	defaultTargetLang: "en",
	pollIntervalMs: 1000,
	maxAttempts: 3,
	timeoutMs: 20000,
	maxChars: 4000,
	extraHeadersRaw: "",
	debug: false,
};

export class TranslateBlockSettingTab extends PluginSettingTab {
	plugin: TranslateBlockPlugin;

	constructor(app: App, plugin: TranslateBlockPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		containerEl.createEl("h2", { text: "Translate Block Settings" });

		new Setting(containerEl)
			.setName("Debug")
			.setDesc("Enable to print debug logs to the browser console (Developer Tools).")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.debug ?? false)
					.onChange(async (value) => {
						this.plugin.settings.debug = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Endpoint URL")
			.setDesc("Full URL for the translation API endpoint (default: local Ollama at http://localhost:13434/api/chat).")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.endpointUrl)
					.setValue(this.plugin.settings.endpointUrl)
					.onChange(async (value) => {
						this.plugin.settings.endpointUrl = value.trim() || DEFAULT_SETTINGS.endpointUrl;
						await this.plugin.saveSettings();
					}),
			);

		const modelList = parseModelList(
			this.plugin.settings.modelsRaw,
			this.plugin.settings.defaultModel,
		);
		const defaultModel = resolveModel(modelList, this.plugin.settings.defaultModel);

		let defaultModelDropdown: DropdownComponent | undefined;

		new Setting(containerEl)
			.setName("Models")
			.setDesc("Model names available in dropdowns, one per line.")
			.setClass("setting-control-on-new-line")
			.addTextArea((text) => {
				text
					.setPlaceholder("llama3\nmistral\ntranslategemma:27b")
					.setValue(this.plugin.settings.modelsRaw ?? DEFAULT_SETTINGS.modelsRaw)
					.onChange(async (value) => {
						this.plugin.settings.modelsRaw = value;
						const list = parseModelList(value, this.plugin.settings.defaultModel);
						this.plugin.settings.defaultModel = resolveModel(list, this.plugin.settings.defaultModel);
						await this.plugin.saveSettings();
						this.plugin.refreshWorkspaceModelOptions();
						// Do not call display() here — it rebuilds the tab and steals focus on Enter/Backspace.
					});
				// Refresh Default model options when leaving the textarea (no full tab rebuild).
				text.inputEl.addEventListener("blur", () => {
					if (!defaultModelDropdown) return;
					const list = parseModelList(
						this.plugin.settings.modelsRaw,
						this.plugin.settings.defaultModel,
					);
					const selected = resolveModel(list, this.plugin.settings.defaultModel);
					defaultModelDropdown.selectEl.empty();
					for (const name of list) {
						defaultModelDropdown.addOption(name, name);
					}
					defaultModelDropdown.setValue(selected);
					this.plugin.settings.defaultModel = selected;
				});
			});

		new Setting(containerEl)
			.setName("Default model")
			.setDesc("Model used when a block or panel does not override it.")
			.addDropdown((dropdown) => {
				defaultModelDropdown = dropdown;
				for (const name of modelList) {
					dropdown.addOption(name, name);
				}
				dropdown.setValue(defaultModel).onChange(async (value) => {
					const list = parseModelList(
						this.plugin.settings.modelsRaw,
						this.plugin.settings.defaultModel,
					);
					this.plugin.settings.defaultModel = resolveModel(list, value);
					await this.plugin.saveSettings();
					this.plugin.refreshWorkspaceModelOptions();
				});
			});

		new Setting(containerEl)
			.setName("Default source language")
			.setDesc("Language of the source text.")
			.addDropdown((dropdown) => {
				for (const code of LANGUAGE_OPTIONS) {
					dropdown.addOption(code, code);
				}
				dropdown
					.setValue(
						resolveLanguage(this.plugin.settings.defaultSourceLang, DEFAULT_SETTINGS.defaultSourceLang),
					)
					.onChange(async (value) => {
						this.plugin.settings.defaultSourceLang = resolveLanguage(
							value,
							DEFAULT_SETTINGS.defaultSourceLang,
						);
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Default target language")
			.setDesc("Language to translate into.")
			.addDropdown((dropdown) => {
				for (const code of LANGUAGE_OPTIONS) {
					dropdown.addOption(code, code);
				}
				dropdown
					.setValue(
						resolveLanguage(this.plugin.settings.defaultTargetLang, DEFAULT_SETTINGS.defaultTargetLang),
					)
					.onChange(async (value) => {
						this.plugin.settings.defaultTargetLang = resolveLanguage(
							value,
							DEFAULT_SETTINGS.defaultTargetLang,
						);
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Poll interval (ms)")
			.setDesc("Auto-translate polling interval in milliseconds. Minimum value is 500 ms.")
			.addText((text) =>
				text
					.setPlaceholder(String(DEFAULT_SETTINGS.pollIntervalMs))
					.setValue(String(this.plugin.settings.pollIntervalMs))
					.onChange(async (value) => {
						const parsed = Number(value);
						const clamped =
							Number.isFinite(parsed) && parsed > 0
								? Math.max(MIN_POLL_INTERVAL_MS, Math.floor(parsed))
								: DEFAULT_SETTINGS.pollIntervalMs;
						this.plugin.settings.pollIntervalMs = clamped;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Max attempts")
			.setDesc("Maximum number of retry attempts for a single translation job.")
			.addText((text) =>
				text
					.setPlaceholder(String(DEFAULT_SETTINGS.maxAttempts))
					.setValue(String(this.plugin.settings.maxAttempts))
					.onChange(async (value) => {
						const parsed = Number(value);
						const next = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_SETTINGS.maxAttempts;
						this.plugin.settings.maxAttempts = next;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Request timeout (ms)")
			.setDesc("Timeout for each translation request in milliseconds.")
			.addText((text) =>
				text
					.setPlaceholder(String(DEFAULT_SETTINGS.timeoutMs))
					.setValue(String(this.plugin.settings.timeoutMs))
					.onChange(async (value) => {
						const parsed = Number(value);
						const next = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_SETTINGS.timeoutMs;
						this.plugin.settings.timeoutMs = next;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Max block size (characters)")
			.setDesc("Maximum source text length for auto-translate. Larger blocks require manual translation.")
			.addText((text) =>
				text
					.setPlaceholder(String(DEFAULT_SETTINGS.maxChars))
					.setValue(String(this.plugin.settings.maxChars))
					.onChange(async (value) => {
						const parsed = Number(value);
						const next = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_SETTINGS.maxChars;
						this.plugin.settings.maxChars = next;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Default prompt")
			.setDesc("Prompt template for translation. You can use {{sourceLang}} and {{targetLang}} placeholders.")
			.setClass("setting-control-on-new-line")
			.addTextArea((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.defaultPrompt)
					.setValue(this.plugin.settings.defaultPrompt)
					.onChange(async (value) => {
						this.plugin.settings.defaultPrompt = value.trim() || DEFAULT_SETTINGS.defaultPrompt;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Extra headers")
			.setDesc("Optional HTTP headers as `Key: Value`, one per line. Useful for API keys or custom auth.")
			.setClass("setting-control-on-new-line")
			.addTextArea((text) =>
				text
					.setPlaceholder("Authorization: Bearer YOUR_TOKEN")
					.setValue(this.plugin.settings.extraHeadersRaw)
					.onChange(async (value) => {
						this.plugin.settings.extraHeadersRaw = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
