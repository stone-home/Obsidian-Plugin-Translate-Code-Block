import { requestUrl } from "obsidian";
import { DEFAULT_SETTINGS } from "./settings";

export interface TranslationRequestOptions {
	endpointUrl: string;
	model: string;
	timeoutMs: number;
	prompt: string;
	extraHeadersRaw: string;
}

export interface TranslationBackend {
	translate(
		text: string,
		sourceLang: string,
		targetLang: string,
		options: TranslationRequestOptions,
	): Promise<string>;
}

export function createDefaultBackend(): TranslationBackend {
	return new OllamaBackend();
}

function buildExtraHeaders(extraHeadersRaw: string): Record<string, string> {
	const headers: Record<string, string> = {};

	const lines = extraHeadersRaw.split("\n");
	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line) continue;
		const idx = line.indexOf(":");
		if (idx === -1) continue;
		const key = line.slice(0, idx).trim();
		const value = line.slice(idx + 1).trim();
		if (!key || !value) continue;
		headers[key] = value;
	}

	return headers;
}

function buildPromptTemplate(prompt: string, sourceLang: string, targetLang: string): string {
	let result = prompt || DEFAULT_SETTINGS.defaultPrompt;
	const effectiveSource = sourceLang || DEFAULT_SETTINGS.defaultSourceLang;
	const effectiveTarget = targetLang || DEFAULT_SETTINGS.defaultTargetLang;
	result = result.replace(/{{sourceLang}}/g, effectiveSource);
	result = result.replace(/{{targetLang}}/g, effectiveTarget);
	return result;
}

class OpenAICompatibleBackend implements TranslationBackend {
	async translate(
		text: string,
		sourceLang: string,
		targetLang: string,
		options: TranslationRequestOptions,
	): Promise<string> {
		const url = (options.endpointUrl || DEFAULT_SETTINGS.endpointUrl).replace(/\/$/, "");

		console.log("[translate-block] POST →", url);

		const systemPrompt = buildPromptTemplate(options.prompt, sourceLang, targetLang);
		const payload = JSON.stringify({
			model: options.model || DEFAULT_SETTINGS.defaultModel,
			messages: [
				{ role: "system", content: systemPrompt },
				{ role: "user", content: text },
			],
			temperature: 0.2,
		});

		console.log("[translate-block] model:", options.model || DEFAULT_SETTINGS.defaultModel);

		const response = await requestUrl({
			url,
			method: "POST",
			contentType: "application/json",
			body: payload,
			headers: buildExtraHeaders(options.extraHeadersRaw),
			throw: false,
		});

		console.log("[translate-block] Response status:", response.status);

		if (response.status < 200 || response.status >= 300) {
			throw new Error(`HTTP ${response.status}: ${response.text || "Unknown error"}`);
		}

		const data = response.json as {
			choices?: Array<{ message?: { content?: string } }>;
		};

		const content = data.choices?.[0]?.message?.content;
		if (!content) {
			console.error("[translate-block] Unexpected response shape:", response.text);
			throw new Error("No content in translation response.");
		}

		return content.trim();
	}
}

class OllamaBackend implements TranslationBackend {
	async translate(
		text: string,
		sourceLang: string,
		targetLang: string,
		options: TranslationRequestOptions,
	): Promise<string> {
		const url = (options.endpointUrl || DEFAULT_SETTINGS.endpointUrl).replace(/\/$/, "");

		console.log("[translate-block] POST →", url);

		const systemPrompt = buildPromptTemplate(options.prompt, sourceLang, targetLang);
		const payload = JSON.stringify({
			model: options.model || DEFAULT_SETTINGS.defaultModel,
			messages: [
				{ role: "system", content: systemPrompt },
				{ role: "user", content: text },
			],
			stream: false,
		});

		const response = await requestUrl({
			url,
			method: "POST",
			contentType: "application/json",
			body: payload,
			headers: buildExtraHeaders(options.extraHeadersRaw),
			throw: false,
		});

		console.log("[translate-block] Response status:", response.status);

		if (response.status < 200 || response.status >= 300) {
			throw new Error(`HTTP ${response.status}: ${response.text || "Unknown error"}`);
		}

		const data = response.json as {
			message?: { content?: string };
		};

		const content = data.message?.content;
		if (!content) {
			console.error("[translate-block] Unexpected response shape:", response.text);
			throw new Error("No content in translation response.");
		}

		return content.trim();
	}
}
