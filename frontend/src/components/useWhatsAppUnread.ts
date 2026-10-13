import { useEffect, useState } from 'react';
import { whatsappInboxApi, type WhatsAppInboxApi } from './whatsappInboxApi';

/** Unread WhatsApp messages across the inbox (0 for non-admins), live through Realtime with a slow poll as fallback. */
export default function useWhatsAppUnread(enabled: boolean, api: WhatsAppInboxApi = whatsappInboxApi) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const refresh = () => { void api.unreadCount().then(value => { if (alive) setCount(value); }); };
    refresh();
    const unsubscribe = api.subscribe(refresh);
    const timer = window.setInterval(refresh, 60000);
    return () => { alive = false; unsubscribe(); window.clearInterval(timer); };
  }, [enabled, api]);
  return enabled ? count : 0;
}
