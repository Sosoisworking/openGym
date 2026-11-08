// Renders the app icons from resources/icon.svg. Run after changing the icon:
//   node scripts/build-icons.mjs            the PWA icons, public/icon-{180,512}.png
//   node scripts/build-icons.mjs --native   also the sources for the Android and iOS icons and
//                                           splash screens, into resources/ (gitignored); then
//   npx @capacitor/assets generate --ios --android   writes them into android/ and ios/
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const svg = readFileSync(root + 'resources/icon.svg', 'utf8')
const render = (src, size, file) => sharp(Buffer.from(src), { density: 300 }).resize(size, size).png().toFile(root + file)
  .then(() => console.log(file))

for (const size of [180, 512]) await render(svg, size, `public/icon-${size}.png`)

if (process.argv.includes('--native')) {
  // The mark is the icon's one <g>; the background is its <rect>.
  const mark = svg.match(/<g transform="[^"]*">([\s\S]*?)<\/g>/)[1]
  const bg = svg.match(/<rect [^>]*fill="(#[0-9a-fA-F]{6})"/)[1]
  const page = (size, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`
  const at = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})">${mark}</g>`
  const fill = size => `<rect width="${size}" height="${size}" fill="${bg}"/>`
  await render(svg, 1024, 'resources/icon-only.png')
  // Android's adaptive icon: the mark alone, placed as in the icon, over a plain background.
  await render(page(1024, at(112, 80, 8)), 1024, 'resources/icon-foreground.png')
  await render(page(1024, fill(1024)), 1024, 'resources/icon-background.png')
  // Splash: the mark, small, in the middle of the background.
  for (const name of ['splash', 'splash-dark']) {
    await render(page(2732, fill(2732) + at(966, 950, 8)), 2732, `resources/${name}.png`)
  }
}
