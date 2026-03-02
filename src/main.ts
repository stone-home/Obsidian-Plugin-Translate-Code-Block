import { MarkdownPostProcessorContext, Notice, Plugin } from "obsidian";
import {
	DEFAULT_SETTINGS,
	MIN_POLL_INTERVAL_MS,
	TranslateBlockSettingTab,
	TranslateBlockSettings,
} from "./settings";
import { TranslationBackend, createDefaultBackend } from "./translation-backend";

type TranslateMode = "manual" | "auto";

interface TranslateBlockState {
	id: string;
	sourceLang: string;
	targetLang: string;
	model: string;
	prompt: string;
	sourceText: string;
	lastSourceHash: string | null;
	inFlight: boolean;
	retryCount: number;
	lastError?: string;
	lastUpdatedAt?: number;
	mode: TranslateMode;
	outputEl: HTMLElement;
	statusEl: HTMLElement;
	autoToggleEl?: HTMLInputElement;
}

export default class TranslateBlockPlugin extends Plugin {
	settings: TranslateBlockSettings = DEFAULT_SETTINGS;
	private blockStates = new Map<string, TranslateBlockState>();
	private backend: TranslationBackend | undefined;
	private pollIntervalId: number | undefined;

	async onload() {
		await this.loadSettings();
		this.backend = createDefaultBackend();

		this.registerMarkdownCodeBlockProcessor("translate-block", (source, el, ctx) => {
			this.processTranslateBlock(source, el, ctx);
		});

		this.addSettingTab(new TranslateBlockSettingTab(this.app, this));

		this.startPolling();
	}

	onunload() {
		if (this.pollIntervalId !== undefined) {
			window.clearInterval(this.pollIntervalId);
		}
		this.blockStates.clear();
	}

	private async loadSettings() {
		const data = (await this.loadData()) as Partial<TranslateBlockSettings> | null;
		const merged: TranslateBlockSettings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
		// Clamp poll interval to minimum.
		if (!merged.pollIntervalMs || merged.pollIntervalMs < MIN_POLL_INTERVAL_MS) {
			merged.pollIntervalMs = Math.max(MIN_POLL_INTERVAL_MS, merged.pollIntervalMs || DEFAULT_SETTINGS.pollIntervalMs);
		}
		this.settings = merged;
	}

	async saveSettings() {
		// Ensure poll interval is always clamped before persisting.
		if (!this.settings.pollIntervalMs || this.settings.pollIntervalMs < MIN_POLL_INTERVAL_MS) {
			this.settings.pollIntervalMs = Math.max(
				MIN_POLL_INTERVAL_MS,
				this.settings.pollIntervalMs || DEFAULT_SETTINGS.pollIntervalMs,
			);
		}
		await this.saveData(this.settings);
	}

	private startPolling() {
		const interval = this.settings.pollIntervalMs || DEFAULT_SETTINGS.pollIntervalMs;
		const effectiveInterval = Math.max(MIN_POLL_INTERVAL_MS, interval);
		this.pollIntervalId = window.setInterval(() => {
			void this.pollBlocks();
		}, effectiveInterval);
		this.registerInterval(this.pollIntervalId);
	}

	private processTranslateBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		const blockId = this.getBlockId(ctx, el);
		const info = ctx.getSectionInfo(el);
		const fenceConfig = this.parseFenceConfig(ctx, el);

		const container = el.createDiv({ cls: "translate-block-container" });

		const inputPanel = container.createDiv({ cls: "translate-block-input" });
		inputPanel.createEl("div", { text: "Input", cls: "translate-block-panel-label" });
		const inputArea = inputPanel.createEl("textarea", { cls: "translate-block-input-area" });
		inputArea.value = source;
		inputArea.placeholder = "Content to translate…";

		const controlsBar = container.createDiv({ cls: "translate-block-controls" });
		const outputPanel = container.createDiv({ cls: "translate-block-output" });
		outputPanel.createEl("div", { text: "Output", cls: "translate-block-panel-label" });
		const outputContent = outputPanel.createDiv({ cls: "translate-block-output-content" });
		const statusEl = container.createDiv({ cls: "translate-block-status" });

		const state = this.ensureBlockState(blockId, source, outputContent, statusEl, fenceConfig);

		// Keep state.sourceText in sync with the editable input, but do NOT
		// continuously write back to the underlying note (that would re-render
		// the preview and steal focus).
		const syncStateFromInput = (): void => {
			state.sourceText = inputArea.value;
			state.lastSourceHash = null;
		};
		inputArea.addEventListener("input", () => syncStateFromInput());
		inputArea.addEventListener("change", () => syncStateFromInput());

		// Controls: language selectors, translate button, auto toggle.
		const sourceSelect = controlsBar.createEl("select");
		const targetSelect = controlsBar.createEl("select");

		this.populateLanguageSelect(sourceSelect, state.sourceLang);
		this.populateLanguageSelect(targetSelect, state.targetLang);

		sourceSelect.addEventListener("change", () => {
			state.sourceLang = sourceSelect.value || this.settings.defaultSourceLang;
		});
		targetSelect.addEventListener("change", () => {
			state.targetLang = targetSelect.value || this.settings.defaultTargetLang;
		});

		const translateButton = controlsBar.createEl("button", { text: "Translate" });
		translateButton.addEventListener("click", () => {
			void this.triggerManualTranslate(state.id);
		});

		// Optional: explicit write-back button for when the user wants to sync
		// the current input content back into the markdown code block.
		if (info && info.lineStart != null && info.lineEnd != null) {
			const saveButton = controlsBar.createEl("button", { text: "Save to block" });
			saveButton.addEventListener("click", () => {
				const fenceLine = info.text.split("\n")[0] ?? "```translate-block";
				void this.updateCodeBlockInFile(
					ctx.sourcePath,
					info.lineStart,
					info.lineEnd,
					fenceLine,
					inputArea.value,
				);
			});
		}

		const autoLabel = controlsBar.createEl("label");
		const autoToggle = autoLabel.createEl("input", { type: "checkbox" });
		state.autoToggleEl = autoToggle;
		autoLabel.appendText(" Auto");

		autoToggle.checked = state.mode === "auto";
		autoToggle.addEventListener("change", () => {
			state.mode = autoToggle.checked ? "auto" : "manual";
			if (state.mode === "auto") {
				statusEl.setText("Auto mode enabled. Waiting for changes…");
			} else {
				statusEl.setText("Manual mode. Click Translate to run.");
			}
		});

		// Initial status.
		if (state.mode === "auto") {
			statusEl.setText("Auto mode enabled. Waiting for changes…");
		} else {
			statusEl.setText("Manual mode. Click Translate to run.");
		}
	}

	private ensureBlockState(
		id: string,
		sourceText: string,
		outputEl: HTMLElement,
		statusEl: HTMLElement,
		config?: Partial<Pick<TranslateBlockState, "sourceLang" | "targetLang" | "model" | "prompt">>,
	): TranslateBlockState {
		let state = this.blockStates.get(id);
		const sourceLang =
			config?.sourceLang && this.isValidLang(config.sourceLang)
				? config.sourceLang
				: this.settings.defaultSourceLang;
		const targetLang =
			config?.targetLang && this.isValidLang(config.targetLang)
				? config.targetLang
				: this.settings.defaultTargetLang;
		const model = config?.model?.trim() || this.settings.defaultModel;
		const prompt = config?.prompt?.trim() || this.settings.defaultPrompt;

		if (!state) {
			state = {
				id,
				sourceLang,
				targetLang,
				model,
				prompt,
				sourceText,
				lastSourceHash: null,
				inFlight: false,
				retryCount: 0,
				mode: "manual",
				outputEl,
				statusEl,
			};
			this.blockStates.set(id, state);
		} else {
			state.sourceText = sourceText;
			state.sourceLang = sourceLang;
			state.targetLang = targetLang;
			state.model = model;
			state.prompt = prompt;
			state.outputEl = outputEl;
			state.statusEl = statusEl;
		}

		return state;
	}

	private parseFenceConfig(
		ctx: MarkdownPostProcessorContext,
		el: HTMLElement,
	): Partial<Pick<TranslateBlockState, "sourceLang" | "targetLang" | "model" | "prompt">> {
		const info = ctx.getSectionInfo(el);
		if (!info || !info.text) {
			return {};
		}

		const lines = info.text.split("\n");
		const fenceLine = lines.find((line) => line.trim().startsWith("```translate-block"));
		if (!fenceLine) {
			return {};
		}

		const trimmed = fenceLine.trim();
		const withoutTicks = trimmed.startsWith("```") ? trimmed.slice(3).trim() : trimmed;
		const parts = withoutTicks.split(/\s+/);
		// First token should be "translate-block".
		const [, ...rest] = parts;

		const result: Partial<Pick<TranslateBlockState, "sourceLang" | "targetLang" | "model" | "prompt">> = {};

		for (const token of rest) {
			const eqIndex = token.indexOf("=");
			if (eqIndex === -1) continue;
			const key = token.slice(0, eqIndex).trim();
			const value = token.slice(eqIndex + 1).trim();
			if (!key || !value) continue;

			switch (key) {
				case "source":
				case "sourceLang":
					if (this.isValidLang(value)) {
						result.sourceLang = value;
					}
					break;
				case "target":
				case "targetLang":
					if (this.isValidLang(value)) {
						result.targetLang = value;
					}
					break;
				case "model":
					result.model = value;
					break;
				case "prompt":
					result.prompt = value;
					break;
				default:
					break;
			}
		}

		return result;
	}

	private populateLanguageSelect(select: HTMLSelectElement, current: string) {
		const options = ["auto", "en", "zh", "ja", "fr", "de", "es"];
		select.empty();
		for (const value of options) {
			const opt = select.createEl("option", { value, text: value });
			if (value === current) {
				opt.selected = true;
			}
		}
	}

	private getBlockId(ctx: MarkdownPostProcessorContext, el: HTMLElement): string {
		const info = ctx.getSectionInfo(el);
		if (info) {
			return `${ctx.sourcePath}:${info.lineStart}-${info.lineEnd}`;
		}
		return `${ctx.sourcePath}:${Math.random().toString(36).slice(2)}`;
	}

	/**
	 * Updates the code block content in the note file.
	 * lineStart/lineEnd are 0-based (inclusive) indices into the file's line array.
	 */
	private async updateCodeBlockInFile(
		sourcePath: string,
		lineStart: number,
		lineEnd: number,
		fenceLine: string,
		newContent: string,
	): Promise<void> {
		const file = this.app.vault.getFileByPath(sourcePath);
		if (!file) return;
		try {
			const content = await this.app.vault.read(file);
			const lines = content.split(/\r?\n/);
			// 0-based line numbers: block is lines[lineStart..lineEnd] inclusive.
			const before = lines.slice(0, lineStart);
			const after = lines.slice(lineEnd + 1);
			const newBlockLines = [fenceLine, ...newContent.split(/\r?\n/), "```"];
			const newFileContent = [...before, ...newBlockLines, ...after].join("\n");
			await this.app.vault.modify(file, newFileContent);
		} catch (e) {
			new Notice(
				"Translate Block: could not update note. " + (e instanceof Error ? e.message : String(e)),
			);
		}
	}

	private async pollBlocks() {
		if (!this.backend) {
			this.backend = createDefaultBackend();
		}
		for (const state of this.blockStates.values()) {
			if (state.mode !== "auto") continue;
			if (state.inFlight) continue;

			if (state.sourceText.length > this.settings.maxChars) {
				state.statusEl.setText(
					`Block too large for auto-translate (>${this.settings.maxChars} chars). Use manual Translate.`,
				);
				continue;
			}

			const hash = this.computeHash(state);
			if (state.lastSourceHash === hash) {
				continue;
			}

			await this.runTranslationJob(state.id);
		}
	}

	private computeHash(state: TranslateBlockState): string {
		const key = [
			state.sourceText,
			state.sourceLang,
			state.targetLang,
			state.model,
			state.prompt,
		].join("||");
		let hash = 0;
		for (let i = 0; i < key.length; i += 1) {
			// Simple string hash sufficient for change detection.
			// eslint-disable-next-line no-bitwise
			hash = (hash << 5) - hash + key.charCodeAt(i);
			// eslint-disable-next-line no-bitwise
			hash |= 0;
		}
		return String(hash);
	}

	private isValidLang(value: string): boolean {
		const v = value.trim();
		if (!v) return false;
		// Allow common language codes like en, zh, ja, fr, de, es, auto, and BCP-47 variants.
		return /^[a-zA-Z-]+$/.test(v);
	}

	private async triggerManualTranslate(blockId: string) {
		await this.runTranslationJob(blockId);
	}

	private async runTranslationJob(blockId: string) {
		if (!this.backend) {
			this.backend = createDefaultBackend();
		}
		const state = this.blockStates.get(blockId);
		if (!state) return;

		if (state.inFlight) {
			return;
		}

		if (state.sourceText.length === 0) {
			state.outputEl.empty();
			state.statusEl.setText("No source text to translate.");
			return;
		}

		if (state.sourceText.length > this.settings.maxChars) {
			state.statusEl.setText(
				`Block too large (${state.sourceText.length} chars). Reduce size or increase max block size in settings.`,
			);
			return;
		}

		state.inFlight = true;
		state.lastError = undefined;
		state.statusEl.setText("Translating…");

		const hash = this.computeHash(state);
		const maxAttempts = this.settings.maxAttempts;
		let attempt = 0;
		let lastErrorMessage: string | undefined;

		while (attempt < maxAttempts) {
			attempt += 1;
			state.retryCount = attempt;
			try {
				const translated = await this.backend.translate(state.sourceText, state.sourceLang, state.targetLang, {
					endpointUrl: this.settings.endpointUrl,
					model: state.model,
					timeoutMs: this.settings.timeoutMs,
					prompt: state.prompt,
					extraHeadersRaw: this.settings.extraHeadersRaw,
				});

				state.outputEl.empty();
				const pre = state.outputEl.createEl("pre", { text: translated, cls: "translate-block-output-pre" });
				pre.setAttribute("contenteditable", "false");

				state.lastSourceHash = hash;
				state.retryCount = 0;
				state.inFlight = false;
				state.lastUpdatedAt = Date.now();
				state.statusEl.setText("Translated successfully.");
				return;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				lastErrorMessage = message;

				const isSoftError = this.isSoftErrorMessage(message);
				if (!isSoftError || attempt >= maxAttempts) {
					break;
				}

				// Small delay before retrying a soft error.
				// eslint-disable-next-line no-await-in-loop
				await new Promise((resolve) => window.setTimeout(resolve, 300));
			}
		}

		state.inFlight = false;
		state.lastError = lastErrorMessage;
		state.lastSourceHash = hash;
		state.statusEl.setText(
			`Translation failed after ${Math.max(1, state.retryCount)} attempt(s). Last error: ${
				lastErrorMessage ?? "Unknown error"
			}`,
		);
		new Notice("Translate Block error. See block status for details.");
	}

	private isSoftErrorMessage(message: string): boolean {
		const lower = message.toLowerCase();
		if (lower.includes("timeout") || lower.includes("network")) return true;
		if (lower.includes("502") || lower.includes("503") || lower.includes("504") || lower.includes("500")) return true;
		return false;
	}
}
