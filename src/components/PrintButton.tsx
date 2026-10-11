"use client";

export default function PrintButton({ label = "🖨 印刷 / PDFで保存" }: { label?: string }) {
  return (
    <button onClick={() => window.print()} className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
      {label}
    </button>
  );
}
