import { cfg, WALK_SPEED, IDLE_CHANCE, Y_PAD,
         PORTRAIT_NAMES, PORTRAIT_SIZE, PORTRAIT_BORDER, PORTRAIT_GAP } from './config.js'
import { loadPet, loadPortraits } from './loader.js'
import { init as initAnim, initPortraits, startAnim, stepAnim, drawFrame, setPortrait } from './animator.js'

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

// ─── Walk AI ──────────────────────────────────────────────────────────────────

function updateWalk() {
  if (isDragging || !isWalking) return

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
  if (Math.random() < IDLE_CHANCE) {
    isWalking = false
    startAnim('Idle')
    const pauseFrames = Math.floor(Math.random() * 240) + 120
    setTimeout(() => { isWalking = true; startAnim('Walk') }, pauseFrames * (1000 / 60))
  }
}

// ─── Input / drag ─────────────────────────────────────────────────────────────

canvas.addEventListener('contextmenu', () => {
  window.electronAPI.showContextMenu()
})

canvas.addEventListener('mouseenter', () => {
  window.electronAPI.setIgnoreMouse(false)
  if (!isDragging) {
    isWalking = false
    startAnim('Idle')
    setPortrait('Normal', true)
  }
})

canvas.addEventListener('mouseleave', () => {
  if (!isDragging) {
    window.electronAPI.setIgnoreMouse(true)
    isWalking = true
    startAnim('Walk')
    setPortrait('Normal', false)
  }
})

canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return  // only left-click starts drag
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
  isWalking = true
  startAnim('Walk')
  setPortrait('Normal', false)  // hide portrait; mouseenter will re-show if cursor stays over pet
  window.electronAPI.setIgnoreMouse(true)
})

// Hit-test: only intercept mouse over opaque pixels
canvas.addEventListener('mousemove', (e) => {
  if (isDragging) return
  try {
    const pixel = ctx.getImageData(e.offsetX, e.offsetY, 1, 1).data
    window.electronAPI.setIgnoreMouse(pixel[3] < 10)
  } catch {
    window.electronAPI.setIgnoreMouse(false)
  }
})

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
    const saved = await window.electronAPI.getSettings()
    Object.assign(cfg, saved)

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
    const maxFrameW   = Math.max(...sizedAnims.map(n => animations[n].frameWidth))
    const maxGroundY  = Math.max(...sizedAnims.map(n => shadowY[n] ?? animations[n].frameHeight))
    const spriteAreaH = (maxGroundY + Y_PAD * 2) * cfg.SCALE

    const portraitDisplayW = PORTRAIT_SIZE * cfg.PORTRAIT_SCALE + PORTRAIT_BORDER * 2
    const portraitAreaH    = PORTRAIT_SIZE * cfg.PORTRAIT_SCALE + PORTRAIT_BORDER * 2 + PORTRAIT_GAP

    canvas.width  = Math.max(maxFrameW * cfg.SCALE, portraitDisplayW)
    canvas.height = portraitAreaH + spriteAreaH
    ctx.imageSmoothingEnabled = false

    window.electronAPI.setWindowSize(canvas.width, canvas.height)
    window.electronAPI.moveWindow(0, -portraitAreaH)

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
