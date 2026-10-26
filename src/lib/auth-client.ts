"use client";
import { createAuthClient } from "better-auth/react";

/** Same-origin client: requests go to /api/auth on the current host. */
export const authClient = createAuthClient();
