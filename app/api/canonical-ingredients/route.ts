import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.toLowerCase().trim() || ''
  if (q.length < 1) return NextResponse.json([])

  const supabase = createServerSupabaseClient()
  const { data } = await supabase
    .from('canonical_ingredients')
    .select('id, name, category, aliases')
    .order('name')

  if (!data) return NextResponse.json([])

  // Score each canonical ingredient against the query
  const scored = data
    .map(ci => {
      const nameLower = ci.name.toLowerCase()
      let score = 0
      if (nameLower === q) score = 100
      else if (nameLower.startsWith(q)) score = 80
      else if (nameLower.includes(q)) score = 60
      else {
        // Check aliases
        const aliasMatch = (ci.aliases || []).some((a: string) => {
          const al = a.toLowerCase()
          if (al === q) { score = 75; return true }
          if (al.startsWith(q)) { score = 55; return true }
          if (al.includes(q)) { score = 40; return true }
          return false
        })
        if (!aliasMatch) score = 0
      }
      return { ...ci, score }
    })
    .filter(ci => ci.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)

  return NextResponse.json(scored)
}
