import type { ReactNode } from 'react';
import { useInRouterContext, useNavigate } from 'react-router-dom';
import { buildAbsoluteAppUrl } from '../../supabaseClient';

/** Navega dentro del enrutador cuando existe; fuera de él (pruebas, vistas aisladas) usa un enlace absoluto. */
function RouterLinkButton({ to, className, children, title }: { to: string; className: string; children: ReactNode; title?: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" className={className} title={title} onClick={() => navigate(to)}>
      {children}
    </button>
  );
}

export default function AppLinkButton({ to, className, children, title }: { to: string; className: string; children: ReactNode; title?: string }) {
  const inRouter = useInRouterContext();
  if (!inRouter) {
    return (
      <a className={className} href={buildAbsoluteAppUrl(to)} title={title}>
        {children}
      </a>
    );
  }
  return (
    <RouterLinkButton to={to} className={className} title={title}>
      {children}
    </RouterLinkButton>
  );
}
