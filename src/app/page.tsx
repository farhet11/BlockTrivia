import { createServerSupabaseClient } from '@/lib/supabase-server'

export default async function Home() {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.from('profiles').select('count')

  return (
    <main>
      <h1>BlockTrivia</h1>
      <p>Supabase connection: {error ? 'FAILED' : 'SUCCESS'}</p>
    </main>
  )
}