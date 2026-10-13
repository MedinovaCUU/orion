import type { ReactNode } from 'react';
import { HIDE_PEOPLE } from '../config/presentationPrivacy';

// Blurs a person's name while the presentation mode is on.
export default function PrivateName({ children }: { children: ReactNode }) {
  return HIDE_PEOPLE && children ? <span className="orion-private">{children}</span> : <>{children}</>;
}
