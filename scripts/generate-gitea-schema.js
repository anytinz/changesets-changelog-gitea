import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import openapiTS, { astToString } from 'openapi-typescript'

const GITEA_VERSION = '1.27'
const SPEC_URL = 'https://docs.gitea.com/openapi3-27.json'
const SPEC_SHA256 = 'e38a24406e913bce8c8a81b1d680b85dda4deec15f2ee5c3abeaaca63205cc95'

const repoRoot = path.resolve(import.meta.dirname, '..')
const cacheDir = path.join(repoRoot, 'node_modules', '.cache', 'gitea')
const cacheFile = path.join(cacheDir, 'openapi3-27.json')
const outputFile = path.join(repoRoot, 'src', 'generated', 'gitea-schema.ts')

/** @param {Buffer} buffer */
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')

const readCachedSpec = async () => {
  try {
    const buffer = await readFile(cacheFile)
    return sha256(buffer) === SPEC_SHA256 ? buffer : null
  } catch {
    return null
  }
}

const downloadSpec = async () => {
  const response = await fetch(SPEC_URL)
  if (!response.ok) {
    throw new Error(`Failed to download ${SPEC_URL}: HTTP ${response.status}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  const digest = sha256(buffer)
  if (digest !== SPEC_SHA256) {
    throw new Error(
      `Checksum mismatch for ${SPEC_URL}: expected ${SPEC_SHA256}, got ${digest}. `
      + 'If the spec changed upstream, update SPEC_SHA256 in this script.',
    )
  }
  return buffer
}

let specBuffer = await readCachedSpec()
if (specBuffer === null) {
  specBuffer = await downloadSpec()
  await mkdir(cacheDir, { recursive: true })
  await writeFile(cacheFile, specBuffer)
}

const schema = JSON.parse(specBuffer.toString('utf8'))

// @ts-expect-error -- JSON.parse returns JSONValue; openapiTS needs an OpenAPI3 document
const ast = await openapiTS(schema)
const output = astToString(ast)

await mkdir(path.dirname(outputFile), { recursive: true })
await writeFile(outputFile, output)
process.stdout.write(
  `Generated ${path.relative(repoRoot, outputFile)} from Gitea ${GITEA_VERSION} OpenAPI spec\n`,
)
