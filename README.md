# Obsidian Translate Block

Translate fenced code blocks between languages using local or remote AI models (default: local Ollama at `http://localhost:13434`).

## Usage

- **Create a translate block** in a note:

````
```translate-block
This is the text to translate.
```
````

- Optionally, specify languages and model in the fence header:

````
```translate-block source=en target=zh model=llama3
This is the text to translate.
```
````

- In preview mode, each `translate-block` renders with:
  - **Input panel**: original text (stored permanently in the note).
  - **Controls bar**: source/target language dropdowns, **Translate** button, **Auto** toggle, and status line.
  - **Output panel**: translated text shown below the input, auto-fitting the window width.

- **Manual mode** (default): click **Translate** to send a one-time request.
- **Auto mode** (per block): enable the **Auto** toggle to poll at the configured interval; translations only run when content or settings change.

## Settings

In the plugin settings, you can configure:

- **Endpoint URL** (default `http://localhost:13434`)
- **Default model** (e.g. `llama3`)
- **Default prompt** (uses `{{sourceLang}}` and `{{targetLang}}` placeholders)
- **Default source/target languages**
- **Poll interval (ms)** — default `1000`, minimum `500`
- **Max attempts** per translation job
- **Request timeout (ms)**
- **Max block size** (characters) for auto-translate
- **Extra headers** (e.g. `Authorization: Bearer ...`) for remote APIs
