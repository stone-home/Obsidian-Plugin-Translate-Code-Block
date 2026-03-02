# Commit Message
`feat: Obsidian Translate Block – requirements and backlog`

# PR Description
**Title:** `feat: Obsidian Translate Block – requirements and backlog`
**Summary:** Formal feature requirements for the Obsidian Translate Block plugin: code-block translation via local/remote AI, settings (endpoint, model, languages, polling), two-panel UI, CORS-safe requests, and backlog items (endpoint auto-path, debug UI, connection test).

---
# Obsidian Translate Block – Feature Requirements

## 1. Requirements & Context

### 1.1 Core Behavior
- **Translate code block:** Custom fenced block `translate-block` in markdown; source text is stored permanently in the note; translation is shown in a separate output panel only (not written back to the note).
- **Manual-first:** Default mode per block is manual; user clicks **Translate** to send one request. Optional **Auto** toggle per block enables polling (always off when a note is loaded).
- **Polling:** Configurable interval (default 1s, minimum 500ms). Only blocks in auto mode are polled; change detection (hash of source + langs + model + prompt) avoids duplicate requests; per-block “busy” state prevents overlapping jobs.
- **Two panels:** Input panel (source text) and output panel (translated text) rendered below when the user leaves the code block (preview/live preview). Width of output panel auto-fits the container.

### 1.2 Settings (Global)
- **Endpoint URL:** Base URL only (e.g. `http://100.86.122.40:31435`). Plugin appends path automatically: `/v1/chat/completions` for OpenAI-compatible backend (default).
- **Default model:** e.g. `translategemma:27b`. Used for every request; no stale cached model (always read from settings at request time).
- **Default prompt:** Template with `{{sourceLang}}` and `{{targetLang}}` placeholders.
- **Default source/target language:** e.g. `auto`, `en`, `zh`.
- **Poll interval (ms):** Default 1000; minimum 500 (clamped on load and save).
- **Max attempts:** Retry count per job (default 3).
- **Request timeout (ms):** e.g. 15000–30000.
- **Max block size (characters):** Above this, auto-translate is skipped; manual translate can still run with a warning.
- **Extra headers:** Newline-separated `Key: Value` (e.g. `Authorization: Bearer ...`).

### 1.3 Per-Block Configuration
- **Fence attributes:** `source=`, `target=`, `model=`, `prompt=` in the block header (e.g. ` ```translate-block source=en target=zh `). Missing or invalid values fall back to global defaults.
- **In-memory state:** Mode (manual/auto), source/target lang, model, prompt, lastSourceHash, inFlight, retryCount, lastError. Not persisted; at load, mode is always manual.
- **Effective model for API:** Always use current global default model from settings for the request (no long-lived cache of model in block state for the outgoing request).

### 1.4 Backend & Network
- **OpenAI-compatible backend (default):** POST to `{endpointUrl}/v1/chat/completions`; request body: `model`, `messages` (system + user), `temperature`. Response: `choices[0].message.content`.
- **Ollama backend (optional):** POST to `{endpointUrl}/api/chat`; same message shape; response: `message.content`.
- **CORS:** Use Obsidian `requestUrl` (no browser CORS). Pass `throw: false` and handle status in code; use `contentType: "application/json"` and `body` as JSON string.

### 1.5 Error Handling
- **Hard errors (no retry):** 4xx (e.g. 400, 401, 404), malformed response. Show message; stop.
- **Soft errors (retry):** Timeout, network, 5xx. Retry up to `maxAttempts` with short delay; then show “Translation failed after N attempt(s)” and last error. After terminal failure, no further auto requests until source changes or user clicks Translate.

### 1.6 Editing UX for Translate Blocks
- **Always-editable input panel:** The rendered `translate-block` preview shows the source text in an editable textarea (“Input” panel). Users can edit this at any time, regardless of whether a translation request is running or auto mode is polling.
- **In-memory source of truth:** While editing, the textarea content updates the block’s in-memory `sourceText`, which is what translation requests use. The underlying markdown code block is **not** modified automatically on every keystroke, to avoid preview re-renders that steal focus.
- **Explicit sync back to markdown:** A dedicated `Save to block` control lets the user write the current textarea content back into the underlying fenced code block once, triggering a re-render only when explicitly requested.
- **Trade-off (design decision):** We intentionally avoid “auto-sync on every input” because Obsidian re-renders the preview whenever the file changes, which would destroy and recreate the textarea DOM node and cause cursor loss. This requirement prioritizes stable editing UX over live markdown mirroring.

### 1.6 Backlog (Explicit User Requests)
- **Endpoint auto-path:** User enters only base URL in settings; plugin appends `/v1/chat/completions` (or `/api/chat` for Ollama) in code. If URL already ends with that path, do not double-append.
- **Debug button and window:** Per-block or global way to show last (or next) request: URL, headers, and request body in a visible debug panel/window (e.g. collapsible section or modal).
- **Connection test button:** In plugin settings, a “Test connection” button that sends a minimal request to the configured endpoint and shows success or error (e.g. Notice or inline status).

## 2. Execution Plan

### 2.1 Implemented (Current State)
- [x] Plugin skeleton; manifest/package/versions aligned; project name and URL correct.
- [x] Global settings schema and settings tab UI; poll interval minimum 500ms.
- [x] `translate-block` fence parsing; per-block config with defaults.
- [x] In-memory block state map; mode manual at load.
- [x] Two-panel UI (input, controls, output); language dropdowns; Translate button; Auto toggle; status line.
- [x] Polling loop with change detection and max size check.
- [x] Translation backend interface; OpenAI-compatible and Ollama backends; `requestUrl` with `throw: false` and `contentType`.
- [x] Retry and error handling (hard/soft, max attempts, status message).
- [x] Ensure block state refresh: on re-render, update `sourceLang`, `targetLang`, `model`, `prompt` from fence + global defaults so UI and effective config stay in sync.
- [x] Editable input panel (textarea) in preview that updates in-memory `sourceText` without continuously rewriting the underlying markdown.
- [x] Manual “Save to block” action that writes the current input panel content back into the fenced `translate-block`, accepting a one-time re-render when invoked.

### 2.2 To Do (Backlog)
- [ ] **Endpoint auto-path:** In backend, derive full URL from base: if base does not end with `/v1/chat/completions` (OpenAI) or `/api/chat` (Ollama), append the appropriate path. Update settings description to “Base URL (path is added automatically)”.
- [ ] **Use settings.defaultModel for API call:** In `runTranslationJob`, pass `this.settings.defaultModel` (or resolved per-block override from fence) to `backend.translate` so the request never uses a stale cached model.
- [ ] **Debug button and window:** Add optional debug mode (e.g. setting or per-block “Debug” button). Before/after request, store last request URL, headers, body; show in a collapsible `<details>` or modal. Ensure no sensitive data is logged in production by default.
- [ ] **Connection test button:** In settings tab, add “Test connection” that calls the same endpoint (or a minimal POST/GET) with current settings and displays result in a Notice or inline text.
- [ ] **Remove or gate console.log:** Once debug UI exists, remove or guard `console.log` in translation-backend (e.g. only when debug setting is on).

## 3. Acceptance Criteria

- User can set only base URL in settings; translation works against `{base}/v1/chat/completions`.
- Changing default model in settings is reflected on the very next Translate (no cached “llama3”).
- User can open a debug view and see the exact request URL, headers, and body used for a translation.
- User can click “Test connection” in settings and see immediate success/failure for the configured endpoint.
- User can freely type in the Input panel without their cursor being lost when auto-translate runs or a manual Translate is triggered.
- The markdown `translate-block` content only changes when the user explicitly invokes the “Save to block” action (or edits the code block directly), not on every keystroke in the Input panel.
