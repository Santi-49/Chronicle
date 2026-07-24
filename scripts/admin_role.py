"""Development helper for listing and changing Chronicle administrator roles."""

from __future__ import annotations

import argparse
import subprocess

PROMOTE_SQL = r"""
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u CROSS JOIN roles r
WHERE lower(u.email) = lower(:'target_email') AND r.name = 'admin'
ON CONFLICT DO NOTHING;
"""

DEMOTE_SQL = r"""
DELETE FROM user_roles
USING users u, roles r
WHERE user_roles.user_id = u.id
  AND user_roles.role_id = r.id
  AND lower(u.email) = lower(:'target_email')
  AND r.name = 'admin';

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u CROSS JOIN roles r
WHERE lower(u.email) = lower(:'target_email') AND r.name = 'user'
ON CONFLICT DO NOTHING;
"""

VERIFY_SQL = r"""
SELECT u.email, array_agg(r.name ORDER BY r.name) AS roles
FROM users u
JOIN user_roles ur ON ur.user_id = u.id
JOIN roles r ON r.id = ur.role_id
WHERE lower(u.email) = lower(:'target_email')
GROUP BY u.email;
"""

LIST_SQL = r"""
SELECT u.email, u.name, u.surname, u.is_active
FROM users u
JOIN user_roles ur ON ur.user_id = u.id
JOIN roles r ON r.id = ur.role_id
WHERE r.name = 'admin'
ORDER BY lower(u.email);
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("promote", "demote", "list"))
    parser.add_argument("email", nargs="?")
    args = parser.parse_args()
    if args.action != "list" and not (args.email or "").strip():
        parser.error("email is required for promote and demote")

    command = [
        "docker", "compose", "exec", "-T", "postgres",
        "psql", "-v", "ON_ERROR_STOP=1", "-U", "hackathon", "-d", "hackathon",
    ]
    if args.action == "list":
        sql = LIST_SQL
    else:
        command.extend(["-v", f"target_email={args.email}"])
        sql = (PROMOTE_SQL if args.action == "promote" else DEMOTE_SQL) + VERIFY_SQL
    subprocess.run(command, input=sql, text=True, check=True)


if __name__ == "__main__":
    main()
