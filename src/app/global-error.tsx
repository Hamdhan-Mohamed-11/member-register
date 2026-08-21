"use client";

import { useEffect } from "react";

/**
 * Last resort: an error in the ROOT layout itself, which is the one place
 * app/error.tsx cannot cover because the layout it renders inside has failed.
 *
 * This replaces the whole document, so it must supply its own <html> and
 * <body> — and it cannot use the app's components or Tailwind classes, since
 * the failure may well be in whatever loads them. Hence the inline styles,
 * which are otherwise not how anything here is written.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app:global-error]", error.digest ?? "(no digest)", error.message);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#f0f2f5",
          color: "#1c1e21",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          padding: "1rem",
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: "0.5rem",
            boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
            padding: "1.5rem",
            maxWidth: "24rem",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>
            Pick a Book is having trouble
          </h1>
          <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "#65676b" }}>
            Something failed while loading the page. Please try again in a
            moment.
          </p>
          {error.digest ? (
            <p style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "#8a8d91" }}>
              Reference <code>{error.digest}</code>
            </p>
          ) : null}
          <button
            onClick={reset}
            style={{
              marginTop: "1.25rem",
              minHeight: "2.75rem",
              padding: "0 1rem",
              borderRadius: "0.5rem",
              border: "none",
              background: "#293896",
              color: "#fff",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
