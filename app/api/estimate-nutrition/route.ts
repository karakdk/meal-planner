import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type IngredientForNutrition = {
  name: string
  qty: number
  unit: string
}

export type NutritionResult = {
  name: string
  calories: number
  protein: number
}

export async function POST(req: NextRequest) {
  try {
    const { ingredients }: { ingredients: IngredientForNutrition[] } = await req.json()
    if (!ingredients?.length) {
      return NextResponse.json({ error: 'No ingredients provided' }, { status: 400 })
    }

    const ingredientList = ingredients
      .map((ing, i) => `${i + 1}. ${ing.qty} ${ing.unit} ${ing.name}`)
      .join('\n')

    const prompt = `You are a nutrition expert. For each ingredient below, estimate the total calories and grams of protein for the EXACT quantity listed. Use standard USDA nutritional data and common knowledge about food.

Return ONLY valid JSON — no markdown, no explanation, nothing else.

Return this exact structure:
[
  { "name": "ingredient name", "calories": 123, "protein": 4.5 },
  ...
]

Rules:
- calories and protein are for the TOTAL quantity listed (not per 100g or per serving)
- Round calories to nearest whole number
- Round protein to 1 decimal place
- For spices, herbs, salt, pepper used in small amounts (under 1 tbsp): calories=0, protein=0
- For oils and butter: estimate calories but protein=0
- For packaged sauces: use reasonable estimates based on typical brands
- Return one entry per ingredient in the same order as the input

Ingredients:
${ingredientList}`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '[]'
    const jsonStr = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim()

    let results: NutritionResult[]
    try {
      results = JSON.parse(jsonStr)
    } catch {
      return NextResponse.json({ error: 'Failed to parse nutrition data' }, { status: 422 })
    }

    // Validate and sanitize
    const sanitized = results.map((r, i) => ({
      name: ingredients[i]?.name || r.name,
      calories: Math.round(Math.max(0, Number(r.calories) || 0)),
      protein: Math.round(Math.max(0, Number(r.protein) || 0) * 10) / 10,
    }))

    return NextResponse.json(sanitized)
  } catch (err: unknown) {
    console.error('Nutrition estimation error:', err)
    return NextResponse.json({ error: 'Estimation failed' }, { status: 500 })
  }
}
