"""Development helper for inspecting and resetting Chronicle's local profile.

Chronicle keeps everything it persists in Electron's per-user data directory.
`npm run dev` and an installed build use *different* directories, because the
directory is named after the Electron app name: `chronicle-desktop` in
development and `Chronicle` once packaged. Pass `--packaged` to target the
installed profile instead of the development one.

Subcommands operate on one concern each so a reset never destroys more than it
says it does. Close Chronicle first — SQLite and Chromium's Local Storage are
both open while the app runs.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import sqlite3
import sys
from pathlib import Path

DEV_APP_NAME = "chronicle-desktop"
PACKAGED_APP_NAME = "Chronicle"

# Renderer state lives in Chromium's Local Storage, which has no supported
# external editor, so the whole store is removed. It holds only the onboarding
# flag, the theme preference, and admin issue triage.
LOCAL_STORAGE_DIR = "Local Storage"
DATABASE_FILE = "chronicle.db"
SESSION_KEY = "secret:control-plane-session"
TELEMETRY_KEYS = ("telemetry-v2-buffer", "telemetry-v2-last-snapshot-hash")


def user_data_dir(app_name: str) -> Path:
    system = platform.system()
    if system == "Windows":
        return Path(os.environ["APPDATA"]) / app_name
    if system == "Darwin":
        return Path.home() / "Library" / "Application Support" / app_name
    return Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / app_name


def open_db(root: Path) -> sqlite3.Connection:
    database = root / DATABASE_FILE
    if not database.exists():
        sys.exit(f"No database at {database}. Nothing to do.")
    return sqlite3.connect(database)


def delete_settings(root: Path, keys: tuple[str, ...], label: str) -> None:
    connection = open_db(root)
    try:
        placeholders = ",".join("?" for _ in keys)
        deleted = connection.execute(
            f"DELETE FROM settings WHERE key IN ({placeholders})", keys
        ).rowcount
        connection.commit()
    finally:
        connection.close()
    print(f"{label}: removed {deleted} record(s) from {root / DATABASE_FILE}")


def reset_onboarding(root: Path) -> None:
    store = root / LOCAL_STORAGE_DIR
    if not store.exists():
        print(f"No renderer storage at {store}; the welcome screen already shows.")
        return
    shutil.rmtree(store)
    print(f"Removed {store}")
    print("The welcome screen shows again on the next launch.")
    print("Note: this also clears the theme preference and admin issue triage.")


def reset_session(root: Path) -> None:
    delete_settings(root, (SESSION_KEY,), "Signed out")


def clear_telemetry(root: Path) -> None:
    delete_settings(root, TELEMETRY_KEYS, "Cleared the pending usage-statistics buffer")


def show(root: Path) -> None:
    print(f"Profile: {root}")
    print(f"Exists:  {root.exists()}")
    if not root.exists():
        return
    installation_file = root / "installation-id"
    if installation_file.exists():
        print(f"Installation ID (file): {installation_file.read_text('utf8').strip()}")
    database = root / DATABASE_FILE
    if not database.exists():
        print("Database: missing")
        return
    connection = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
    try:
        rows = dict(connection.execute("SELECT key, value FROM settings"))
    finally:
        connection.close()
    stored_id = rows.get("control-plane-installation-id")
    print(f"Installation ID (db):   {json.loads(stored_id) if stored_id else '(none)'}")
    print(f"Signed in:              {SESSION_KEY in rows}")
    print(f"Pending telemetry:      {'telemetry-v2-buffer' in rows}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "action",
        choices=("show", "reset-onboarding", "reset-session", "clear-telemetry"),
    )
    parser.add_argument(
        "--packaged",
        action="store_true",
        help=f"target the installed profile ({PACKAGED_APP_NAME}) instead of development",
    )
    args = parser.parse_args()

    root = user_data_dir(PACKAGED_APP_NAME if args.packaged else DEV_APP_NAME)
    {
        "show": show,
        "reset-onboarding": reset_onboarding,
        "reset-session": reset_session,
        "clear-telemetry": clear_telemetry,
    }[args.action](root)


if __name__ == "__main__":
    main()
