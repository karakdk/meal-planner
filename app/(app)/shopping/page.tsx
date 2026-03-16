'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { type Ingredient, CATEGORY_ORDER, getMondayOfWeek } from '@/lib/types'

type ShopItem = {
  name: string; qty: number; unit: string; category: string; mergedCount: number
}

export default function ShoppingPage() {
  const supabase = createClient()
  const [items, setItems] = useState<ShopItem[]>([])
  const [miscItems, setMiscItems] = useState<string[]>([])
  const [newMiscItem, setNewMiscItem] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [checkedMisc, setCheckedMisc] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [planId, setPlanId] = useState<string | null>(null)
  const weekStart = getMondayOfWeek().toISOString().split('T')[0]

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('profiles').select('household_id').eq('id', user.id).single()
    const hid = profile?.household_id
    if (!hid) { setLoading(false); return }

    const { data: plan } = await supabase
      .from('meal_plans').select('id, misc_items').eq('household_id', hid).eq('week_start', weekStart).single()
    if (!plan) { setLoading(false); return }
    setPlanId(plan.id)
    setMiscItems(plan.misc_items || [])

    const { data: slots } = await supabase
      .from('meal_plan_slots')
      .select('recipe_id, servings, recipe:recipes(servings, ingredients(*))')
      .eq('plan_id', plan.id)

    if (!slots) { setLoading(false); return }

    // Aggregate using canonical_name for deduplication
    const agg: Record<string, ShopItem> = {}
    for (const slot of slots) {
      const rec = slot.recipe as { servings: number; ingredients: Ingredient[] } | null
      if (!rec?.ingredients) continue
      const scale = slot.servings / (rec.servings || 4)
      for (const ing of rec.ingredients) {
        if (ing.is_pantry_staple) continue
        // Use canonical_name for deduplication key, fall back to name
        const keyName = (ing.canonical_name || ing.name).trim()
        const key = `${keyName.toLowerCase()}|${ing.unit.toLowerCase()}`
        if (agg[key]) {
          agg[key].qty += ing.qty * scale
          agg[key].mergedCount += 1
        } else {
          agg[key] = { name: keyName, qty: ing.qty * scale, unit: ing.unit, category: ing.category, mergedCount: 1 }
        }
      }
    }
    setItems(Object.values(agg))

    // Restore checked state
    const saved = localStorage.getItem(`shopping-checked-${plan.id}`)
    if (saved) setChecked(new Set(JSON.parse(saved)))
    setLoading(false)
  }, [supabase, weekStart])

  useEffect(() => { load() }, [load])

  function toggleCheck(key: string) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      if (planId) localStorage.setItem(`shopping-checked-${planId}`, JSON.stringify([...next]))
      return next
    })
  }

  function toggleCheckMisc(idx: number) {
    setCheckedMisc(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  function clearChecked() {
    setChecked(new Set())
    setCheckedMisc(new Set())
    if (planId) localStorage.removeItem(`shopping-checked-${planId}`)
  }

  async function addMiscItem() {
    if (!newMiscItem.trim() || !planId) return
    const updated = [...miscItems, newMiscItem.trim()]
    setMiscItems(updated)
    setNewMiscItem('')
    await supabase.from('meal_plans').update({ misc_items: updated }).eq('id', planId)
  }

  async function removeMiscItem(idx: number) {
    const updated = miscItems.filter((_, i) => i !== idx)
    setMiscItems(updated)
    if (planId) await supabase.from('meal_plans').update({ misc_items: updated }).eq('id', planId)
  }

  const byCat: Record<string, ShopItem[]> = {}
  for (const item of items) {
    const cat = item.category || 'Other'
    if (!byCat[cat]) byCat[cat] = []
    byCat[cat].push(item)
  }
  const sortedCats = CATEGORY_ORDER.filter(c => byCat[c]).concat(Object.keys(byCat).filter(c => !CATEGORY_ORDER.includes(c)))

  const CAT_EMOJI: Record<string, string> = {
    Meat:'🥩',Produce:'🥦',Dairy:'🧀',Dry:'🌾',Can:'🥫',
    Condiments:'🫙',Spice:'🌶️',Bakery:'🍞',Frozen:'🧊',Refrigerated:'🥚',Asian:'🍜',Other:'📦'
  }

  const checkedCount = items.filter(i => checked.has(`${(i.name).toLowerCase()}|${i.unit.toLowerCase()}`)).length
    + [...checkedMisc].length
  const totalCount = items.length + miscItems.length

  if (loading) return (
    <div className="pt-16 flex items-center justify-center h-40">
      <div className="flex gap-1.5">{[0,1,2].map(i => (
        <div key={i} className="w-2 h-2 rounded-full bg-sage-200" style={{animation:`pulse-dot 1s ease ${i*0.2}s infinite`}}/>
      ))}</div>
    </div>
  )

  return (
    <div className="pt-8 animate-fade-up">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-medium text-stone-900 tracking-tight">Shopping list</h1>
          <p className="text-sm text-stone-400 mt-0.5">
            {totalCount === 0 ? 'No items yet' : `${checkedCount} of ${totalCount} checked`}
          </p>
        </div>
        {checkedCount > 0 && (
          <button onClick={clearChecked} className="text-xs text-stone-400 hover:text-stone-600 transition-colors">Clear checked</button>
        )}
      </div>

      {items.length === 0 && miscItems.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 rounded-2xl bg-sage-50 flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M4 4h2l3.5 11h9L21 8H7.5" stroke="#3B6D11" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="10" cy="20" r="1.5" fill="#3B6D11"/>
              <circle cx="17" cy="20" r="1.5" fill="#3B6D11"/>
            </svg>
          </div>
          <p className="text-stone-500 font-medium">No items yet</p>
          <p className="text-stone-400 text-sm mt-1">Add meals to your plan to generate your shopping list</p>
        </div>
      ) : (
        <>
          {/* Progress bar */}
          <div className="bg-stone-100 rounded-full h-1.5 mb-5 overflow-hidden">
            <div className="bg-sage-400 h-full rounded-full transition-all duration-500"
              style={{ width: `${totalCount ? (checkedCount/totalCount)*100 : 0}%` }}/>
          </div>

          {/* Recipe ingredients by category */}
          <div className="space-y-4 mb-6">
            {sortedCats.map(cat => (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-2">
                  <span style={{fontSize:14}}>{CAT_EMOJI[cat]||'📦'}</span>
                  <span className="text-xs font-medium text-stone-400 uppercase tracking-widest">{cat}</span>
                </div>
                <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
                  {byCat[cat].map((item, idx) => {
                    const key = `${item.name.toLowerCase()}|${item.unit.toLowerCase()}`
                    const done = checked.has(key)
                    const qty = item.qty % 1 === 0 ? item.qty : parseFloat(item.qty.toFixed(2))
                    return (
                      <button key={key} onClick={() => toggleCheck(key)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-stone-50 ${idx < byCat[cat].length-1 ? 'border-b border-stone-100' : ''}`}>
                        <div className={`w-5 h-5 rounded-md border flex-shrink-0 flex items-center justify-center transition-all ${done ? 'bg-sage-600 border-sage-600' : 'border-stone-300 bg-white'}`}>
                          {done && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-5" stroke="#EAF3DE" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </div>
                        <span className={`flex-1 text-sm transition-all ${done ? 'line-through text-stone-300' : 'text-stone-800'}`}>
                          {item.name}
                          {item.mergedCount > 1 && !done && (
                            <span className="ml-1.5 text-[10px] bg-sage-50 text-sage-600 border border-sage-100 px-1.5 py-0.5 rounded-full">{item.mergedCount} recipes</span>
                          )}
                        </span>
                        <span className={`text-sm ${done ? 'text-stone-300' : 'text-stone-400'}`}>
                          {qty}<span className="text-xs ml-0.5">{item.unit}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Misc / extras section */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span style={{fontSize:14}}>🗒️</span>
              <span className="text-xs font-medium text-stone-400 uppercase tracking-widest">Extras</span>
            </div>
            <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden mb-2">
              {miscItems.length === 0 ? (
                <div className="px-4 py-3 text-sm text-stone-300">Nothing added yet</div>
              ) : miscItems.map((item, idx) => {
                const done = checkedMisc.has(idx)
                return (
                  <div key={idx} className={`flex items-center gap-3 px-4 py-3 ${idx < miscItems.length-1 ? 'border-b border-stone-100' : ''}`}>
                    <button onClick={() => toggleCheckMisc(idx)}
                      className={`w-5 h-5 rounded-md border flex-shrink-0 flex items-center justify-center transition-all ${done ? 'bg-sage-600 border-sage-600' : 'border-stone-300 bg-white'}`}>
                      {done && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-5" stroke="#EAF3DE" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </button>
                    <span className={`flex-1 text-sm ${done ? 'line-through text-stone-300' : 'text-stone-800'}`}>{item}</span>
                    <button onClick={() => removeMiscItem(idx)} className="text-stone-300 hover:text-stone-500 transition-colors">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                    </button>
                  </div>
                )
              })}
            </div>
            {/* Add misc item */}
            <div className="flex gap-2">
              <input type="text" value={newMiscItem} onChange={e => setNewMiscItem(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addMiscItem() }}
                placeholder="Add an extra item…"
                className="flex-1 bg-white border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-sage-400 transition-colors"/>
              <button onClick={addMiscItem} disabled={!newMiscItem.trim()}
                className="bg-sage-600 text-sage-50 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-sage-800 transition-colors disabled:opacity-40">
                Add
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
