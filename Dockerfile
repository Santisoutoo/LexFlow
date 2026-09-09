# ---- builder stage ----
FROM python:3.12-slim AS builder

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-editable

# ---- runtime stage ----
FROM python:3.12-slim AS runtime

WORKDIR /app

# Copy virtualenv from builder
COPY --from=builder /app/.venv /app/.venv

# Copy application source
COPY src/ ./src/
COPY main.py ./
COPY data/ ./data/

# Make sure the venv is on PATH
ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONPATH="/app/src"

# Corpus copy omits .git — persist revision for warm disk-cache hits (#42).
RUN python -c "from pathlib import Path; from lexflow.core.corpus_revision import write_corpus_revision; write_corpus_revision(Path('data/legalize-es'))" || true

EXPOSE 8000

CMD ["python", "main.py"]
