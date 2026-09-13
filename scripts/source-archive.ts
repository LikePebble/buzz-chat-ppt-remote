import { resolve } from 'node:path'
import { createSourceArchive } from '../src/interaction/source'

createSourceArchive(process.cwd(), resolve('out/source.tar.gz')).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
