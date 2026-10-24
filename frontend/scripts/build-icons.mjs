// Renders the PWA icons from resources/icon.svg. Run after changing the icon:
//   node scripts/build-icons.mjs
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
for (const size of [180, 512]) {
  await sharp(root + 'resources/icon.svg', { density: 300 }).resize(size, size).png().toFile(`${root}public/icon-${size}.png`)
  console.log(`public/icon-${size}.png`)
}
