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

// ─── Config ───────────────────────────────────────────────────────────────────

export const DEX        = '0025'  // Change this to load a different Pokémon (Pikachu = 0025)
export const SCALE      = 2       // Pixel scale multiplier (3× gives nice chunky pixels)
export const WALK_SPEED = 1.2     // Pixels per frame the pet moves
export const IDLE_CHANCE = 0.003  // Per-frame probability of stopping to idle
export const Y_PAD      = 6       // Source-pixel headroom above and below the sprite

// ─── Portraits ────────────────────────────────────────────────────────────────

// Emotions to download; Normal is shown on hover (emotion logic added later)
export const PORTRAIT_NAMES      = ['Normal', 'Happy', 'Sad', 'Angry', 'Worried', 'Inspired', 'Determined']
export const PORTRAIT_SIZE       = 40   // PMDCollab source size (always 40×40 px)
export const PORTRAIT_SCALE      = 1.5    // Display scale — change this to resize the portrait (80px at 2×)
export const PORTRAIT_BORDER     = 3    // White border width in screen pixels
export const PORTRAIT_RADIUS     = 8    // Rounded corner radius in screen pixels
export const PORTRAIT_GAP        = 10   // Screen pixels between portrait bottom and sprite top
export const PORTRAIT_FADE_SPEED = 0.07 // Opacity change per frame (1/0.07 ≈ 14 frames to fully fade)
