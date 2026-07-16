package authz

import future.keywords.if
import future.keywords.in

default allow := false

# Admin bypasses all resource checks
allow if "admin" in input.roles

# Regular role: check role → permission mapping defined in roles.rego
allow if {
    some role_name in input.roles
    some perm in data.authz.role_permissions[role_name]
    perm.resource == input.resource
    perm.action   == input.action
}
