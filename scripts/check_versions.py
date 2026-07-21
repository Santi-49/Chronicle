"""Fail when Chronicle's authoritative versions and derived files disagree."""

from __future__ import annotations

import json
import os
import re
import tomllib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def json_file(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def project_version(path: Path) -> str:
    with path.open("rb") as handle:
        return tomllib.load(handle)["project"]["version"]


def main() -> None:
    desktop_package = json_file(ROOT / "apps" / "desktop" / "package.json")
    desktop_lock = json_file(ROOT / "apps" / "desktop" / "package-lock.json")
    desktop_version = desktop_package["version"]
    locked_version = desktop_lock["packages"][""]["version"]
    if desktop_version != locked_version:
        raise SystemExit(
            f"Desktop package/lock mismatch: {desktop_version} != {locked_version}. "
            "Run npm install --package-lock-only in apps/desktop."
        )

    release_manifest = json_file(ROOT / ".release-please-manifest.json")
    released_desktop_version = release_manifest.get("apps/desktop")
    if desktop_version != released_desktop_version:
        raise SystemExit(
            "Desktop package/release manifest mismatch: "
            f"{desktop_version} != {released_desktop_version}."
        )

    versions = {
        "desktop": desktop_version,
        "ai": project_version(ROOT / "services" / "ai" / "pyproject.toml"),
        "api": project_version(ROOT / "services" / "api" / "pyproject.toml"),
    }
    for component, value in versions.items():
        if not re.fullmatch(
            r"(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)",
            value,
        ):
            raise SystemExit(f"{component} has a non-release SemVer value: {value}")

    contracts = {
        "ai": json_file(ROOT / "packages" / "contracts" / "ai" / "openapi.json")["info"]["version"],
        "api": json_file(ROOT / "packages" / "contracts" / "api" / "openapi.json")["info"]["version"],
    }
    for component, contract_version in contracts.items():
        if contract_version != versions[component]:
            raise SystemExit(
                f"{component} OpenAPI drift: {contract_version} != {versions[component]}. "
                "Regenerate the contract."
            )

    tag = os.environ.get("CHRONICLE_RELEASE_TAG", "").strip()
    if tag:
        expected = f"v{desktop_version}"
        if tag != expected:
            raise SystemExit(f"Release tag mismatch: {tag} != {expected}")

    print(
        "Version check passed: "
        f"desktop {versions['desktop']}, AI {versions['ai']}, API {versions['api']}"
    )


if __name__ == "__main__":
    main()
