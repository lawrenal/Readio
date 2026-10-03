const STYLES: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  extracted: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  needs_pdf: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

const LABELS: Record<string, string> = {
  pending: "Pending",
  extracted: "Extracted",
  needs_pdf: "Needs PDF",
  failed: "Failed",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[status] ?? ""}`}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
