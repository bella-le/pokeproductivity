import { hexToRgbLuminance } from '../shared/color.js'

// ─── Type palette ─────────────────────────────────────────────────────────────

let _isLight = false   // set after settings load, before render()

const TYPE_COLORS = {
  Todo:      {
    dark:  { bg: 'rgba(59,130,246,0.22)',  border: 'rgba(59,130,246,0.45)',  text: '#93c5fd' },
    light: { bg: 'rgba(37,99,235,0.12)',   border: 'rgba(37,99,235,0.35)',   text: '#1d4ed8' },
  },
  Habit:     {
    dark:  { bg: 'rgba(16,185,129,0.22)',  border: 'rgba(16,185,129,0.45)',  text: '#6ee7b7' },
    light: { bg: 'rgba(4,120,87,0.12)',    border: 'rgba(4,120,87,0.35)',    text: '#047857' },
  },
  Daily:     {
    dark:  { bg: 'rgba(245,158,11,0.22)',  border: 'rgba(245,158,11,0.45)',  text: '#fcd34d' },
    light: { bg: 'rgba(180,83,9,0.12)',    border: 'rgba(180,83,9,0.35)',    text: '#b45309' },
  },
  Weekly:     {
    dark:  { bg: 'rgba(139,92,246,0.22)',  border: 'rgba(139,92,246,0.45)',  text: '#c4b5fd' },
    light: { bg: 'rgba(109,40,217,0.12)',  border: 'rgba(109,40,217,0.35)',  text: '#6d28d9' },
  },
  Monthly: {
    dark:  { bg: 'rgba(239,68,68,0.22)',   border: 'rgba(239,68,68,0.45)',   text: '#fca5a5' },
    light: { bg: 'rgba(185,28,28,0.12)',   border: 'rgba(185,28,28,0.35)',   text: '#b91c1c' },
  },
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

const CHECKMARK_SVG = `<svg width="8" height="8" viewBox="0 0 11 11" fill="none">
  <polyline points="1,5.5 4,8.5 10,2.5"
    stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

// SVG arc progress ring for repeating tasks — avoids conic-gradient anti-aliasing artifacts
const ARC_R    = 7
const ARC_CIRC = +(2 * Math.PI * ARC_R).toFixed(3)  // 43.982

function makeTimesArcSVG(pct) {
  const offset = +(ARC_CIRC * (1 - pct)).toFixed(3)
  return `<svg class="tick-svg" width="18" height="18" viewBox="0 0 18 18" fill="none">
  <circle cx="9" cy="9" r="${ARC_R}" stroke-width="2" class="arc-track"/>
  <circle cx="9" cy="9" r="${ARC_R}" stroke="#4ade80" stroke-width="2"
    stroke-dasharray="${ARC_CIRC}" stroke-dashoffset="${offset}"
    stroke-linecap="round" transform="rotate(-90 9 9)" class="arc-fill"/>
  <polyline points="4.5,9.5 7.5,12.5 13.5,5.5" stroke="#fff" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round" class="arc-check"/>
</svg>`
}

function buildCard(task) {
  const palette = TYPE_COLORS[task.type] ?? TYPE_COLORS.Todo
  const col     = _isLight ? palette.light : palette.dark
  const card = document.createElement('div')
  card.className  = 'task-card'
  card.dataset.id = task.id
  card.addEventListener('contextmenu', e => {
    e.preventDefault()
    e.stopPropagation()
    showCtxMenu(e.clientX, e.clientY, task.id, card)
  })

  // Times counter element declared early so the tick closure can reference it
  let countEl = null
  if (task.times) {
    countEl = document.createElement('span')
    countEl.className   = 'times-count'
    countEl.textContent = `${task.progress ?? 0}/${task.times}`
  }

  // Circular tick — SVG arc progress for repeating tasks, checkmark otherwise
  const tick = document.createElement('button')
  tick.className = 'tick'
  tick.setAttribute('aria-label', 'Mark complete')

  if (task.times) {
    tick.classList.add('tick-times')
    tick.innerHTML = makeTimesArcSVG((task.progress ?? 0) / task.times)
    tick.addEventListener('click', () => incrementTask(task.id, card, tick, countEl))
  } else {
    tick.innerHTML = CHECKMARK_SVG
    tick.addEventListener('click', () => completeTask(task.id, card))
  }

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

  if (countEl) meta.appendChild(countEl)

  // Duration button — starts a pomodoro at the specified duration
  if (task.duration) {
    const durBtn = document.createElement('button')
    durBtn.className   = 'duration-btn'
    durBtn.textContent = `⏱ ${task.duration}m`
    durBtn.setAttribute('aria-label', `Start ${task.duration} minute pomodoro`)
    durBtn.addEventListener('click', () => window.electronAPI.startPomodoro(task.duration * 60))
    meta.appendChild(durBtn)
  }

  body.append(titleEl, meta)
  card.append(tick, body)
  return card
}

// ─── Task completion ──────────────────────────────────────────────────────────

const RECURRING = new Set(['Habit', 'Daily', 'Weekly', 'Monthly'])

function nextStartDate(type) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  if (type === 'Habit' || type === 'Daily') d.setDate(d.getDate() + 1)
  else if (type === 'Weekly')               d.setDate(d.getDate() + 7)
  else if (type === 'Monthly')              d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 10)
}

let _tasks = []

async function completeTask(id, card) {
  // 1. Fill the tick + notify pet to celebrate
  card.querySelector('.tick').classList.add('checked')
  window.electronAPI.taskComplete()
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

  // 4. Persist + spawn next recurrence for recurring types
  const done = _tasks.find(t => t.id === id)
  _tasks = _tasks.map(t => t.id === id ? { ...t, completed: true } : t)
  if (done && RECURRING.has(done.type)) {
    _tasks.push({
      ...done,
      id:        Math.max(0, ..._tasks.map(t => t.id)) + 1,
      completed: false,
      progress:  0,
      startDate: nextStartDate(done.type),
    })
  }
  window.electronAPI.saveTasks(_tasks)

  // 5. Award 1 EXP to the pet
  const prog = await window.electronAPI.getProgress()
  window.electronAPI.saveProgress({ exp: (prog.exp ?? 0) + 1 })

  // 6. Empty state
  if (!document.querySelector('.task-card')) showEmpty()
}

// ─── Repeating task increment ─────────────────────────────────────────────────

async function incrementTask(id, card, tickEl, countEl) {
  const idx = _tasks.findIndex(t => t.id === id)
  if (idx === -1) return
  const task = _tasks[idx]
  const newProgress = (task.progress ?? 0) + 1
  _tasks[idx] = { ...task, progress: newProgress }

  if (newProgress >= task.times) {
    // Final increment — run the normal completion animation
    completeTask(id, card)
  } else {
    const arcFill = tickEl.querySelector('.arc-fill')
    if (arcFill) arcFill.style.strokeDashoffset = +(ARC_CIRC * (1 - newProgress / task.times)).toFixed(3)
    if (countEl) countEl.textContent = `${newProgress}/${task.times}`
    window.electronAPI.saveTasks(_tasks)
  }
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
  const today  = new Date(); today.setHours(0, 0, 0, 0)
  const active = _tasks.filter(t => {
    if (t.completed) return false
    if (t.startDate && new Date(t.startDate + 'T00:00:00') > today) return false
    return true
  })
  if (active.length === 0) { showEmpty(); return }
  for (const t of active) list.appendChild(buildCard(t))
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

// Apply side + rounded from URL query params set by main process
const _params  = new URLSearchParams(window.location.search)
const _side    = _params.get('side') ?? 'right'
const _rounded = _params.get('rounded') !== 'false'
document.body.dataset.side = _side
if (_rounded) document.querySelector('.shell').classList.add('rounded')

// Apply panel color from settings
;(async () => {
  const settings = await window.electronAPI.getSettings()
  const { r, g, b, luminance, fg } = hexToRgbLuminance(settings.TASKS_COLOR ?? '#060612')
  _isLight = luminance > 0.4
  const root = document.documentElement
  root.style.setProperty('--pr', r)
  root.style.setProperty('--pg', g)
  root.style.setProperty('--pb', b)
  root.style.setProperty('--fg', fg)
  // Due label shadow: dark drop shadow on light backgrounds so colored labels stay readable
  root.style.setProperty('--due-shadow', _isLight ? '0 1px 3px rgba(0,0,0,0.45)' : 'none')
  // Render after colors are resolved so badge palette is correct
  render()
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
  const h = parseInt(_params.get('height') ?? '600', 10)
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

// ─── Add / Edit Task form ─────────────────────────────────────────────────────

let _editingId = null
const _addBtn  = document.getElementById('add-task-btn')
const _addForm = document.getElementById('add-form')
const _afTitle = document.getElementById('af-title')
const _afType  = document.getElementById('af-type')
const _afDue   = document.getElementById('af-due')
const _afStart = document.getElementById('af-start')
const _afDur   = document.getElementById('af-duration')
const _afTimes = document.getElementById('af-times')

const _afSubmit = document.getElementById('af-submit')

function toggleAddForm(forceClose = false) {
  const willOpen = forceClose ? false : !_addForm.classList.contains('open')
  _addForm.classList.toggle('open', willOpen)
  _addBtn.classList.toggle('open', willOpen)
  _addBtn.querySelector('.add-label').textContent = willOpen ? ' Cancel' : ' Add Task'
  if (!willOpen && _editingId !== null) {
    _editingId = null
    _afSubmit.textContent = 'Add Task'
  }
  if (willOpen) _afTitle.focus()
}

function openEditForm(task) {
  _editingId     = task.id
  _afTitle.value = task.title
  _afType.value  = task.type
  _afDue.value   = task.dueDate   ?? ''
  _afStart.value = task.startDate ?? ''
  _afDur.value   = task.duration  ?? ''
  _afTimes.value = task.times     ?? ''
  _afSubmit.textContent = 'Save Changes'
  _addForm.classList.add('open')
  _addBtn.classList.add('open')
  _addBtn.querySelector('.add-label').textContent = ' Cancel'
  _afTitle.focus()
  _addForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

_addBtn.addEventListener('click', () => toggleAddForm())

_afTitle.addEventListener('keydown', e => {
  if (e.key === 'Enter')  document.getElementById('af-submit').click()
  if (e.key === 'Escape') toggleAddForm(true)
})

document.getElementById('af-submit').addEventListener('click', () => {
  const title = _afTitle.value.trim()
  if (!title) {
    _afTitle.style.borderColor = 'rgba(239,68,68,0.6)'
    _afTitle.style.boxShadow   = '0 0 0 2px rgba(239,68,68,0.2)'
    setTimeout(() => { _afTitle.style.borderColor = ''; _afTitle.style.boxShadow = '' }, 800)
    _afTitle.focus()
    return
  }

  const dur   = parseInt(_afDur.value,   10)
  const times = parseInt(_afTimes.value, 10)
  const list  = document.getElementById('task-list')

  if (_editingId !== null) {
    // ── Edit mode: update existing task ──────────────────────────────────────
    const idx = _tasks.findIndex(t => t.id === _editingId)
    if (idx !== -1) {
      const updated = {
        ..._tasks[idx],
        title,
        type:      _afType.value,
        dueDate:   _afDue.value   || null,
        startDate: _afStart.value || null,
      }
      if (dur   > 0) updated.duration = dur;  else delete updated.duration
      if (times > 1) updated.times    = times; else delete updated.times
      _tasks[idx] = updated
      window.electronAPI.saveTasks(_tasks)
      const oldCard = list.querySelector(`.task-card[data-id="${_editingId}"]`)
      if (oldCard) {
        const newCard = buildCard(updated)
        // Fade old card out, then swap and animate new card in
        oldCard.style.transition = 'opacity 0.15s ease, transform 0.15s ease'
        oldCard.style.opacity    = '0'
        oldCard.style.transform  = 'scale(0.98)'
        setTimeout(() => { oldCard.replaceWith(newCard); animateCardIn(newCard) }, 160)
      }
    }
  } else {
    // ── Add mode: create new task ─────────────────────────────────────────────
    const task = {
      id:        Math.max(0, ..._tasks.map(t => t.id)) + 1,
      title,
      type:      _afType.value,
      dueDate:   _afDue.value   || null,
      startDate: _afStart.value || null,
      completed: false,
      ...(dur   > 0 && { duration: dur }),
      ...(times > 1 && { times         }),
    }
    _tasks.push(task)
    window.electronAPI.saveTasks(_tasks)
    const empty = list.querySelector('.empty')
    if (empty) empty.remove()
    list.prepend(buildCard(task))
  }

  // Reset form fields and close
  _afTitle.value = ''
  _afDue.value   = ''
  _afStart.value = ''
  _afDur.value   = ''
  _afTimes.value = ''
  _afType.value  = 'Todo'
  toggleAddForm(true)
})

updateCollapseBtn()

// ─── Duplicate / Delete ───────────────────────────────────────────────────────

// Fade + slide a card in from a slightly-scaled, offset state
function animateCardIn(card) {
  card.style.transition = 'none'
  card.style.opacity    = '0'
  card.style.transform  = 'scale(0.97) translateY(-5px)'
  card.offsetHeight                    // force reflow before enabling transition
  card.style.transition = ''
  card.style.opacity    = ''
  card.style.transform  = ''
}

function duplicateTask(id) {
  const orig = _tasks.find(t => t.id === id)
  if (!orig) return
  const copy = { ...orig, id: Math.max(0, ..._tasks.map(t => t.id)) + 1, completed: false, progress: 0 }
  _tasks.push(copy)
  window.electronAPI.saveTasks(_tasks)
  const list     = document.getElementById('task-list')
  const origCard = list.querySelector(`.task-card[data-id="${id}"]`)
  const newCard  = buildCard(copy)
  if (origCard) origCard.after(newCard)
  else          list.prepend(newCard)
  animateCardIn(newCard)
}

async function deleteTask(id, card) {
  // Brief red flash to distinguish delete from task completion
  card.style.boxShadow = 'inset 0 0 0 1.5px rgba(239,68,68,0.55)'
  await new Promise(r => setTimeout(r, 130))
  card.style.boxShadow = ''
  card.classList.add('completing')
  await new Promise(r => setTimeout(r, 460))
  const h = card.offsetHeight
  card.style.cssText += `height:${h}px; overflow:hidden; transition:height 0.22s ease, margin 0.22s ease, padding 0.22s ease;`
  card.offsetHeight
  card.style.height = card.style.paddingTop = card.style.paddingBottom = card.style.marginTop = '0'
  await new Promise(r => setTimeout(r, 230))
  card.remove()
  _tasks = _tasks.filter(t => t.id !== id)
  window.electronAPI.saveTasks(_tasks)
  if (!document.querySelector('.task-card')) showEmpty()
}

// ─── Context menu ─────────────────────────────────────────────────────────────

const _ctxMenu = document.getElementById('ctx-menu')
let _ctxId   = null
let _ctxCard = null

function showCtxMenu(x, y, taskId, card) {
  _ctxId   = taskId
  _ctxCard = card
  // offsetWidth/Height are unaffected by CSS transform:scale — use them to clamp
  // before making the menu visible so it never appears partially off-screen
  const w = _ctxMenu.offsetWidth
  const h = _ctxMenu.offsetHeight
  _ctxMenu.style.left = `${Math.max(4, Math.min(x, window.innerWidth  - w - 4))}px`
  _ctxMenu.style.top  = `${Math.max(4, Math.min(y, window.innerHeight - h - 4))}px`
  _ctxMenu.classList.add('visible')
}

function hideCtxMenu() { _ctxMenu.classList.remove('visible') }

document.getElementById('ctx-edit').addEventListener('click', () => {
  const task = _tasks.find(t => t.id === _ctxId)
  hideCtxMenu()
  if (task) openEditForm(task)
})

document.getElementById('ctx-duplicate').addEventListener('click', () => {
  const id = _ctxId; hideCtxMenu(); duplicateTask(id)
})

document.getElementById('ctx-delete').addEventListener('click', () => {
  const id = _ctxId; const card = _ctxCard; hideCtxMenu(); deleteTask(id, card)
})

document.addEventListener('click', hideCtxMenu)
document.addEventListener('contextmenu', e => { if (!e.target.closest('.task-card')) hideCtxMenu() })
