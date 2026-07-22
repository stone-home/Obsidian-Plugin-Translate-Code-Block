import { populateModelSelect, resolveModel } from "./models";
import { populateLanguageSelect, resolveLanguage } from "./languages";

export type TranslateMode = "manual" | "auto";

export type TranslateWorkspaceState = {
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
	modelSelectEl?: HTMLSelectElement;
};

export type TranslateWorkspaceHost = {
	getModelList: () => string[];
	defaultSourceLang: string;
	defaultTargetLang: string;
	defaultModel: string;
	isValidLang: (value: string) => boolean;
	registerWorkspace: (state: TranslateWorkspaceState) => void;
	triggerManualTranslate: (id: string) => Promise<void>;
};

export type TranslateWorkspaceOptions = {
	id: string;
	initialSourceText: string;
	initialSourceLang: string;
	initialTargetLang: string;
	initialModel: string;
	prompt: string;
	/** When set, shows a "Save to block" control (note hosts only). */
	onSaveToBlock?: () => void;
	/** Extra class on the root container (e.g. panel leaf). */
	containerClass?: string;
};

export type TranslateWorkspaceHandle = {
	id: string;
	getState: () => TranslateWorkspaceState;
	destroy: () => void;
	refreshModelOptions: () => void;
};

/**
 * Mounts the shared stacked translator UI into `parentEl`.
 * Registers workspace state with the host for Translate / Auto polling.
 */
export function mountTranslateWorkspace(
	parentEl: HTMLElement,
	host: TranslateWorkspaceHost,
	options: TranslateWorkspaceOptions,
): TranslateWorkspaceHandle {
	const models = host.getModelList();
	const sourceLang = resolveLanguage(options.initialSourceLang, host.defaultSourceLang);
	const targetLang = resolveLanguage(options.initialTargetLang, host.defaultTargetLang);
	const model = resolveModel(models, options.initialModel || host.defaultModel);
	const prompt = options.prompt;

	const rootClasses = ["translate-block-container"];
	if (options.containerClass) {
		rootClasses.push(options.containerClass);
	}
	const container = parentEl.createDiv({ cls: rootClasses.join(" ") });

	const inputPanel = container.createDiv({ cls: "translate-block-input" });
	inputPanel.createEl("div", { text: "Input", cls: "translate-block-panel-label" });
	const inputArea = inputPanel.createEl("textarea", { cls: "translate-block-input-area" });
	inputArea.value = options.initialSourceText;
	inputArea.placeholder = "Content to translate…";

	const resizeInput = (): void => {
		inputArea.style.height = "0";
		const newHeight = Math.max(120, inputArea.scrollHeight);
		inputArea.style.height = `${newHeight}px`;
	};
	requestAnimationFrame(() => resizeInput());

	const controlsBar = container.createDiv({ cls: "translate-block-controls" });
	const outputPanel = container.createDiv({ cls: "translate-block-output" });
	outputPanel.createEl("div", { text: "Output", cls: "translate-block-panel-label" });
	const outputContent = outputPanel.createDiv({ cls: "translate-block-output-content" });
	const statusEl = container.createDiv({ cls: "translate-block-status" });

	const state: TranslateWorkspaceState = {
		id: options.id,
		sourceLang,
		targetLang,
		model,
		prompt,
		sourceText: options.initialSourceText,
		lastSourceHash: null,
		inFlight: false,
		retryCount: 0,
		mode: "manual",
		outputEl: outputContent,
		statusEl,
	};

	host.registerWorkspace(state);

	const syncStateFromInput = (): void => {
		state.sourceText = inputArea.value;
		state.lastSourceHash = null;
	};
	inputArea.addEventListener("input", () => {
		syncStateFromInput();
		resizeInput();
	});
	inputArea.addEventListener("change", () => syncStateFromInput());

	const sourceSelect = controlsBar.createEl("select");
	const targetSelect = controlsBar.createEl("select");
	populateLanguageSelect(sourceSelect, state.sourceLang);
	populateLanguageSelect(targetSelect, state.targetLang);

	sourceSelect.addEventListener("change", () => {
		state.sourceLang = sourceSelect.value || host.defaultSourceLang;
		state.lastSourceHash = null;
	});
	targetSelect.addEventListener("change", () => {
		state.targetLang = targetSelect.value || host.defaultTargetLang;
		state.lastSourceHash = null;
	});

	const modelSelect = controlsBar.createEl("select", { cls: "translate-block-model-select" });
	state.modelSelectEl = modelSelect;
	populateModelSelect(modelSelect, models, state.model);
	modelSelect.addEventListener("change", () => {
		state.model = resolveModel(host.getModelList(), modelSelect.value);
		state.lastSourceHash = null;
	});

	const translateButton = controlsBar.createEl("button", { text: "Translate" });
	translateButton.addEventListener("click", () => {
		void host.triggerManualTranslate(state.id);
	});

	if (options.onSaveToBlock) {
		const saveButton = controlsBar.createEl("button", { text: "Save to block" });
		saveButton.addEventListener("click", () => {
			options.onSaveToBlock?.();
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

	if (state.mode === "auto") {
		statusEl.setText("Auto mode enabled. Waiting for changes…");
	} else {
		statusEl.setText("Manual mode. Click Translate to run.");
	}

	const handle: TranslateWorkspaceHandle = {
		id: options.id,
		getState: () => state,
		destroy: () => {
			container.remove();
		},
		refreshModelOptions: () => {
			const list = host.getModelList();
			state.model = resolveModel(list, state.model);
			populateModelSelect(modelSelect, list, state.model);
		},
	};

	return handle;
}
