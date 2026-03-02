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

export const DIR = { SOUTH: 0, EAST: 2, WEST: 2 }  // West re-uses East row + flip

// ─── User-configurable settings ───────────────────────────────────────────────
// Exported as a single mutable object so pet.js can merge saved settings into it
// at runtime (Object.assign) and all modules that import cfg see the new values.

export const cfg = {
  DEX:                   '0025',  // Pokémon dex number (zero-padded, e.g. '0001')
  NICKNAME:              'Buddy', // Display name shown in the info panel
  SCALE:                 2,       // Sprite display scale
  PORTRAIT_SCALE:        1.5,     // Portrait display scale (40 × 1.5 = 60px)
  PORTRAIT_BORDER_COLOR: '#ffffff',
}

// ─── Fixed constants ──────────────────────────────────────────────────────────

export const WALK_SPEED      = 1.2
export const IDLE_CHANCE     = 0.003
export const Y_PAD           = 6

export const PORTRAIT_NAMES      = ['Normal', 'Happy', 'Sad', 'Angry', 'Worried', 'Inspired', 'Determined', 'Dizzy']
export const PORTRAIT_SIZE       = 40    // PMDCollab source size (always 40×40 px)
export const PORTRAIT_BORDER     = 3     // Border width in screen pixels
export const PORTRAIT_RADIUS     = 8     // Rounded corner radius in screen pixels
export const PORTRAIT_GAP        = 10    // Gap between portrait bottom and sprite top
export const PORTRAIT_FADE_SPEED = 0.07  // Opacity change per frame

export const INFO_PANEL_W = 155  // Width of the expanded info panel (px)
