require('dotenv').config({ path: '/Users/ricardomontanezmiranda/Desktop/Biosystems Project/frontend/.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
(async () => {
    const { data, error } = await supabase.from('profiles').select('*');
    console.log("Data:", data, "Error:", error);
})();
