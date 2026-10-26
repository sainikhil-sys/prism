import { describe, expect, it } from "vitest";
import { can, canAssignRole, hasRole } from "@/lib/roles";

describe("roles", () => {
  it("orders roles from viewer to owner", () => {
    expect(hasRole("OWNER", "VIEWER")).toBe(true);
    expect(hasRole("VIEWER", "ANALYST")).toBe(false);
    expect(hasRole("ADMIN", "ADMIN")).toBe(true);
  });

  it("limits sensitive permissions", () => {
    expect(can("VIEWER", "data:read")).toBe(true);
    expect(can("VIEWER", "imports:write")).toBe(false);
    expect(can("ANALYST", "recommendations:generate")).toBe(true);
    expect(can("ANALYST", "recommendations:decide")).toBe(false);
    expect(can("ADMIN", "recommendations:decide")).toBe(true);
    expect(can("ADMIN", "org:delete")).toBe(false);
    expect(can("OWNER", "org:delete")).toBe(true);
  });

  it("only lets owners grant ownership and stops admins escalating", () => {
    expect(canAssignRole("ADMIN", "OWNER")).toBe(false);
    expect(canAssignRole("OWNER", "OWNER")).toBe(true);
    expect(canAssignRole("ADMIN", "ANALYST")).toBe(true);
    expect(canAssignRole("ANALYST", "VIEWER")).toBe(false);
  });
});
