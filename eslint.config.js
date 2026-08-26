import { anytinz } from '@anytinz/eslint-config'

/** @type {import('eslint').Linter.Config[]} */
const config = anytinz(
  {
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
