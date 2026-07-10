'use client'

import { useState, useCallback, useEffect } from 'react'
import { useTheme } from '@/providers/theme-provider'
import { cn } from '@/lib/utils'

function hexToOklch(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  const lr = toLinear(r)
  const lg = toLinear(g)
  const lb = toLinear(b)

  const l_ = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s_ = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)

  const okL = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const okA = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const okB = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_

  const C = Math.sqrt(okA * okA + okB * okB)
  const H = C < 0.001 ? 0 : ((Math.atan2(okB, okA) * 180) / Math.PI + 360) % 360

  const round = (n: number, d: number) => parseFloat(n.toFixed(d))
  return `oklch(${round(okL, 3)} ${round(C, 3)} ${round(H, 3)})`
}

interface ThemeColor {
  variable: string
  label: string
  defaultLight: string
  defaultDark: string
}

interface ThemeGroup {
  label: string
  colors: ThemeColor[]
}

const THEME_GROUPS: ThemeGroup[] = [
  {
    label: 'Base',
    colors: [
      {
        variable: '--background',
        label: 'Background',
        defaultLight: '#ffffff',
        defaultDark: '#0d0d0d',
      },
      {
        variable: '--foreground',
        label: 'Foreground',
        defaultLight: '#0a0a0a',
        defaultDark: '#ffffff',
      },
    ],
  },
  {
    label: 'Primary',
    colors: [
      { variable: '--primary', label: 'Primary', defaultLight: '#171717', defaultDark: '#ffffff' },
      {
        variable: '--primary-foreground',
        label: 'Primary Text',
        defaultLight: '#fafafa',
        defaultDark: '#000000',
      },
    ],
  },
  {
    label: 'Secondary',
    colors: [
      {
        variable: '--secondary',
        label: 'Secondary',
        defaultLight: '#e8e8e8',
        defaultDark: '#202020',
      },
      {
        variable: '--secondary-foreground',
        label: 'Secondary Text',
        defaultLight: '#171717',
        defaultDark: '#ffffff',
      },
    ],
  },
  {
    label: 'Card',
    colors: [
      { variable: '--card', label: 'Card', defaultLight: '#f5f5f5', defaultDark: '#0d0d0d' },
      {
        variable: '--card-foreground',
        label: 'Card Text',
        defaultLight: '#0a0a0a',
        defaultDark: '#ffffff',
      },
    ],
  },
  {
    label: 'Popover',
    colors: [
      { variable: '--popover', label: 'Popover', defaultLight: '#ffffff', defaultDark: '#161616' },
      {
        variable: '--popover-foreground',
        label: 'Popover Text',
        defaultLight: '#0a0a0a',
        defaultDark: '#ffffff',
      },
    ],
  },
  {
    label: 'Muted',
    colors: [
      { variable: '--muted', label: 'Muted', defaultLight: '#f2f2f2', defaultDark: '#171717' },
      {
        variable: '--muted-foreground',
        label: 'Muted Text',
        defaultLight: '#555555',
        defaultDark: '#737373',
      },
    ],
  },
  {
    label: 'Accent',
    colors: [
      { variable: '--accent', label: 'Accent', defaultLight: '#f5f5f5', defaultDark: '#202020' },
      {
        variable: '--accent-foreground',
        label: 'Accent Text',
        defaultLight: '#171717',
        defaultDark: '#ffffff',
      },
    ],
  },
  {
    label: 'Borders & Input',
    colors: [
      { variable: '--border', label: 'Border', defaultLight: '#d7d7d7', defaultDark: '#262626' },
      { variable: '--input', label: 'Input', defaultLight: '#eeeeee', defaultDark: '#0b0b0b' },
      { variable: '--ring', label: 'Focus Ring', defaultLight: '#a1a1a1', defaultDark: '#3d3d3d' },
    ],
  },
  {
    label: 'Destructive',
    colors: [
      {
        variable: '--destructive',
        label: 'Destructive',
        defaultLight: '#dc2626',
        defaultDark: '#ef4444',
      },
    ],
  },
]

interface Preset {
  name: string
  isDark: boolean
  radius: number
  colors: Record<string, string>
}

const PRESETS: Preset[] = [
  {
    name: 'Default Dark',
    isDark: true,
    radius: 0.625,
    colors: {},
  },
  {
    name: 'Default Light',
    isDark: false,
    radius: 0.625,
    colors: {},
  },
  {
    name: 'Ocean',
    isDark: true,
    radius: 0.75,
    colors: {
      '--background': '#0c1222',
      '--foreground': '#e2e8f0',
      '--primary': '#38bdf8',
      '--primary-foreground': '#0c1222',
      '--secondary': '#1e293b',
      '--secondary-foreground': '#e2e8f0',
      '--card': '#131c31',
      '--card-foreground': '#e2e8f0',
      '--popover': '#131c31',
      '--popover-foreground': '#e2e8f0',
      '--muted': '#1e293b',
      '--muted-foreground': '#94a3b8',
      '--accent': '#1e293b',
      '--accent-foreground': '#e2e8f0',
      '--border': '#1e3a5f',
      '--input': '#1e3a5f',
      '--ring': '#38bdf8',
      '--destructive': '#f43f5e',
    },
  },
  {
    name: 'Emerald',
    isDark: true,
    radius: 1,
    colors: {
      '--background': '#0a1410',
      '--foreground': '#ecfdf5',
      '--primary': '#34d399',
      '--primary-foreground': '#0a1410',
      '--secondary': '#1a2e26',
      '--secondary-foreground': '#ecfdf5',
      '--card': '#0f1f18',
      '--card-foreground': '#ecfdf5',
      '--popover': '#0f1f18',
      '--popover-foreground': '#ecfdf5',
      '--muted': '#1a2e26',
      '--muted-foreground': '#6ee7b7',
      '--accent': '#1a2e26',
      '--accent-foreground': '#ecfdf5',
      '--border': '#1f3d30',
      '--input': '#1f3d30',
      '--ring': '#34d399',
      '--destructive': '#f87171',
    },
  },
  {
    name: 'Purple Haze',
    isDark: true,
    radius: 0.875,
    colors: {
      '--background': '#13091f',
      '--foreground': '#f3e8ff',
      '--primary': '#a78bfa',
      '--primary-foreground': '#13091f',
      '--secondary': '#2a1a40',
      '--secondary-foreground': '#f3e8ff',
      '--card': '#1a0f2e',
      '--card-foreground': '#f3e8ff',
      '--popover': '#1a0f2e',
      '--popover-foreground': '#f3e8ff',
      '--muted': '#2a1a40',
      '--muted-foreground': '#c4b5fd',
      '--accent': '#2a1a40',
      '--accent-foreground': '#f3e8ff',
      '--border': '#3b2566',
      '--input': '#3b2566',
      '--ring': '#a78bfa',
      '--destructive': '#fb7185',
    },
  },
  {
    name: 'Rose',
    isDark: false,
    radius: 1,
    colors: {
      '--background': '#fff1f2',
      '--foreground': '#1c1917',
      '--primary': '#e11d48',
      '--primary-foreground': '#ffffff',
      '--secondary': '#ffe4e6',
      '--secondary-foreground': '#1c1917',
      '--card': '#ffffff',
      '--card-foreground': '#1c1917',
      '--popover': '#ffffff',
      '--popover-foreground': '#1c1917',
      '--muted': '#ffe4e6',
      '--muted-foreground': '#78716c',
      '--accent': '#ffe4e6',
      '--accent-foreground': '#1c1917',
      '--border': '#fecdd3',
      '--input': '#fecdd3',
      '--ring': '#e11d48',
      '--destructive': '#dc2626',
    },
  },
  {
    name: 'Midnight',
    isDark: true,
    radius: 0.25,
    colors: {
      '--background': '#09090b',
      '--foreground': '#fafafa',
      '--primary': '#fafafa',
      '--primary-foreground': '#09090b',
      '--secondary': '#1c1c1e',
      '--secondary-foreground': '#fafafa',
      '--card': '#111113',
      '--card-foreground': '#fafafa',
      '--popover': '#111113',
      '--popover-foreground': '#fafafa',
      '--muted': '#1c1c1e',
      '--muted-foreground': '#71717a',
      '--accent': '#1c1c1e',
      '--accent-foreground': '#fafafa',
      '--border': '#27272a',
      '--input': '#27272a',
      '--ring': '#52525b',
      '--destructive': '#ef4444',
    },
  },
  {
    name: 'Sand',
    isDark: false,
    radius: 0.5,
    colors: {
      '--background': '#faf8f4',
      '--foreground': '#4b4336',
      '--primary': '#b57140',
      '--primary-foreground': '#ffffff',
      '--secondary': '#ece7e0',
      '--secondary-foreground': '#605950',
      '--card': '#faf8f4',
      '--card-foreground': '#272727',
      '--popover': '#ffffff',
      '--popover-foreground': '#3b3630',
      '--muted': '#f1ede6',
      '--muted-foreground': '#918d86',
      '--accent': '#ece7e0',
      '--accent-foreground': '#3b3630',
      '--border': '#e5e1da',
      '--input': '#b6b0a5',
      '--ring': '#3b7cc9',
      '--destructive': '#272727',
    },
  },
]

function getDefaults(isDark: boolean): Record<string, string> {
  const map: Record<string, string> = {}
  for (const group of THEME_GROUPS) {
    for (const color of group.colors) {
      map[color.variable] = isDark ? color.defaultDark : color.defaultLight
    }
  }
  return map
}

function ColorInput({
  label,
  value,
  onChange,
  isDark,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  isDark: boolean
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <span
        className={cn(
          'min-w-0 shrink truncate text-[11px]',
          isDark ? 'text-neutral-400' : 'text-neutral-500'
        )}
      >
        {label}
      </span>
      <div className="flex shrink-0 items-center gap-1.5">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'w-17 rounded border px-1.5 py-0.5 font-mono text-[11px] transition-colors outline-none',
            isDark
              ? 'border-neutral-700 bg-neutral-800 text-neutral-200 focus:border-neutral-500'
              : 'border-neutral-300 bg-white text-neutral-800 focus:border-neutral-400'
          )}
        />
        <label className="relative cursor-pointer">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
          <div
            className={cn(
              'size-6 shrink-0 rounded border',
              isDark ? 'border-neutral-600' : 'border-neutral-300'
            )}
            style={{ backgroundColor: value }}
          />
        </label>
      </div>
    </div>
  )
}

export function ThemeEditor() {
  const { theme: currentMode, setTheme } = useTheme()
  const isDark = currentMode === 'dark'

  const [colors, setColors] = useState<Record<string, string>>(() => getDefaults(false))
  const [radius, setRadius] = useState(0.625)
  const [copied, setCopied] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(['Base', 'Primary', 'Borders & Input'])
  )

  useEffect(() => {
    const savedColors = localStorage.getItem('theme-editor-colors')
    const savedRadius = localStorage.getItem('theme-editor-radius')
    const savedMode = localStorage.getItem('theme-editor-mode')
    if (savedMode && savedMode !== currentMode) {
      setTheme(savedMode as 'dark' | 'light')
    }
    if (savedColors) {
      setColors(JSON.parse(savedColors))
    } else {
      setColors(getDefaults(savedMode === 'dark' || (!savedMode && isDark)))
    }
    if (savedRadius) {
      setRadius(parseFloat(savedRadius))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyThemeToElement = useCallback(
    (el: HTMLElement, newColors: Record<string, string>, newRadius: number) => {
      for (const [variable, value] of Object.entries(newColors)) {
        const privanaVar = variable.replace('--', '--privana-')
        el.style.setProperty(privanaVar, value)
      }
      el.style.setProperty('--privana-radius', `${newRadius}rem`)
      // The SDK reads its effective theme from `color-scheme` (e.g. to match
      // the MoonPay widget) — declare it alongside the variable overrides.
      el.style.colorScheme = isDark ? 'dark' : 'light'
    },
    [isDark]
  )

  const applyTheme = useCallback(
    (newColors: Record<string, string>, newRadius: number) => {
      const targets = document.querySelectorAll<HTMLElement>('[data-privana]')
      targets.forEach((el) => applyThemeToElement(el, newColors, newRadius))
    },
    [applyThemeToElement]
  )

  useEffect(() => {
    applyTheme(colors, radius)
  }, [colors, radius, applyTheme])

  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) {
            if (node.hasAttribute('data-privana')) {
              applyThemeToElement(node, colors, radius)
            }
            const nested = node.querySelectorAll<HTMLElement>('[data-privana]')
            nested.forEach((el) => applyThemeToElement(el, colors, radius))
          }
        }
      }
    })

    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [colors, radius, applyThemeToElement])

  useEffect(() => {
    localStorage.setItem('theme-editor-colors', JSON.stringify(colors))
    localStorage.setItem('theme-editor-radius', String(radius))
    localStorage.setItem('theme-editor-mode', isDark ? 'dark' : 'light')
  }, [colors, radius, isDark])

  const handleColorChange = (variable: string, value: string) => {
    setColors((prev) => ({ ...prev, [variable]: value }))
  }

  const switchMode = (dark: boolean) => {
    setTheme(dark ? 'dark' : 'light')
    setColors(getDefaults(dark))
  }

  const handlePreset = (preset: Preset) => {
    if (preset.isDark !== isDark) {
      setTheme(preset.isDark ? 'dark' : 'light')
    }
    setColors({ ...getDefaults(preset.isDark), ...preset.colors })
    setRadius(preset.radius)
  }

  const handleReset = () => {
    setColors(getDefaults(isDark))
    setRadius(0.625)
    localStorage.removeItem('theme-editor-colors')
    localStorage.removeItem('theme-editor-radius')
    const targets = document.querySelectorAll<HTMLElement>('[data-privana]')
    targets.forEach((el) => {
      for (const group of THEME_GROUPS) {
        for (const color of group.colors) {
          el.style.removeProperty(color.variable.replace('--', '--privana-'))
        }
      }
      el.style.removeProperty('--privana-radius')
      el.style.removeProperty('color-scheme')
    })
  }

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  const generateCSS = () => {
    const selector = isDark ? '[data-privana].dark, .dark [data-privana]' : '[data-privana]'
    const lines = [`${selector} {`, `  --privana-radius: ${radius}rem;`]
    for (const group of THEME_GROUPS) {
      for (const color of group.colors) {
        const hex = colors[color.variable]
        const privanaVar = color.variable.replace('--', '--privana-')
        lines.push(`  ${privanaVar}: ${hex?.startsWith('#') ? hexToOklch(hex) : hex};`)
      }
    }
    lines.push('}')
    return lines.join('\n')
  }

  const copyCSS = () => {
    navigator.clipboard.writeText(generateCSS())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className={cn(
        'flex h-full flex-col overflow-hidden transition-colors',
        isDark ? 'bg-neutral-900 text-neutral-200' : 'bg-neutral-50 text-neutral-800'
      )}
    >
      <div
        className={cn(
          'flex shrink-0 items-center justify-between border-b px-4 py-3',
          isDark ? 'border-neutral-800' : 'border-neutral-200'
        )}
      >
        <span
          className={cn(
            'text-xs font-semibold tracking-wide uppercase',
            isDark ? 'text-neutral-400' : 'text-neutral-500'
          )}
        >
          Theme Editor
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className={cn(
              'rounded px-2 py-1 text-[11px] transition-colors',
              isDark
                ? 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                : 'text-neutral-500 hover:bg-neutral-200 hover:text-neutral-800'
            )}
          >
            Reset
          </button>
          <button
            onClick={copyCSS}
            className={cn(
              'rounded px-2.5 py-1 text-[11px] font-medium transition-colors',
              isDark
                ? 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700'
                : 'bg-neutral-200 text-neutral-800 hover:bg-neutral-300'
            )}
          >
            {copied ? 'Copied!' : 'Copy CSS'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-x-hidden overflow-y-auto">
        <EditorSection isDark={isDark} label="Mode">
          <div
            className={cn(
              'flex gap-1 rounded-lg p-0.5',
              isDark ? 'bg-neutral-800' : 'bg-neutral-200'
            )}
          >
            {(['light', 'dark'] as const).map((mode) => {
              const isActive = isDark === (mode === 'dark')
              return (
                <button
                  key={mode}
                  onClick={() => switchMode(mode === 'dark')}
                  className={cn(
                    'flex-1 rounded-md py-1.5 text-[11px] font-medium capitalize transition-colors',
                    isActive
                      ? isDark
                        ? 'bg-neutral-700 text-neutral-100'
                        : 'bg-white text-neutral-900 shadow-sm'
                      : isDark
                        ? 'text-neutral-400 hover:text-neutral-200'
                        : 'text-neutral-500 hover:text-neutral-700'
                  )}
                >
                  {mode}
                </button>
              )
            })}
          </div>
        </EditorSection>

        <EditorSection isDark={isDark} label="Presets">
          <div className="grid grid-cols-2 gap-1.5">
            {PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => handlePreset(preset)}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11px] transition-colors',
                  isDark
                    ? 'border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-800'
                    : 'border-neutral-200 text-neutral-600 hover:border-neutral-300 hover:bg-neutral-100'
                )}
              >
                <div className="flex shrink-0 -space-x-1">
                  <div
                    className={cn(
                      'size-3 rounded-full border',
                      isDark ? 'border-neutral-700' : 'border-neutral-300'
                    )}
                    style={{
                      backgroundColor:
                        preset.colors['--primary'] || (preset.isDark ? '#e5e5e5' : '#171717'),
                    }}
                  />
                  <div
                    className={cn(
                      'size-3 rounded-full border',
                      isDark ? 'border-neutral-700' : 'border-neutral-300'
                    )}
                    style={{
                      backgroundColor:
                        preset.colors['--background'] || (preset.isDark ? '#1a1a1a' : '#ffffff'),
                    }}
                  />
                </div>
                <span className="truncate">{preset.name}</span>
              </button>
            ))}
          </div>
        </EditorSection>

        <EditorSection isDark={isDark} label="Layout">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className={cn('text-[11px]', isDark ? 'text-neutral-400' : 'text-neutral-500')}>
                Border Radius
              </span>
              <span
                className={cn(
                  'font-mono text-[11px]',
                  isDark ? 'text-neutral-500' : 'text-neutral-400'
                )}
              >
                {radius}rem
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.125"
              value={radius}
              onChange={(e) => setRadius(parseFloat(e.target.value))}
              className={cn('w-full', isDark ? 'accent-neutral-400' : 'accent-neutral-600')}
            />
          </div>
        </EditorSection>

        <div>
          {THEME_GROUPS.map((group) => {
            const isExpanded = expandedGroups.has(group.label)
            return (
              <div
                key={group.label}
                className={cn('border-b', isDark ? 'border-neutral-800' : 'border-neutral-200')}
              >
                <button
                  onClick={() => toggleGroup(group.label)}
                  className={cn(
                    'flex w-full items-center justify-between px-4 py-2.5 transition-colors',
                    isDark ? 'hover:bg-neutral-800/50' : 'hover:bg-neutral-100'
                  )}
                >
                  <span
                    className={cn(
                      'text-[10px] font-semibold tracking-wider uppercase',
                      isDark ? 'text-neutral-500' : 'text-neutral-400'
                    )}
                  >
                    {group.label}
                  </span>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={cn(
                      'shrink-0 transition-transform',
                      isDark ? 'text-neutral-600' : 'text-neutral-400',
                      isExpanded && 'rotate-180'
                    )}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {isExpanded && (
                  <div className="space-y-2 px-4 pb-3">
                    {group.colors.map((color) => (
                      <ColorInput
                        key={color.variable}
                        label={color.label}
                        value={colors[color.variable] || ''}
                        onChange={(value) => handleColorChange(color.variable, value)}
                        isDark={isDark}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function EditorSection({
  isDark,
  label,
  children,
}: {
  isDark: boolean
  label: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('border-b px-4 py-3', isDark ? 'border-neutral-800' : 'border-neutral-200')}>
      <span
        className={cn(
          'mb-2 block text-[10px] font-semibold tracking-wider uppercase',
          isDark ? 'text-neutral-500' : 'text-neutral-400'
        )}
      >
        {label}
      </span>
      {children}
    </div>
  )
}
