const FALLBACK_MODEL = "llama3";

/**
 * Parses a newline-separated model list: trim, drop empties, dedupe (order preserved).
 * Returns a non-empty list (falls back to defaultModel / llama3).
 */
export function parseModelList(raw: string, fallbackModel?: string): string[] {
	const fallback = (fallbackModel?.trim() || FALLBACK_MODEL).trim();
	const seen = new Set<string>();
	const result: string[] = [];

	for (const line of (raw ?? "").split("\n")) {
		const name = line.trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		result.push(name);
	}

	if (result.length === 0) {
		return [fallback];
	}
	return result;
}

/**
 * Returns `preferred` when it appears in `list`; otherwise the first list entry.
 */
export function resolveModel(list: string[], preferred: string | undefined): string {
	const models = list.length > 0 ? list : parseModelList("");
	const want = preferred?.trim();
	if (want && models.includes(want)) {
		return want;
	}
	return models[0];
}

/**
 * Fills a `<select>` with model options and selects `current` (resolved against the list).
 */
export function populateModelSelect(select: HTMLSelectElement, models: string[], current: string): void {
	const list = models.length > 0 ? models : parseModelList("");
	const selected = resolveModel(list, current);
	select.empty();
	for (const value of list) {
		const opt = select.createEl("option", { value, text: value });
		if (value === selected) {
			opt.selected = true;
		}
	}
}
