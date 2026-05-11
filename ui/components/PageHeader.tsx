interface Props {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions }: Props) {
  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-3 pb-5">
      <div className="min-w-0 flex-1">
        <h1 className="text-3xl font-normal tracking-tight text-ink">{title}</h1>
        {subtitle && <div className="mt-2 text-sm text-ink3">{subtitle}</div>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
