"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            fontFamily: "sans-serif",
            padding: 24,
          }}
        >
          <div style={{ maxWidth: 460, textAlign: "center" }}>
            <h1>Adaptive World needs a refresh</h1>
            <p>
              The application shell encountered an unexpected error. No demo permissions were
              changed.
            </p>
            <button
              onClick={reset}
              style={{
                border: 0,
                borderRadius: 10,
                padding: "11px 16px",
                background: "#111713",
                color: "white",
                cursor: "pointer",
              }}
            >
              Reload application
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
