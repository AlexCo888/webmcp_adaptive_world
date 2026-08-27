"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="page-wrap">
      <div className="error-page card">
        <AlertTriangle size={32} />
        <h1>That path needs another try.</h1>
        <p>The ordinary interface is still available; no Passport data was changed.</p>
        <button className="button button--dark" type="button" onClick={reset}>
          <RotateCcw size={16} /> Try again
        </button>
      </div>
    </div>
  );
}
