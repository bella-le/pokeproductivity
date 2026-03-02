import { DIR, cfg, PORTRAIT_SIZE, PORTRAIT_BORDER, PORTRAIT_RADIUS, PORTRAIT_FADE_SPEED, Y_PAD } from './config.js'

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
let _portraits             = {}
let _currentPortrait       = 'Normal'
let _portraitOpacity       = 0
let _portraitTargetOpacity = 0

// Expanded info panel state
let _expandProgress   = 0     // 0 = fully collapsed, 1 = fully expanded
let _expandTarget     = 0     // 0 or 1
let _portraitDisplayW = 0     // portrait box width (left edge of info panel)
const EXPAND_SPEED    = 0.12  // progress per frame (~8 frames to fully expand)

// Placeholder pet data (will be driven by productivity tracking later)
const _petInfo = { nickname: 'Buddy', level: 1, xp: 35, maxXp: 100 }

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

export function setExpanded(expanded, portraitDisplayW) {
  _expandTarget     = expanded ? 1 : 0
  _portraitDisplayW = portraitDisplayW
}

export function getExpandProgress() {
  return _expandProgress
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

// ─── Info panel drawing ───────────────────────────────────────────────────────

function drawInfoPanel(displaySize) {
  const panelX = _portraitDisplayW
  const panelW = _canvas.width - panelX
  const panelH = displaySize + PORTRAIT_BORDER * 2

  _ctx.save()
  _ctx.globalAlpha = _portraitOpacity * _expandProgress  // fades in/out with expansion

  // Dark background with rounded right corners (left edge flush with portrait)
  _ctx.fillStyle = 'rgba(15, 15, 25, 0.82)'
  _ctx.beginPath()
  _ctx.roundRect(panelX, 0, panelW, panelH, [0, PORTRAIT_RADIUS + PORTRAIT_BORDER, PORTRAIT_RADIUS + PORTRAIT_BORDER, 0])
  _ctx.fill()

  const pad   = 10
  const textX = panelX + pad

  _ctx.textBaseline = 'top'

  // Nickname (left) + Level (right) on the same line
  _ctx.font      = `bold 12px -apple-system, system-ui, sans-serif`
  _ctx.fillStyle = '#ffffff'
  _ctx.fillText(cfg.NICKNAME, textX, PORTRAIT_BORDER + 6)

  _ctx.font      = `11px -apple-system, system-ui, sans-serif`
  _ctx.fillStyle = 'rgba(255,255,255,0.6)'
  _ctx.textAlign = 'right'
  _ctx.fillText(`Lv. ${_petInfo.level}`, panelX + panelW - pad, PORTRAIT_BORDER + 7)
  _ctx.textAlign = 'left'

  // XP bar
  const barX  = textX
  const barY  = PORTRAIT_BORDER + 28
  const barW  = panelW - pad * 2
  const barH  = 7
  const fillW = barW * Math.min(_petInfo.xp / _petInfo.maxXp, 1)

  _ctx.fillStyle = 'rgba(255,255,255,0.15)'
  _ctx.beginPath()
  _ctx.roundRect(barX, barY, barW, barH, 3.5)
  _ctx.fill()

  if (fillW > 0) {
    _ctx.fillStyle = '#4ade80'
    _ctx.beginPath()
    _ctx.roundRect(barX, barY, fillW, barH, 3.5)
    _ctx.fill()
  }

  // XP label
  _ctx.font      = `10px -apple-system, system-ui, sans-serif`
  _ctx.fillStyle = 'rgba(255,255,255,0.5)'
  _ctx.fillText(`${_petInfo.xp} / ${_petInfo.maxXp} XP`, barX, barY + barH + 5)

  _ctx.restore()
}

// ─── Portrait drawing helper ──────────────────────────────────────────────────

function drawPortrait(img, x, y, displaySize) {
  _ctx.save()
  _ctx.globalAlpha = _portraitOpacity

  // Colored border — a slightly larger rounded rect drawn behind the image
  _ctx.fillStyle = cfg.PORTRAIT_BORDER_COLOR
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
  const destW   = frameWidth   * cfg.SCALE
  const destH   = frameHeight  * cfg.SCALE
  const groundY = _shadowY[currentAnim] ?? frameHeight
  const destY   = _canvas.height - (groundY + Y_PAD) * cfg.SCALE

  _ctx.clearRect(0, 0, _canvas.width, _canvas.height)

  // Fade portrait opacity toward its target each frame
  if (_portraitOpacity !== _portraitTargetOpacity) {
    const step = _portraitTargetOpacity > _portraitOpacity ? PORTRAIT_FADE_SPEED : -PORTRAIT_FADE_SPEED
    _portraitOpacity = Math.max(0, Math.min(1, _portraitOpacity + step))
  }

  // Advance expansion animation
  if (_expandProgress !== _expandTarget) {
    const step = _expandTarget > _expandProgress ? EXPAND_SPEED : -EXPAND_SPEED
    _expandProgress = Math.max(0, Math.min(1, _expandProgress + step))
  }

  // Portrait: centered in canvas when collapsed, slides left to PORTRAIT_BORDER when expanded
  if (_portraitOpacity > 0 && _portraits[_currentPortrait]) {
    const displaySize = PORTRAIT_SIZE * cfg.PORTRAIT_SCALE
    const collapsedX  = Math.round((_canvas.width - displaySize) / 2)
    const px          = Math.round(collapsedX + (PORTRAIT_BORDER - collapsedX) * _expandProgress)
    if (_expandProgress > 0) drawInfoPanel(displaySize)  // drawn first so portrait renders on top
    drawPortrait(_portraits[_currentPortrait], px, PORTRAIT_BORDER, displaySize)
  }

  // Sprite: always centered horizontally in the canvas
  const spriteX = Math.round((_canvas.width - destW) / 2)
  if (flipH) {
    _ctx.save()
    _ctx.translate(spriteX + destW, 0)
    _ctx.scale(-1, 1)
    _ctx.drawImage(sheet, srcX, srcY, frameWidth, frameHeight, 0, destY, destW, destH)
    _ctx.restore()
    return
  }

  _ctx.drawImage(sheet, srcX, srcY, frameWidth, frameHeight, spriteX, destY, destW, destH)

  if (flipH) _ctx.restore()
}
