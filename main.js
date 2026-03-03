const { app, BrowserWindow, ipcMain, screen, protocol, Menu } = require('electron')
const path = require('path')
const fs   = require('fs')

const { loadSettings, saveSettings, loadProgress, saveProgress, loadTasks, saveTasks } = require('./lib/storage')
const { fetchSpriteFile, fetchPortraitFile } = require('./lib/cache')

// Must register custom schemes before app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'sprite', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

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
    { label: 'Tasks',    click: () => { if (tasksWin && !tasksWin.isDestroyed()) { tasksWin.close(); return } openTasksWindow() } },
    { label: 'Pomodoro', click: () => { if (win && !win.isDestroyed()) win.webContents.send('show-pomodoro') } },
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
  const side    = settings.TASKS_SIDE   ?? 'right'
  const winW    = 250
  const winH    = Math.min(settings.TASKS_HEIGHT ?? 600, sh - 40)
  const x       = side === 'left' ? 16 : sw - winW - 16
  const rounded = settings.TASKS_ROUNDED ?? true
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
    roundedCorners: rounded,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })
  tasksWin.setMenu(null)
  tasksWin.loadFile(path.join(__dirname, 'src', 'tasks', 'tasks.html'), { query: { side, height: String(winH), rounded: String(rounded) } })
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
  settingsWin.loadFile(path.join(__dirname, 'src', 'settings', 'settings.html'))
  settingsWin.on('closed', () => { settingsWin = null })
}

// ─── Pet window ───────────────────────────────────────────────────────────────

let win

function createWindow() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize

  // sprite://cache/<dex>/<filename>    → sprite-cache    (hostname = "cache")
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

  win.loadFile(path.join(__dirname, 'src', 'pet', 'index.html'))
  win.setIgnoreMouseEvents(true, { forward: true })

  const LEVEL = ['verbose', 'info', 'warning', 'error']
  win.webContents.on('console-message', (_e, level, message, line, source) => {
    console.log(`[renderer:${LEVEL[level] ?? level}] ${message}  (${source}:${line})`)
  })
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
