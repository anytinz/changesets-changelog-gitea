import { anytinz } from '@anytinz/eslint-config'

/** @type {import('eslint').Linter.Config[]} */
const config = anytinz(
  {
    ingores: [
      'src/generated/**',
    ],
    perfectionist: {
      rules: {
        sortImports: {
          internalPattern: [
            '^@/.+',
          ],
        },
      },
    },
  },
)
export default config
