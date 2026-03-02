import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hmgsktcgjvohyesrucli.supabase.co';
const supabaseAnonKey = 'sb_publishable_CVGj7Li4dYegRx-BnDnzRA_QFWcpMh2';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
