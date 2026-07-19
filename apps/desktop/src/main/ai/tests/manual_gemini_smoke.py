"""
Chronicle — manual smoke test for the Gemini vision diff.

This script exercises the real Chronicle annotation pipeline end-to-end:
  image_loader  →  AnnotateRequest  →  annotate_version()  →  VersionAnnotation

Run from the repository root with the committed demo fixtures or explicit
PNG/JPG paths:

    python apps/desktop/src/main/ai/tests/manual_gemini_smoke.py
    python apps/desktop/src/main/ai/tests/manual_gemini_smoke.py --first

Prerequisites:
    pip install langchain langchain-google-genai python-dotenv pydantic

The GOOGLE_API_KEY is read from the .env file at the repo root.
Images default to fixtures/before.jpg and fixtures/after.jpg; pass any PNG or
JPG paths as positional arguments to override:

    python apps/desktop/src/main/ai/tests/manual_gemini_smoke.py path/to/before.jpg path/to/after.jpg
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
    load_dotenv()          # reads .env at cwd if present
except ModuleNotFoundError:
    pass  # python-dotenv is optional; key may already be in the environment

API_KEY = os.environ.get("GOOGLE_API_KEY", "").strip()

# ---------------------------------------------------------------------------
# 2. Import the real Chronicle pipeline modules
# ---------------------------------------------------------------------------
# Add the repo root to sys.path so the package is importable without
# installing it first.
REPO_ROOT = Path(__file__).resolve().parents[6]
FIXTURE_ROOT = Path(__file__).resolve().parent / "fixtures"
sys.path.insert(0, str(REPO_ROOT))

from apps.desktop.src.main.ai.image_loader import load_image       # noqa: E402
from apps.desktop.src.main.ai.model_engine import annotate_version # noqa: E402
from apps.desktop.src.main.ai.schemas import AnnotateRequest        # noqa: E402

# ---------------------------------------------------------------------------
# 3. Helpers
# ---------------------------------------------------------------------------

PROVIDER   = "google_genai"
MODEL      = "gemini-flash-latest"


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
    print("\nSending to Gemini …")

    annotation = await annotate_version(request)
    print_result(annotation)


def main() -> None:
    parser = argparse.ArgumentParser(description="Chronicle Gemini smoke test")
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
                "\n[ERROR] Default Gemini fixtures were not found.\n"
                "  Pass one or two explicit PNG/JPG paths instead.\n"
            )

    # Key guard runs here, after --help has had a chance to print and exit
    if not API_KEY:
        sys.exit(
            "\n[ERROR] GOOGLE_API_KEY is not set.\n"
            "  Add it to a .env file at the repo root:\n"
            "    GOOGLE_API_KEY=your_real_key_here\n"
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
