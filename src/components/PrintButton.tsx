"use client";

export default function PrintButton({ label = "🖨 印刷 / PDFで保存" }: { label?: string }) {
  return (
    <button onClick={() => window.print()} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
      {label}
    </button>
  );
}
