import { ImageResponse } from "next/og";

export const alt = "Prism: demand forecasting and price recommendations with SHAP explanations";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#faf8f2", padding: 72, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="72" height="72" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="7" fill="#24201a" />
            <path d="M7 9c3.5 0 5.5 10 18 14" stroke="#faf8f2" strokeWidth="2.4" fill="none" strokeLinecap="round" />
            <path d="M7 21h7v-6h11" stroke="#1fa774" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div style={{ fontSize: 44, fontWeight: 700, color: "#24201a" }}>Prism</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 68, fontWeight: 700, color: "#24201a", lineHeight: 1.08, maxWidth: 980 }}>Forecast demand. Set prices inside your own rules. See why.</div>
          <div style={{ fontSize: 30, color: "#5b554b", maxWidth: 960, lineHeight: 1.35 }}>
            Demand forecasts from your sales history, price recommendations within your margin and stock limits, and a SHAP explanation for each one.
          </div>
        </div>
        <div style={{ display: "flex", height: 10, width: "100%", background: "#1d7a57", borderRadius: 4 }} />
      </div>
    ),
    size,
  );
}
