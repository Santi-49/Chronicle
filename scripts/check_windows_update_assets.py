"""Validate Chronicle's local and published electron-updater assets."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DESKTOP = ROOT / "apps" / "desktop"
DIST = DESKTOP / "dist"


def scalar(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def read_metadata(path: Path) -> tuple[str, list[tuple[str, str]]]:
    version: str | None = None
    files: list[tuple[str, str]] = []
    current_url: str | None = None
    current_sha512: str | None = None
    in_files = False

    for line in path.read_text(encoding="utf-8").splitlines():
        if match := re.match(r"^version:\s*(.+?)\s*$", line):
            version = scalar(match.group(1))
        if line == "files:":
            in_files = True
            continue
        if in_files and re.match(r"^\S", line):
            if current_url and current_sha512:
                files.append((current_url, current_sha512))
            current_url = current_sha512 = None
            in_files = False
        if not in_files:
            continue
        if match := re.match(r"^\s*-\s+url:\s*(.+?)\s*$", line):
            if current_url and current_sha512:
                files.append((current_url, current_sha512))
            current_url = scalar(match.group(1))
            current_sha512 = None
        elif match := re.match(r"^\s+sha512:\s*(.+?)\s*$", line):
            current_sha512 = scalar(match.group(1))

    if current_url and current_sha512:
        files.append((current_url, current_sha512))
    if not version:
        raise SystemExit(f"{path} has no version")
    if not files:
        raise SystemExit(f"{path} has no files[] update entries")
    return version, files


def file_sha512(path: Path) -> str:
    digest = hashlib.sha512()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return base64.b64encode(digest.digest()).decode("ascii")


def github_json(url: str) -> dict:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "Chronicle-update-asset-check",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token := os.environ.get("GH_TOKEN"):
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--release-tag", help="Also verify assets on the public GitHub release")
    args = parser.parse_args()

    manifests = list(DIST.glob("latest.yml"))
    installers = list(DIST.glob("Chronicle-Setup-*.exe"))
    blockmaps = list(DIST.glob("Chronicle-Setup-*.exe.blockmap"))
    if len(manifests) != 1:
        raise SystemExit(f"Expected exactly one latest.yml, found {len(manifests)}")
    if len(installers) != 1:
        raise SystemExit(f"Expected exactly one Windows installer, found {len(installers)}")
    if len(blockmaps) != 1:
        raise SystemExit(f"Expected exactly one Windows blockmap, found {len(blockmaps)}")

    package = json.loads((DESKTOP / "package.json").read_text(encoding="utf-8"))
    version, update_files = read_metadata(manifests[0])
    if version != package["version"]:
        raise SystemExit(f"latest.yml version {version} != package.json {package['version']}")
    if args.release_tag and args.release_tag != f"v{version}":
        raise SystemExit(f"Release tag {args.release_tag} != v{version}")

    local_names = {path.name: path for path in DIST.iterdir() if path.is_file()}
    for name, expected_sha512 in update_files:
        local = local_names.get(name)
        if local is None:
            raise SystemExit(f"latest.yml references missing local asset: {name}")
        actual_sha512 = file_sha512(local)
        if actual_sha512 != expected_sha512:
            raise SystemExit(f"SHA-512 mismatch for {name}")

    if args.release_tag:
        release = github_json(
            f"https://api.github.com/repos/Santi-49/Chronicle/releases/tags/{args.release_tag}"
        )
        if release.get("draft") or release.get("prerelease"):
            raise SystemExit("Update release must be public and non-prerelease")
        published_names = {asset["name"] for asset in release.get("assets", [])}
        required = {
            manifests[0].name,
            blockmaps[0].name,
            *(name for name, _ in update_files),
        }
        missing = sorted(required - published_names)
        if missing:
            raise SystemExit(f"GitHub release is missing updater assets: {', '.join(missing)}")
        latest = github_json("https://api.github.com/repos/Santi-49/Chronicle/releases/latest")
        if latest.get("tag_name") != args.release_tag:
            raise SystemExit(
                f"{args.release_tag} is not GitHub's latest release ({latest.get('tag_name')})"
            )

    names = ", ".join(name for name, _ in update_files)
    print(f"Windows update assets valid for {version}: latest.yml -> {names}")


if __name__ == "__main__":
    main()
