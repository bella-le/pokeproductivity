import { hexToRgbLuminance } from '../shared/color.js'

// ─── Pomodoro overlay module ───────────────────────────────────────────────────
// Embedded inside the pet window so the timer moves with the sprite.
// Call initPomodoro(w, h, settings, callbacks) once after canvas is sized,
// then togglePomodoro() each time the context menu item is clicked.

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseInput(raw) {
  const str = raw.trim()
  if (!str) return null
  if (str.includes(':')) {
    const [m, s] = str.split(':').map(Number)
    if (!Number.isFinite(m) || !Number.isFinite(s)) return null
    return m * 60 + s
  }
  const mins = Number(str)
  if (!Number.isFinite(mins) || mins <= 0) return null
  return Math.round(mins * 60)
}

function fmt(secs) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// ─── State ────────────────────────────────────────────────────────────────────

let _total     = 0
let _remaining = 0
let _paused    = false
let _done      = false
let _interval  = null

// ─── Callbacks (set by initPomodoro) ──────────────────────────────────────────

let _onStart, _onPause, _onResume, _onStop, _onComplete

// ─── Elements (populated in initPomodoro) ─────────────────────────────────────

let _pom, _config, _running, _input, _countdown, _fill, _rlabel, _btnPause, _btnStop

// ─── Views ────────────────────────────────────────────────────────────────────

function showConfig() {
  _config.classList.remove('pom-hidden')
  _running.classList.add('pom-hidden')
}

function showRunning() {
  _config.classList.add('pom-hidden')
  _running.classList.remove('pom-hidden')
}

// ─── Timer ────────────────────────────────────────────────────────────────────

function updateDisplay() {
  _countdown.textContent = fmt(_remaining)
  _fill.style.width = `${_total > 0 ? (_remaining / _total) * 100 : 0}%`
}

function tick() {
  if (_paused || _done) return
  _remaining--
  updateDisplay()
  if (_remaining <= 0) {
    _remaining = 0
    _done = true
    clearInterval(_interval)
    _interval = null
    _countdown.textContent = 'Done!'
    _countdown.classList.add('done')
    _fill.classList.add('done')
    _fill.style.transition = 'none'
    _fill.style.width = '100%'
    _rlabel.textContent = 'Complete!'
    _btnPause.classList.add('pom-hidden')
    _btnStop.textContent = '↩ Reset'
    _btnStop.classList.remove('pom-btn-stop')
    _btnStop.classList.add('pom-btn-start')
    _onComplete()
  }
}

function startTimer(secs) {
  clearInterval(_interval)
  _total     = secs
  _remaining = secs
  _paused    = false
  _done      = false

  _countdown.classList.remove('done', 'paused')
  _fill.classList.remove('done')
  _fill.style.transition = 'width 1s linear'
  _rlabel.textContent    = 'Focus'
  _btnPause.classList.remove('pom-hidden')
  _btnPause.textContent  = '⏸'
  _btnStop.textContent   = '■'
  _btnStop.classList.remove('pom-btn-start')
  _btnStop.classList.add('pom-btn-stop')

  updateDisplay()
  showRunning()
  _interval = setInterval(tick, 1000)
  _onStart()
}

function resetTimer(wasAborted) {
  clearInterval(_interval)
  _interval = null
  _done     = false
  _paused   = false
  _countdown.classList.remove('done', 'paused')
  _fill.classList.remove('done')
  showConfig()
  if (wasAborted) _onStop()
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// True when the timer has been started and hasn't completed or been reset yet
function _isActive() { return !!_interval || _paused }

// ─── Public API ───────────────────────────────────────────────────────────────

export function initPomodoro(overlayW, overlayH, settings, callbacks = {}) {
  _onStart    = callbacks.onStart    ?? (() => {})
  _onPause    = callbacks.onPause    ?? (() => {})
  _onResume   = callbacks.onResume   ?? (() => {})
  _onStop     = callbacks.onStop     ?? (() => {})
  _onComplete = callbacks.onComplete ?? (() => {})

  _pom       = document.getElementById('pom')
  _config    = document.getElementById('pom-config')
  _running   = document.getElementById('pom-running')
  _input     = document.getElementById('pom-input')
  _countdown = document.getElementById('pom-countdown')
  _fill      = document.getElementById('pom-fill')
  _rlabel    = document.getElementById('pom-rlabel')
  _btnPause  = document.getElementById('pom-pause')
  _btnStop   = document.getElementById('pom-stop')

  // Size the overlay to cover the portrait zone
  _pom.style.width  = `${overlayW}px`
  _pom.style.height = `${overlayH}px`

  // Apply TASKS_COLOR to CSS vars on the overlay element
  const { r, g, b, fg } = hexToRgbLuminance(settings.TASKS_COLOR ?? '#060612')
  _pom.style.setProperty('--pr', r)
  _pom.style.setProperty('--pg', g)
  _pom.style.setProperty('--pb', b)
  _pom.style.setProperty('--fg', fg)

  // Mouse passthrough: enable pointer events on the overlay so buttons work
  _pom.addEventListener('mouseenter', () => window.electronAPI.setIgnoreMouse(false))
  _pom.addEventListener('mouseleave', () => { if (!_pom.classList.contains('pom-hidden')) window.electronAPI.setIgnoreMouse(true) })

  // Auto-format colon after 2 digits
  _input.addEventListener('input', () => {
    let v = _input.value.replace(/[^\d:]/g, '')
    if (v.length === 2 && !v.includes(':')) v += ':'
    _input.value = v
  })
  _input.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('pom-start').click() })

  document.getElementById('pom-start').addEventListener('click', () => {
    const secs = parseInput(_input.value)
    if (!secs || secs <= 0) {
      _input.style.borderColor = 'rgba(239,68,68,0.6)'
      _input.style.boxShadow   = '0 0 0 2px rgba(239,68,68,0.2)'
      setTimeout(() => { _input.style.borderColor = ''; _input.style.boxShadow = '' }, 800)
      return
    }
    startTimer(secs)
  })

  _btnPause.addEventListener('click', () => {
    if (_done) return
    _paused = !_paused
    _btnPause.textContent = _paused ? '▶' : '⏸'
    _countdown.classList.toggle('paused', _paused)
    if (_paused) _onPause()
    else         _onResume()
  })

  _btnStop.addEventListener('click', () => {
    resetTimer(_isActive())
  })

  // Close (×) button
  document.getElementById('pom-close').addEventListener('click', () => {
    resetTimer(_isActive())
    _pom.classList.add('pom-hidden')
  })
}

// Returns true while the pomodoro owns the pet's animation state
// (timer running, paused, or showing the Done/Hop state)
export function isPomodoroControlling() {
  if (!_pom || _pom.classList.contains('pom-hidden')) return false
  return !!_interval || _paused || _done
}

export function togglePomodoro() {
  _pom.classList.toggle('pom-hidden')
  if (!_pom.classList.contains('pom-hidden') && !_interval && !_done) {
    showConfig()
    _input.focus()
  }
}

export function startPomodoro(secs) {
  _pom.classList.remove('pom-hidden')
  startTimer(secs)
}
