import { Link, useNavigate } from 'react-router-dom';

export default function AdminPageHeader({ title, subtitle = '', links = [], actions = null }) {
  const navigate = useNavigate();

  return (
    <div className="mb-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            onClick={() => navigate('/admin')}
            className="px-3 py-1.5 text-sm bg-cad-card border border-cad-border text-cad-muted hover:text-cad-ink hover:bg-cad-surface rounded transition-colors"
          >
            Back to Admin Menu
          </button>
          <div className="mt-3">
            <h2 className="text-xl font-bold">{title}</h2>
            {subtitle ? <p className="text-sm text-cad-muted mt-1">{subtitle}</p> : null}
          </div>
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>

      {Array.isArray(links) && links.length > 0 ? (
        <div className="rounded-xl border border-cad-border bg-cad-card/60 p-3">
          <p className="text-[11px] uppercase tracking-wider text-cad-muted mb-2">Related Tools</p>
          <div className="flex flex-wrap gap-2">
            {links.map((link) => (
              <Link
                key={`${link.to}-${link.label}`}
                to={link.to}
                className="px-3 py-1.5 text-xs rounded border border-cad-border bg-cad-surface text-cad-muted hover:text-cad-ink hover:bg-cad-card transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
