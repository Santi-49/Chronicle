"""
Chronicle — manual smoke test for the vision diff (provider-agnostic).

This script exercises the real Chronicle annotation pipeline end-to-end:
  image_loader  →  AnnotateRequest  →  annotate_version()  →  VersionAnnotation

Run from the repository root with the committed demo fixtures or explicit
PNG/JPG paths:

    python services/ai/tests/manual_smoke.py
    python services/ai/tests/manual_smoke.py --first

Prerequisites:
    pip install -e "services/ai[dev,<provider>]"   # e.g. [dev,google]

Provider, model, and key are read from the repo-root .env via the CHRONICLE_AI_*
variables (see .env.example).
Images default to fixtures/before.jpg and fixtures/after.jpg; pass any PNG or
JPG paths as positional arguments to override:

    python services/ai/tests/manual_smoke.py path/to/before.jpg path/to/after.jpg
"""

import argparse
import asyncio
import base64
import os
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# 1. Load the API key from .env
# ---------------------------------------------------------------------------

try:
    from dotenv import load_dotenv
    # Load the repository-root .env (three levels up from this file).
    load_dotenv(Path(__file__).resolve().parents[3] / ".env")
except ModuleNotFoundError:
    pass  # python-dotenv is optional; values may already be in the environment

API_KEY = os.environ.get("CHRONICLE_AI_API_KEY", "").strip()

# ---------------------------------------------------------------------------
# 2. Import the real Chronicle pipeline modules
# ---------------------------------------------------------------------------
# Add the service root (services/ai) to sys.path so `chronicle_ai` is
# importable without installing the package first.
SERVICE_ROOT = Path(__file__).resolve().parents[1]
FIXTURE_ROOT = Path(__file__).resolve().parent / "fixtures"
sys.path.insert(0, str(SERVICE_ROOT))

from chronicle_ai.image_loader import load_image       # noqa: E402
from chronicle_ai.engine import annotate_version # noqa: E402
from chronicle_ai.schemas import AnnotateRequest        # noqa: E402

# ---------------------------------------------------------------------------
# 3. Helpers
# ---------------------------------------------------------------------------

PROVIDER = os.environ.get("CHRONICLE_AI_PROVIDER", "").strip()
MODEL = os.environ.get("CHRONICLE_AI_ANNOTATE_MODEL", "").strip()


def load_as_image_input(file_path: Path) -> dict:
    """Read a file via image_loader and return the ImageInput dict the schema expects."""
    record = load_image(str(file_path))
    return {
        "base64":    base64.b64encode(record["data"]).decode(),
        "mediaType": record["mime_type"],
    }


def print_result(annotation) -> None:
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(annotation.summary)

    print("\nCHANGES")
    print("-" * 60)
    for i, change in enumerate(annotation.changes, 1):
        print(f"  {i}. {change}")

    print("\nTAGS")
    print("-" * 60)
    print("  " + "  ·  ".join(annotation.tags))

    if annotation.confidence is not None:
        print(f"\nCONFIDENCE:  {annotation.confidence:.0%}")

    usage = getattr(annotation, "usage", None)
    if usage is not None:
        print("\nTOKENS")
        print("-" * 60)
        print(
            f"  input: {usage.input_tokens}  ·  output: {usage.output_tokens}"
            f"  ·  total: {usage.total_tokens}"
        )

    cost = getattr(annotation, "cost", None)
    if cost is not None and cost.total_usd is not None:
        print("\nESTIMATED COST")
        print("-" * 60)
        print(
            f"  ${cost.total_usd:.6f} {cost.currency}"
            f"  (in ${cost.input_usd:.6f} + out ${cost.output_usd:.6f})"
        )
    print("=" * 60 + "\n")


# ---------------------------------------------------------------------------
# 4. Main
# ---------------------------------------------------------------------------

async def run(image1: Path, image2: Path | None) -> None:
    is_first = image2 is None

    current_input = load_as_image_input(image1)
    previous_input = load_as_image_input(image2) if image2 else None

    request = AnnotateRequest.model_validate({
        "provider":  PROVIDER,
        "model":     MODEL,
        "apiKey":    API_KEY,
        "fileName":  image1.name,
        "previous":  previous_input,
        "current":   current_input,
    })

    mode = "first-version description" if is_first else "version diff"
    label_prev = str(image2) if image2 else "—"
    print(f"\nMode      : {mode}")
    print(f"Previous  : {label_prev}")
    print(f"Current   : {image1}")
    print(f"Provider  : {PROVIDER}  /  {MODEL}")
    print("\nSending to provider …")

    annotation = await annotate_version(request)
    print_result(annotation)


def main() -> None:
    parser = argparse.ArgumentParser(description="Chronicle AI smoke test")
    # --help must work before the key check
    parser.add_argument(
        "images",
        nargs="*",
        help=(
            "One or two image paths. "
            "One image → first-version description. "
            "Two images → diff (first = previous, second = current). "
            "Defaults to image1.png and image2.png next to this script."
        ),
    )
    parser.add_argument(
        "--first",
        action="store_true",
        help="Force first-version description mode even when two images are given.",
    )
    args = parser.parse_args()

    # Resolve image paths
    if args.images:
        paths = [Path(p) for p in args.images]
    else:
        paths = [FIXTURE_ROOT / "before.jpg", FIXTURE_ROOT / "after.jpg"]
        if not all(path.exists() for path in paths):
            sys.exit(
                "\n[ERROR] Default fixtures were not found.\n"
                "  Pass one or two explicit PNG/JPG paths instead.\n"
            )

    # Config guard runs here, after --help has had a chance to print and exit
    missing = [
        name
        for name, value in (
            ("CHRONICLE_AI_API_KEY", API_KEY),
            ("CHRONICLE_AI_PROVIDER", PROVIDER),
            ("CHRONICLE_AI_ANNOTATE_MODEL", MODEL),
        )
        if not value
    ]
    if missing:
        sys.exit(
            "\n[ERROR] Missing config: " + ", ".join(missing) + ".\n"
            "  Set them in a .env file at the repo root (see .env.example).\n"
        )

    # Validate that specified files exist
    for p in paths:
        if not p.exists():
            sys.exit(f"\n[ERROR] Image file not found: {p}\n")

    if args.first or len(paths) == 1:
        asyncio.run(run(image1=paths[0], image2=None))
    else:
        asyncio.run(run(image1=paths[1], image2=paths[0]))


if __name__ == "__main__":
    main()
