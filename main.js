const { app, BrowserWindow, ipcMain, screen, protocol, Menu } = require('electron')
const path = require('path')
const fs = require('fs')
const https = require('https')

// Must register custom schemes before app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'sprite', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

// ─── Settings ─────────────────────────────────────────────────────────────────

const DEFAULTS_FILE      = path.join(__dirname, 'settings.json')         // shipped defaults
const USER_SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json')  // user-saved cache

const DEFAULT_SETTINGS = {
  DEX:                   '0025',
  NICKNAME:              'Buddy',
  SCALE:                 2,
  PORTRAIT_SCALE:        1.5,
  PORTRAIT_BORDER_COLOR: '#ffffff',
  TASKS_SIDE:            'right',
  TASKS_HEIGHT:          600,
  TASKS_COLOR:           '#060612',
}

function loadSettings() {
  // Prefer user-saved settings; fall back to shipped defaults file, then hardcoded defaults
  for (const file of [USER_SETTINGS_FILE, DEFAULTS_FILE]) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'))
      return { ...DEFAULT_SETTINGS, ...data }
    } catch { /* try next */ }
  }
  return { ...DEFAULT_SETTINGS }
}

function saveSettings(data) {
  fs.mkdirSync(path.dirname(USER_SETTINGS_FILE), { recursive: true })
  fs.writeFileSync(USER_SETTINGS_FILE, JSON.stringify(data, null, 2))
}

// ─── Progress ─────────────────────────────────────────────────────────────────

const PROGRESS_FILE = path.join(app.getPath('userData'), 'progress.json')

function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'))
  } catch {
    return { exp: 0 }
  }
}

function saveProgress(data) {
  fs.mkdirSync(path.dirname(PROGRESS_FILE), { recursive: true })
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2))
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

const TASKS_FILE = path.join(app.getPath('userData'), 'tasks.json')

const DEFAULT_TASKS = [
  { id: 1, title: 'Morning meditation',        type: 'Habit',     dueDate: null,         completed: false },
  { id: 2, title: 'Submit project proposal',   type: 'Todo',      dueDate: '2026-03-04', completed: false },
  { id: 3, title: 'Read for 30 minutes',       type: 'Daily',     dueDate: null,         completed: false },
  { id: 4, title: 'Defeat the dungeon boss',   type: 'Challenge', dueDate: '2026-03-07', completed: false },
  { id: 5, title: 'Drink 8 glasses of water',  type: 'Daily',     dueDate: null,         completed: false },
  { id: 6, title: 'Explore a new framework',   type: 'Quest',     dueDate: '2026-03-15', completed: false },
]

function loadTasks() {
  try {
    return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'))
  } catch {
    return [...DEFAULT_TASKS]
  }
}

function saveTasks(tasks) {
  fs.mkdirSync(path.dirname(TASKS_FILE), { recursive: true })
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2))
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

const CACHE_DIR          = path.join(app.getPath('userData'), 'sprite-cache')
const PORTRAIT_CACHE_DIR = path.join(app.getPath('userData'), 'portrait-cache')

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

ipcMain.handle('get-portrait-file', async (_event, dexNumber, filename) => {
  try {
    await fetchPortraitFile(dexNumber, filename)
    return { ok: true, url: `sprite://portrait/${dexNumber}/${filename}` }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('get-sprite-file', async (_event, dexNumber, filename) => {
  try {
    await fetchSpriteFile(dexNumber, filename)
    return { ok: true, url: `sprite://cache/${dexNumber}/${filename}` }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// Drag / auto-walk: move window by a pixel delta
ipcMain.on('move-window', (_event, deltaX, deltaY) => {
  if (!win || win.isDestroyed()) return
  const { width: sw } = screen.getPrimaryDisplay().workAreaSize
  const { height: fullH } = screen.getPrimaryDisplay().bounds
  const [winW] = win.getSize()
  const [x, y] = win.getPosition()
  const nx = Math.round(Math.max(0, Math.min(sw - winW, x + deltaX)))
  const ny = Math.round(Math.max(0, Math.min(fullH, y + deltaY)))
  if (Number.isFinite(nx) && Number.isFinite(ny)) win.setPosition(nx, ny)
})

ipcMain.on('set-ignore-mouse', (_event, ignore) => {
  win.setIgnoreMouseEvents(ignore, { forward: true })
})

ipcMain.handle('get-window-pos', () => {
  return win ? win.getPosition() : [0, 0]
})

ipcMain.on('set-window-size', (_event, w, h) => {
  if (!win || win.isDestroyed()) return
  win.setSize(Math.round(w), Math.round(h))
})

ipcMain.on('resize-tasks-window', (_event, h) => {
  if (!tasksWin || tasksWin.isDestroyed()) return
  const [w] = tasksWin.getSize()
  tasksWin.setSize(w, Math.round(h))
})

ipcMain.handle('get-settings', () => loadSettings())

ipcMain.handle('get-progress', () => loadProgress())
ipcMain.on('save-progress', (_event, data) => saveProgress(data))

ipcMain.handle('get-tasks', () => loadTasks())
ipcMain.on('save-tasks', (_event, tasks) => saveTasks(tasks))

ipcMain.on('save-settings', (_event, data) => {
  saveSettings(data)
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.close()
  const wasTasksOpen = tasksWin && !tasksWin.isDestroyed()
  if (wasTasksOpen) tasksWin.close()
  if (win && !win.isDestroyed()) win.reload()
  if (wasTasksOpen) openTasksWindow()
})

ipcMain.on('show-context-menu', () => {
  const menu = Menu.buildFromTemplate([
    { label: 'Tasks',    click: openTasksWindow    },
    { label: 'Settings', click: openSettingsWindow },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ])
  menu.popup({ window: win })
})

// ─── Tasks window ─────────────────────────────────────────────────────────────

let tasksWin = null

function openTasksWindow() {
  if (tasksWin && !tasksWin.isDestroyed()) { tasksWin.focus(); return }
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
  const settings = loadSettings()
  const side     = settings.TASKS_SIDE   ?? 'right'
  const winW     = 250
  const winH     = Math.min(settings.TASKS_HEIGHT ?? 600, sh - 40)
  const x        = side === 'left' ? 16 : sw - winW - 16
  tasksWin = new BrowserWindow({
    width: winW,
    height: winH,
    x,
    y: 20,
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
  tasksWin.setMenu(null)
  tasksWin.loadFile(path.join(__dirname, 'src', 'tasks.html'), { query: { side, height: String(winH) } })
  tasksWin.on('closed', () => { tasksWin = null })
}

// ─── Settings window ──────────────────────────────────────────────────────────

let settingsWin = null

function openSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.focus(); return }
  settingsWin = new BrowserWindow({
    width: 460,
    height: 360,
    title: 'Settings',
    resizable: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })
  settingsWin.setMenu(null)
  settingsWin.loadFile(path.join(__dirname, 'src', 'settings.html'))
  settingsWin.on('closed', () => { settingsWin = null })
}

// ─── Pet window ───────────────────────────────────────────────────────────────

let win

function createWindow() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize

  // sprite://cache/<dex>/<filename>   → sprite-cache    (hostname = "cache")
  // sprite://portrait/<dex>/<filename> → portrait-cache  (hostname = "portrait")
  protocol.handle('sprite', async (request) => {
    const parsed = new URL(request.url)
    const [, dexNumber, filename] = parsed.pathname.split('/')
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
  win.setIgnoreMouseEvents(true, { forward: true })

  const LEVEL = ['verbose', 'info', 'warning', 'error']
  win.webContents.on('console-message', (_e, level, message, line, source) => {
    console.log(`[renderer:${LEVEL[level] ?? level}] ${message}  (${source}:${line})`)
  })
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
