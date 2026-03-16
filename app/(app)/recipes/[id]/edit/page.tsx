'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { CATEGORIES, PRESET_TAGS, type Recipe, type Ingredient } from '@/lib/types'

type IngRow = {
  id?: string
  name: string; qty: string; unit: string; category: string
  calories: string; protein: string; is_pantry_staple: boolean
  sort_order: number
}

export default function EditRecipePage() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [servings, setServings] = useState('4')
  const [recipeUrl, setRecipeUrl] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [instructions, setInstructions] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [customTag, setCustomTag] = useState('')
  const [ingredients, setIngredients] = useState<IngRow[]>([])
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saveStep, setSaveStep] = useState<'idle'|'estimating'|'saving'>('idle')
  const [estimating, setEstimating] = useState(false)
  const [error, setError] = useState('')
  const saving = saveStep !== 'idle'

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('recipes').select('*, ingredients(*)').eq('id', id).single()
    if (error || !data) { setLoading(false); return }
    const rec = data as Recipe & { ingredients: Ingredient[] }
    setName(rec.name)
    setServings(String(rec.servings))
    setRecipeUrl(rec.recipe_url || '')
    setVideoUrl(rec.video_url || '')
    setNotes(rec.notes || '')
    setInstructions(rec.instructions || '')
    setTags(rec.tags || [])
    setExistingPhotoUrl(rec.photo_url || null)
    setPhotoPreview(rec.photo_url || null)
    const sortedIngs = [...(rec.ingredients || [])].sort((a, b) => a.sort_order - b.sort_order)
    setIngredients(sortedIngs.map(i => ({
      id: i.id,
      name: i.name, qty: String(i.qty), unit: i.unit,
      category: i.category, calories: String(i.calories || ''),
      protein: String(i.protein || ''), is_pantry_staple: i.is_pantry_staple,
      sort_order: i.sort_order,
    })))
    setLoading(false)
  }, [supabase, id])

  useEffect(() => { load() }, [load])

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  function updateIng(i: number, field: keyof IngRow, value: string | boolean) {
    setIngredients(prev => prev.map((ing, idx) => idx === i ? { ...ing, [field]: value } : ing))
  }
  function addIng() {
    setIngredients(prev => [...prev, {
      name: '', qty: '', unit: '', category: 'Produce',
      calories: '', protein: '', is_pantry_staple: false,
      sort_order: prev.length,
    }])
  }
  function removeIng(i: number) {
    setIngredients(prev => prev.filter((_, idx) => idx !== i))
  }

  async function reEstimateNutrition() {
    const validIngs = ingredients.filter(i => i.name.trim())
    if (!validIngs.length) return
    setEstimating(true)
    try {
      const res = await fetch('/api/estimate-nutrition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredients: validIngs.map(i => ({
            name: i.name.trim(),
            qty: parseFloat(i.qty) || 0,
            unit: i.unit.trim(),
          }))
        }),
      })
      if (res.ok) {
        const nutrition = await res.json()
        setIngredients(prev => prev.map((ing, idx) => {
          const match = nutrition[validIngs.indexOf(ing)]
          if (!match) return ing
          return { ...ing, calories: String(match.calories), protein: String(match.protein) }
        }))
      }
    } catch { /* non-fatal */ }
    setEstimating(false)
  }

    function toggleTag(tag: string) {
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }
  function addCustomTag() {
    if (!customTag.trim() || tags.includes(customTag.trim())) { setCustomTag(''); return }
    setTags(prev => [...prev, customTag.trim()])
    setCustomTag('')
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Recipe name is required'); return }
    const validIngs = ingredients.filter(i => i.name.trim())
    if (!validIngs.length) { setError('Add at least one ingredient'); return }
    setError('')
    const validIngs2 = ingredients.filter(i => i.name.trim())
    const needsEstimation = validIngs2.some(i => !i.calories && !i.protein)
    if (needsEstimation) {
      setSaveStep('estimating')
      try {
        const res = await fetch('/api/estimate-nutrition', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ingredients: validIngs2.map(i => ({ name: i.name.trim(), qty: parseFloat(i.qty)||0, unit: i.unit.trim() })) }),
        })
        if (res.ok) {
          const nutrition = await res.json()
          setIngredients(prev => prev.map((ing, idx) => {
            const vi = validIngs2.indexOf(ing)
            if (vi < 0 || (ing.calories && ing.protein)) return ing
            return { ...ing, calories: String(nutrition[vi]?.calories ?? 0), protein: String(nutrition[vi]?.protein ?? 0) }
          }))
        }
      } catch { /* non-fatal */ }
    }
    setSaveStep('saving'); setError('')

    try {
      const { data: { user } } = await supabase.auth.getUser()

      // Upload new photo if changed
      let photoUrl = existingPhotoUrl
      if (photoFile && user) {
        const ext = photoFile.name.split('.').pop()
        const path = `${user.id}/${Date.now()}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('recipe-photos').upload(path, photoFile, { cacheControl: '3600', upsert: false })
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('recipe-photos').getPublicUrl(path)
          photoUrl = urlData.publicUrl
        }
      }

      // Update recipe
      const { error: recErr } = await supabase.from('recipes').update({
        name: name.trim(),
        servings: parseInt(servings) || 4,
        recipe_url: recipeUrl.trim() || null,
        video_url: videoUrl.trim() || null,
        notes: notes.trim() || null,
        instructions: instructions.trim() || null,
        tags,
        photo_url: photoUrl,
        updated_at: new Date().toISOString(),
      }).eq('id', id)
      if (recErr) throw recErr

      // Delete all existing ingredients and re-insert (simplest reliable approach)
      await supabase.from('ingredients').delete().eq('recipe_id', id)
      const { error: ingErr } = await supabase.from('ingredients').insert(
        validIngs.map((ing, idx) => ({
          recipe_id: id,
          name: ing.name.trim(),
          qty: parseFloat(ing.qty) || 0,
          unit: ing.unit.trim(),
          category: ing.category,
          calories: parseFloat(ing.calories) || 0,
          protein: parseFloat(ing.protein) || 0,
          is_pantry_staple: ing.is_pantry_staple,
          sort_order: idx,
        }))
      )
      if (ingErr) throw ingErr
      router.push(`/recipes/${id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      setSaveStep('idle')
    }
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

  return (
    <div className="pt-8 pb-8 animate-fade-up">
      <Link href={`/recipes/${id}`} className="inline-flex items-center gap-1.5 text-stone-400 hover:text-stone-600 text-sm mb-5 transition-colors">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to recipe
      </Link>
      <h1 className="text-2xl font-medium text-stone-900 tracking-tight mb-6">Edit recipe</h1>

      <form onSubmit={handleSave} className="space-y-5">

        {/* Photo */}
        <div>
          <p className="text-xs font-medium text-stone-400 uppercase tracking-widest mb-2">Photo</p>
          <div
            onClick={() => fileRef.current?.click()}
            className="relative cursor-pointer rounded-2xl overflow-hidden border-2 border-dashed border-stone-200 hover:border-sage-300 transition-colors"
            style={{ height: photoPreview ? 200 : 100 }}
          >
            {photoPreview ? (
              <>
                <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                  <span className="text-white text-sm font-medium bg-black/40 px-3 py-1.5 rounded-lg">Change photo</span>
                </div>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-1.5">
                <svg className="text-stone-300" width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="9" cy="10" r="2" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M3 17l5-4 4 4 3-3 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-sm text-stone-400">Tap to add photo</span>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
          {photoPreview && (
            <button type="button" onClick={() => { setPhotoPreview(null); setPhotoFile(null); setExistingPhotoUrl(null) }}
              className="mt-1.5 text-xs text-stone-400 hover:text-red-400 transition-colors">
              Remove photo
            </button>
          )}
        </div>

        {/* Basic info */}
        <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-stone-400 uppercase tracking-widest mb-1.5">Recipe name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Thai Coconut Curry"
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-sage-400 transition-colors" />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-400 uppercase tracking-widest mb-1.5">Servings</label>
            <input type="number" min="1" max="20" value={servings} onChange={e => setServings(e.target.value)}
              className="w-24 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-900 focus:outline-none focus:border-sage-400 transition-colors" />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-400 uppercase tracking-widest mb-1.5">Recipe URL</label>
            <input type="url" value={recipeUrl} onChange={e => setRecipeUrl(e.target.value)} placeholder="https://..."
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-sage-400 transition-colors" />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-400 uppercase tracking-widest mb-1.5">Video URL</label>
            <input type="url" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="https://youtube.com/..."
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-sage-400 transition-colors" />
          </div>
        </div>

        {/* Tags */}
        <div>
          <p className="text-xs font-medium text-stone-400 uppercase tracking-widest mb-2">Tags</p>
          <div className="flex flex-wrap gap-2 mb-2">
            {PRESET_TAGS.map(tag => (
              <button key={tag} type="button" onClick={() => toggleTag(tag)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${tags.includes(tag) ? 'bg-sage-600 border-sage-600 text-sage-50' : 'bg-white border-stone-200 text-stone-500 hover:border-stone-300'}`}>
                {tag}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={customTag} onChange={e => setCustomTag(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag() } }}
              placeholder="Custom tag…"
              className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-sage-400 transition-colors"/>
            <button type="button" onClick={addCustomTag} className="bg-stone-100 text-stone-600 px-3 py-2 rounded-xl text-sm hover:bg-stone-200 transition-colors">Add</button>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {tags.map(tag => (
                <span key={tag} className="text-xs bg-sage-100 text-sage-700 px-2.5 py-1 rounded-full flex items-center gap-1">
                  {tag}
                  <button type="button" onClick={() => toggleTag(tag)} className="text-sage-400 hover:text-sage-700">×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Ingredients */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-stone-400 uppercase tracking-widest">Ingredients</p>
            <button type="button" onClick={reEstimateNutrition} disabled={estimating}
              className="text-xs text-sage-600 hover:text-sage-800 transition-colors disabled:opacity-50 flex items-center gap-1">
              {estimating ? 'Estimating…' : '↻ Re-estimate nutrition'}
            </button>
          </div>
          <div className="space-y-2">
            {ingredients.map((ing, i) => (
              <div key={i} className="bg-white border border-stone-200 rounded-2xl p-3 space-y-2">
                <div className="flex gap-2">
                  <input value={ing.name} onChange={e => updateIng(i, 'name', e.target.value)}
                    placeholder="Ingredient name"
                    className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-sage-400 transition-colors" />
                  <button type="button" onClick={() => removeIng(i)} className="text-stone-300 hover:text-stone-500 transition-colors px-1">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input type="number" value={ing.qty} onChange={e => updateIng(i, 'qty', e.target.value)}
                    placeholder="Qty"
                    className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-sage-400 transition-colors" />
                  <input value={ing.unit} onChange={e => updateIng(i, 'unit', e.target.value)}
                    placeholder="Unit"
                    className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-sage-400 transition-colors" />
                  <select value={ing.category} onChange={e => updateIng(i, 'category', e.target.value)}
                    className="bg-stone-50 border border-stone-200 rounded-xl px-2 py-2 text-sm text-stone-700 focus:outline-none focus:border-sage-400 transition-colors">
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" value={ing.calories} onChange={e => updateIng(i, 'calories', e.target.value)}
                    placeholder="Calories (optional)"
                    className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-sage-400 transition-colors" />
                  <input type="number" value={ing.protein} onChange={e => updateIng(i, 'protein', e.target.value)}
                    placeholder="Protein g (optional)"
                    className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-sage-400 transition-colors" />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={ing.is_pantry_staple}
                    onChange={e => updateIng(i, 'is_pantry_staple', e.target.checked)}
                    className="w-4 h-4 rounded accent-sage-600" />
                  <span className="text-xs text-stone-500">Pantry staple — skip in shopping list</span>
                </label>
              </div>
            ))}
          </div>
          <button type="button" onClick={addIng}
            className="w-full mt-2 border border-dashed border-stone-300 rounded-2xl py-3 text-sm text-stone-400 hover:text-stone-600 hover:border-stone-400 transition-colors">
            + Add ingredient
          </button>
        </div>

        {/* Instructions */}
        <div>
          <label className="block text-xs font-medium text-stone-400 uppercase tracking-widest mb-1.5">Instructions</label>
          <p className="text-xs text-stone-400 mb-2">One step per line</p>
          <textarea value={instructions} onChange={e => setInstructions(e.target.value)}
            placeholder={"Heat oil in a pan over medium heat.\nAdd chicken and cook until golden.\nStir in curry powder and coconut milk..."}
            rows={6}
            className="w-full bg-white border border-stone-200 rounded-2xl px-4 py-3 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-sage-400 transition-colors resize-none leading-relaxed" />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-stone-400 uppercase tracking-widest mb-1.5">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Tips, variations, substitutions…" rows={2}
            className="w-full bg-white border border-stone-200 rounded-2xl px-4 py-3 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-sage-400 transition-colors resize-none" />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <button type="submit" disabled={saving}
          className="w-full bg-sage-600 hover:bg-sage-800 text-sage-50 font-medium py-3.5 rounded-2xl text-sm transition-colors disabled:opacity-60">
          {saveStep === 'estimating' ? 'Estimating nutrition…' : saveStep === 'saving' ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </div>
  )
}
