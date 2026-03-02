import { DIR, SCALE, Y_PAD,
         PORTRAIT_SIZE, PORTRAIT_SCALE, PORTRAIT_BORDER, PORTRAIT_RADIUS,
         PORTRAIT_FADE_SPEED } from './config.js'

// ─── State ────────────────────────────────────────────────────────────────────

let _canvas = null
let _ctx    = null
let _animations = {}
let _sheets     = {}
let _shadowY    = {}

let currentAnim  = null
let currentFrame = 0
let frameTimer   = 0

// Portrait state
let _portraits          = {}
let _currentPortrait    = 'Normal'
let _portraitOpacity    = 0   // current rendered opacity (0–1)
let _portraitTargetOpacity = 0   // 0 = hidden, 1 = visible

// ─── Init ─────────────────────────────────────────────────────────────────────

export function init(canvas, ctx, animations, sheets, shadowY) {
  _canvas     = canvas
  _ctx        = ctx
  _animations = animations
  _sheets     = sheets
  _shadowY    = shadowY
}

export function initPortraits(portraits) {
  _portraits = portraits
}

// ─── Animation control ────────────────────────────────────────────────────────

export function startAnim(name) {
  if (!_animations[name] && !_animations['Idle']) return
  currentAnim  = _animations[name] ? name : 'Idle'
  currentFrame = 0
  frameTimer   = 0
}

export function stepAnim() {
  const anim = _animations[currentAnim]
  if (!anim) return
  frameTimer++
  if (frameTimer >= anim.durations[currentFrame]) {
    frameTimer   = 0
    currentFrame = (currentFrame + 1) % anim.frameCount
  }
}

// ─── Portrait control ─────────────────────────────────────────────────────────

export function setPortrait(name, visible) {
  _currentPortrait       = name
  _portraitTargetOpacity = visible ? 1 : 0
}

// ─── Portrait drawing helper ──────────────────────────────────────────────────

function drawPortrait(img, x, y, displaySize) {
  _ctx.save()
  _ctx.globalAlpha = _portraitOpacity

  // White border — a slightly larger rounded rect drawn behind the image
  _ctx.fillStyle = 'white'
  _ctx.beginPath()
  _ctx.roundRect(
    x - PORTRAIT_BORDER,
    y - PORTRAIT_BORDER,
    displaySize + PORTRAIT_BORDER * 2,
    displaySize + PORTRAIT_BORDER * 2,
    PORTRAIT_RADIUS + PORTRAIT_BORDER
  )
  _ctx.fill()

  // Clip the image to a rounded rect, then draw it
  _ctx.beginPath()
  _ctx.roundRect(x, y, displaySize, displaySize, PORTRAIT_RADIUS)
  _ctx.clip()
  _ctx.drawImage(img, 0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE, x, y, displaySize, displaySize)

  _ctx.restore()
}

// ─── Drawing ──────────────────────────────────────────────────────────────────

export function drawFrame(dirX) {
  const anim  = _animations[currentAnim]
  const sheet = _sheets[currentAnim]
  if (!anim || !sheet) return

  const { frameWidth, frameHeight } = anim

  // Direction row: South for Idle/Hurt, East/West (mirrored) for Walk
  let dirRow = DIR.SOUTH
  let flipH  = false
  if (currentAnim === 'Walk') {
    if (dirX >= 0) { dirRow = DIR.EAST; flipH = false }
    else           { dirRow = DIR.WEST; flipH = true  }
  }

  const srcX    = currentFrame * frameWidth
  const srcY    = dirRow       * frameHeight
  const destW   = frameWidth   * SCALE
  const destH   = frameHeight  * SCALE
  const groundY = _shadowY[currentAnim] ?? frameHeight
  const destY   = _canvas.height - (groundY + Y_PAD) * SCALE

  _ctx.clearRect(0, 0, _canvas.width, _canvas.height)

  // Fade portrait opacity toward its target each frame
  if (_portraitOpacity !== _portraitTargetOpacity) {
    const step = _portraitTargetOpacity > _portraitOpacity ? PORTRAIT_FADE_SPEED : -PORTRAIT_FADE_SPEED
    _portraitOpacity = Math.max(0, Math.min(1, _portraitOpacity + step))
  }

  // Portrait — centered horizontally, offset down by PORTRAIT_BORDER so the border fits
  if (_portraitOpacity > 0 && _portraits[_currentPortrait]) {
    const displaySize = PORTRAIT_SIZE * PORTRAIT_SCALE
    const px = Math.round((_canvas.width - displaySize) / 2)
    drawPortrait(_portraits[_currentPortrait], px, PORTRAIT_BORDER, displaySize)
  }

  // Sprite
  if (flipH) {
    _ctx.save()
    _ctx.translate(destW, 0)  // flip within the sprite's own width, not the full canvas
    _ctx.scale(-1, 1)
  }

  _ctx.drawImage(sheet, srcX, srcY, frameWidth, frameHeight, 0, destY, destW, destH)

  if (flipH) _ctx.restore()
}
