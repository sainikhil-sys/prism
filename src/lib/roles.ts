/** Role ranks: a higher role can do everything a lower role can. */
export const ROLES = ["VIEWER", "ANALYST", "ADMIN", "OWNER"] as const;
export type RoleName = (typeof ROLES)[number];

export const ROLE_LABELS: Record<RoleName, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  ANALYST: "Analyst",
  VIEWER: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<RoleName, string> = {
  OWNER: "Full access, including deleting the organization and managing owners.",
  ADMIN: "Manage members, pricing policy, products and data, and decide on recommendations.",
  ANALYST: "Import data, edit products, run forecasts and generate recommendations.",
  VIEWER: "Read-only access to data, forecasts and recommendations.",
};

export function hasRole(actual: RoleName, required: RoleName): boolean {
  return ROLES.indexOf(actual) >= ROLES.indexOf(required);
}

/** Minimum role per action. Server code checks these; the UI only uses them to hide controls. */
export const PERMISSIONS = {
  "data:read": "VIEWER",
  "products:write": "ANALYST",
  "imports:write": "ANALYST",
  "competitors:write": "ANALYST",
  "forecasts:run": "ANALYST",
  "recommendations:generate": "ANALYST",
  "recommendations:decide": "ADMIN",
  "policy:write": "ADMIN",
  "org:write": "ADMIN",
  "members:manage": "ADMIN",
  "org:delete": "OWNER",
} as const satisfies Record<string, RoleName>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: RoleName, permission: Permission): boolean {
  return hasRole(role, PERMISSIONS[permission]);
}

/** Admins may assign roles up to their own level, except OWNER, which only owners can grant. */
export function canAssignRole(actor: RoleName, target: RoleName): boolean {
  if (target === "OWNER") return actor === "OWNER";
  return hasRole(actor, "ADMIN") && hasRole(actor, target);
}
