import { defineConfig } from 'tsup'
import { resolve } from 'path'
import { readFileSync, writeFileSync, copyFileSync, readdirSync } from 'fs'

const addUseClientDirective = () => {
  const files = readdirSync('dist').filter((f) => /\.(js|cjs)$/.test(f))
  files.forEach((name) => {
    const file = `dist/${name}`
    try {
      const content = readFileSync(file, 'utf-8')
      if (!content.startsWith('"use client"')) {
        writeFileSync(file, `"use client";\n${content}`)
      }
    } catch {}
  })
}

const copyCssToOutput = () => {
  try {
    copyFileSync('src/compiled.css', 'dist/index.css')
    console.log('✓ Copied CSS to dist/index.css')
  } catch (err) {
    console.error('✗ Failed to copy CSS:', err)
  }
}

const copyStaticAssetsToOutput = () => {
  try {
    copyFileSync('src/powered_by_privana.svg', 'dist/powered_by_privana.svg')
    console.log('✓ Copied static assets to dist/')
  } catch (err) {
    console.error('✗ Failed to copy static assets:', err)
  }
}

export default defineConfig({
  entry: ['src/index.ts', 'src/on-ramp.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom', 'react/jsx-runtime', 'wagmi', 'viem', '@tanstack/react-query'],
  treeshake: true,
  minify: false,
  // Disable injectStyle to prevent CSS regeneration
  // The SDK will export a CSS file that host apps should import
  injectStyle: false,
  esbuildOptions(options) {
    options.alias = {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, '../../shared'),
    }
  },
  async onSuccess() {
    addUseClientDirective()
    copyCssToOutput()
    copyStaticAssetsToOutput()
    console.log('✓ Added "use client" directive to output files')
  },
})
