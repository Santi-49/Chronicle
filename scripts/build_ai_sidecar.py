"""Build Chronicle's self-contained Windows AI sidecar with PyInstaller."""

from __future__ import annotations

import shutil
import subprocess
import sys
import os
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SERVICE_DIR = ROOT / "services" / "ai"
DESKTOP_BUILD = ROOT / "apps" / "desktop" / "build"
DIST_DIR = DESKTOP_BUILD / "sidecar"
WORK_DIR = DESKTOP_BUILD / "pyinstaller-work"
SPEC_DIR = DESKTOP_BUILD / "pyinstaller-spec"


def main() -> None:
    if sys.platform != "win32":
        raise SystemExit("The MVP installer sidecar must be built on Windows.")

    requested_python = os.environ.get("CHRONICLE_SIDECAR_PYTHON", "").strip()
    if requested_python and Path(requested_python).resolve() != Path(sys.executable).resolve():
        subprocess.run([requested_python, str(Path(__file__).resolve())], check=True)
        return

    for target in (DIST_DIR, WORK_DIR, SPEC_DIR):
        resolved = target.resolve()
        if DESKTOP_BUILD.resolve() not in resolved.parents:
            raise RuntimeError(f"Refusing to clean unexpected path: {resolved}")
        shutil.rmtree(resolved, ignore_errors=True)
        resolved.mkdir(parents=True, exist_ok=True)

    command = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onefile",
        "--name",
        "chronicle-ai-sidecar",
        "--paths",
        str(SERVICE_DIR),
        "--distpath",
        str(DIST_DIR),
        "--workpath",
        str(WORK_DIR),
        "--specpath",
        str(SPEC_DIR),
        "--copy-metadata",
        "chronicle-ai",
        "--copy-metadata",
        "langchain-google-genai",
        "--hidden-import",
        "langchain_google_genai",
        str(SERVICE_DIR / "chronicle_ai" / "__main__.py"),
    ]
    subprocess.run(command, cwd=SERVICE_DIR, check=True)

    executable = DIST_DIR / "chronicle-ai-sidecar.exe"
    if not executable.is_file() or executable.stat().st_size == 0:
        raise RuntimeError(f"Sidecar build did not produce {executable}")
    print(f"Built {executable.relative_to(ROOT)} ({executable.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
