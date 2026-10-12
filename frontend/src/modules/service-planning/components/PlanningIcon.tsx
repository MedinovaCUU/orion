import type { ReactNode, SVGAttributes } from 'react';

export type PlanningIconName =
  | 'calendar'
  | 'shield'
  | 'wrench'
  | 'cap'
  | 'refresh'
  | 'briefcase'
  | 'coin'
  | 'check'
  | 'alert'
  | 'user'
  | 'users'
  | 'plus'
  | 'filter'
  | 'table'
  | 'bell'
  | 'settings'
  | 'live'
  | 'summary'
  | 'guards'
  | 'engineers'
  | 'reports';

interface PlanningIconProps extends SVGAttributes<SVGSVGElement> {
  name: PlanningIconName;
}

// Line icons on a 24px grid, 1.6 stroke, drawn with currentColor and sized at
// 1em, so each placement controls tint and size through color / font-size.
const paths: Record<PlanningIconName, ReactNode> = {
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      <path d="M8 13.5h.01M12 13.5h.01M16 13.5h.01M8 17h.01M12 17h.01" strokeWidth="2.2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.2 5 5.8v5.4c0 4.4 2.9 8.1 7 9.6 4.1-1.5 7-5.2 7-9.6V5.8z" />
      <path d="M12 9v6M9 12h6" />
    </>
  ),
  wrench: (
    <path d="M16.94 4.83A4.6 4.6 0 0 0 10.86 11.01L4.54 17.34a1.5 1.5 0 0 0 2.12 2.12l6.33-6.32A4.6 4.6 0 0 0 19.17 7.06l-2.19 2.22-2.26-2.26z" />
  ),
  cap: (
    <>
      <path d="M2.5 9.5 12 5l9.5 4.5L12 14z" />
      <path d="M6.5 11.6v4.2c0 1.5 2.5 2.7 5.5 2.7s5.5-1.2 5.5-2.7v-4.2M21.5 9.5v5" />
    </>
  ),
  refresh: (
    <>
      <path d="M4.5 12a7.5 7.5 0 0 1 13-5.1M19.5 12a7.5 7.5 0 0 1-13 5.1" />
      <path d="M17.5 3.5v3.4h-3.4M6.5 20.5v-3.4h3.4" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3.5" y="7.5" width="17" height="12" rx="2.5" />
      <path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5" />
      <path d="M3.5 12.5h7M13.5 12.5h7M10.5 11.2h3v2.6h-3z" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.5 9.3c-.5-.9-1.5-1.3-2.5-1.3-1.4 0-2.5.8-2.5 1.9 0 2.6 5 1.4 5 4.1 0 1.1-1.1 2-2.5 2-1.1 0-2.1-.5-2.6-1.4M12 6.5V8M12 16v1.5" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.3 12.2 2.5 2.5 4.9-5" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 4.3 2.8 17.5a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z" />
      <path d="M12 9.5v4.5" />
      <path d="M12 17.2h.01" strokeWidth="2.2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.8 20.2c.8-3.4 3.7-5.6 7.2-5.6s6.4 2.2 7.2 5.6" />
    </>
  ),
  users: (
    <>
      <circle cx="9.5" cy="8.5" r="3.3" />
      <path d="M3.5 19.5c.6-3 3-4.9 6-4.9s5.4 1.9 6 4.9" />
      <path d="M15.5 5.4a3.2 3.2 0 0 1 0 6.2M17.8 14.9c1.6.6 2.6 2.1 2.9 4.1" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  filter: <path d="M4 5.5h16l-6.2 7.3v5.4l-3.6 1.8v-7.2z" />,
  table: (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
      <path d="M3.5 9h17M3.5 14.5h17M9.5 9v11" />
    </>
  ),
  bell: (
    <>
      <path d="M6.2 16.5V11a5.8 5.8 0 0 1 11.6 0v5.5l1.7 1.8h-15z" />
      <path d="M10 20.8a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h2M10 7h10M4 12h10M18 12h2M4 17h5M13 17h7" />
      <circle cx="8" cy="7" r="2" />
      <circle cx="16" cy="12" r="2" />
      <circle cx="11" cy="17" r="2" />
    </>
  ),
  live: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="2.5" />
      <path d="M8.5 20.5h7M12 17v3.5" />
      <path d="M6.5 11.5h2.2l1.6-3 2.4 6 1.8-4.2 1 1.2h2" />
    </>
  ),
  summary: (
    <>
      <rect x="3.5" y="3.5" width="7" height="9" rx="1.8" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="1.8" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="1.8" />
      <rect x="3.5" y="15.5" width="7" height="5" rx="1.8" />
    </>
  ),
  guards: (
    <>
      <path d="M12 3.2 5 5.8v5.4c0 4.4 2.9 8.1 7 9.6 4.1-1.5 7-5.2 7-9.6V5.8z" />
      <path d="m9 12 2.1 2.1L15.2 10" />
    </>
  ),
  engineers: (
    <>
      <path d="M7 10.2a5 5 0 0 1 10 0" />
      <path d="M5.8 10.2h12.4M12 5.2v2.6" />
      <path d="M8.6 12.2a3.4 3.4 0 0 0 6.8 0" />
      <path d="M5 20.5c.6-2.9 3.5-4.9 7-4.9s6.4 2 7 4.9" />
    </>
  ),
  reports: (
    <>
      <path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z" />
      <path d="M14 3.5V8h4.5" />
      <path d="M9 17v-3M12 17v-5.5M15 17v-2" />
    </>
  ),
};

export default function PlanningIcon({ name, className = '', ...props }: PlanningIconProps) {
  const classes = ['planning-icon', className].filter(Boolean).join(' ');

  return (
    <svg
      aria-hidden="true"
      className={classes}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
