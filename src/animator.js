import { DIR, SCALE, Y_PAD } from './config.js'

// ─── State ────────────────────────────────────────────────────────────────────

let _canvas = null
let _ctx    = null
let _animations = {}
let _sheets     = {}
let _shadowY    = {}

let currentAnim  = null
let currentFrame = 0
let frameTimer   = 0

// ─── Init ─────────────────────────────────────────────────────────────────────

export function init(canvas, ctx, animations, sheets, shadowY) {
  _canvas     = canvas
  _ctx        = ctx
  _animations = animations
  _sheets     = sheets
  _shadowY    = shadowY
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

  if (flipH) {
    _ctx.save()
    _ctx.translate(destW, 0)  // flip within the sprite's own width, not the full canvas
    _ctx.scale(-1, 1)
  }

  _ctx.drawImage(sheet, srcX, srcY, frameWidth, frameHeight, 0, destY, destW, destH)

  if (flipH) _ctx.restore()
}
