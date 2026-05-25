import type { HTMLAttributes } from 'react';

type PlanningIconName =
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
  | 'table'
  | 'users'
  | 'bell'
  | 'chart'
  | 'settings'
  | 'plus'
  | 'filter';

interface PlanningIconProps extends HTMLAttributes<HTMLSpanElement> {
  name: PlanningIconName;
}

const iconMap: Record<PlanningIconName, string> = {
  calendar: '🗓️',
  shield: '🛡️',
  wrench: '🔧',
  cap: '🎓',
  refresh: '🔄',
  briefcase: '💼',
  coin: '🪙',
  check: '✅',
  alert: '❗',
  user: '👤',
  table: '📋',
  users: '👥',
  bell: '🚨',
  chart: '📊',
  settings: '⚙️',
  plus: '➕',
  filter: '⚲',
};

export default function PlanningIcon({ name, className = '', ...props }: PlanningIconProps) {
  const classes = ['planning-icon', className].filter(Boolean).join(' ');

  return (
    <span aria-hidden="true" className={classes} {...props}>
      {iconMap[name]}
    </span>
  );
}
