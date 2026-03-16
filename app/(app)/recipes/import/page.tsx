'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { CATEGORIES, PRESET_TAGS } from '@/lib/types'

type ParsedIngredient = {
  name: string; qty: number; unit: string; category: string
  calories: number; protein: number; is_pantry_staple: boolean
}
type ParsedRecipe = {
  name: string
  servings: number
  instructions: string
  photo_url: string | null
  tags: string[]
  ingredients: ParsedIngredient[]
}

export default function ImportRecipePage() {
  const supabase = createClient()
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [step, setStep] = useState<'input' | 'loading' | 'review'>('input')
  const [parsed, setParsed] = useState<ParsedRecipe | null>(null)
  const [videoUrl, setVideoUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [customTag, setCustomTag] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('Fetching page…')

  async function handleImport() {
    if (!url.trim()) return
    setError('')
    setStep('loading')
    setLoadingMsg('Fetching page…')

    const msgTimer = setTimeout(() => setLoadingMsg('Reading ingredients…'), 2000)
    const msgTimer2 = setTimeout(() => setLoadingMsg('Extracting instructions…'), 4000)

    try {
      const res = await fetch('/api/import-recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      clearTimeout(msgTimer)
      clearTimeout(msgTimer2)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to import')
      setParsed(data)
      setTags(data.tags || [])
      setStep('review')
    } catch (err: unknown) {
      clearTimeout(msgTimer)
      clearTimeout(msgTimer2)
      setError(err instanceof Error ? err.message : 'Failed to fetch recipe')
      setStep('input')
    }
  }

  function updateIng(i: number, field: keyof ParsedIngredient, value: string | number | boolean) {
    if (!parsed) return
    setParsed(prev => prev ? {
      ...prev,
      ingredients: prev.ingredients.map((ing, idx) => idx === i ? { ...ing, [field]: value } : ing)
    } : null)
  }

  function removeIng(i: number) {
    if (!parsed) return
    setParsed(prev => prev ? { ...prev, ingredients: prev.ingredients.filter((_, idx) => idx !== i) } : null)
  }

  async function handleSave() {
    if (!parsed) return
    setSaving(true); setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: recipe, error: recipeErr } = await supabase.from('recipes').insert({
        name: parsed.name,
        servings: parsed.servings,
        recipe_url: url.trim(),
        video_url: videoUrl.trim() || null,
        source_url: url.trim(),
        photo_url: parsed.photo_url || null,
        instructions: parsed.instructions?.trim() || null,
        notes: notes.trim() || null,
        tags,
        created_by: user?.id,
      }).select().single()
      if (recipeErr) throw recipeErr
      const { error: ingErr } = await supabase.from('ingredients').insert(
        parsed.ingredients.map((ing, idx) => ({ ...ing, recipe_id: recipe.id, sort_order: idx }))
      )
      if (ingErr) throw ingErr
      // Auto-save to household
      const { data: profile } = await supabase.from('profiles').select('household_id').eq('id', user?.id || '').single()
      if (profile?.household_id) {
        await supabase.from('saved_recipes').insert({ household_id: profile.household_id, recipe_id: recipe.id, saved_by: user?.id })
      }
      router.push(`/recipes/${recipe.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      setSaving(false)
    }
  }

  return (
    <div className="pt-8 pb-8 animate-fade-up">
      <Link href="/recipes" className="inline-flex items-center gap-1.5 text-stone-400 hover:text-stone-600 text-sm mb-5 transition-colors">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Recipes
      </Link>
      <h1 className="text-2xl font-medium text-stone-900 tracking-tight mb-1">Import from link</h1>
      <p className="text-sm text-stone-400 mb-6">Paste a recipe URL — we&apos;ll read the ingredients, instructions, and photo automatically.</p>

      {/* Step 1: Input */}
      {step === 'input' && (
        <div className="space-y-4 animate-fade-up">
          <div>
            <label className="block text-xs font-medium text-stone-400 uppercase tracking-widest mb-1.5">Recipe URL</label>
            <input
              type="url" value={url} onChange={e => setUrl(e.target.value)}
              placeholder="https://www.allrecipes.com/recipe/..."
              onKeyDown={e => { if (e.key === 'Enter') handleImport() }}
              className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-sage-400 transition-colors"
            />
            <p className="text-xs text-stone-400 mt-1.5">Works with AllRecipes, Food Network, Delish, Half Baked Harvest, and most recipe sites.</p>
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
          )}
          <button onClick={handleImport} disabled={!url.trim()}
            className="w-full bg-sage-600 hover:bg-sage-800 text-sage-50 font-medium py-3.5 rounded-2xl text-sm transition-colors disabled:opacity-40">
            Import recipe
          </button>
          <Link href="/recipes/new" className="block text-center text-sm text-stone-400 hover:text-stone-600 transition-colors">
            Enter manually instead
          </Link>
        </div>
      )}

      {/* Step 2: Loading */}
      {step === 'loading' && (
        <div className="animate-fade-up">
          <div className="bg-sage-50 rounded-2xl p-6 text-center mb-4">
            <div className="flex justify-center gap-2 mb-3">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2.5 h-2.5 rounded-full bg-sage-400"
                  style={{ animation: `pulse-dot 1s ease ${i * 0.25}s infinite` }} />
              ))}
            </div>
            <p className="text-sm font-medium text-sage-800">{loadingMsg}</p>
            <p className="text-xs text-sage-500 mt-1 truncate max-w-xs mx-auto">{url}</p>
          </div>
          <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3">
            {['Recipe name & servings', 'Photo', 'Ingredients', 'Instructions'].map((item, i) => (
              <div key={item} className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full border-2 border-sage-200 flex items-center justify-center flex-shrink-0"
                  style={{ animation: `pulse-dot 1.2s ease ${i * 0.3}s infinite` }}>
                  <div className="w-1.5 h-1.5 rounded-full bg-sage-300" />
                </div>
                <span className="text-sm text-stone-400">{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 'review' && parsed && (
        <div className="space-y-4 animate-fade-up">

          {/* Photo preview */}
          {parsed.photo_url && (
            <div className="rounded-2xl overflow-hidden bg-stone-100" style={{ height: 180 }}>
              <img src={parsed.photo_url} alt={parsed.name} className="w-full h-full object-cover" />
            </div>
          )}

          {/* Name & servings */}
          <div className="bg-sage-50 rounded-2xl p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <input
                value={parsed.name}
                onChange={e => setParsed(p => p ? { ...p, name: e.target.value } : p)}
                className="flex-1 text-lg font-medium text-stone-900 bg-transparent focus:outline-none border-b border-transparent hover:border-stone-300 focus:border-sage-400 transition-colors"
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-stone-500">Serves</span>
              <input type="number" value={parsed.servings} min="1"
                onChange={e => setParsed(p => p ? { ...p, servings: parseInt(e.target.value) || 4 } : p)}
                className="w-14 text-sm text-stone-700 bg-white border border-stone-200 rounded-lg px-2 py-1 focus:outline-none focus:border-sage-400 transition-colors" />
              {!parsed.photo_url && (
                <span className="text-xs text-stone-400 ml-auto">No photo found on this page</span>
              )}
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
            <p className="text-xs text-amber-700">Review everything below before saving — tap any field to edit.</p>
          </div>

          {/* Ingredients */}
          <div>
            <p className="text-xs font-medium text-stone-400 uppercase tracking-widest mb-2">
              {parsed.ingredients.length} ingredients
            </p>
            <div className="space-y-2">
              {parsed.ingredients.map((ing, i) => (
                <div key={i} className="bg-white border border-stone-200 rounded-xl p-3 space-y-2">
                  <div className="flex gap-2">
                    <input value={ing.name} onChange={e => updateIng(i, 'name', e.target.value)}
                      className="flex-1 bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-1.5 text-sm text-stone-900 focus:outline-none focus:border-sage-400 transition-colors" />
                    <button onClick={() => removeIng(i)} className="text-stone-300 hover:text-stone-500 transition-colors">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <input type="number" value={ing.qty}
                      onChange={e => updateIng(i, 'qty', parseFloat(e.target.value) || 0)}
                      placeholder="Qty"
                      className="bg-stone-50 border border-stone-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-sage-400 transition-colors" />
                    <input value={ing.unit} onChange={e => updateIng(i, 'unit', e.target.value)}
                      placeholder="Unit"
                      className="bg-stone-50 border border-stone-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-sage-400 transition-colors" />
                    <select value={ing.category} onChange={e => updateIng(i, 'category', e.target.value)}
                      className="bg-stone-50 border border-stone-200 rounded-lg px-1 py-1.5 text-xs text-stone-700 focus:outline-none focus:border-sage-400 transition-colors">
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={ing.is_pantry_staple}
                      onChange={e => updateIng(i, 'is_pantry_staple', e.target.checked)}
                      className="w-3.5 h-3.5 rounded accent-sage-600" />
                    <span className="text-xs text-stone-400">Pantry staple</span>
                  </label>
                </div>
              ))}
              <button
                onClick={() => setParsed(p => p ? {
                  ...p, ingredients: [...p.ingredients, { name: '', qty: 0, unit: '', category: 'Produce', calories: 0, protein: 0, is_pantry_staple: false }]
                } : p)}
                className="w-full border border-dashed border-stone-300 rounded-xl py-2.5 text-sm text-stone-400 hover:text-stone-600 hover:border-stone-400 transition-colors">
                + Add ingredient
              </button>
            </div>
          </div>

          {/* Instructions */}
          <div>
            <label className="block text-xs font-medium text-stone-400 uppercase tracking-widest mb-1.5">Instructions</label>
            <textarea
              value={parsed.instructions || ''}
              onChange={e => setParsed(p => p ? { ...p, instructions: e.target.value } : p)}
              rows={8}
              placeholder="No instructions found — you can add them manually here"
              className="w-full bg-white border border-stone-200 rounded-2xl px-4 py-3 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-sage-400 transition-colors resize-none leading-relaxed"
            />
          </div>

          {/* Tags */}
          <div>
            <p className="text-xs font-medium text-stone-400 uppercase tracking-widest mb-2">Tags</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {PRESET_TAGS.map(tag => (
                <button key={tag} type="button"
                  onClick={() => setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${tags.includes(tag) ? 'bg-sage-600 border-sage-600 text-sage-50' : 'bg-white border-stone-200 text-stone-500 hover:border-stone-300'}`}>
                  {tag}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={customTag} onChange={e => setCustomTag(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (customTag.trim() && !tags.includes(customTag.trim())) { setTags(prev => [...prev, customTag.trim()]); setCustomTag('') } } }}
                placeholder="Custom tag…"
                className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-sage-400 transition-colors"/>
              <button type="button"
                onClick={() => { if (customTag.trim() && !tags.includes(customTag.trim())) { setTags(prev => [...prev, customTag.trim()]); setCustomTag('') } }}
                className="bg-stone-100 text-stone-600 px-3 py-2 rounded-xl text-sm hover:bg-stone-200 transition-colors">Add</button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map(tag => (
                  <span key={tag} className="text-xs bg-sage-100 text-sage-700 px-2.5 py-1 rounded-full flex items-center gap-1">
                    {tag}
                    <button type="button" onClick={() => setTags(prev => prev.filter(t => t !== tag))} className="text-sage-400 hover:text-sage-700">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Extra fields */}
          <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-stone-400 uppercase tracking-widest mb-1.5">Video URL (optional)</label>
              <input type="url" value={videoUrl} onChange={e => setVideoUrl(e.target.value)}
                placeholder="https://youtube.com/..."
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-sage-400 transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-400 uppercase tracking-widest mb-1.5">Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                placeholder="Any extra tips…"
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-sage-400 transition-colors resize-none" />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <button onClick={handleSave} disabled={saving}
            className="w-full bg-sage-600 hover:bg-sage-800 text-sage-50 font-medium py-3.5 rounded-2xl text-sm transition-colors disabled:opacity-60">
            {saving ? 'Saving…' : 'Save recipe'}
          </button>
          <button onClick={() => setStep('input')}
            className="w-full text-sm text-stone-400 hover:text-stone-600 transition-colors py-1">
            ← Try a different URL
          </button>
        </div>
      )}
    </div>
  )
}
