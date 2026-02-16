"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-slate-50">
      <h1 className="text-xl font-bold text-slate-900 mb-2">Something went wrong</h1>
      <p className="text-slate-600 mb-4">{error.message}</p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800"
      >
        Try again
      </button>
    </div>
  );
}
