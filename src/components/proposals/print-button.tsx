"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      className="border border-zinc-300 px-3 py-2 text-sm"
      onClick={() => window.print()}
    >
      Save as PDF
    </button>
  );
}
