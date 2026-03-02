const { app, BrowserWindow, ipcMain, screen, protocol } = require('electron')
const path = require('path')
const fs = require('fs')
const https = require('https')

// Must register custom schemes before app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'sprite', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

// ─── Cache helpers ────────────────────────────────────────────────────────────

const CACHE_DIR = path.join(__dirname, 'sprite-cache')

function cachePath(dexNumber, filename) {
  return path.join(CACHE_DIR, dexNumber, filename)
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
    console.log(`[cache hit]  ${dexNumber}/${filename}`)
    return local
  }

  // PMDCollab sprites live directly under sprite/<dex>/ (no form subdirectory for base form)
  const url = `https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/sprite/${dexNumber}/${filename}`
  console.log(`[download]   ${url}`)
  console.log(`[cache dir]  ${path.dirname(local)}`)
  await downloadFile(url, local)
  console.log(`[saved]      ${local}`)
  return local
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

// Returns a sprite:// URL for the renderer (downloads and caches if needed)
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
  const [x, y] = win.getPosition()
  win.setPosition(Math.round(x + deltaX), Math.round(y + deltaY))
})

// Mouse pass-through toggle
ipcMain.on('set-ignore-mouse', (_event, ignore) => {
  win.setIgnoreMouseEvents(ignore, { forward: true })
})

// Renderer needs the window's current screen position to initialise posX
ipcMain.handle('get-window-pos', () => {
  return win ? win.getPosition() : [0, 0]
})

// ─── Window ───────────────────────────────────────────────────────────────────

let win

function createWindow() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize

  // Serve cached sprite files over sprite:// so the renderer can use fetch()
  // and drawImage() without cross-origin file:// restrictions.
  // We read the file with fs rather than net.fetch to avoid file:// URL encoding issues.
  protocol.handle('sprite', async (request) => {
    // URL is sprite://cache/<dexNumber>/<filename>
    // pathname = "/<dexNumber>/<filename>"
    const [, dexNumber, filename] = new URL(request.url).pathname.split('/')
    try {
      const localPath = await fetchSpriteFile(dexNumber, filename)
      const data = fs.readFileSync(localPath)
      const mime = filename.endsWith('.png') ? 'image/png' : 'text/xml; charset=utf-8'
      return new Response(data, { headers: { 'Content-Type': mime } })
    } catch (err) {
      console.error(`[sprite] ${dexNumber}/${filename}:`, err.message)
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
