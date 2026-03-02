// ─── PMDCollab direction rows ──────────────────────────────────────────────────
// The spritesheet has 8 direction rows in this order:
//   0: South      (facing viewer / walking down)
//   1: SouthEast
//   2: East        (walking right)
//   3: NorthEast
//   4: North
//   5: NorthWest
//   6: West        (walking left)  ← same sprites as East, flipped horizontally
//   7: SouthWest
//
// We only use South (0), East (2), and West (6) — but since West is a mirror
// of East in the game data, we read row 2 and flip the canvas when going left.

const DIR = { SOUTH: 0, EAST: 2, WEST: 2 }  // West re-uses East row + flip

// ─── Config ───────────────────────────────────────────────────────────────────

const DEX = '0025'       // Change this to load a different Pokémon (Pikachu = 0025)
const SCALE = 3          // Pixel scale multiplier (3× gives nice chunky pixels)
const WALK_SPEED = 1.2   // Pixels per frame the pet moves
const IDLE_CHANCE = 0.003 // Per-frame probability of stopping to idle
const Y_PAD = 6          // Extra source-pixel headroom above the tallest animation

// ─── State ────────────────────────────────────────────────────────────────────

const canvas = document.getElementById('pet-canvas')
const ctx    = canvas.getContext('2d', { willReadFrequently: true })

let animations = {}   // { Walk: { frameWidth, frameHeight, durations }, Idle: {...} }
let sheets     = {}   // { Walk: HTMLImageElement, Idle: HTMLImageElement, ... }
let shadowY    = {}   // { Walk: 20, Idle: 18, Hurt: 22 } — ground-anchor Y in source pixels

let currentAnim  = null   // currently playing animation key ("Walk" | "Idle")
let currentFrame = 0
let frameTimer   = 0

// Walking state
let posX = 0              // window's current X on screen (synced from main on boot)
let dirX = 1              // +1 = right, -1 = left
let isWalking = true

// Screen bounds (populated after load)
let screenW = window.screen.width
let screenH = window.screen.height

// Drag state
let isDragging  = false
let dragStartX  = 0
let dragStartY  = 0

// ─── XML parsing ──────────────────────────────────────────────────────────────

function parseAnimXML(xmlText) {
  const parser = new DOMParser()
  const doc    = parser.parseFromString(xmlText, 'text/xml')
  const result = {}

  for (const animEl of doc.querySelectorAll('Anim')) {
    // Skip CopyOf entries — we resolve those after initial parse
    if (animEl.querySelector('CopyOf')) continue

    const name        = animEl.querySelector('Name')?.textContent?.trim()
    const frameWidth  = parseInt(animEl.querySelector('FrameWidth')?.textContent)
    const frameHeight = parseInt(animEl.querySelector('FrameHeight')?.textContent)
    const durations   = [...animEl.querySelectorAll('Duration')].map(d => parseInt(d.textContent))

    if (!name || isNaN(frameWidth) || !durations.length) continue
    result[name] = { frameWidth, frameHeight, durations, frameCount: durations.length }
  }

  // Resolve CopyOf references
  for (const animEl of doc.querySelectorAll('Anim')) {
    const copyOf = animEl.querySelector('CopyOf')?.textContent?.trim()
    if (!copyOf) continue
    const name = animEl.querySelector('Name')?.textContent?.trim()
    if (name && result[copyOf]) result[name] = result[copyOf]
  }

  return result
}

// ─── Sprite loading ───────────────────────────────────────────────────────────

async function loadSpriteImage(dex, filename) {
  const { ok, url, error } = await window.electronAPI.getSpriteFile(dex, filename)
  if (!ok) throw new Error(`Failed to fetch ${filename}: ${error}`)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload  = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
    img.src = url
  })
}

// Parse a shadow PNG for an animation to find the ground-anchor Y (in source pixels).
// The shadow is an ellipse drawn below the character's feet; its centroid Y = ground contact.
// Returns frameHeight as a safe fallback if the shadow PNG is missing or unreadable.
async function computeShadowY(dex, name, anim) {
  const dirRow = (name === 'Walk') ? DIR.EAST : DIR.SOUTH
  try {
    const img  = await loadSpriteImage(dex, `${name}-Shadow.png`)
    const oc   = document.createElement('canvas')
    oc.width   = anim.frameWidth
    oc.height  = anim.frameHeight
    const octx = oc.getContext('2d', { willReadFrequently: true })

    let sumY = 0, count = 0
    for (let f = 0; f < anim.frameCount; f++) {
      octx.clearRect(0, 0, oc.width, oc.height)
      octx.drawImage(
        img,
        f * anim.frameWidth, dirRow * anim.frameHeight, anim.frameWidth, anim.frameHeight,
        0, 0, anim.frameWidth, anim.frameHeight
      )
      const { data } = octx.getImageData(0, 0, anim.frameWidth, anim.frameHeight)
      for (let y = 0; y < anim.frameHeight; y++) {
        for (let x = 0; x < anim.frameWidth; x++) {
          if (data[(y * anim.frameWidth + x) * 4 + 3] > 10) { sumY += y; count++ }
        }
      }
    }
    return count > 0 ? Math.round(sumY / count) : anim.frameHeight
  } catch {
    return anim.frameHeight  // fallback: bottom-anchor (same as before)
  }
}

async function loadPet(dex) {
  // 1. Fetch and parse AnimData.xml
  const { ok, url, error } = await window.electronAPI.getSpriteFile(dex, 'AnimData.xml')
  if (!ok) throw new Error(`AnimData.xml fetch failed: ${error}`)
  const xmlResp = await fetch(url)
  if (!xmlResp.ok) throw new Error(`AnimData.xml HTTP ${xmlResp.status}`)
  const xmlText   = await xmlResp.text()
  animations      = parseAnimXML(xmlText)

  // 2. Load the spritesheets and compute ground-anchor Y for each animation
  const needed = ['Walk', 'Idle', 'Hurt'].filter(n => animations[n])
  for (const name of needed) {
    sheets[name]  = await loadSpriteImage(dex, `${name}-Anim.png`)
    shadowY[name] = await computeShadowY(dex, name, animations[name])
    console.log(`[shadow] ${name}: groundY=${shadowY[name]}px (frameH=${animations[name].frameHeight})`)
  }

  // 3. Size canvas so the tallest "above-ground" extent (Walk or Idle) fits.
  //    Hurt is excluded from sizing to avoid inflating the window; it will
  //    clip at the top if taller than the canvas, which is acceptable.
  //    canvas.height = max shadowY across Walk/Idle, so the ground line sits
  //    exactly at the canvas bottom and all animations share the same baseline.
  const sizedAnims = ['Walk', 'Idle'].filter(n => animations[n])
  const maxFrameW  = Math.max(...sizedAnims.map(n => animations[n].frameWidth))
  const maxGroundY = Math.max(...sizedAnims.map(n => shadowY[n] ?? animations[n].frameHeight))
  canvas.width  = maxFrameW            * SCALE
  canvas.height = (maxGroundY + Y_PAD * 2) * SCALE  // Y_PAD on top, Y_PAD on bottom
  ctx.imageSmoothingEnabled = false
  // Resize the native window to exactly match the canvas
  window.electronAPI.setWindowSize(canvas.width, canvas.height)

  // 4. Start in walking state
  startAnim('Walk')
}

// ─── Animation control ────────────────────────────────────────────────────────

function startAnim(name) {
  // Fall back gracefully if the anim doesn't exist
  if (!animations[name] && !animations['Idle']) return
  currentAnim  = animations[name] ? name : 'Idle'
  currentFrame = 0
  frameTimer   = 0
}

function stepAnim() {
  const anim = animations[currentAnim]
  if (!anim) return

  frameTimer++
  if (frameTimer >= anim.durations[currentFrame]) {
    frameTimer    = 0
    currentFrame  = (currentFrame + 1) % anim.frameCount
  }
}

// ─── Drawing ──────────────────────────────────────────────────────────────────

function drawFrame() {
  const anim  = animations[currentAnim]
  const sheet = sheets[currentAnim]
  if (!anim || !sheet) return

  const { frameWidth, frameHeight } = anim

  // Direction row: South for idle, East/West for walk
  // West = row 6 in the sheet, but since it mirrors East (row 2), we
  // use row 2 and flip the canvas horizontally.
  let dirRow  = DIR.SOUTH
  let flipH   = false
  if (currentAnim === 'Walk') {
    if (dirX >= 0) {
      dirRow = DIR.EAST     // row 2
      flipH  = false
    } else {
      dirRow = DIR.WEST     // also row 2, drawn mirrored
      flipH  = true
    }
  }

  const srcX  = currentFrame * frameWidth
  const srcY  = dirRow       * frameHeight
  const destW = frameWidth   * SCALE
  const destH = frameHeight  * SCALE
  // Shadow-anchor: pin the ground contact point (shadow centroid) to the canvas bottom
  // so all animations share the same visual baseline regardless of frame height.
  const groundY = shadowY[currentAnim] ?? frameHeight
  const destY   = canvas.height - (groundY + Y_PAD) * SCALE

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  if (flipH) {
    ctx.save()
    ctx.translate(destW, 0)  // flip within the sprite's own width, not the full canvas
    ctx.scale(-1, 1)
  }

  ctx.drawImage(
    sheet,
    srcX, srcY, frameWidth, frameHeight,  // source rect
    0, destY, destW, destH                // dest rect (scaled, bottom-anchored)
  )

  if (flipH) ctx.restore()
}

// ─── Walking AI ───────────────────────────────────────────────────────────────

function updateWalk() {
  if (isDragging) return

  if (isWalking) {
    const dx = dirX * WALK_SPEED
    posX += dx
    window.electronAPI.moveWindow(dx, 0)  // actually move the window across the screen

    // Bounce off screen edges using the actual canvas/window width
    const WIN_W = canvas.width
    if (posX <= 0) {
      posX = 0
      dirX = 1
    } else if (posX >= screenW - WIN_W) {
      posX = screenW - WIN_W
      dirX = -1
    }

    // Occasionally stop to idle
    if (Math.random() < IDLE_CHANCE) {
      isWalking = false
      startAnim('Idle')
      // Resume walking after a random pause (2–6 seconds at 60fps)
      const pauseFrames = Math.floor(Math.random() * 240) + 120
      setTimeout(() => {
        isWalking = true
        startAnim('Walk')
      }, pauseFrames * (1000 / 60))
    }
  }
}

// ─── Drag to reposition ───────────────────────────────────────────────────────

canvas.addEventListener('mouseenter', () => {
  window.electronAPI.setIgnoreMouse(false)
  if (!isDragging) {
    isWalking = false
    startAnim('Idle')
  }
})

canvas.addEventListener('mouseleave', () => {
  if (!isDragging) {
    window.electronAPI.setIgnoreMouse(true)
    isWalking = true
    startAnim('Walk')
  }
})

canvas.addEventListener('mousedown', (e) => {
  isDragging = true
  dragStartX = e.screenX
  dragStartY = e.screenY
  startAnim('Hurt')  // show hurt/grabbed face while dragging
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
  if (isDragging) {
    isDragging = false
    // Re-sync posX with where the window actually landed after the drag,
    // otherwise the bounds check uses a stale value and the pet walks off-screen.
    const [wx] = await window.electronAPI.getWindowPos()
    posX = wx
    // Resume walking after being dropped
    isWalking = true
    startAnim('Walk')
    window.electronAPI.setIgnoreMouse(true)
  }
})

// ─── Hit-test: only intercept mouse over opaque pixels ───────────────────────
// We poll the pixel under the cursor; if it's transparent we pass the click through.

canvas.addEventListener('mousemove', (e) => {
  if (isDragging) return
  try {
    const pixel = ctx.getImageData(e.offsetX, e.offsetY, 1, 1).data
    window.electronAPI.setIgnoreMouse(pixel[3] < 10)
  } catch {
    // Canvas may be tainted briefly during load; default to opaque
    window.electronAPI.setIgnoreMouse(false)
  }
})

// ─── Main loop ────────────────────────────────────────────────────────────────

function loop() {
  updateWalk()
  stepAnim()
  drawFrame()
  requestAnimationFrame(loop)
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

;(async () => {
  try {
    // Sync posX with where Electron actually placed the window
    const [winX] = await window.electronAPI.getWindowPos()
    posX = winX

    await loadPet(DEX)
    loop()
  } catch (err) {
    console.error('Failed to load Pokémon sprites:', err)
    canvas.width  = 40
    canvas.height = 40
    ctx.fillStyle = 'red'
    ctx.fillRect(0, 0, 40, 40)
  }
})()
