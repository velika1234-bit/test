# Merge conflict guide for `index.html`

If GitHub shows 4 conflicts in `index.html`, **do not blindly use "Accept current change" for all blocks**.

Use this checklist:

1. Keep the host builder controls:
   - `id="lesson-template"`
   - `id="builder-lesson-title"`
   - `id="builder-slides"`
   - `id="btn-build-lesson"`

2. Keep the simplified host toolbar with end control:
   - `id="btn-host-start"`
   - `id="btn-host-next"`
   - `id="btn-host-end"` (inside "Още" details panel is OK)

3. Keep student final/result screen ids:
   - `id="student-final"`
   - `id="final-score"`, `id="final-max"`, `id="final-correct"`, `id="final-total"`
   - `id="btn-final-resend"`, `id="btn-final-exit"`

4. Keep presentation shell ids:
   - `id="present-shell"`
   - `id="present-bg"`, `id="present-overlay"`, `id="present-surface"`

After resolving each block:
- Remove conflict markers `<<<<<<<`, `=======`, `>>>>>>>`.
- Ensure each `id` appears once (no duplicates after "Accept both").
- Run:

```bash
node --check app.js
rg -n "lesson-template|builder-lesson-title|btn-build-lesson|btn-host-end|student-final|present-shell" index.html app.js
```
