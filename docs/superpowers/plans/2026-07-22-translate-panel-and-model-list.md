# Translate Panel + Model List Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.  
> **Constraint:** All edits under `.obsidian/plugins/st-translate-block/` only.  
> **Tests:** Deferred (project rule: no `test/` changes in the same task as `src/`).

**Goal:** Shared `TranslateWorkspace` UI for side panel + `translate-block`, plus settings model list dropdowns.

**Architecture:** Extract mountable workspace; `TranslatePanelView` + block processor both mount it; plugin owns translation jobs/polling; `modelsRaw` feeds all model selects.

**Tech Stack:** Obsidian Plugin API (`ItemView`, `Plugin`, `Setting`), TypeScript, existing `requestUrl` backend.

**Spec:** `docs/superpowers/specs/2026-07-22-translate-panel-and-model-list-design.md`

## Global Constraints

- Artifacts in English only
- Work only inside this plugin directory
- Keep Translate + Auto behaviour
- Stacked layout; open in right sidebar by default
- Session-only panel state
- No mixed testcase authoring in this plan

## File map

| File | Role |
|--|--|
| `src/models.ts` | `parseModelList`, `resolveModel` |
| `src/translate-workspace.ts` | Shared UI mount + state handle |
| `src/translate-panel-view.ts` | `ItemView` host |
| `src/settings.ts` | `modelsRaw`, models textarea, default model dropdown |
| `src/main.ts` | Register view/ribbon/command; refactor block to workspace; registry |
| `src/styles.css` / `styles.css` | Panel leaf spacing if needed |
| `README.md` | Document panel + model list |

---

### Task 1: Model list helpers + settings

**Files:** Create `src/models.ts`; Modify `src/settings.ts`

- [ ] Add `parseModelList` / `resolveModel` in `src/models.ts`
- [ ] Add `modelsRaw` to settings + DEFAULT_SETTINGS (`"llama3"`)
- [ ] Settings UI: Models textarea; Default model dropdown; sync default when list changes

### Task 2: TranslateWorkspace

**Files:** Create `src/translate-workspace.ts`

- [ ] Mount stacked UI (langs, model select, Translate, Auto, optional Save)
- [ ] Expose handle: state getters, destroy, refreshModelOptions
- [ ] Wire Translate → plugin job; Auto → mode on shared state

### Task 3: Panel view + plugin wiring

**Files:** Create `src/translate-panel-view.ts`; Modify `src/main.ts`

- [ ] `TranslatePanelView` mounts workspace on open, unregisters on close
- [ ] Register view, ribbon, command; open in right leaf
- [ ] Refactor `processTranslateBlock` to mount workspace
- [ ] Registry + poll/run jobs over all workspaces

### Task 4: Styles + README

**Files:** Modify `src/styles.css`, `styles.css`, `README.md`

- [ ] Panel container polish if needed
- [ ] Document Open Translate Panel + Models setting

### Task 5: Build verify

- [ ] `npm run build` in plugin root; fix TypeScript errors
