import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const SCOPE = '[data-privana]'
const CSS_VAR_PREFIX = '--privana-'

const SDK_VARS = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'border',
  'input',
  'ring',
  'radius',
  'radius-xs',
  'radius-sm',
  'radius-md',
  'radius-lg',
  'radius-xl',
]

const SCOPED_BASE = `@layer base{${SCOPE},${SCOPE} *,${SCOPE} ::before,${SCOPE} ::after{box-sizing:border-box;border-width:0;border-style:solid;border-color:var(--privana-border,currentColor)}}`

// Prefix all utility selectors to scope them to [data-privana]
// Uses :is() to match both the element with the attribute AND its descendants
// Pattern: :is([data-privana],[data-privana] *).class
function scopeUtilityClasses(css: string): string {
  const SCOPE_PATTERN = `:is(${SCOPE},${SCOPE} *)`

  let result = ''
  let i = 0

  while (i < css.length) {
    // Check if we're at a class selector (starts with .)
    // It should be preceded by one of: { } , ; @ space or start of file
    // And followed by a valid class name character
    if (
      css[i] === '.' &&
      (i === 0 || /[{},;\s@]/.test(css[i - 1])) &&
      i + 1 < css.length &&
      /[a-zA-Z_@\\-]/.test(css[i + 1])
    ) {
      // Check if already scoped (look backwards for [data-privana])
      const lookback = css.slice(Math.max(0, i - 50), i)
      if (lookback.includes('[data-privana]')) {
        result += css[i]
        i++
        continue
      }

      // Check if inside :is(.dark *) pattern
      if (lookback.includes(':is(') && !lookback.includes(')')) {
        result += css[i]
        i++
        continue
      }

      // Check if inside :where() pattern
      if (lookback.includes(':where(') && !lookback.includes(')')) {
        result += css[i]
        i++
        continue
      }

      // Don't scope @container queries
      if (css.substring(i, i + 12).includes('@container')) {
        result += css[i]
        i++
        continue
      }

      // Add the scope pattern - matches both the element itself and descendants
      result += `${SCOPE_PATTERN}.`
      i++ // Skip the .
    } else {
      result += css[i]
      i++
    }
  }

  return result
}

function extractBlock(css: string, startIndex: number): number {
  let depth = 0
  for (let i = startIndex; i < css.length; i++) {
    if (css[i] === '{') depth++
    if (css[i] === '}') {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return -1
}

function replaceLayerBase(css: string): string {
  const marker = '@layer base{'
  const idx = css.indexOf(marker)
  if (idx === -1) return css
  const end = extractBlock(css, idx + '@layer base'.length)
  if (end === -1) return css
  return css.slice(0, idx) + SCOPED_BASE + css.slice(end)
}

const filePath = resolve(import.meta.dirname!, '../src/compiled.css')
let css = readFileSync(filePath, 'utf-8')

css = replaceLayerBase(css)

css = css.replaceAll(':root,:host', SCOPE)

css = css.replace(/:root\s*\{([^}]+)\}/g, `${SCOPE}{$1}`)

css = css.replace(/\.dark\s*\{([^}]+)\}/g, `${SCOPE}.dark,.dark ${SCOPE}{$1}`)

for (const v of SDK_VARS) {
  css = css.replaceAll(`var(--${v})`, `var(${CSS_VAR_PREFIX}${v})`)
  css = css.replaceAll(`--${v}:`, `${CSS_VAR_PREFIX}${v}:`)
}

// Scope utility class selectors to [data-privana]
css = scopeUtilityClasses(css)

writeFileSync(filePath, css)
console.log('CSS scoped successfully')
