import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export function EmptyState({ icon, title, children, action }: { icon: IconName; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="card empty">
      <div className="empty-icon"><Icon name={icon} size={30} /></div>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
