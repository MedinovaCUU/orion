import { createRoot } from 'react-dom/client';
import { supabase } from '../../src/supabaseClient';
import Tickets from '../../src/components/Tickets';
import '../../src/index.css';
// Standalone development fixture: the session comes from the query string. No credentials, no real data.
const userId = new URLSearchParams(window.location.search).get('user') || 'alfredo';
supabase.auth.getUser = (async () => ({ data: { user: { id: userId } }, error: null })) as typeof supabase.auth.getUser;
supabase.auth.onAuthStateChange = (() => ({ data: { subscription: { unsubscribe: () => {} } } })) as unknown as typeof supabase.auth.onAuthStateChange;
createRoot(document.getElementById('root')!).render(<main style={{ maxWidth: 1200, margin: '0 auto', padding: '1rem' }}><Tickets /></main>);
