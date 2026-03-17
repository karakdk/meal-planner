'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { type Recipe, getMondayOfWeek } from '@/lib/types'

export default function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const router = useRouter()
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [addedDay, setAddedDay] = useState<number | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setCurrentUserId(user?.id || null)

    // Fetch recipe without FK join to avoid null created_by crash
    const { data, error } = await supabase
      .from('recipes')
      .select('*, ingredients(*)')
      .eq('id', id)
      .single()

    if (error || !data) { setLoading(false); return }

    // Fetch creator separately if exists
    let creator = null
    if (data.created_by) {
      const { data: profile } = await supabase
        .from('profiles').select('display_name').eq('id', data.created_by).single()
      if (profile) creator = profile
    }

    setRecipe({ ...data, creator })
    setLoading(false)
  }, [supabase, id])

  useEffect(() => { load() }, [load])

  async function addToPlan() {
    if (!recipe) return
    setAdding(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('profiles').select('household_id').eq('id', user.id).single()
    const householdId = profile?.household_id
    if (!householdId) return
    const weekStart = getMondayOfWeek().toISOString().split('T')[0]
    let { data: plan } = await supabase
      .from('meal_plans').select('id').eq('household_id', householdId).eq('week_start', weekStart).single()
    if (!plan) {
      const { data: newPlan } = await supabase
        .from('meal_plans').insert({ household_id: householdId, week_start: weekStart, misc_items: [] }).select().single()
      plan = newPlan
    }
    if (!plan) { setAdding(false); return }
    // Count existing slots to get next slot_order
    const { data: existingSlots } = await supabase
      .from('meal_plan_slots').select('id').eq('plan_id', plan.id)
    const slotOrder = (existingSlots || []).length
    const { error } = await supabase.from('meal_plan_slots').insert({
      plan_id: plan.id, recipe_id: recipe.id,
      slot_order: slotOrder, servings: recipe.servings
    })
    if (error) {
      console.error('Failed to add to plan:', error)
      setAdding(false)
      return
    }
    setAddedDay(0)
    setAdding(false)
    setTimeout(() => router.push('/plan'), 600)
  }

  async function deleteRecipe() {
    if (!recipe || !confirm('Delete this recipe? This cannot be undone.')) return
    await supabase.from('recipes').delete().eq('id', recipe.id)
    router.push('/recipes')
  }

  if (loading) return (
    <div className="pt-16 flex items-center justify-center h-40">
      <div className="flex gap-1.5">
        {[0, 1, 2].map(i => (
          <div key={i} className="w-2 h-2 rounded-full bg-sage-200"
            style={{ animation: `pulse-dot 1s ease ${i * 0.2}s infinite` }} />
        ))}
      </div>
    </div>
  )
  if (!recipe) return (
    <div className="pt-16 text-center">
      <p className="text-stone-400 mb-4">Recipe not found</p>
      <Link href="/recipes" className="text-sage-600 text-sm underline">Back to recipes</Link>
    </div>
  )

  const sortedIngs = [...(recipe.ingredients || [])].sort((a, b) => a.sort_order - b.sort_order)
  const nonPantry = sortedIngs.filter(i => !i.is_pantry_staple)
  const pantry = sortedIngs.filter(i => i.is_pantry_staple)
  const cal = sortedIngs.reduce((s, i) => s + (i.calories || 0), 0)
  const prot = sortedIngs.reduce((s, i) => s + (i.protein || 0), 0)
  const calPerServ = Math.round(cal / recipe.servings)
  const protPerServ = Math.round(prot / recipe.servings)
  const isOwner = currentUserId && recipe.created_by === currentUserId
  const creator = recipe.creator as { display_name: string } | null

  // Parse instructions into steps if they exist
  const instructionSteps = recipe.instructions
    ? recipe.instructions.split('\n').map(s => s.trim()).filter(Boolean)
    : []

  return (
    <div className="pt-8 pb-8 animate-fade-up">
      <Link href="/recipes" className="inline-flex items-center gap-1.5 text-stone-400 hover:text-stone-600 text-sm mb-5 transition-colors">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Recipes
      </Link>

      {/* Photo */}
      {recipe.photo_url ? (
        <div className="rounded-3xl overflow-hidden mb-4 bg-stone-100" style={{ height: 200 }}>
          <img src={recipe.photo_url} alt={recipe.name} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="rounded-3xl mb-4 bg-sage-50 border-2 border-dashed border-sage-200 flex items-center justify-center" style={{ height: 120 }}>
          <div className="text-center">
            <svg className="mx-auto mb-1 text-sage-300" width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect x="3" y="6" width="22" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="10" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M3 19l6-5 4 4 3-3 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="text-xs text-sage-400">No photo yet</p>
            {isOwner && (
              <Link href={`/recipes/${recipe.id}/edit`} className="text-xs text-sage-600 underline underline-offset-2 mt-0.5 block">
                Add photo
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Hero */}
      <div className="bg-sage-50 rounded-3xl p-5 mb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h1 className="text-xl font-medium text-stone-900 leading-tight">{recipe.name}</h1>
          {isOwner && (
            <Link href={`/recipes/${recipe.id}/edit`} className="flex-shrink-0 text-stone-400 hover:text-stone-600 transition-colors">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M3 13.5l2.5-.5 8-8a1.77 1.77 0 00-2.5-2.5l-8 8-.5 2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          )}
        </div>
        {creator && <p className="text-xs text-stone-400 mb-3">Added by {creator.display_name}</p>}
        {(recipe.tags || []).length > 0 && (
          <div className="flex gap-1 flex-wrap mb-3">
            {(recipe.tags || []).map(tag => (
              <span key={tag} className="text-[10px] bg-sage-50 text-sage-700 px-2 py-0.5 rounded-md border border-sage-100">{tag}</span>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {calPerServ > 0 && <span className="text-xs bg-white text-sage-800 border border-sage-200 px-2.5 py-1 rounded-full font-medium">{calPerServ.toLocaleString()} cal / serving</span>}
          {protPerServ > 0 && <span className="text-xs bg-white text-sage-800 border border-sage-200 px-2.5 py-1 rounded-full font-medium">{protPerServ}g protein</span>}
          <span className="text-xs bg-sage-600 text-sage-50 px-2.5 py-1 rounded-full font-medium">serves {recipe.servings}</span>
        </div>
      </div>

      {/* Links */}
      {(recipe.recipe_url || recipe.video_url) && (
        <div className="flex gap-2 mb-4">
          {recipe.recipe_url && (
            <a href={recipe.recipe_url} target="_blank" rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 bg-sage-600 text-sage-50 text-sm font-medium py-3 rounded-2xl hover:bg-sage-800 transition-colors">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5 9L9 5M6.5 3H3.5A1.5 1.5 0 002 4.5v7A1.5 1.5 0 003.5 13h7A1.5 1.5 0 0012 11.5V8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M9 2h3v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              View recipe
            </a>
          )}
          {recipe.video_url && (
            <a href={recipe.video_url} target="_blank" rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 bg-stone-100 text-stone-700 text-sm font-medium py-3 rounded-2xl hover:bg-stone-200 transition-colors">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="2.5" width="8.5" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                <path d="M9.5 5.5l3-2v7l-3-2" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
              Watch video
            </a>
          )}
        </div>
      )}

      {/* Ingredients */}
      <div className="mb-4">
        <p className="text-xs font-medium text-stone-400 uppercase tracking-widest mb-2">Ingredients</p>
        <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
          {nonPantry.map((ing, i) => (
            <div key={ing.id} className={`flex items-center gap-3 px-4 py-3 ${i < nonPantry.length - 1 || pantry.length > 0 ? 'border-b border-stone-100' : ''}`}>
              <div className="w-1.5 h-1.5 rounded-full bg-sage-300 flex-shrink-0" />
              <span className="flex-1 text-sm text-stone-800">{ing.name}</span>
              <span className="text-sm text-stone-400">
                {ing.qty % 1 === 0 ? ing.qty : parseFloat(ing.qty.toFixed(2))} <span className="text-xs">{ing.unit}</span>
              </span>
            </div>
          ))}
          {pantry.map((ing, i) => (
            <div key={ing.id} className={`flex items-center gap-3 px-4 py-3 ${i < pantry.length - 1 ? 'border-b border-stone-100' : ''}`}>
              <div className="w-1.5 h-1.5 rounded-full bg-stone-200 flex-shrink-0" />
              <span className="flex-1 text-sm text-stone-400">{ing.name}</span>
              <span className="text-xs text-stone-300 bg-stone-100 px-2 py-0.5 rounded-full">pantry</span>
            </div>
          ))}
        </div>
      </div>

      {/* Instructions */}
      {instructionSteps.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-medium text-stone-400 uppercase tracking-widest mb-2">Instructions</p>
          <div className="space-y-2">
            {instructionSteps.map((step, i) => (
              <div key={i} className="flex gap-3 bg-white border border-stone-200 rounded-2xl px-4 py-3">
                <div className="w-6 h-6 rounded-full bg-sage-100 text-sage-700 text-xs font-medium flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <p className="text-sm text-stone-700 leading-relaxed">{step}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {recipe.notes && (
        <div className="mb-4 bg-stone-50 rounded-2xl p-4">
          <p className="text-xs font-medium text-stone-400 uppercase tracking-widest mb-1.5">Notes</p>
          <p className="text-sm text-stone-600 leading-relaxed">{recipe.notes}</p>
        </div>
      )}

      {/* Add to plan */}
      <div className="mb-4">
        <button
          onClick={addToPlan}
          disabled={adding || addedDay !== null}
          className={`w-full py-3.5 rounded-2xl text-sm font-medium transition-all ${
            addedDay !== null
              ? 'bg-sage-600 text-sage-50'
              : 'bg-sage-600 hover:bg-sage-800 text-sage-50 disabled:opacity-60'
          }`}
        >
          {adding ? 'Adding…' : addedDay !== null ? '✓ Added to this week' : "Add to this week's meal plan"}
        </button>
      </div>

      {isOwner && (
        <button onClick={deleteRecipe} className="w-full text-xs text-stone-300 hover:text-red-400 transition-colors py-2 mt-2">
          Delete recipe
        </button>
      )}
    </div>
  )
}
