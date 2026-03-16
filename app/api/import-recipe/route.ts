import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const CATEGORIES = ['Meat','Produce','Dairy','Dry','Can','Condiments','Spice','Bakery','Frozen','Refrigerated','Asian','Other']

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()
    if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 })

    const fetchRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; recipe-importer/1.0)',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(10000),
    })
    if (!fetchRes.ok) {
      return NextResponse.json({ error: `Could not fetch that URL (${fetchRes.status})` }, { status: 400 })
    }

    const html = await fetchRes.text()

    // Extract og:image for recipe photo
    let photoUrl: string | null = null
    const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
    if (ogImageMatch?.[1]) photoUrl = ogImageMatch[1]

    // Clean HTML
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    const bodyContent = bodyMatch ? bodyMatch[1] : html
    const cleaned = bodyContent
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside[\s\S]*?<\/aside>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 10000)

    // Single prompt: extract recipe AND estimate nutrition in one call
    const prompt = `You are a recipe parser and nutrition expert. Extract the recipe from the webpage text below and return ONLY valid JSON — no markdown, no code fences, no explanation.

Return this exact structure:
{
  "name": "Recipe name",
  "servings": 4,
  "instructions": "Step 1.\\nStep 2.\\nStep 3.",
  "tags": ["Chicken", "Bowls"],
  "ingredients": [
    {
      "name": "Chicken Breast",
      "qty": 1.5,
      "unit": "lb",
      "category": "Meat",
      "calories": 612,
      "protein": 136.5,
      "canonical_name": "Chicken Breast",
      "is_pantry_staple": false
    }
  ]
}

Rules for extraction:
- servings: number, default 4 if not found
- instructions: all steps as one string, each step separated by \\n
- qty: number (convert fractions: 1/2→0.5, 1/4→0.25, 3/4→0.75)
- unit: oz, lb, cup, tbsp, tsp, each, clove, bunch, slice, can, etc.
- category: exactly one of: ${CATEGORIES.join(', ')}
- is_pantry_staple: true for salt, pepper, water, cooking spray only
- canonical_name: the standardized name for this ingredient. Common mappings: "chicken breasts"→"Chicken Breast", "ground beef 80/20"→"Ground Beef", "garlic cloves"→"Garlic", "spaghetti"→"Spaghetti", "olive oil"→"Olive Oil". If unsure, use the same value as name.
- tags: 1-4 relevant tags from: Chicken, Beef, Pork, Seafood, Pasta, Soup, Bowls, Tacos, Burgers, Salad, Rice, Quick, High Protein, Vegetarian, Instant Pot

Rules for nutrition (calories and protein per ingredient):
- Estimate using USDA nutritional data for the EXACT quantity listed
- calories: total for that ingredient, rounded to nearest whole number
- protein: total grams for that ingredient, rounded to 1 decimal place
- For spices under 1 tbsp, salt, pepper: calories=0, protein=0
- For oils and butter: estimate calories accurately, protein=0
- For packaged sauces/condiments: use reasonable brand estimates

If no recipe is found: return {"error": "No recipe found on this page"}

Webpage text:
${cleaned}`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    const jsonStr = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim()

    let parsed: {
      error?: string
      name?: string
      servings?: number
      instructions?: string
      ingredients?: Array<{
        name: string; qty: number; unit: string; category: string
        calories: number; protein: number; is_pantry_staple: boolean
      }>
    }
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      return NextResponse.json({ error: 'Could not parse recipe data from that page' }, { status: 422 })
    }

    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 422 })
    if (!parsed.name || !parsed.ingredients?.length) {
      return NextResponse.json({ error: 'No recipe found on this page' }, { status: 422 })
    }

    // Sanitize nutrition values
    const sanitizedIngredients = parsed.ingredients.map(ing => ({
      ...ing,
      calories: Math.round(Math.max(0, Number(ing.calories) || 0)),
      protein: Math.round(Math.max(0, Number(ing.protein) || 0) * 10) / 10,
    }))

    return NextResponse.json({
      ...parsed,
      ingredients: sanitizedIngredients,
      photo_url: photoUrl,
    })

  } catch (err: unknown) {
    console.error('Import error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Import failed' }, { status: 500 })
  }
}
