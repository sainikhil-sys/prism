import { TEMPLATES, templateCsv, type TemplateName } from "@/lib/imports/csv";

export async function GET(_req: Request, ctx: RouteContext<"/api/templates/[name]">) {
  const { name } = await ctx.params;
  const key = name.replace(/\.csv$/, "") as TemplateName;
  if (!(key in TEMPLATES)) return new Response("Template not found", { status: 404 });
  return new Response(templateCsv(key), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="prism-${key}-template.csv"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
