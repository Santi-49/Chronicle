"""Development helper for clearing control-plane usage statistics.

Runs against the Postgres container started by `make control-plane-up`, so it
only ever touches the *local* control plane. A deployed instance
(`CHRONICLE_CONTROL_PLANE_URL` pointing anywhere else) is untouched — check
which endpoint the desktop app uses before assuming this cleared what you saw.

Accounts, roles, external identities, account settings, and encrypted secrets
are never deleted: signing in again would otherwise be required after every
reset. Installations survive too unless `--installations` is passed, because
deleting them re-registers every profile as brand new.
"""

from __future__ import annotations

import argparse
import subprocess

# Ordered so a future foreign key cannot leave an orphan behind.
TELEMETRY_TABLES = (
    "telemetry_errors",
    "telemetry_hourly_ai_usage",
    "telemetry_hourly_usage",
    "telemetry_project_removals",
    "telemetry_sessions",
    "project_telemetry",
    "installation_telemetry",
)

COUNT_SQL = """
SELECT relname AS table, n_live_tup AS approximate_rows
FROM pg_stat_user_tables
WHERE relname IN ({names})
ORDER BY relname;
"""


def psql(sql: str) -> None:
    subprocess.run(
        [
            "docker", "compose", "exec", "-T", "postgres",
            "psql", "-v", "ON_ERROR_STOP=1", "-U", "hackathon", "-d", "hackathon",
        ],
        input=sql,
        text=True,
        check=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--installations",
        action="store_true",
        help="also delete installation records (every profile re-registers as new)",
    )
    args = parser.parse_args()

    tables = TELEMETRY_TABLES + (("installations",) if args.installations else ())
    names = ", ".join(f"'{table}'" for table in tables)
    psql(f"TRUNCATE {', '.join(tables)} CASCADE;\n" + COUNT_SQL.format(names=names))
    print("Cleared local control-plane statistics.")
    print("Run `make app-clear-telemetry` too, or the desktop app resends its buffer.")


if __name__ == "__main__":
    main()
