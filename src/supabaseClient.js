import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://arypsfovyoisixgacwwq.supabase.co'
const supabaseKey = 'sb_publishable_pXduFA8Yqs66-BGZM_1Ecg_Y6oru3Aw'

export const supabase = createClient(supabaseUrl, supabaseKey)
