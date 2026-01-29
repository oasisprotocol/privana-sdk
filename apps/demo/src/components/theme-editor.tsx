'use client'

import { useState, useCallback, useEffect } from 'react'
import { useTheme } from '@/providers/theme-provider'

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
      { variable: '--background', label: 'Background', defaultLight: '#ffffff', defaultDark: '#1a1a1a' },
      { variable: '--foreground', label: 'Foreground', defaultLight: '#171717', defaultDark: '#fafafa' },
    ],
  },
  {
    label: 'Primary',
    colors: [
      { variable: '--primary', label: 'Primary', defaultLight: '#171717', defaultDark: '#e5e5e5' },
      { variable: '--primary-foreground', label: 'Primary Text', defaultLight: '#fafafa', defaultDark: '#262626' },
    ],
  },
  {
    label: 'Secondary',
    colors: [
      { variable: '--secondary', label: 'Secondary', defaultLight: '#f5f5f5', defaultDark: '#363636' },
      { variable: '--secondary-foreground', label: 'Secondary Text', defaultLight: '#171717', defaultDark: '#fafafa' },
    ],
  },
  {
    label: 'Card',
    colors: [
      { variable: '--card', label: 'Card', defaultLight: '#ffffff', defaultDark: '#262626' },
      { variable: '--card-foreground', label: 'Card Text', defaultLight: '#171717', defaultDark: '#fafafa' },
    ],
  },
  {
    label: 'Popover',
    colors: [
      { variable: '--popover', label: 'Popover', defaultLight: '#ffffff', defaultDark: '#262626' },
      { variable: '--popover-foreground', label: 'Popover Text', defaultLight: '#171717', defaultDark: '#fafafa' },
    ],
  },
  {
    label: 'Muted',
    colors: [
      { variable: '--muted', label: 'Muted', defaultLight: '#f5f5f5', defaultDark: '#363636' },
      { variable: '--muted-foreground', label: 'Muted Text', defaultLight: '#737373', defaultDark: '#a3a3a3' },
    ],
  },
  {
    label: 'Accent',
    colors: [
      { variable: '--accent', label: 'Accent', defaultLight: '#f5f5f5', defaultDark: '#363636' },
      { variable: '--accent-foreground', label: 'Accent Text', defaultLight: '#171717', defaultDark: '#fafafa' },
    ],
  },
  {
    label: 'Borders & Input',
    colors: [
      { variable: '--border', label: 'Border', defaultLight: '#e5e5e5', defaultDark: '#333333' },
      { variable: '--input', label: 'Input', defaultLight: '#e5e5e5', defaultDark: '#3a3a3a' },
      { variable: '--ring', label: 'Focus Ring', defaultLight: '#a3a3a3', defaultDark: '#737373' },
    ],
  },
  {
    label: 'Destructive',
    colors: [
      { variable: '--destructive', label: 'Destructive', defaultLight: '#dc2626', defaultDark: '#ef4444' },
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
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 min-w-0">
      <span className="text-[11px] text-neutral-400 truncate shrink min-w-0">{label}</span>
      <div className="flex items-center gap-1.5 shrink-0">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-17 rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-200 font-mono outline-none focus:border-neutral-500"
        />
        <label className="relative cursor-pointer">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
          <div
            className="size-6 rounded border border-neutral-600 shrink-0"
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

  const [colors, setColors] = useState<Record<string, string>>(() => getDefaults(true))
  const [radius, setRadius] = useState(0.625)
  const [copied, setCopied] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(['Base', 'Primary', 'Borders & Input']))

  const applyTheme = useCallback((newColors: Record<string, string>, newRadius: number) => {
    const root = document.documentElement
    for (const [variable, value] of Object.entries(newColors)) {
      root.style.setProperty(variable, value)
    }
    root.style.setProperty('--radius', `${newRadius}rem`)
  }, [])

  useEffect(() => {
    applyTheme(colors, radius)
  }, [colors, radius, applyTheme])

  const handleColorChange = (variable: string, value: string) => {
    setColors((prev) => ({ ...prev, [variable]: value }))
  }

  const switchMode = (dark: boolean) => {
    setTheme(dark ? 'dark' : 'light')
    const defaults = getDefaults(dark)
    setColors(defaults)
  }

  const handlePreset = (preset: Preset) => {
    if (preset.isDark !== isDark) {
      setTheme(preset.isDark ? 'dark' : 'light')
    }
    const defaults = getDefaults(preset.isDark)
    const merged = { ...defaults, ...preset.colors }
    setColors(merged)
    setRadius(preset.radius)
  }

  const handleReset = () => {
    const defaults = getDefaults(isDark)
    setColors(defaults)
    setRadius(0.625)
    const root = document.documentElement
    for (const group of THEME_GROUPS) {
      for (const color of group.colors) {
        root.style.removeProperty(color.variable)
      }
    }
    root.style.removeProperty('--radius')
  }

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(label)) {
        next.delete(label)
      } else {
        next.add(label)
      }
      return next
    })
  }

  const generateCSS = () => {
    const selector = isDark ? '.dark' : ':root'
    let css = `${selector} {\n  --radius: ${radius}rem;\n`
    for (const group of THEME_GROUPS) {
      for (const color of group.colors) {
        css += `  ${color.variable}: ${colors[color.variable]};\n`
      }
    }
    css += '}'
    return css
  }

  const copyCSS = () => {
    navigator.clipboard.writeText(generateCSS())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-neutral-900 text-neutral-200">
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3 shrink-0">
        <span className="text-xs font-semibold tracking-wide uppercase text-neutral-400">Theme Editor</span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="rounded px-2 py-1 text-[11px] text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
          >
            Reset
          </button>
          <button
            onClick={copyCSS}
            className="rounded bg-neutral-800 px-2.5 py-1 text-[11px] font-medium text-neutral-200 transition-colors hover:bg-neutral-700"
          >
            {copied ? 'Copied!' : 'Copy CSS'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="border-b border-neutral-800 px-4 py-3">
          <span className="mb-2 block text-[10px] font-semibold tracking-wider uppercase text-neutral-500">Mode</span>
          <div className="flex gap-1 rounded-lg bg-neutral-800 p-0.5">
            <button
              onClick={() => switchMode(false)}
              className={`flex-1 rounded-md py-1.5 text-[11px] font-medium transition-colors ${
                !isDark ? 'bg-neutral-700 text-neutral-100' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Light
            </button>
            <button
              onClick={() => switchMode(true)}
              className={`flex-1 rounded-md py-1.5 text-[11px] font-medium transition-colors ${
                isDark ? 'bg-neutral-700 text-neutral-100' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Dark
            </button>
          </div>
        </div>

        <div className="border-b border-neutral-800 px-4 py-3">
          <span className="mb-2 block text-[10px] font-semibold tracking-wider uppercase text-neutral-500">Presets</span>
          <div className="grid grid-cols-2 gap-1.5">
            {PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => handlePreset(preset)}
                className="flex items-center gap-2 rounded-md border border-neutral-800 px-2.5 py-1.5 text-[11px] text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
              >
                <div className="flex -space-x-1 shrink-0">
                  <div
                    className="size-3 rounded-full border border-neutral-700"
                    style={{ backgroundColor: preset.colors['--primary'] || (preset.isDark ? '#e5e5e5' : '#171717') }}
                  />
                  <div
                    className="size-3 rounded-full border border-neutral-700"
                    style={{ backgroundColor: preset.colors['--background'] || (preset.isDark ? '#1a1a1a' : '#ffffff') }}
                  />
                </div>
                <span className="truncate">{preset.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="border-b border-neutral-800 px-4 py-3">
          <span className="mb-3 block text-[10px] font-semibold tracking-wider uppercase text-neutral-500">Layout</span>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] text-neutral-400">Border Radius</span>
              <span className="text-[11px] font-mono text-neutral-500">{radius}rem</span>
            </div>
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.125"
              value={radius}
              onChange={(e) => setRadius(parseFloat(e.target.value))}
              className="w-full accent-neutral-400"
            />
          </div>
        </div>

        <div>
          {THEME_GROUPS.map((group) => {
            const isExpanded = expandedGroups.has(group.label)
            return (
              <div key={group.label} className="border-b border-neutral-800">
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="flex w-full items-center justify-between px-4 py-2.5 transition-colors hover:bg-neutral-800/50"
                >
                  <span className="text-[10px] font-semibold tracking-wider uppercase text-neutral-500">
                    {group.label}
                  </span>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={`text-neutral-600 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
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
