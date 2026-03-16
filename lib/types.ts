export type Profile = {
  id: string
  display_name: string
  household_id: string | null
  created_at: string
}

export type Household = {
  id: string
  name: string
  invite_code: string
  created_by: string | null
  created_at: string
}

export type CanonicalIngredient = {
  id: string
  name: string
  category: string
  aliases: string[]
}

export type Ingredient = {
  id: string
  recipe_id: string
  name: string
  canonical_name: string | null
  qty: number
  unit: string
  category: string
  calories: number
  protein: number
  is_pantry_staple: boolean
  sort_order: number
}

export type Recipe = {
  id: string
  created_by: string | null
  name: string
  servings: number
  recipe_url: string | null
  video_url: string | null
  source_url: string | null
  photo_url: string | null
  instructions: string | null
  notes: string | null
  tags: string[]
  created_at: string
  updated_at: string
  ingredients?: Ingredient[]
  creator?: Profile | null
  is_saved?: boolean
}

export type SavedRecipe = {
  id: string
  household_id: string
  recipe_id: string
  saved_by: string | null
  saved_at: string
}

export type MealPlan = {
  id: string
  household_id: string
  week_start: string
  misc_items: string[]
  slots?: MealPlanSlot[]
}

export type MealPlanSlot = {
  id: string
  plan_id: string
  recipe_id: string | null
  slot_order: number
  servings: number
  recipe?: Recipe
}

// Mon–Sun display order
export const WEEK_DAYS = [
  { label: 'Mon', full: 'Monday',    jsDay: 1 },
  { label: 'Tue', full: 'Tuesday',   jsDay: 2 },
  { label: 'Wed', full: 'Wednesday', jsDay: 3 },
  { label: 'Thu', full: 'Thursday',  jsDay: 4 },
  { label: 'Fri', full: 'Friday',    jsDay: 5 },
  { label: 'Sat', full: 'Saturday',  jsDay: 6 },
  { label: 'Sun', full: 'Sunday',    jsDay: 0 },
]

export const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
export const DAYS_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

export const CATEGORIES = [
  'Meat','Produce','Dairy','Dry','Can',
  'Condiments','Spice','Bakery','Frozen','Refrigerated','Asian','Other'
]

export const CATEGORY_ORDER = [
  'Meat','Produce','Dairy','Refrigerated','Dry',
  'Can','Condiments','Spice','Bakery','Frozen','Asian','Other'
]

export const PRESET_TAGS = [
  'Chicken','Beef','Pork','Seafood','Pasta','Soup','Bowls',
  'Tacos','Burgers','Salad','Rice','Quick','High Protein','Vegetarian','Instant Pot'
]

export function getMondayOfWeek(date: Date = new Date()): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0,0,0,0)
  return d
}

export function getDateForJsDay(monday: Date, jsDay: number): number {
  const d = new Date(monday)
  const offset = jsDay === 0 ? 6 : jsDay - 1
  d.setDate(monday.getDate() + offset)
  return d.getDate()
}

export function formatWeekRange(mondayStr: string): string {
  const monday = new Date(mondayStr + 'T00:00:00')
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  return `${monday.toLocaleDateString('en-US', opts)} – ${sunday.toLocaleDateString('en-US', opts)}`
}

export function generateInviteCode(): string {
  const words = ['APPLE','BAKER','CEDAR','DELTA','EMBER','FABLE','GROVE','HAVEN',
                 'IVORY','JADE','KIWI','LEMON','MAPLE','NUTMEG','OLIVE','PEACH',
                 'QUILL','RIVER','SAGE','THYME','UMBRA','VIOLA','WALNUT','XYLO','YARROW','ZEST']
  const word = words[Math.floor(Math.random() * words.length)]
  const num  = Math.floor(1000 + Math.random() * 9000)
  return `${word}-${num}`
}
