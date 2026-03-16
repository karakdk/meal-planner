import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import Nav from '@/components/Nav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', session.user.id).single()
  if (!profile?.household_id) redirect('/household')

  return (
    <div className="min-h-screen bg-cream">
      <main className="max-w-lg mx-auto pb-24 px-4">
        {children}
      </main>
      <Nav />
    </div>
  )
}
