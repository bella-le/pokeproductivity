// ─── Type palette ─────────────────────────────────────────────────────────────

const TYPE_COLORS = {
  Todo:      { bg: 'rgba(59,130,246,0.22)',  border: 'rgba(59,130,246,0.45)',  text: '#93c5fd' },
  Habit:     { bg: 'rgba(16,185,129,0.22)',  border: 'rgba(16,185,129,0.45)',  text: '#6ee7b7' },
  Daily:     { bg: 'rgba(245,158,11,0.22)',  border: 'rgba(245,158,11,0.45)',  text: '#fcd34d' },
  Quest:     { bg: 'rgba(139,92,246,0.22)',  border: 'rgba(139,92,246,0.45)',  text: '#c4b5fd' },
  Challenge: { bg: 'rgba(239,68,68,0.22)',   border: 'rgba(239,68,68,0.45)',   text: '#fca5a5' },
}

// ─── Due-date helper ──────────────────────────────────────────────────────────

function dueMeta(dateStr) {
  if (!dateStr) return null
  const due   = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.round((due - today) / 86_400_000)
  if (days < 0)   return { label: 'Overdue',                                                        cls: 'over'  }
  if (days === 0) return { label: 'Today',                                                          cls: 'today' }
  if (days === 1) return { label: 'Tomorrow',                                                       cls: 'soon'  }
  if (days <= 6)  return { label: `${days} days`,                                                   cls: 'soon'  }
  return { label: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), cls: '' }
}

// ─── Build a task card element ────────────────────────────────────────────────

function buildCard(task) {
  const col  = TYPE_COLORS[task.type] ?? TYPE_COLORS.Todo
  const card = document.createElement('div')
  card.className  = 'task-card'
  card.dataset.id = task.id

  // Circular tick
  const tick = document.createElement('button')
  tick.className = 'tick'
  tick.setAttribute('aria-label', 'Mark complete')
  tick.innerHTML = `<svg width="8" height="8" viewBox="0 0 11 11" fill="none">
    <polyline points="1,5.5 4,8.5 10,2.5"
      stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`
  tick.addEventListener('click', () => completeTask(task.id, card))

  // Body
  const body     = document.createElement('div')
  body.className = 'task-body'

  const titleEl       = document.createElement('div')
  titleEl.className   = 'task-title'
  titleEl.textContent = task.title

  const meta     = document.createElement('div')
  meta.className = 'task-meta'

  const badge       = document.createElement('span')
  badge.className   = 'type-badge'
  badge.textContent = task.type
  badge.style.cssText = `background:${col.bg}; border:1px solid ${col.border}; color:${col.text};`
  meta.appendChild(badge)

  const dm = dueMeta(task.dueDate)
  if (dm) {
    const due       = document.createElement('span')
    due.className   = `due-label ${dm.cls}`.trim()
    due.textContent = dm.label
    meta.appendChild(due)
  }

  body.append(titleEl, meta)
  card.append(tick, body)
  return card
}

// ─── Task completion ──────────────────────────────────────────────────────────

let _tasks = []

async function completeTask(id, card) {
  // 1. Fill the tick
  card.querySelector('.tick').classList.add('checked')
  await new Promise(r => setTimeout(r, 300))

  // 2. Slide-fade out
  card.classList.add('completing')
  await new Promise(r => setTimeout(r, 460))

  // 3. Collapse height so remaining cards close the gap
  const h = card.offsetHeight
  card.style.cssText += `height:${h}px; overflow:hidden; transition:height 0.22s ease, margin 0.22s ease, padding 0.22s ease;`
  card.offsetHeight // force reflow
  card.style.height = card.style.paddingTop = card.style.paddingBottom = card.style.marginTop = '0'
  await new Promise(r => setTimeout(r, 230))
  card.remove()

  // 4. Persist
  _tasks = _tasks.map(t => t.id === id ? { ...t, completed: true } : t)
  window.electronAPI.saveTasks(_tasks)

  // 5. Award 1 EXP to the pet
  const prog = await window.electronAPI.getProgress()
  window.electronAPI.saveProgress({ exp: (prog.exp ?? 0) + 1 })

  // 6. Empty state
  if (!document.querySelector('.task-card')) showEmpty()
}

// ─── Render ───────────────────────────────────────────────────────────────────

function showEmpty() {
  document.getElementById('task-list').innerHTML =
    '<div class="empty">All tasks complete!<br/>Your Pokémon is proud of you.</div>'
}

async function render() {
  try {
    _tasks = await window.electronAPI.getTasks()
  } catch {
    // fallback — should not happen since preload always exposes the API
    _tasks = []
  }

  const list   = document.getElementById('task-list')
  list.innerHTML = ''
  const active = _tasks.filter(t => !t.completed)
  if (active.length === 0) { showEmpty(); return }
  for (const t of active) list.appendChild(buildCard(t))
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

// Apply side from URL query param (?side=left|right) set by main process
const _side = new URLSearchParams(window.location.search).get('side') ?? 'right'
document.body.dataset.side = _side

// Apply panel color from settings
;(async () => {
  const settings = await window.electronAPI.getSettings()
  const hex = settings.TASKS_COLOR ?? '#060612'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const root = document.documentElement
  root.style.setProperty('--pr', r)
  root.style.setProperty('--pg', g)
  root.style.setProperty('--pb', b)
  // Perceived luminance — flip to black text on light backgrounds
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  root.style.setProperty('--fg', luminance > 0.4 ? 0 : 255)
})()

// ─── Collapse / expand ────────────────────────────────────────────────────────

let _collapsed  = false
let _animating  = false
const _collapseBtn = document.getElementById('collapse')
const _taskList    = document.getElementById('task-list')
const _shell       = document.querySelector('.shell')

// Titlebar height in px (shell padding-top + titlebar line-height + gap)
const HEADER_H = 52

function updateCollapseBtn() {
  _collapseBtn.textContent = _collapsed ? '▲' : '▼'
}

function configuredHeight() {
  const h = parseInt(new URLSearchParams(window.location.search).get('height') ?? '600', 10)
  return Math.min(h, screen.height - 40)
}

// Set shell to its full height so CSS transitions work in px→px
_shell.style.height = `${configuredHeight()}px`

_collapseBtn.addEventListener('click', async () => {
  if (_animating) return
  _animating = true
  _collapsed = !_collapsed
  updateCollapseBtn()

  if (_collapsed) {
    // 1. Fade content out while shell shrinks simultaneously
    _taskList.classList.add('collapsing')
    _shell.style.height = `${HEADER_H}px`
    // 2. After CSS transition (280ms), resize the window to match
    await new Promise(r => setTimeout(r, 300))
    window.electronAPI.resizeTasksWindow(HEADER_H)
  } else {
    // 1. Expand window so shell has room to grow into
    window.electronAPI.resizeTasksWindow(configuredHeight())
    // 2. Brief delay for the OS to resize the window
    await new Promise(r => setTimeout(r, 60))
    // 3. Animate shell back up
    _shell.style.height = `${configuredHeight()}px`
    // 4. Fade content in mid-stretch
    await new Promise(r => setTimeout(r, 80))
    _taskList.classList.remove('collapsing')
  }

  _animating = false
})

updateCollapseBtn()
render()
