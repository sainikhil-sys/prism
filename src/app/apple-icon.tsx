import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#24201a" }}>
        <svg width="132" height="132" viewBox="0 0 32 32">
          <path d="M7 9c3.5 0 5.5 10 18 14" stroke="#faf8f2" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <path d="M7 21h7v-6h11" stroke="#1fa774" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    size,
  );
}
