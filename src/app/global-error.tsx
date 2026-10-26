"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#faf8f2", color: "#1f1c17", margin: 0 }}>
        <main style={{ maxWidth: 520, margin: "20vh auto", padding: "0 16px" }}>
          <h1 style={{ fontSize: 28, fontWeight: 600 }}>Prism is temporarily unavailable</h1>
          <p style={{ marginTop: 12, lineHeight: 1.5 }}>An unexpected error stopped the page from loading. Please try again in a moment.</p>
          <button type="button" onClick={reset} style={{ marginTop: 24, padding: "10px 16px", borderRadius: 8, border: "1px solid #1f1c17", background: "#1f1c17", color: "#faf8f2", fontSize: 15, cursor: "pointer" }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
