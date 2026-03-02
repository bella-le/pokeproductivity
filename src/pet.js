import { DEX, SCALE, WALK_SPEED, IDLE_CHANCE, Y_PAD } from './config.js'
import { loadPet } from './loader.js'
import { init as initAnim, startAnim, stepAnim, drawFrame } from './animator.js'

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

canvas.addEventListener('mouseenter', () => {
  window.electronAPI.setIgnoreMouse(false)
  if (!isDragging) { isWalking = false; startAnim('Idle') }
})

canvas.addEventListener('mouseleave', () => {
  if (!isDragging) {
    window.electronAPI.setIgnoreMouse(true)
    isWalking = true; startAnim('Walk')
  }
})

canvas.addEventListener('mousedown', (e) => {
  isDragging = true
  dragStartX = e.screenX
  dragStartY = e.screenY
  startAnim('Hurt')
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
  // Re-sync posX with where the window actually landed after the drag
  const [wx] = await window.electronAPI.getWindowPos()
  posX = wx
  isWalking = true
  startAnim('Walk')
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
    const [winX] = await window.electronAPI.getWindowPos()
    posX = winX

    const { animations, sheets, shadowY } = await loadPet(DEX)
    initAnim(canvas, ctx, animations, sheets, shadowY)

    // Size canvas to the tallest above-ground extent (Walk/Idle only — Hurt excluded
    // to avoid inflating the window) plus Y_PAD breathing room on both sides.
    const sizedAnims = ['Walk', 'Idle'].filter(n => animations[n])
    const maxFrameW  = Math.max(...sizedAnims.map(n => animations[n].frameWidth))
    const maxGroundY = Math.max(...sizedAnims.map(n => shadowY[n] ?? animations[n].frameHeight))
    canvas.width  = maxFrameW            * SCALE
    canvas.height = (maxGroundY + Y_PAD * 2) * SCALE
    ctx.imageSmoothingEnabled = false
    window.electronAPI.setWindowSize(canvas.width, canvas.height)

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
