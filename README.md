# Obsidian Translate Block

Translate fenced code blocks between languages using local or remote AI models (default: local Ollama at `http://localhost:13434`). Also includes a standalone **Translate** side panel that uses the same UI and backend.

## Translate panel

- Open via the **ribbon** (languages icon) or command palette: **Open Translate Panel**.
- Opens in the **right sidebar** by default; you can drag the leaf into the main workspace.
- Stacked layout: Input → controls (languages, model, Translate, Auto) → Output.
- Panel text and choices are **session-only** (not persisted across Obsidian restarts).

## Usage (code blocks)

- **Create a translate block** in a note:

````
```translate-block
This is the text to translate.
```
````

- Optionally, specify languages and model in the fence header (`model` must appear in the Models list in settings):

````
```translate-block source=en target=zh model=llama3
This is the text to translate.
```
````

- In preview mode, each `translate-block` renders with:
  - **Input panel**: original text (stored permanently in the note).
  - **Controls bar**: source/target language dropdowns, **model** dropdown, **Translate** button, **Auto** toggle, optional **Save to block**, and status line.
  - **Output panel**: translated text shown below the input.

- **Manual mode** (default): click **Translate** to send a one-time request.
- **Auto mode** (per block / panel): enable the **Auto** toggle to poll at the configured interval; translations only run when content or settings change.

## Settings

In the plugin settings, you can configure:

- **Endpoint URL** (default `http://localhost:13434/api/chat`)
- **Models** — one model name per line; fills all model dropdowns
- **Default model** — dropdown from the Models list
- **Default prompt** (uses `{{sourceLang}}` and `{{targetLang}}` placeholders)
- **Default source/target languages**
- **Poll interval (ms)** — default `1000`, minimum `500`
- **Max attempts** per translation job
- **Request timeout (ms)**
- **Max block size** (characters) for auto-translate
- **Extra headers** (e.g. `Authorization: Bearer ...`) for remote APIs
- **Debug** — console logging for translation requests
