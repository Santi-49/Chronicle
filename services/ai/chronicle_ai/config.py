"""Environment-driven defaults for the local AI service.

The desktop app sends provider/model/key per request (BYOK). These values are
the fallback used when a request omits them — for the standalone service run
(`make run-ai`), the smoke script, and manual `curl` testing. They are read
from the process environment (see `.env.example` for the variable names);
`main.py` best-effort loads the repository-root `.env` at startup.

Pricing is configured per task so cost estimates can be attached to each API
response. Prices are USD per 1,000,000 tokens.
"""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class TaskConfig:
    """Default model and per-million-token pricing for one AI task."""

    model: str | None
    input_price_per_m: float
    output_price_per_m: float


@dataclass(frozen=True)
class AiConfig:
    provider: str | None
    api_key: str | None
    annotate: TaskConfig
    embed: TaskConfig


def _price(name: str) -> float:
    """Read a per-million-token price; missing/blank means 0 (no estimate)."""
    raw = os.getenv(name, "").strip()
    if not raw:
        return 0.0
    try:
        return float(raw)
    except ValueError:
        return 0.0


def load_config() -> AiConfig:
    """Read defaults from the current process environment on each call."""
    return AiConfig(
        provider=os.getenv("CHRONICLE_AI_PROVIDER", "").strip() or None,
        api_key=os.getenv("CHRONICLE_AI_API_KEY", "").strip() or None,
        annotate=TaskConfig(
            model=os.getenv("CHRONICLE_AI_ANNOTATE_MODEL", "").strip() or None,
            input_price_per_m=_price("CHRONICLE_AI_ANNOTATE_INPUT_PRICE_PER_M"),
            output_price_per_m=_price("CHRONICLE_AI_ANNOTATE_OUTPUT_PRICE_PER_M"),
        ),
        embed=TaskConfig(
            model=os.getenv("CHRONICLE_AI_EMBED_MODEL", "").strip() or None,
            input_price_per_m=_price("CHRONICLE_AI_EMBED_INPUT_PRICE_PER_M"),
            output_price_per_m=0.0,  # embeddings are billed on input tokens only
        ),
    )
