import { cfg, WALK_SPEED, IDLE_CHANCE, Y_PAD,
         PORTRAIT_NAMES, PORTRAIT_SIZE, PORTRAIT_BORDER, PORTRAIT_GAP, INFO_PANEL_W } from './config.js'
import { loadPet, loadPortraits } from './loader.js'
import { init as initAnim, initPortraits, startAnim, stepAnim, drawFrame, setPortrait, setExpanded, setExp } from './animator.js'
import { initPomodoro, togglePomodoro } from './pomodoro.js'

// ─── Canvas ───────────────────────────────────────────────────────────────────

const canvas = document.getElementById('pet-canvas')
const ctx    = canvas.getContext('2d', { willReadFrequently: true })

// ─── Walk state ───────────────────────────────────────────────────────────────

let posX      = 0        // window's current X on screen (synced from main on boot)
let dirX      = 1        // +1 = right, -1 = left
let isWalking = true
let screenW   = window.screen.width

// ─── Drag state ───────────────────────────────────────────────────────────────

let isDragging = false
let dragStartX = 0
let dragStartY = 0

// ─── Expansion state ──────────────────────────────────────────────────────────

let isExpanded    = false
let _portraitZoneH = 0  // height of portrait box in px (set during boot) — used for click detection

// ─── Hover state ──────────────────────────────────────────────────────────────

let isOverOpaque = false  // true when cursor is over an opaque pixel (sprite or portrait)

// ─── Walk AI ──────────────────────────────────────────────────────────────────

function updateWalk() {
  if (isDragging || isExpanded || !isWalking) return

  const dx = dirX * WALK_SPEED
  posX += dx
  window.electronAPI.moveWindow(dx, 0)

  const WIN_W = canvas.width
  if (posX <= 0) {
    posX = 0; dirX = 1
  } else if (posX >= screenW - WIN_W) {
    posX = screenW - WIN_W; dirX = -1
  }

  // Occasionally stop to idle for a random 2–6 second pause
  if (!isExpanded && (Math.random() < IDLE_CHANCE)) {
    isWalking = false
    startAnim('Idle')
    const pauseFrames = Math.floor(Math.random() * 240) + 120
    setTimeout(() => { if (!isDragging && !isExpanded) { isWalking = true; startAnim('Walk') } }, pauseFrames * (1000 / 60))
  }
}

// ─── Input / drag ─────────────────────────────────────────────────────────────

canvas.addEventListener('contextmenu', () => {
  isDragging = false
  isWalking = false
  startAnim('Idle')
  setPortrait('Normal', false)
  window.electronAPI.setIgnoreMouse(true)
  window.electronAPI.showContextMenu()
})

canvas.addEventListener('mouseenter', () => {
  // Re-enable events so mousemove can do per-pixel hit-testing
  window.electronAPI.setIgnoreMouse(false)
})

canvas.addEventListener('mouseleave', () => {
  if (isDragging) return
  if (isOverOpaque) {
    isOverOpaque = false
    setPortrait('Normal', false)
    if (!isExpanded) {
      const pauseFrames = Math.floor(Math.random() * 240) + 120
      setTimeout(() => { if (!isDragging && !isExpanded) { isWalking = true; startAnim('Walk') } }, pauseFrames * (1000 / 60))
    }
  }
  window.electronAPI.setIgnoreMouse(true)
})

canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return

  // Click inside portrait/info zone → toggle expanded info panel
  if (e.offsetY < _portraitZoneH) {
    toggleExpansion()
    return
  }

  isDragging = true
  dragStartX = e.screenX
  dragStartY = e.screenY
  startAnim('Hurt')
  setPortrait('Dizzy', true)
})

window.addEventListener('mousemove', (e) => {
  if (!isDragging) return
  const dx = e.screenX - dragStartX
  const dy = e.screenY - dragStartY
  dragStartX = e.screenX
  dragStartY = e.screenY
  window.electronAPI.moveWindow(dx, dy)
})

window.addEventListener('mouseup', async () => {
  if (!isDragging) return
  isDragging = false
  const [wx] = await window.electronAPI.getWindowPos()
  posX = wx
  if (!isExpanded) {
    isWalking = true
    startAnim('Walk')
  }
  setPortrait('Normal', false)  // hide portrait; mouseenter will re-show if cursor stays over pet
  window.electronAPI.setIgnoreMouse(true)
})

// Hit-test + hover: drive enter/leave from per-pixel opacity, not canvas DOM bounds
canvas.addEventListener('mousemove', (e) => {
  if (isDragging) return
  try {
    const pixel  = ctx.getImageData(e.offsetX, e.offsetY, 1, 1).data
    const opaque = pixel[3] >= 10
    window.electronAPI.setIgnoreMouse(!opaque)

    if (opaque && !isOverOpaque) {
      isOverOpaque = true
      isWalking = false
      startAnim('Idle')
      setPortrait('Normal', true)
    } else if (!opaque && isOverOpaque) {
      isOverOpaque = false
      setPortrait('Normal', false)
      const pauseFrames = Math.floor(Math.random() * 240) + 120
      setTimeout(() => { if (!isDragging && !isExpanded) { isWalking = true; startAnim('Walk') } }, pauseFrames * (1000 / 60))
    }
  } catch {
    window.electronAPI.setIgnoreMouse(false)
  }
})

// ─── Expansion ────────────────────────────────────────────────────────────────

function toggleExpansion() {
  isExpanded = !isExpanded
  const portraitDisplayW = PORTRAIT_SIZE * cfg.PORTRAIT_SCALE + PORTRAIT_BORDER * 2
  setExpanded(isExpanded, portraitDisplayW)
  if (isExpanded) {
    isWalking = false
    startAnim('Idle')
  } else {
    isWalking = true
    startAnim('Walk')
  }
  // Canvas and window size never change — expansion is purely a drawing animation
}

// ─── Main loop ────────────────────────────────────────────────────────────────

function loop() {
  updateWalk()
  stepAnim()
  drawFrame(dirX)
  requestAnimationFrame(loop)
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

;(async () => {
  try {
    // Merge saved settings into cfg before anything reads from it
    const [saved, progress] = await Promise.all([
      window.electronAPI.getSettings(),
      window.electronAPI.getProgress(),
    ])
    Object.assign(cfg, saved)
    setExp(progress.exp ?? 0)

    const [winX] = await window.electronAPI.getWindowPos()
    posX = winX

    const [{ animations, sheets, shadowY }, portraits] = await Promise.all([
      loadPet(cfg.DEX),
      loadPortraits(cfg.DEX, PORTRAIT_NAMES),
    ])

    initAnim(canvas, ctx, animations, sheets, shadowY)
    initPortraits(portraits)

    // ── Canvas sizing ────────────────────────────────────────────────────────
    const sizedAnims  = ['Walk', 'Idle'].filter(n => animations[n])
    const maxGroundY  = Math.max(...sizedAnims.map(n => shadowY[n] ?? animations[n].frameHeight))
    const spriteAreaH = (maxGroundY + Y_PAD * 2) * cfg.SCALE

    const portraitDisplayW = PORTRAIT_SIZE * cfg.PORTRAIT_SCALE + PORTRAIT_BORDER * 2
    const portraitAreaH    = PORTRAIT_SIZE * cfg.PORTRAIT_SCALE + PORTRAIT_BORDER * 2 + PORTRAIT_GAP

    _portraitZoneH = portraitDisplayW  // portrait is square so height == width here

    // Canvas is pre-sized to the full expanded width so no resize is needed during animation
    canvas.width  = portraitDisplayW + INFO_PANEL_W
    canvas.height = portraitAreaH + spriteAreaH
    ctx.imageSmoothingEnabled = false

    // Prime animator with collapsed state so portrait centers correctly over the sprite
    setExpanded(false, portraitDisplayW)

    window.electronAPI.setWindowSize(canvas.width, canvas.height)
    window.electronAPI.moveWindow(0, -portraitAreaH)

    // Pomodoro overlay — covers the portrait zone
    initPomodoro(canvas.width, portraitAreaH, saved)
    window.electronAPI.onShowPomodoro(togglePomodoro)

    startAnim('Walk')
    loop()
  } catch (err) {
    console.error('Failed to load Pokémon sprites:', err)
    canvas.width  = 40
    canvas.height = 40
    ctx.fillStyle = 'red'
    ctx.fillRect(0, 0, 40, 40)
  }
})()
