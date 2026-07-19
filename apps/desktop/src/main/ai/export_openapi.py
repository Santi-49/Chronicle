"""Export FastAPI's C3 schema for TypeScript client generation."""

import json
from pathlib import Path
import sys

REPOSITORY_ROOT = Path(__file__).resolve().parents[5]
sys.path.insert(0, str(REPOSITORY_ROOT))

from apps.desktop.src.main.ai.main import app  # noqa: E402


OUTPUT_PATH = REPOSITORY_ROOT / "packages" / "contracts" / "ai" / "openapi.json"


def main() -> None:
    OUTPUT_PATH.write_text(
        json.dumps(app.openapi(), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
