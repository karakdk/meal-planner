'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { generateInviteCode } from '@/lib/types'

export default function HouseholdPage() {
  const supabase = createClient()
  const router = useRouter()
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose')
  const [householdName, setHouseholdName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState('')
  const [createdCode, setCreatedCode] = useState('')
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string } | null>(null)

  const loadUser = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setCurrentUser({ id: user.id, email: user.email || '' })
    // Pre-fill display name from profile
    const { data: profile } = await supabase.from('profiles').select('display_name, household_id').eq('id', user.id).single()
    if (profile?.household_id) { router.push('/plan'); return }
    if (profile?.display_name) setDisplayName(profile.display_name)
    setInitialLoading(false)
  }, [supabase, router])

  useEffect(() => { loadUser() }, [loadUser])

  async function handleCreate() {
    if (!householdName.trim() || !displayName.trim()) { setError('Please fill in all fields'); return }
    setLoading(true); setError('')
    try {
      const code = generateInviteCode()
      const { data: household, error: hErr } = await supabase.from('households').insert({
        name: householdName.trim(),
        invite_code: code,
        created_by: currentUser?.id,
      }).select().single()
      if (hErr) throw hErr

      await supabase.from('profiles').update({
        display_name: displayName.trim(),
        household_id: household.id,
      }).eq('id', currentUser?.id)

      setCreatedCode(code)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create household — check Supabase permissions')
    }
    setLoading(false)
  }

  async function handleJoin() {
    if (!joinCode.trim() || !displayName.trim()) { setError('Please fill in all fields'); return }
    setLoading(true); setError('')
    try {
      const { data: household, error: hErr } = await supabase
        .from('households').select('id').eq('invite_code', joinCode.trim().toUpperCase()).single()
      if (hErr || !household) throw new Error('Invite code not found. Check the code and try again.')

      await supabase.from('profiles').update({
        display_name: displayName.trim(),
        household_id: household.id,
      }).eq('id', currentUser?.id)

      router.push('/plan')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to join household')
    }
    setLoading(false)
  }

  if (initialLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-cream">
      <div className="flex gap-1.5">
        {[0,1,2].map(i => (
          <div key={i} className="w-2 h-2 rounded-full bg-sage-300"
            style={{animation:`pulse-dot 1s ease ${i*0.2}s infinite`}}/>
        ))}
      </div>
    </div>
  )

  if (createdCode) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-cream">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="w-12 h-12 rounded-2xl bg-sage-600 flex items-center justify-center mx-auto mb-4">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 2L3 7v11h5v-5h4v5h5V7L10 2z" stroke="#EAF3DE" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2 className="text-xl font-medium text-stone-900 text-center mb-2">{householdName} is ready!</h2>
          <p className="text-sm text-stone-500 text-center mb-6">Share this invite code with your household members so they can join.</p>

          <div className="bg-sage-50 border border-sage-200 rounded-2xl p-5 mb-4 text-center">
            <p className="text-xs font-medium text-sage-600 uppercase tracking-widest mb-2">Invite code</p>
            <p className="text-3xl font-medium text-sage-800 tracking-widest mb-3">{createdCode}</p>
            <button
              onClick={() => navigator.clipboard.writeText(createdCode)}
              className="text-xs text-sage-600 border border-sage-300 rounded-lg px-3 py-1.5 hover:bg-sage-100 transition-colors"
            >
              Copy code
            </button>
          </div>

          <p className="text-xs text-stone-400 text-center mb-6">They go to the app, tap "Join a household", and enter this code.</p>

          <button
            onClick={() => router.push('/plan')}
            className="w-full bg-sage-600 hover:bg-sage-800 text-sage-50 font-medium py-3 rounded-2xl text-sm transition-colors"
          >
            Go to my meal planner
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-cream">
      <div className="w-full max-w-sm animate-fade-up">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-10 h-10 rounded-2xl bg-sage-600 flex items-center justify-center mx-auto mb-3">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 2L2 7v9h4v-4h6v4h4V7L9 2z" stroke="#EAF3DE" strokeWidth="1.4" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className="text-xl font-medium text-stone-900 tracking-tight">Set up your household</h1>
          <p className="text-sm text-stone-400 mt-1">Share recipes and shopping lists with your family</p>
        </div>

        {mode === 'choose' && (
          <div className="space-y-3 animate-fade-up">
            <button
              onClick={() => setMode('create')}
              className="w-full bg-white border border-stone-200 rounded-2xl p-4 text-left hover:border-sage-300 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-sage-50 flex items-center justify-center flex-shrink-0">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 2L2 6v8h4v-4h4v4h4V6L8 2z" stroke="#3B6D11" strokeWidth="1.3" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-stone-800">Create a household</p>
                  <p className="text-xs text-stone-400 mt-0.5">Start fresh and invite your partner or family</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setMode('join')}
              className="w-full bg-white border border-stone-200 rounded-2xl p-4 text-left hover:border-sage-300 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-stone-100 flex items-center justify-center flex-shrink-0">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="6" cy="5" r="2.5" stroke="#5F5E5A" strokeWidth="1.3"/>
                    <path d="M1 13c0-2.8 2.2-5 5-5" stroke="#5F5E5A" strokeWidth="1.3" strokeLinecap="round"/>
                    <path d="M11 9v6M8 12h6" stroke="#5F5E5A" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-stone-800">Join a household</p>
                  <p className="text-xs text-stone-400 mt-0.5">Enter the invite code from your partner</p>
                </div>
              </div>
            </button>
          </div>
        )}

        {mode === 'create' && (
          <div className="space-y-4 animate-fade-up">
            <div>
              <label className="block text-xs font-medium text-stone-400 uppercase tracking-widest mb-1.5">Your name</label>
              <input value={displayName} onChange={e => setDisplayName(e.target.value)}
                placeholder="Kara"
                className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-sage-400 transition-colors"/>
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-400 uppercase tracking-widest mb-1.5">Household name</label>
              <input value={householdName} onChange={e => setHouseholdName(e.target.value)}
                placeholder="Kara & Ernie"
                className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-sage-400 transition-colors"/>
            </div>
            {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}
            <button onClick={handleCreate} disabled={loading}
              className="w-full bg-sage-600 hover:bg-sage-800 text-sage-50 font-medium py-3 rounded-2xl text-sm transition-colors disabled:opacity-60">
              {loading ? 'Creating…' : 'Create household'}
            </button>
            <button onClick={() => { setMode('choose'); setError('') }}
              className="w-full text-sm text-stone-400 hover:text-stone-600 transition-colors py-1">
              ← Back
            </button>
          </div>
        )}

        {mode === 'join' && (
          <div className="space-y-4 animate-fade-up">
            <div>
              <label className="block text-xs font-medium text-stone-400 uppercase tracking-widest mb-1.5">Your name</label>
              <input value={displayName} onChange={e => setDisplayName(e.target.value)}
                placeholder="Ernie"
                className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-sage-400 transition-colors"/>
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-400 uppercase tracking-widest mb-1.5">Invite code</label>
              <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
                placeholder="SAGE-4829"
                className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-sage-400 transition-colors font-mono tracking-wider uppercase"/>
            </div>
            {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}
            <button onClick={handleJoin} disabled={loading}
              className="w-full bg-sage-600 hover:bg-sage-800 text-sage-50 font-medium py-3 rounded-2xl text-sm transition-colors disabled:opacity-60">
              {loading ? 'Joining…' : 'Join household'}
            </button>
            <button onClick={() => { setMode('choose'); setError('') }}
              className="w-full text-sm text-stone-400 hover:text-stone-600 transition-colors py-1">
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
