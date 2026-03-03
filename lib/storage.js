const path = require('path')
const fs   = require('fs')
const { app } = require('electron')

// ─── Settings ─────────────────────────────────────────────────────────────────

const DEFAULTS_FILE      = path.join(__dirname, '..', 'settings.json')         // shipped defaults
const USER_SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json') // user-saved cache

const DEFAULT_SETTINGS = {
  DEX:                   '0025',
  NICKNAME:              'Buddy',
  SCALE:                 2,
  PORTRAIT_SCALE:        1.5,
  PORTRAIT_BORDER_COLOR: '#ffffff',
  TASKS_SIDE:            'right',
  TASKS_HEIGHT:          600,
  TASKS_COLOR:           '#060612',
  TASKS_ROUNDED:         true,
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

module.exports = { loadSettings, saveSettings, loadProgress, saveProgress, loadTasks, saveTasks }
