"""Export FastAPI's C3 schema for TypeScript client generation.

Run as a module from the service directory so the package import resolves:

    cd services/ai && python -m chronicle_ai.export_openapi
"""

import json
from pathlib import Path

from .main import app

# services/ai/chronicle_ai/export_openapi.py → repository root is three levels up.
REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
OUTPUT_PATH = REPOSITORY_ROOT / "packages" / "contracts" / "ai" / "openapi.json"


def main() -> None:
    OUTPUT_PATH.write_text(
        json.dumps(app.openapi(), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
