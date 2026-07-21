"""Repeat Chronicle's automated MVP-12 reliability gate three times."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
NPM = "npm.cmd" if os.name == "nt" else "npm"


def run(command: list[str], cwd: Path = ROOT) -> None:
    print(f"\n> {' '.join(command)}", flush=True)
    subprocess.run(command, cwd=cwd, check=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=3)
    parser.add_argument(
        "--package",
        action="store_true",
        help="Also build and health-check the self-contained Windows sidecar and installer.",
    )
    args = parser.parse_args()
    if args.runs < 1:
        raise SystemExit("--runs must be at least 1")

    run([sys.executable, "scripts/check_versions.py"])
    for current in range(1, args.runs + 1):
        print(f"\n=== MVP-12 automated pass {current}/{args.runs} ===", flush=True)
        run([NPM, "run", "typecheck"], ROOT / "apps" / "desktop")
        run([NPM, "test"], ROOT / "apps" / "desktop")
        run([sys.executable, "-m", "pytest", "-q"], ROOT / "services" / "ai")
        run([sys.executable, "-m", "pytest", "-q"], ROOT / "services" / "api")
        run([NPM, "run", "build"], ROOT / "apps" / "desktop")

    if args.package:
        run([NPM, "run", "package"], ROOT / "apps" / "desktop")
        run([sys.executable, "scripts/smoke_ai_sidecar.py"])

    print(f"\nMVP-12 automated gate passed {args.runs} consecutive time(s).")
    print("Complete docs/mvp-12-acceptance.md on the clean Windows demo machine.")


if __name__ == "__main__":
    main()
