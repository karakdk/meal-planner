'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { type Household } from '@/lib/types'

type Member = { id: string; display_name: string }

export default function ProfilePage() {
  const supabase = createClient()
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [household, setHousehold] = useState<Household | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [currentUserId, setCurrentUserId] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setEmail(user.email || '')
      setCurrentUserId(user.id)
      const { data: profile } = await supabase.from('profiles').select('display_name, household_id').eq('id', user.id).single()
      if (profile) {
        setDisplayName(profile.display_name)
        if (profile.household_id) {
          const { data: hh } = await supabase.from('households').select('*').eq('id', profile.household_id).single()
          setHousehold(hh)
          const { data: memberProfiles } = await supabase.from('profiles').select('id, display_name').eq('household_id', profile.household_id)
          setMembers(memberProfiles || [])
        }
      }
      setLoading(false)
    }
    load()
  }, [supabase])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('profiles').upsert({ id: currentUserId, display_name: displayName })
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function copyCode() {
    if (!household) return
    await navigator.clipboard.writeText(household.invite_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const initials = displayName ? displayName.slice(0,2).toUpperCase() : email.slice(0,2).toUpperCase()

  if (loading) return (
    <div className="pt-16 flex items-center justify-center h-40">
      <div className="flex gap-1.5">{[0,1,2].map(i => (
        <div key={i} className="w-2 h-2 rounded-full bg-sage-200" style={{animation:`pulse-dot 1s ease ${i*0.2}s infinite`}}/>
      ))}</div>
    </div>
  )

  return (
    <div className="pt-8 animate-fade-up">
      <h1 className="text-2xl font-medium text-stone-900 tracking-tight mb-6">Profile</h1>

      {/* Avatar */}
      <div className="flex justify-center mb-6">
        <div className="w-20 h-20 rounded-full bg-sage-100 flex items-center justify-center">
          <span className="text-2xl font-medium text-sage-700">{initials}</span>
        </div>
      </div>

      {/* Profile form */}
      <form onSubmit={handleSave} className="space-y-3 mb-5">
        <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-stone-400 uppercase tracking-widest mb-1.5">Your name</label>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Kara"
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-sage-400 transition-colors"/>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-400 uppercase tracking-widest mb-1.5">Email</label>
            <div className="bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm text-stone-400">{email}</div>
          </div>
        </div>
        <button type="submit" disabled={saving}
          className="w-full bg-sage-600 hover:bg-sage-800 text-sage-50 font-medium py-3 rounded-2xl text-sm transition-colors disabled:opacity-60">
          {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>

      {/* Household */}
      {household && (
        <div className="mb-5">
          <p className="text-xs font-medium text-stone-400 uppercase tracking-widest mb-2">Household</p>
          <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
            <div className="bg-sage-50 px-4 py-3 border-b border-stone-100 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-sage-600 flex items-center justify-center flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2L2 6v8h4v-4h4v4h4V6L8 2z" stroke="#EAF3DE" strokeWidth="1.3" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-stone-900">{household.name}</p>
                <p className="text-xs text-stone-400">{members.length} member{members.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            {members.map(m => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3 border-b border-stone-100 last:border-0">
                <div className="w-7 h-7 rounded-full bg-sage-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-medium text-sage-700">{m.display_name.slice(0,1).toUpperCase()}</span>
                </div>
                <span className="flex-1 text-sm text-stone-700">{m.display_name}</span>
                {m.id === currentUserId && (
                  <span className="text-xs text-sage-600 bg-sage-50 px-2 py-0.5 rounded-full">you</span>
                )}
                {m.id === household.created_by && (
                  <span className="text-xs text-stone-400">owner</span>
                )}
              </div>
            ))}
          </div>

          {/* Invite code */}
          <div className="mt-3 bg-white border border-stone-200 rounded-2xl p-4">
            <p className="text-xs font-medium text-stone-400 uppercase tracking-widest mb-2">Invite code</p>
            <p className="text-xs text-stone-400 mb-3">Share this code with anyone you want to join your household.</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-sage-50 rounded-xl px-4 py-2.5 font-mono text-base font-medium text-sage-800 tracking-widest">
                {household.invite_code}
              </div>
              <button onClick={copyCode} className="bg-sage-600 text-sage-50 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-sage-800 transition-colors flex-shrink-0">
                {copied ? '✓' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}

      <button onClick={signOut}
        className="w-full border border-stone-200 text-stone-500 hover:text-stone-700 hover:border-stone-300 font-medium py-3 rounded-2xl text-sm transition-colors">
        Sign out
      </button>
    </div>
  )
}
