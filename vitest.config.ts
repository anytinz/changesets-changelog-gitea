import { defineConfig } from 'vitest/config'

const config = defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
  },
})
export default config
