'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { type MealPlan, type MealPlanSlot, type Recipe, getMondayOfWeek, formatWeekRange } from '@/lib/types'

const MAX_MEALS = 7

export default function PlanPage() {
  const supabase = createClient()
  const [plan, setPlan] = useState<MealPlan | null>(null)
  const [slots, setSlots] = useState<MealPlanSlot[]>([])
  const [savedRecipes, setSavedRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [showPicker, setShowPicker] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [resetting, setResetting] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [toastError, setToastError] = useState('')
  const monday = getMondayOfWeek()
  const weekStart = monday.toISOString().split('T')[0]

  const getHouseholdId = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: profile } = await supabase.from('profiles').select('household_id').eq('id', user.id).single()
    return profile?.household_id || null
  }, [supabase])

  const loadPlan = useCallback(async () => {
    try {
    const householdId = await getHouseholdId()
    if (!householdId) { setLoading(false); return }

    let { data: existingPlan } = await supabase
      .from('meal_plans').select('*').eq('household_id', householdId).eq('week_start', weekStart).single()
    if (!existingPlan) {
      const { data: newPlan } = await supabase
        .from('meal_plans').insert({ household_id: householdId, week_start: weekStart, misc_items: [] }).select().single()
      existingPlan = newPlan
    }
    if (!existingPlan) return
    setPlan(existingPlan)

    // Load slots
    const { data: slotData } = await supabase
      .from('meal_plan_slots')
      .select(`*, recipe:recipes(id, name, servings, recipe_url, video_url, photo_url, created_by, tags, ingredients(*))`)
      .eq('plan_id', existingPlan.id)
      .order('slot_order')

    const rawSlots = slotData || []
    const creatorIds = [...new Set(rawSlots.map((s: {recipe?: {created_by?: string | null}}) => s.recipe?.created_by).filter(Boolean))] as string[]
    let profileMap: Record<string, string> = {}
    if (creatorIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, display_name').in('id', creatorIds)
      profileMap = Object.fromEntries((profiles || []).map((p: {id: string; display_name: string}) => [p.id, p.display_name]))
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setSlots(rawSlots.map((s: any) => ({
      ...s,
      recipe: s.recipe ? { ...s.recipe, creator: s.recipe.created_by ? { display_name: profileMap[s.recipe.created_by] || 'Unknown' } : null } : null
    })))

    // Load household saved recipes
    const { data: savedData } = await supabase
      .from('saved_recipes')
      .select('recipe:recipes(id, name, servings, photo_url, tags)')
      .eq('household_id', householdId)
      .order('saved_at', { ascending: false })
    setSavedRecipes((savedData || []).map((s: {recipe: unknown}) => s.recipe as Recipe))
    setLoading(false)
    } catch (err) {
      console.error('Plan load error:', err)
      setLoadError(err instanceof Error ? err.message : 'Failed to load')
      setLoading(false)
    }
  }, [supabase, weekStart, getHouseholdId])

  useEffect(() => { loadPlan() }, [loadPlan])

  async function addMeal(recipeId: string) {
    if (slots.length >= MAX_MEALS) return
    if (!plan) {
      console.error('No plan available')
      return
    }
    const recipe = savedRecipes.find(r => r.id === recipeId)
    const { error } = await supabase.from('meal_plan_slots').insert({
      plan_id: plan.id, recipe_id: recipeId,
      slot_order: slots.length, servings: recipe?.servings || 4
    })
    if (error) {
      console.error('Failed to add meal:', error)
      setToastError(error.message || 'Failed to add meal')
      setTimeout(() => setToastError(''), 4000)
      return
    }
    setShowPicker(false)
    setPickerSearch('')
    loadPlan()
  }

  async function removeMeal(slotId: string) {
    await supabase.from('meal_plan_slots').delete().eq('id', slotId)
    loadPlan()
  }

  async function updateServings(slotId: string, servings: number) {
    await supabase.from('meal_plan_slots').update({ servings }).eq('id', slotId)
    loadPlan()
  }

  async function resetWeek() {
    if (!plan || !confirm('Clear all meals and shopping notes for this week?')) return
    setResetting(true)
    await supabase.from('meal_plan_slots').delete().eq('plan_id', plan.id)
    await supabase.from('meal_plans').update({ misc_items: [] }).eq('id', plan.id)
    loadPlan()
    setResetting(false)
  }

  // Per-serving averages for the summary stats
  const totalCal = slots.reduce((sum, slot) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = slot.recipe as any
    if (!rec?.ingredients) return sum
    const cal = rec.ingredients.reduce((s: number, i: {calories: number}) => s + (i.calories||0), 0)
    return sum + Math.round(cal / (rec.servings||4))
  }, 0)

  const totalProt = slots.reduce((sum, slot) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = slot.recipe as any
    if (!rec?.ingredients) return sum
    const prot = rec.ingredients.reduce((s: number, i: {protein: number}) => s + (i.protein||0), 0)
    return sum + Math.round(prot / (rec.servings||4))
  }, 0)

  const filteredRecipes = savedRecipes.filter(r =>
    r.name.toLowerCase().includes(pickerSearch.toLowerCase()) &&
    !slots.some(s => s.recipe_id === r.id)
  )

  if (loadError) return (
    <div className="pt-16 text-center">
      <p className="text-red-500 text-sm font-medium mb-2">Failed to load</p>
      <p className="text-stone-400 text-xs mb-4">{loadError}</p>
      <button onClick={() => { setLoadError(''); setLoading(true); loadPlan() }}
        className="text-sage-600 text-sm underline">Try again</button>
    </div>
  )

  if (loading) return (
    <div className="pt-16 flex items-center justify-center h-40">
      <div className="flex gap-1.5">{[0,1,2].map(i => (
        <div key={i} className="w-2 h-2 rounded-full bg-sage-200" style={{animation:`pulse-dot 1s ease ${i*0.2}s infinite`}}/>
      ))}</div>
    </div>
  )

  return (
    <div className="pt-8 animate-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-medium text-stone-900 tracking-tight">This week</h1>
          <p className="text-sm text-stone-400 mt-0.5">{formatWeekRange(weekStart)}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={resetWeek} disabled={resetting || slots.length === 0}
            className="text-xs text-stone-400 border border-stone-200 bg-white px-3 py-2 rounded-xl hover:border-stone-300 hover:text-stone-600 transition-colors disabled:opacity-40">
            {resetting ? '…' : 'Reset week'}
          </button>
          <Link href="/shopping" className="flex items-center gap-1.5 bg-sage-50 text-sage-800 text-xs font-medium px-3 py-2 rounded-xl border border-sage-100">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2h1.5l1.8 6h5.2L12 5H4.5" stroke="#27500A" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="6.5" cy="11.5" r="1" fill="#27500A"/><circle cx="10" cy="11.5" r="1" fill="#27500A"/>
            </svg>
            Shop
          </Link>
        </div>
      </div>

      {/* Stats */}
      {slots.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-5">
          {[
            { val: `${slots.length}`, sub: `of ${MAX_MEALS} meals` },
            { val: slots.length ? Math.round(totalCal/slots.length).toLocaleString() : '—', sub: 'avg cal / serving' },
            { val: slots.length ? `${Math.round(totalProt/slots.length)}g` : '—', sub: 'avg protein / serving' },
          ].map(({ val, sub }) => (
            <div key={sub} className="bg-sage-50 rounded-2xl p-3 text-center">
              <div className="text-lg font-medium text-sage-800">{val}</div>
              <div className="text-[10px] text-sage-600 mt-0.5">{sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Meal slots */}
      <div className="space-y-2 mb-4">
        {slots.map((slot, idx) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rec = slot.recipe as any
          if (!rec) return null
          const cal = rec.ingredients?.reduce((s: number, i: {calories: number}) => s + (i.calories||0), 0) || 0
          const prot = rec.ingredients?.reduce((s: number, i: {protein: number}) => s + (i.protein||0), 0) || 0
          const calPerServ = Math.round(cal / (rec.servings||4))
          const protPerServ = Math.round(prot / (rec.servings||4))
          return (
            <div key={slot.id} className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-3 p-3">
                {/* Photo thumbnail */}
                <Link href={`/recipes/${rec.id}`} className="flex-shrink-0">
                  {rec.photo_url ? (
                    <img src={rec.photo_url} alt={rec.name} className="w-14 h-14 rounded-xl object-cover"/>
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-sage-50 flex items-center justify-center">
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <rect x="2" y="4" width="16" height="12" rx="2" stroke="#97C459" strokeWidth="1.3"/>
                        <circle cx="7" cy="8" r="1.5" stroke="#97C459" strokeWidth="1.3"/>
                        <path d="M2 13l4-3.5 3.5 3.5 2.5-3 4.5 4.5" stroke="#97C459" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )}
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-1">
                    <div className="text-xs text-stone-400 mb-0.5">Meal {idx + 1}</div>
                    <button onClick={() => removeMeal(slot.id)} className="text-stone-300 hover:text-stone-500 transition-colors flex-shrink-0">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                    </button>
                  </div>
                  <p className="text-sm font-medium text-stone-900 truncate">{rec.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-stone-400">{calPerServ.toLocaleString()} cal / serving</span>
                    <span className="text-stone-200">·</span>
                    <span className="text-xs text-stone-400">{protPerServ}g protein</span>
                  </div>
                </div>
              </div>
              <div className="border-t border-stone-100 px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-stone-400">Servings</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => updateServings(slot.id, Math.max(1, slot.servings-1))}
                    className="w-6 h-6 rounded-full border border-stone-200 bg-stone-50 text-stone-500 flex items-center justify-center text-base leading-none hover:bg-stone-100 transition-colors">−</button>
                  <span className="text-xs font-medium text-stone-800 w-4 text-center">{slot.servings}</span>
                  <button onClick={() => updateServings(slot.id, slot.servings+1)}
                    className="w-6 h-6 rounded-full border border-stone-200 bg-stone-50 text-stone-500 flex items-center justify-center text-base leading-none hover:bg-stone-100 transition-colors">+</button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Add meal button */}
      {slots.length < MAX_MEALS && (
        <button onClick={() => setShowPicker(true)}
          className="w-full border border-dashed border-stone-300 rounded-2xl py-3.5 text-sm text-stone-400 hover:text-stone-600 hover:border-stone-400 transition-colors mb-4">
          + Add meal {slots.length + 1} of {MAX_MEALS}
        </button>
      )}

      {/* Meal picker — inline panel, no fixed positioning */}
      {showPicker && (
        <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden mb-4 animate-fade-up">
          <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
            <h3 className="text-sm font-medium text-stone-900">Choose a meal</h3>
            <button onClick={() => { setShowPicker(false); setPickerSearch('') }}
              className="text-stone-400 hover:text-stone-600 transition-colors">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
          <div className="px-3 pt-3 pb-2">
            <input type="text" value={pickerSearch} onChange={e => setPickerSearch(e.target.value)}
              placeholder="Search your recipes…" autoFocus
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-sage-400 transition-colors"/>
          </div>
          <div className="px-3 pb-3 space-y-2 max-h-96 overflow-y-auto">
            {filteredRecipes.length === 0 ? (
              <div className="text-center py-6 text-stone-400 text-sm">
                {savedRecipes.length === 0 ? (
                  <><p className="font-medium">No saved recipes yet</p>
                  <p className="text-xs mt-1">Go to Recipes → Master list and save some first</p></>
                ) : (
                  <p>No recipes match &ldquo;{pickerSearch}&rdquo;</p>
                )}
              </div>
            ) : filteredRecipes.map(r => (
              <button key={r.id}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); addMeal(r.id) }}
                className="w-full flex items-center gap-3 bg-stone-50 active:bg-sage-50 border border-stone-200 rounded-2xl p-3 text-left transition-all">
                {r.photo_url ? (
                  <img src={r.photo_url} alt={r.name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0"/>
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-sage-100 flex items-center justify-center flex-shrink-0">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <rect x="2" y="3" width="14" height="11" rx="2" stroke="#97C459" strokeWidth="1.2"/>
                      <circle cx="6" cy="7" r="1.5" stroke="#97C459" strokeWidth="1.2"/>
                      <path d="M2 11l3.5-3 3 3 2-2.5 4 4" stroke="#97C459" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-800 truncate">{r.name}</p>
                  <div className="flex gap-1.5 mt-1 flex-wrap">
                    {(r.tags || []).slice(0,3).map(tag => (
                      <span key={tag} className="text-[10px] bg-sage-100 text-sage-700 px-1.5 py-0.5 rounded-md">{tag}</span>
                    ))}
                  </div>
                </div>
                <svg className="text-stone-300 flex-shrink-0" width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}
      {/* Error toast */}
      {toastError && (
        <div className="fixed bottom-24 left-4 right-4 max-w-lg mx-auto bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700 z-50">
          {toastError}
        </div>
      )}
    </div>
  )
}
