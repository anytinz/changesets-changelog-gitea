import { defineConfig } from 'tsdown'

const config = defineConfig({
  entry: ['./src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
})
export default config
