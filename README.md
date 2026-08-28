<p align="center">
  <img src="assets/lexflow-banner.jpeg" alt="LexFlow" width="700" />
</p>

<h3 align="center">Legislación española, viva y navegable.</h3>

<p align="center">
  Plataforma open source para explorar, analizar y consultar legislación española mediante grafos de conocimiento, IA y dashboards interactivos.
</p>

<p align="center">
  <a href="https://github.com/VforVitorio/LexFlow/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License" /></a>
  <a href="https://www.python.org/"><img src="https://img.shields.io/badge/python-3.12+-blue.svg" alt="Python" /></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/react-18-61dafb.svg" alt="React" /></a>
  <a href="https://github.com/VforVitorio/LexFlow/issues"><img src="https://img.shields.io/github/issues/VforVitorio/LexFlow" alt="Issues" /></a>
  <img src="https://img.shields.io/badge/status-pre--alpha-orange" alt="Status" />
</p>

---

LexFlow transforma [legalize-es](https://github.com/legalize-dev/legalize-es) — el corpus de leyes españolas en Markdown, versionado con Git — en una plataforma interactiva para explorarlas, entenderlas y consultarlas. Objetivo final: una app de escritorio standalone, sin Docker ni Python para el usuario.

## Desarrollo autónomo (loop engineering)

El roadmap restante se completa mediante un loop de agentes autónomo
(`agent-loop`, GitHub Actions, sobre Cursor CLI) que elige issue, planifica,
implementa, revisa y abre PR sin intervención humana, tres veces al día
(06:00, 13:00 y 20:00 UTC), más un sondeo cada 30 min (a las :15/:45) que
solo actúa si el último run sustantivo falló y ya pasó al menos 1h desde
entonces — así un fallo puntual (timeout, cuota, error de infraestructura)
no deja el loop parado hasta el siguiente slot oficial (hasta ~10h), sino
~60-90 min. El sondeo es gratis en el caso sano: si el último run no falló,
el propio tick se autocancela casi al instante. Cada tarea del loop tiene su
propio agente/modelo, elegido por coste-beneficio:

| Tarea | Modelo principal | Alternativas |
|---|---|---|
| Selección de issue | GPT-5.3 Codex (OpenAI, vía Cursor) | — (si no responde, orden determinista) |
| Planificación de implementación | GPT-5.3 Codex (OpenAI, vía Cursor) | — (Implement sigue sin plan si falla) |
| Revisión (juicio/seguridad, pre-PR) | GPT-5.3 Codex (OpenAI) | GPT-5.6 Sol (OpenAI) → Kimi K3 Max (Moonshot) como respaldo garantizado |
| Implementación general | Claude Sonnet 5 Thinking, medium (Anthropic) | Grok 4.6 High (Cursor) → Kimi K3 Max (Moonshot) |
| Implementación — documentación | GPT-5.4 Mini (OpenAI) | Gemini 3.7 Flash High (Google) → Kimi K2.7 Code (Moonshot) |
| Implementación — tests | Kimi K2.7 Code (Moonshot) | GPT-5.4 Mini (OpenAI) → Gemini 3.7 Flash High (Google) |

Detalle de las cadenas de fallback y la política de coste en
[`.github/agent/README.md`](.github/agent/README.md).

```mermaid
flowchart TD
    A["Cron oficial: 06:00 / 13:00 / 20:00 UTC<br/>(o workflow_dispatch manual)"] --> C
    A2["Cron de sondeo: cada 30 min<br/>(:15 / :45 UTC)"] --> C
    C{"Guard: ¿AGENT_GH_PAT y<br/>CURSOR_API_KEY presentes?"}
    C -- "falta alguno" --> Z2["Loop desarmado, sin ruido"]
    C -- "ok" --> RG{"Retry gate:<br/>¿es tick de sondeo?"}
    RG -- "no (oficial/manual)" --> B
    RG -- "sí" --> RG2{"¿último run sustantivo<br/>= failure Y ≥1h desde que acabó?"}
    RG2 -- "no" --> Z3["Tick de sondeo: se autocancela<br/>(conclusion=cancelled, coste ~0)"]
    RG2 -- "sí" --> B
    B{"Circuit breaker:<br/>¿últimos 3 runs sustantivos = failure?"}
    B -- "sí" --> Z1["Loop pausado este ciclo"]
    B -- "no" --> D["Pick issue<br/>picker-prompt.md · gpt-5.3-codex · --mode ask"]
    D --> E["Plan<br/>planner-prompt.md · gpt-5.3-codex · --mode ask"]
    E --> F["Implement<br/>worker-prompt.md · modelo según área"]
    F --> G["Review<br/>reviewer-prompt.md · cascada gpt-5.3-codex → gpt-5.6-sol → kimi-k3-max"]
    G -- "NEEDS_CHANGES" --> F
    G -- "OK" --> H["Verify: backend + pip-audit + frontend + landing"]
    H -- "rojo" --> I["agent:failed → agent:blocked tras 2 intentos"]
    H -- "verde" --> J["Abre PR<br/>labels: agent-pr, do-not-rebase"]
    J --> K["Arma auto-merge"]
    K --> L["CI de la PR"]
    L -- "verde" --> M["Merge automático a main"]

    subgraph EXT["Contribuciones externas (fork)"]
        N["PR abierta desde fuera del allowlist"] --> O["external-pr-review.yml<br/>cursor-agent --mode ask, solo lectura"]
        O --> P["Comentario con veredicto:<br/>RECOMMEND_MERGE / NEEDS_CHANGES / DO_NOT_MERGE"]
        P --> Q["Decisión de merge: SIEMPRE humana"]
    end

    subgraph SUP["Supervisión (orca-supervisor.yml, cron diario)"]
        R["Limpia agent:wip huérfano"]
        S["Reporta PRs atascadas o rojas"]
        T["Chequea salud de credenciales"]
    end
```

## Qué puedes hacer

- **Buscar leyes** — full-text, semántica e híbrida; por `#tag` (materias BOE), por acrónimo o nombre corto (LOPD, LEC…), por ministerio, o navegando por comunidad autónoma.
- **Navegar el grafo de conocimiento** — cross-referencias entre leyes y artículos, con un panel de "leyes relacionadas".
- **Hablar con el chatbot legal** — responde con herramientas reales vía MCP, en local (Ollama, LM Studio) o en la nube (OpenAI, Anthropic, Google).
- **Consultar dashboards** — compliance y tendencias legislativas.
- **Redactar en el editor** — citas tipadas, plantillas, borrador asistido por IA y comentarios inline.
- **Organizar con tags propias** y revisar el historial de versiones y diffs de cada ley (del git de legalize-es).

## Inicio rápido

Requisitos: Python 3.12+, [uv](https://docs.astral.sh/uv/), Node.js.

```bash
git clone https://github.com/VforVitorio/LexFlow.git
cd LexFlow
git submodule update --init --recursive   # corpus de legalize-es
uv sync --all-extras
uv run python main.py                     # backend en :8000, docs interactivas en /docs
```

```bash
cd frontend
npm install
npm run dev                               # Vite en :5173, proxy /api → :8000
```

> Atajo: `./scripts/dev.ps1` arranca backend + frontend a la vez.

**Producción** (un solo proceso): `cd frontend && npm run build && cd .. && uv run python main.py` — FastAPI sirve la API bajo `/api/v1` y el SPA en `/`.

## Stack

- **Backend** — Python 3.12, FastAPI + Pydantic v2, NetworkX (grafo), FastMCP (chat), uv, Ruff, mypy, pytest.
- **Frontend** — React 18 + TypeScript, Vite, TanStack Query, Zustand, Tailwind CSS, Vitest + Playwright.

## Arquitectura

Cuatro capas sobre el mismo corpus: **API REST**, **grafo de conocimiento**, **chat legal** y **dashboards**.

```text
LexFlow/
├── src/lexflow/       # backend: api/ core/ chat/ graph/ dashboards/
├── frontend/          # React + TypeScript (Vite)
├── data/legalize-es/  # submódulo: corpus de leyes
├── tests/             # pytest
└── main.py            # entry point del backend
```

Toda la API vive bajo `/api/v1/*`. Documentación interactiva en `/docs`; inventario completo en [`docs/backend/api-endpoints.md`](docs/backend/api-endpoints.md).

## Documentación y contribuir

- [CLAUDE.md](CLAUDE.md) — stack, convenciones y contrato API ↔ frontend.
- [ROADMAP.md](ROADMAP.md) — plan por fases.
- [CONTRIBUTING.md](CONTRIBUTING.md) — cómo abrir una PR.

Flujo trunk-based: rama `feat/xxx` / `fix/xxx` / `docs/xxx` desde `main`, PR de vuelta a `main`, CI (`test`, `lint`, `typecheck`) en verde y sin squash — se preserva el histórico completo.

## Créditos

Este proyecto existe gracias a [legalize-es](https://github.com/legalize-dev/legalize-es), que recopila y versiona legislación española en Markdown.

## Licencia

[Apache 2.0](LICENSE) — Copyright 2026 VforVitorio.
