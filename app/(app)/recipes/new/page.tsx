'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { PRESET_TAGS } from '@/lib/types'
import IngredientInput from '@/components/IngredientInput'

type IngRow = {
  name: string; canonical_name: string; qty: string; unit: string; category: string
  calories: string; protein: string; is_pantry_staple: boolean
}

const emptyIng = (): IngRow => ({ name:'', canonical_name:'', qty:'', unit:'', category:'Produce', calories:'', protein:'', is_pantry_staple:false })

type SaveStep = 'idle' | 'estimating' | 'saving'

export default function NewRecipePage() {
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
  const [ingredients, setIngredients] = useState<IngRow[]>([emptyIng()])
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [saveStep, setSaveStep] = useState<SaveStep>('idle')
  const [error, setError] = useState('')

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

    const needsEstimation = validIngs.some(i => !i.calories && !i.protein)
    let finalIngs = validIngs

    if (needsEstimation) {
      setSaveStep('estimating')
      try {
        const res = await fetch('/api/estimate-nutrition', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ingredients: validIngs.map(i => ({ name: i.name.trim(), qty: parseFloat(i.qty)||0, unit: i.unit.trim() })) }),
        })
        if (res.ok) {
          const nutrition = await res.json()
          finalIngs = validIngs.map((ing, idx) => ({
            ...ing,
            calories: ing.calories || String(nutrition[idx]?.calories ?? 0),
            protein:  ing.protein  || String(nutrition[idx]?.protein  ?? 0),
          }))
        }
      } catch { /* non-fatal */ }
    }

    setSaveStep('saving')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('profiles').select('household_id').eq('id', user!.id).single()

      let photoUrl: string | null = null
      if (photoFile && user) {
        const ext = photoFile.name.split('.').pop()
        const path = `${user.id}/${Date.now()}.${ext}`
        const { error: uploadErr } = await supabase.storage.from('recipe-photos').upload(path, photoFile, { cacheControl: '3600', upsert: false })
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('recipe-photos').getPublicUrl(path)
          photoUrl = urlData.publicUrl
        }
      }

      const { data: recipe, error: recipeErr } = await supabase.from('recipes').insert({
        name: name.trim(), servings: parseInt(servings)||4,
        recipe_url: recipeUrl.trim()||null, video_url: videoUrl.trim()||null,
        notes: notes.trim()||null, instructions: instructions.trim()||null,
        photo_url: photoUrl, tags, created_by: user?.id,
      }).select().single()
      if (recipeErr) throw recipeErr

      await supabase.from('ingredients').insert(finalIngs.map((ing, idx) => ({
        recipe_id: recipe.id, name: ing.name.trim(),
        canonical_name: ing.canonical_name || ing.name.trim(),
        qty: parseFloat(ing.qty)||0, unit: ing.unit.trim(), category: ing.category,
        calories: parseFloat(ing.calories)||0, protein: parseFloat(ing.protein)||0,
        is_pantry_staple: ing.is_pantry_staple, sort_order: idx,
      })))

      // Auto-save to household
      if (profile?.household_id) {
        await supabase.from('saved_recipes').insert({ household_id: profile.household_id, recipe_id: recipe.id, saved_by: user?.id }).select()
      }

      router.push(`/recipes/${recipe.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      setSaveStep('idle')
    }
  }

  const saveLabel = { idle:'Save recipe', estimating:'Estimating nutrition…', saving:'Saving…' }[saveStep]
  const saving = saveStep !== 'idle'

  return (
    <div className="pt-8 pb-8 animate-fade-up">
      <Link href="/recipes" className="inline-flex items-center gap-1.5 text-stone-400 hover:text-stone-600 text-sm mb-5 transition-colors">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
        Recipes
      </Link>
      <h1 className="text-2xl font-medium text-stone-900 tracking-tight mb-1">New recipe</h1>
      <p className="text-sm text-stone-400 mb-6">Calories and protein are estimated automatically.</p>

      <form onSubmit={handleSave} className="space-y-5">
        {/* Photo */}
        <div>
          <p className="text-xs font-medium text-stone-400 uppercase tracking-widest mb-2">Photo</p>
          <div onClick={() => fileRef.current?.click()}
            className="relative cursor-pointer rounded-2xl overflow-hidden border-2 border-dashed border-stone-200 hover:border-sage-300 transition-colors"
            style={{ height: photoPreview ? 200 : 100 }}>
            {photoPreview ? (
              <><img src={photoPreview} alt="Preview" className="w-full h-full object-cover"/>
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                <span className="text-white text-sm font-medium bg-black/40 px-3 py-1.5 rounded-lg">Change photo</span>
              </div></>
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-1.5">
                <svg className="text-stone-300" width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.5"/>
                  <circle cx="9" cy="10" r="2" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M3 17l5-4 4 4 3-3 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="text-sm text-stone-400">Tap to add photo</span>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if(f){setPhotoFile(f);setPhotoPreview(URL.createObjectURL(f))} }} className="hidden"/>
        </div>

        {/* Basic info */}
        <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-4">
          <div><label className="block text-xs font-medium text-stone-400 uppercase tracking-widest mb-1.5">Recipe name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Thai Coconut Curry"
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-sage-400 transition-colors"/></div>
          <div><label className="block text-xs font-medium text-stone-400 uppercase tracking-widest mb-1.5">Servings</label>
            <input type="number" min="1" max="20" value={servings} onChange={e => setServings(e.target.value)}
              className="w-24 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-sage-400 transition-colors"/></div>
          <div><label className="block text-xs font-medium text-stone-400 uppercase tracking-widest mb-1.5">Recipe URL</label>
            <input type="url" value={recipeUrl} onChange={e => setRecipeUrl(e.target.value)} placeholder="https://..."
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-sage-400 transition-colors"/></div>
          <div><label className="block text-xs font-medium text-stone-400 uppercase tracking-widest mb-1.5">Video URL</label>
            <input type="url" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="https://youtube.com/..."
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-sage-400 transition-colors"/></div>
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
            <p className="text-xs text-sage-600">Nutrition auto-estimated</p>
          </div>
          <div className="space-y-2">
            {ingredients.map((ing, i) => (
              <IngredientInput key={i} index={i} value={ing}
                onChange={updated => setIngredients(prev => prev.map((x,idx) => idx===i ? updated : x))}
                onRemove={() => setIngredients(prev => prev.filter((_,idx) => idx!==i))}/>
            ))}
          </div>
          <button type="button" onClick={() => setIngredients(prev => [...prev, emptyIng()])}
            className="w-full mt-2 border border-dashed border-stone-300 rounded-2xl py-3 text-sm text-stone-400 hover:text-stone-600 hover:border-stone-400 transition-colors">
            + Add ingredient
          </button>
        </div>

        {/* Instructions */}
        <div>
          <label className="block text-xs font-medium text-stone-400 uppercase tracking-widest mb-1.5">Instructions</label>
          <p className="text-xs text-stone-400 mb-2">One step per line</p>
          <textarea value={instructions} onChange={e => setInstructions(e.target.value)}
            placeholder={"Heat oil in a large pan.\nAdd chicken and cook 5 minutes.\nStir in curry powder..."}
            rows={5} className="w-full bg-white border border-stone-200 rounded-2xl px-4 py-3 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-sage-400 transition-colors resize-none leading-relaxed"/>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-stone-400 uppercase tracking-widest mb-1.5">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Tips, variations…" rows={2}
            className="w-full bg-white border border-stone-200 rounded-2xl px-4 py-3 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-sage-400 transition-colors resize-none"/>
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}

        <button type="submit" disabled={saving}
          className="w-full bg-sage-600 hover:bg-sage-800 text-sage-50 font-medium py-3.5 rounded-2xl text-sm transition-colors disabled:opacity-70 relative">
          {saveStep === 'estimating' && (
            <span className="absolute left-4 top-1/2 -translate-y-1/2 flex gap-1">
              {[0,1,2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-sage-200 inline-block" style={{animation:`pulse-dot 0.9s ease ${i*0.2}s infinite`}}/>)}
            </span>
          )}
          {saveLabel}
        </button>
      </form>
    </div>
  )
}
