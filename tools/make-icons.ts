/* Bakes public/'s icons out of reference/icon.svg and reference/icon-maskable.svg.
 *
 *   bun tools/make-icons.ts
 *
 * Run it whenever either source changes; the PNGs it writes are committed,
 * because the build serves public/ as it stands and nothing on a deploy machine
 * has a browser to render an SVG with.
 *
 * Chrome is the rasteriser. Nothing else on this machine renders SVG — no
 * rsvg-convert, no Inkscape, no ImageMagick — and a dependency that ships a
 * rasteriser would be a rasteriser in every install of the app for the sake of
 * a script run a few times a year. `CHROME` overrides the path.
 *
 * It drives Chrome over the devtools protocol rather than `--screenshot`, which
 * has no way to say "this many pixels exactly" and leaves the process running
 * when the page never goes idle.
 */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const CHROME =
  process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const root = new URL('../', import.meta.url)
const source = (name: string) => fileURLToPath(new URL(`reference/${name}`, root))
const target = (name: string) => fileURLToPath(new URL(`public/${name}`, root))

/* Every size something asks for, and which drawing answers. The .ico is packed
   from the first three afterwards. */
const ICONS: readonly { file: string; size: number; svg: string }[] = [
  { file: 'favicon-16.png', size: 16, svg: 'icon.svg' },
  { file: 'favicon-32.png', size: 32, svg: 'icon.svg' },
  { file: 'favicon-48.png', size: 48, svg: 'icon.svg' },
  { file: 'apple-touch-icon.png', size: 180, svg: 'icon.svg' },
  { file: 'icon-192.png', size: 192, svg: 'icon.svg' },
  { file: 'icon-512.png', size: 512, svg: 'icon.svg' },
  { file: 'icon-512-maskable.png', size: 512, svg: 'icon-maskable.svg' },
  /* The rail and the sign-in page still draw this one. It is the same 512 as
     icon-512.png and was already a byte-for-byte copy of it; kept rather than
     pointed at the icon because the two are the same picture today and need not
     be tomorrow — an icon is cut for a launcher and a mark is drawn on a page. */
  { file: 'logo.png', size: 512, svg: 'icon.svg' },
]

const ICO = ['favicon-16.png', 'favicon-32.png', 'favicon-48.png'] as const

const port = 9222 + Math.floor(Math.random() * 500)
const profile = fileURLToPath(new URL(`node_modules/.tmp/icon-chrome-${port}`, root))

const chrome = Bun.spawn(
  [
    CHROME,
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdout: 'ignore', stderr: 'ignore' },
)

async function devtools(): Promise<string> {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const pages = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as {
        type: string
        webSocketDebuggerUrl: string
      }[]
      const page = pages.find((entry) => entry.type === 'page')
      if (page) return page.webSocketDebuggerUrl
    } catch {
      /* Not listening yet. */
    }
    await Bun.sleep(250)
  }
  throw new Error('Chrome never answered on the devtools port')
}

const socket = new WebSocket(await devtools())
await new Promise((open) => socket.addEventListener('open', open, { once: true }))

let sent = 0
const waiting = new Map<number, (result: Record<string, unknown>) => void>()
socket.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data)) as { id?: number; result?: Record<string, unknown> }
  if (message.id !== undefined) waiting.get(message.id)?.(message.result ?? {})
})

function send(method: string, params: Record<string, unknown> = {}): Promise<any> {
  sent += 1
  const id = sent
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve) => waiting.set(id, resolve))
}

await send('Page.enable')

/* The page is the drawing and nothing else: no margin, no scrollbars, and a
   transparent backdrop so the tile's own corners stay the tile's.

   The SVG is written into the page rather than linked from it. A `data:` page
   has an opaque origin and is refused every `file://` subresource it asks for,
   which rendered eight broken-image glyphs before it rendered anything else. */
function pageFor(markup: string, size: number): string {
  const page = `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent}
    svg{display:block;width:${size}px;height:${size}px}
  </style>${markup}`
  return `data:text/html;base64,${Buffer.from(page, 'utf8').toString('base64')}`
}

for (const icon of ICONS) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: icon.size,
    height: icon.size,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await send('Emulation.setDefaultBackgroundColorOverride', {
    color: { r: 0, g: 0, b: 0, a: 0 },
  })
  await send('Page.navigate', {
    url: pageFor(await Bun.file(source(icon.svg)).text(), icon.size),
  })
  /* Navigating is not painting, and a screenshot taken between the two comes
     back as the page before it. */
  await Bun.sleep(400)

  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  })
  writeFileSync(target(icon.file), Buffer.from(shot.data as string, 'base64'))
  console.log(`${icon.file}  ${icon.size}×${icon.size}  from ${icon.svg}`)
}

socket.close()
chrome.kill()

/* An .ico is a header, one directory entry per size, and the images after it.
   Each entry here is a whole PNG rather than a bitmap — every browser that
   still asks for an .ico by name has read PNG-in-ICO for fifteen years, and the
   bitmap form would mean writing a BMP encoder and its upside-down AND mask. */
const images = await Promise.all(
  ICO.map(async (file) => ({
    size: Number(file.match(/(\d+)/)![1]!),
    bytes: Buffer.from(await Bun.file(target(file)).arrayBuffer()),
  })),
)

const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(images.length, 4)

let offset = 6 + images.length * 16
const entries: Buffer[] = []
for (const image of images) {
  const entry = Buffer.alloc(16)
  /* Zero means 256 in this field, which is why nothing here may exceed 255. */
  entry.writeUInt8(image.size, 0)
  entry.writeUInt8(image.size, 1)
  entry.writeUInt8(0, 2)
  entry.writeUInt8(0, 3)
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(image.bytes.length, 8)
  entry.writeUInt32LE(offset, 12)
  entries.push(entry)
  offset += image.bytes.length
}

writeFileSync(
  target('favicon.ico'),
  Buffer.concat([header, ...entries, ...images.map((image) => image.bytes)]),
)
console.log(`favicon.ico  ${images.map((image) => image.size).join(', ')}`)
