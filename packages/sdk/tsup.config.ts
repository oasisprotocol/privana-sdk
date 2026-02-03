import { defineConfig } from 'tsup'
import { resolve } from 'path'
import { readFileSync, writeFileSync } from 'fs'

const addUseClientDirective = () => {
  const files = ['dist/index.js', 'dist/index.cjs']
  files.forEach((file) => {
    try {
      const content = readFileSync(file, 'utf-8')
      if (!content.startsWith('"use client"')) {
        writeFileSync(file, `"use client";\n${content}`)
      }
    } catch {}
  })
}

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom', 'react/jsx-runtime', 'wagmi', 'viem', '@tanstack/react-query'],
  treeshake: true,
  minify: false,
  injectStyle: true,
  esbuildOptions(options) {
    options.alias = {
      '@': resolve(__dirname, 'src'),
    }
  },
  async onSuccess() {
    addUseClientDirective()
    console.log('✓ Added "use client" directive to output files')
  },
})
