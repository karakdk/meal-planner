'use client'
import { useState, useRef, useEffect } from 'react'
import { CATEGORIES } from '@/lib/types'

type IngRow = {
  name: string; canonical_name: string; qty: string; unit: string; category: string
  calories: string; protein: string; is_pantry_staple: boolean
}

type CanonicalSuggestion = { id: string; name: string; category: string }

type Props = {
  value: IngRow
  onChange: (updated: IngRow) => void
  onRemove: () => void
  index: number
}

export default function IngredientInput({ value, onChange, onRemove, index }: Props) {
  const [suggestions, setSuggestions] = useState<CanonicalSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleNameChange(name: string) {
    onChange({ ...value, name })
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (name.length < 2) { setSuggestions([]); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/canonical-ingredients?q=${encodeURIComponent(name)}`)
        if (res.ok) {
          const data = await res.json()
          setSuggestions(data)
          setShowSuggestions(data.length > 0)
        }
      } catch { /* ignore */ }
    }, 250)
  }

  function selectCanonical(suggestion: CanonicalSuggestion) {
    onChange({ ...value, name: suggestion.name, canonical_name: suggestion.name, category: suggestion.category })
    setSuggestions([])
    setShowSuggestions(false)
  }

  // Close suggestions on outside click
  const wrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setShowSuggestions(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const isMatched = value.canonical_name && value.canonical_name === value.name
  const hasSuggestion = suggestions.length > 0

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-3 space-y-2">
      <div className="flex gap-2">
        <div ref={wrapRef} className="flex-1 relative">
          <input
            value={value.name}
            onChange={e => handleNameChange(e.target.value)}
            onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true) }}
            placeholder="Ingredient name"
            className={`w-full border rounded-xl px-3 py-2 text-sm text-stone-900 placeholder-stone-400 focus:outline-none transition-colors ${
              isMatched ? 'bg-sage-50 border-sage-200 focus:border-sage-400' :
              hasSuggestion ? 'bg-amber-50 border-amber-200 focus:border-amber-400' :
              'bg-stone-50 border-stone-200 focus:border-sage-400'
            }`}
          />
          {isMatched && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="6" fill="#3B6D11"/>
                <path d="M4 7l2 2 4-4" stroke="#EAF3DE" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          )}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-stone-200 rounded-xl overflow-hidden z-20">
              {suggestions.slice(0, 4).map(s => (
                <button key={s.id} type="button" onMouseDown={() => selectCanonical(s)}
                  className="w-full text-left px-3 py-2.5 hover:bg-sage-50 transition-colors border-b border-stone-100 last:border-0">
                  <div className="text-sm font-medium text-stone-800">{s.name}</div>
                  <div className="text-xs text-stone-400">{s.category}</div>
                </button>
              ))}
              <button type="button" onMouseDown={() => { onChange({ ...value, canonical_name: '' }); setShowSuggestions(false) }}
                className="w-full text-left px-3 py-2 text-xs text-stone-400 hover:bg-stone-50 transition-colors">
                Use &ldquo;{value.name}&rdquo; as-is
              </button>
            </div>
          )}
        </div>
        <button type="button" onClick={onRemove} className="text-stone-300 hover:text-stone-500 transition-colors px-1">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
      {hasSuggestion && !isMatched && value.name.length > 1 && (
        <p className="text-[10px] text-amber-600">
          Matches standard name — select from list to merge on shopping list
        </p>
      )}
      <div className="grid grid-cols-3 gap-2">
        <input type="number" value={value.qty} onChange={e => onChange({ ...value, qty: e.target.value })}
          placeholder="Qty"
          className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-sage-400 transition-colors"/>
        <input value={value.unit} onChange={e => onChange({ ...value, unit: e.target.value })}
          placeholder="Unit"
          className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-sage-400 transition-colors"/>
        <select value={value.category} onChange={e => onChange({ ...value, category: e.target.value })}
          className="bg-stone-50 border border-stone-200 rounded-xl px-2 py-2 text-sm text-stone-700 focus:outline-none focus:border-sage-400 transition-colors">
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input type="number" value={value.calories} onChange={e => onChange({ ...value, calories: e.target.value })}
          placeholder="Calories (auto-estimated)"
          className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-sage-400 transition-colors"/>
        <input type="number" value={value.protein} onChange={e => onChange({ ...value, protein: e.target.value })}
          placeholder="Protein g (auto-estimated)"
          className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-sage-400 transition-colors"/>
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={value.is_pantry_staple} onChange={e => onChange({ ...value, is_pantry_staple: e.target.checked })}
          className="w-4 h-4 rounded accent-sage-600"/>
        <span className="text-xs text-stone-500">Pantry staple — skip in shopping list</span>
      </label>
    </div>
  )
}
