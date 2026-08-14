export function PagePlaceholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="panel px-8 py-10 text-center max-w-md">
        <div className="text-sm font-semibold text-ink mb-1">{title}</div>
        <p className="text-xs text-muted leading-relaxed">{note}</p>
      </div>
    </div>
  );
}
