'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const NAV = [
  { href: '/plan',     label: 'Plan',    icon: (active: boolean) => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="4" width="14" height="13" rx="2" stroke={active ? '#3B6D11' : '#888780'} strokeWidth="1.5"/>
      <path d="M7 2v3M13 2v3M3 8h14" stroke={active ? '#3B6D11' : '#888780'} strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="6.5" y="11" width="3" height="3" rx="0.5" fill={active ? '#3B6D11' : '#B4B2A9'}/>
    </svg>
  )},
  { href: '/shopping', label: 'Shop',    icon: (active: boolean) => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M3 3h2l2.5 8.5h7L17 7H6" stroke={active ? '#3B6D11' : '#888780'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="9" cy="16" r="1.5" fill={active ? '#3B6D11' : '#888780'}/>
      <circle cx="14" cy="16" r="1.5" fill={active ? '#3B6D11' : '#888780'}/>
    </svg>
  )},
  { href: '/recipes',  label: 'Recipes', icon: (active: boolean) => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M4 4h12v13a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" stroke={active ? '#3B6D11' : '#888780'} strokeWidth="1.5"/>
      <path d="M8 2h4v3H8zM7 9h6M7 12h4" stroke={active ? '#3B6D11' : '#888780'} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )},
  { href: '/profile',  label: 'Profile', icon: (active: boolean) => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="7" r="3.5" stroke={active ? '#3B6D11' : '#888780'} strokeWidth="1.5"/>
      <path d="M3 17c0-3.3 3.1-6 7-6s7 2.7 7 6" stroke={active ? '#3B6D11' : '#888780'} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )},
]

export default function Nav() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-cream border-t border-stone-200 z-50 pb-safe">
      <div className="max-w-lg mx-auto flex">
        {NAV.map(({ href, label, icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link key={href} href={href} className="flex-1 flex flex-col items-center gap-1 py-3 transition-opacity">
              {icon(active)}
              <span className={`text-[10px] font-medium ${active ? 'text-sage-600' : 'text-stone-400'}`}>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
