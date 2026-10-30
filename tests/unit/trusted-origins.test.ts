import { describe, expect, it } from "vitest";
import { trustedOrigins } from "@/server/auth";

describe("auth trusted origins", () => {
  it("trusts APP_URL, extra origins and every Vercel-assigned hostname", () => {
    const origins = trustedOrigins("https://prism-sai-nikhil2.vercel.app/", {
      TRUSTED_ORIGINS: "https://prism-kohl-omega.vercel.app, https://prism.example.com/path",
      VERCEL_PROJECT_PRODUCTION_URL: "prism-kohl-omega.vercel.app",
      VERCEL_BRANCH_URL: "prism-git-main-sai-nikhil2.vercel.app",
      VERCEL_URL: "prism-83lqextqu-sai-nikhil2.vercel.app",
    });
    expect(origins).toEqual([
      "https://prism-sai-nikhil2.vercel.app",
      "https://prism-kohl-omega.vercel.app",
      "https://prism.example.com",
      "https://prism-git-main-sai-nikhil2.vercel.app",
      "https://prism-83lqextqu-sai-nikhil2.vercel.app",
    ]);
  });

  it("only trusts APP_URL locally", () => {
    expect(trustedOrigins("http://localhost:3000", {})).toEqual(["http://localhost:3000"]);
  });
});
