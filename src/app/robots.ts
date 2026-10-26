import type { MetadataRoute } from "next";
import { site } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  const production = process.env.VERCEL_ENV ? process.env.VERCEL_ENV === "production" : process.env.NODE_ENV === "production";
  if (!production) {
    // Preview and development deployments must never be indexed.
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/api", "/onboarding", "/invite", "/reset-password", "/forgot-password", "/sign-in"] }],
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  };
}
