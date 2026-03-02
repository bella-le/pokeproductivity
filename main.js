const { app, BrowserWindow, ipcMain, screen, protocol } = require('electron')
const path = require('path')
const fs = require('fs')
const https = require('https')

// Must register custom schemes before app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'sprite', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

// ─── Cache helpers ────────────────────────────────────────────────────────────

const CACHE_DIR         = path.join(__dirname, 'sprite-cache')
const PORTRAIT_CACHE_DIR = path.join(__dirname, 'portrait-cache')

function cachePath(dexNumber, filename) {
  return path.join(CACHE_DIR, dexNumber, filename)
}

function portraitCachePath(dexNumber, filename) {
  return path.join(PORTRAIT_CACHE_DIR, dexNumber, filename)
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    ensureDir(dest)
    const file = fs.createWriteStream(dest)
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close()
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) {
        file.close()
        fs.unlink(dest, () => {})
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      }
      res.pipe(file)
      file.on('finish', () => file.close(resolve))
    }).on('error', (err) => {
      fs.unlink(dest, () => {})
      reject(err)
    })
  })
}

// Fetch a sprite file, caching locally; returns local path
async function fetchSpriteFile(dexNumber, filename) {
  const local = cachePath(dexNumber, filename)
  if (fs.existsSync(local)) {
    console.log(`[cache hit]  sprite/${dexNumber}/${filename}`)
    return local
  }
  const url = `https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/sprite/${dexNumber}/${filename}`
  console.log(`[download]   ${url}`)
  await downloadFile(url, local)
  console.log(`[saved]      ${local}`)
  return local
}

// Fetch a portrait file, caching locally; returns local path
async function fetchPortraitFile(dexNumber, filename) {
  const local = portraitCachePath(dexNumber, filename)
  if (fs.existsSync(local)) {
    console.log(`[cache hit]  portrait/${dexNumber}/${filename}`)
    return local
  }
  const url = `https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/portrait/${dexNumber}/${filename}`
  console.log(`[download]   ${url}`)
  await downloadFile(url, local)
  console.log(`[saved]      ${local}`)
  return local
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

// Returns a sprite://portrait/ URL for the renderer (downloads and caches if needed)
ipcMain.handle('get-portrait-file', async (_event, dexNumber, filename) => {
  try {
    await fetchPortraitFile(dexNumber, filename)
    return { ok: true, url: `sprite://portrait/${dexNumber}/${filename}` }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// Returns a sprite://cache/ URL for the renderer (downloads and caches if needed)
ipcMain.handle('get-sprite-file', async (_event, dexNumber, filename) => {
  try {
    await fetchSpriteFile(dexNumber, filename)
    // Put dex+filename in the path, not the hostname — numeric hostnames get
    // mangled by URL parsing (e.g. "0025" → "0.0.0.21" as octal IPv4)
    return { ok: true, url: `sprite://cache/${dexNumber}/${filename}` }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// Drag / auto-walk: move window by a pixel delta
ipcMain.on('move-window', (_event, deltaX, deltaY) => {
  if (!win || win.isDestroyed()) return
  const { width: sw } = screen.getPrimaryDisplay().workAreaSize
  const { height: fullH } = screen.getPrimaryDisplay().bounds  // full height, past the Dock
  const [winW] = win.getSize()
  const [x, y] = win.getPosition()
  // X: clamp to work area width. Y: clamp to full screen height so the pet can sit behind the Dock.
  const nx = Math.round(Math.max(0, Math.min(sw - winW, x + deltaX)))
  // Y: allow dragging all the way to the physical bottom (behind/below the Dock)
  const ny = Math.round(Math.max(0, Math.min(fullH, y + deltaY)))
  if (Number.isFinite(nx) && Number.isFinite(ny)) win.setPosition(nx, ny)
})

// Mouse pass-through toggle
ipcMain.on('set-ignore-mouse', (_event, ignore) => {
  win.setIgnoreMouseEvents(ignore, { forward: true })
})

// Renderer needs the window's current screen position to initialise posX
ipcMain.handle('get-window-pos', () => {
  return win ? win.getPosition() : [0, 0]
})

// Renderer tells us the canvas size after sprites load so we can resize the window to match
ipcMain.on('set-window-size', (_event, w, h) => {
  if (!win || win.isDestroyed()) return
  win.setSize(Math.round(w), Math.round(h))
})

// ─── Window ───────────────────────────────────────────────────────────────────

let win

function createWindow() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize

  // Serve cached sprite files over sprite:// so the renderer can use fetch()
  // and drawImage() without cross-origin file:// restrictions.
  // We read the file with fs rather than net.fetch to avoid file:// URL encoding issues.
  // sprite://cache/<dex>/<filename>   → sprite-cache    (hostname = "cache")
  // sprite://portrait/<dex>/<filename> → portrait-cache  (hostname = "portrait")
  protocol.handle('sprite', async (request) => {
    const parsed = new URL(request.url)
    const [, dexNumber, filename] = parsed.pathname.split('/')   // pathname = "/<dex>/<file>"
    const isPortrait = parsed.hostname === 'portrait'
    try {
      const localPath = isPortrait
        ? await fetchPortraitFile(dexNumber, filename)
        : await fetchSpriteFile(dexNumber, filename)
      const data = fs.readFileSync(localPath)
      const mime = filename.endsWith('.png') ? 'image/png' : 'text/xml; charset=utf-8'
      return new Response(data, { headers: { 'Content-Type': mime } })
    } catch (err) {
      console.error(`[sprite/${parsed.hostname}] ${dexNumber}/${filename}:`, err.message)
      return new Response(err.message, { status: 404 })
    }
  })

  win = new BrowserWindow({
    width: 160,
    height: 160,
    x: sw - 200,
    y: sh - 200,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  win.loadFile(path.join(__dirname, 'src', 'index.html'))

  // Start fully click-through; renderer re-enables on hover
  win.setIgnoreMouseEvents(true, { forward: true })

  // Forward renderer console.log/warn/error → terminal so you can see them with npm start
  const LEVEL = ['verbose', 'info', 'warning', 'error']
  win.webContents.on('console-message', (_e, level, message, line, source) => {
    console.log(`[renderer:${LEVEL[level] ?? level}] ${message}  (${source}:${line})`)
  })
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
