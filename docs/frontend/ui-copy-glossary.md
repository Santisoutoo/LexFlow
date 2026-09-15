# UI copy glossary (ES)

Official Spanish microcopy for the LexFlow SPA. New UI strings follow this
table. Code identifiers, route paths, JSON keys, and API params stay as they
are (`/diff`, `wizard.*`, `tags`, `DiffResult`).

Issue #69 / Sprint 3 of the Fable-5 micro-copy audit. The detailed variant
table (`memory/fable_microcopy_audit_2026-07-05.md` §2) is not in this repo;
this page is the source of truth until that file is recovered.

## Terminology

| Concept | Official ES | Avoid | Notes |
|--------|-------------|-------|-------|
| Tag (UI label) | **etiqueta** / **etiquetas** | tag, Tags | Syntax stays `#` + slug (Obsidian-style, #671). Hints may show `#etiqueta`; query param `tags` unchanged. |
| Version diff feature | **Comparación** | Diff | Routes and TypeScript keep `diff`. |
| Model setup flow | **asistente** | wizard (in UI) | i18n namespace `wizard` stays. |
| Dashboards section | **Cuadros de mando** | bare “Cuadros” | Full name in nav, breadcrumbs, help. |
| Settings path separator | **→** | **›** | e.g. `Ajustes → Modelos`. |
| Generic legal item | **norma** | ley (generic) | Use **ley** only for rank/title (“Ley Orgánica…”). Do not rewrite corpus text. |
| ES emphasis quotes | **«…»** | straight `"…"` in UI copy | Code/JSON syntax unchanged. Quotes around code tokens (`mcpServers`) may stay straight. |
| Model-kind badges | **local**, **nube** (lowercase) | Title Case | `model.local` / `model.cloud`. |
| Law-status badges | **Title Case** (`Vigente`, `Derogada`, …) | lowercase status labels | Via `statusLabel()` in `frontend/src/lib/utils.ts`. |
| Toggle state labels | **Activado** / **Desactivado** | ON / OFF | `settings.privacy.on` / `settings.privacy.off`. |

## Register bands

- **Neutral/professional (default):** settings, explorer, law detail, errors, help bodies.
- **Compact/lowercase:** model vendor/kind chips (`local`, `nube`, `sin configurar`).
- **Title Case badges:** legal status enums (`Vigente`, `Derogada`, `Derogada parcialmente`, `Pendiente`, `Desconocido`).
- **Playful/informal (intentional):** greeting pool (`greeting.pool.*`) and the first-run welcome animation phrase. Gender-neutral; no assumed masculine (*Bienvenido*). Prefer “Te damos la bienvenida” / “Hola de nuevo”.
