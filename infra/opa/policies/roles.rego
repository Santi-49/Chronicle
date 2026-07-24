package authz

# Static permission map — mirrors the DB seed in 001_initial_schema.py.
# Add new resources/actions here and in the migration when the challenge is known.
role_permissions := {
    "admin": [
        {"resource": "users",       "action": "read"},
        {"resource": "users",       "action": "write"},
        {"resource": "users",       "action": "delete"},
        {"resource": "roles",       "action": "read"},
        {"resource": "roles",       "action": "write"},
        {"resource": "roles",       "action": "delete"},
        {"resource": "permissions", "action": "read"},
        {"resource": "permissions", "action": "write"},
        {"resource": "permissions", "action": "delete"},
        {"resource": "hello",       "action": "read"},
        {"resource": "account",     "action": "read"},
        {"resource": "account",     "action": "write"},
        {"resource": "admin_statistics", "action": "read"}
    ],
    "user": [
        {"resource": "hello",   "action": "read"},
        {"resource": "account", "action": "read"},
        {"resource": "account", "action": "write"}
    ]
}
