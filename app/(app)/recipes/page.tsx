'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { type Recipe, PRESET_TAGS } from '@/lib/types'

export default function RecipesPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<'my' | 'master'>('my')
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('profiles').select('household_id').eq('id', user.id).single()
    const hid = profile?.household_id
    setHouseholdId(hid)

    // Load saved recipe IDs for this household
    if (hid) {
      const { data: saved } = await supabase.from('saved_recipes').select('recipe_id').eq('household_id', hid)
      setSavedIds(new Set((saved || []).map((s: {recipe_id: string}) => s.recipe_id)))
    }

    if (tab === 'my') {
      // Load only saved recipes for this household
      const { data } = await supabase
        .from('saved_recipes')
        .select('recipe:recipes(*, ingredients(*))')
        .eq('household_id', hid)
        .order('saved_at', { ascending: false })
      const fetched = (data || []).map((s: {recipe: unknown}) => s.recipe as Recipe)
      // Enrich with creator names
      await enrichWithCreators(fetched)
    } else {
      // Master list — all recipes
      const { data } = await supabase.from('recipes').select('*, ingredients(*)').order('name')
      await enrichWithCreators(data || [])
    }
    setLoading(false)
  }, [supabase, tab])

  async function enrichWithCreators(data: Recipe[]) {
    const creatorIds = Array.from(new Set(data.map(r => r.created_by).filter(Boolean))) as string[]
    let profileMap: Record<string, string> = {}
    if (creatorIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, display_name').in('id', creatorIds)
      profileMap = Object.fromEntries((profiles || []).map((p: {id: string; display_name: string}) => [p.id, p.display_name]))
    }
    setRecipes(data.map(r => ({ ...r, creator: r.created_by ? { display_name: profileMap[r.created_by] || 'Unknown', id: r.created_by, created_at: '', household_id: null } : null })))
  }

  useEffect(() => { load() }, [load])

  async function toggleSave(recipeId: string) {
    if (!householdId) return
    setSavingId(recipeId)
    const { data: { user } } = await supabase.auth.getUser()
    if (savedIds.has(recipeId)) {
      await supabase.from('saved_recipes').delete().eq('household_id', householdId).eq('recipe_id', recipeId)
      setSavedIds(prev => { const n = new Set(prev); n.delete(recipeId); return n })
    } else {
      await supabase.from('saved_recipes').insert({ household_id: householdId, recipe_id: recipeId, saved_by: user?.id })
      setSavedIds(prev => { const n = new Set(prev); n.add(recipeId); return n })
    }
    setSavingId(null)
  }

  function getMacros(recipe: Recipe) {
    if (!recipe.ingredients?.length) return null
    const cal = recipe.ingredients.reduce((s, i) => s + (i.calories||0), 0)
    const prot = recipe.ingredients.reduce((s, i) => s + (i.protein||0), 0)
    return { calPerServ: Math.round(cal/recipe.servings), protPerServ: Math.round(prot/recipe.servings) }
  }

  // Get all tags used across loaded recipes
  const allTags = Array.from(new Set(recipes.flatMap(r => r.tags || []))).sort()
  const tagsToShow = allTags.length > 0 ? allTags : PRESET_TAGS.slice(0, 8)

  const filtered = recipes.filter(r => {
    const matchesSearch = r.name.toLowerCase().includes(search.toLowerCase())
    const matchesTag = !activeTag || (r.tags || []).includes(activeTag)
    return matchesSearch && matchesTag
  })

  return (
    <div className="pt-8 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-medium text-stone-900 tracking-tight">Recipes</h1>
        <div className="flex gap-2">
          <Link href="/recipes/import" className="flex items-center gap-1 bg-stone-100 text-stone-700 text-xs font-medium px-3 py-2 rounded-xl hover:bg-stone-200 transition-colors">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 7L7 4M5 2.5H2.5A1 1 0 001.5 3.5v6A1 1 0 002.5 10.5h6A1 1 0 009.5 9.5V7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M7 1.5h3v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
            Import
          </Link>
          <Link href="/recipes/new" className="flex items-center gap-1 bg-sage-600 text-sage-50 text-xs font-medium px-3 py-2 rounded-xl hover:bg-sage-800 transition-colors">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            Add
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-stone-100 rounded-xl p-1 mb-4">
        {(['my', 'master'] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); setSearch(''); setActiveTag(null) }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${tab === t ? 'bg-white text-stone-900' : 'text-stone-500 hover:text-stone-700'}`}>
            {t === 'my' ? 'Our recipes' : 'Master list'}
          </button>
        ))}
      </div>

      {tab === 'master' && (
        <div className="bg-sage-50 border border-sage-100 rounded-xl px-3 py-2.5 mb-4 text-xs text-sage-700">
          Browse all recipes added by any user. Tap <strong>+ Save</strong> to add a recipe to your household&apos;s list.
        </div>
      )}

      {/* Search */}
      <div className="relative mb-3">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
        <input type="text" placeholder="Search recipes…" value={search} onChange={e => setSearch(e.target.value)}
          className="w-full bg-white border border-stone-200 rounded-xl pl-8 pr-4 py-2.5 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:border-sage-400 transition-colors"/>
      </div>

      {/* Tag filters */}
      {tagsToShow.length > 0 && (
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
          <button onClick={() => setActiveTag(null)}
            className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors ${!activeTag ? 'bg-sage-600 border-sage-600 text-sage-50' : 'bg-white border-stone-200 text-stone-500 hover:border-stone-300'}`}>
            All
          </button>
          {tagsToShow.map(tag => (
            <button key={tag} onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors ${activeTag === tag ? 'bg-sage-600 border-sage-600 text-sage-50' : 'bg-white border-stone-200 text-stone-500 hover:border-stone-300'}`}>
              {tag}
            </button>
          ))}
        </div>
      )}

      <p className="text-xs text-stone-400 mb-3">{filtered.length} {filtered.length === 1 ? 'recipe' : 'recipes'}</p>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="flex gap-1.5">{[0,1,2].map(i => (
            <div key={i} className="w-2 h-2 rounded-full bg-sage-200" style={{animation:`pulse-dot 1s ease ${i*0.2}s infinite`}}/>
          ))}</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-stone-400">
          <p className="font-medium">{tab === 'my' ? 'No saved recipes yet' : 'No recipes found'}</p>
          <p className="text-xs mt-1">{tab === 'my' ? 'Switch to Master list and save some recipes' : 'Try a different search or tag'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map(recipe => {
            const macros = getMacros(recipe)
            const isSaved = savedIds.has(recipe.id)
            const creator = recipe.creator as {display_name: string} | null
            return (
              <div key={recipe.id} className="bg-white border border-stone-200 rounded-2xl overflow-hidden hover:border-stone-300 transition-colors">
                <Link href={`/recipes/${recipe.id}`}>
                  {recipe.photo_url ? (
                    <img src={recipe.photo_url} alt={recipe.name} className="w-full h-28 object-cover"/>
                  ) : (
                    <div className="w-full h-28 bg-sage-50 flex items-center justify-center">
                      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                        <rect x="3" y="5" width="22" height="17" rx="3" stroke="#C0DD97" strokeWidth="1.3"/>
                        <circle cx="10" cy="11" r="2.5" stroke="#C0DD97" strokeWidth="1.3"/>
                        <path d="M3 18l5-4.5 4 4 3-3.5 7 6" stroke="#C0DD97" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )}
                </Link>
                <div className="p-2.5">
                  <Link href={`/recipes/${recipe.id}`}>
                    <p className="text-sm font-medium text-stone-800 leading-tight mb-1 line-clamp-2">{recipe.name}</p>
                  </Link>
                  {creator && <p className="text-[10px] text-stone-400 mb-1">by {creator.display_name}</p>}
                  {macros && (
                    <p className="text-[10px] text-stone-400 mb-2">{macros.calPerServ} cal · {macros.protPerServ}g protein</p>
                  )}
                  {(recipe.tags || []).length > 0 && (
                    <div className="flex gap-1 mb-2 flex-wrap">
                      {(recipe.tags || []).slice(0,2).map(tag => (
                        <span key={tag} className="text-[9px] bg-sage-50 text-sage-700 px-1.5 py-0.5 rounded-md border border-sage-100">{tag}</span>
                      ))}
                    </div>
                  )}
                  {tab === 'master' && (
                    <button onClick={() => toggleSave(recipe.id)} disabled={savingId === recipe.id}
                      className={`w-full text-xs py-1.5 rounded-lg border font-medium transition-all ${isSaved ? 'bg-sage-600 border-sage-600 text-sage-50' : 'bg-stone-50 border-stone-200 text-stone-600 hover:border-sage-300 hover:text-sage-700'}`}>
                      {savingId === recipe.id ? '…' : isSaved ? '✓ Saved' : '+ Save'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
