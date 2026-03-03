import { DIR } from './config.js'

// ─── XML parsing ──────────────────────────────────────────────────────────────

export function parseAnimXML(xmlText) {
  const parser = new DOMParser()
  const doc    = parser.parseFromString(xmlText, 'text/xml')
  const result = {}

  for (const animEl of doc.querySelectorAll('Anim')) {
    if (animEl.querySelector('CopyOf')) continue  // resolve CopyOf in second pass

    const name        = animEl.querySelector('Name')?.textContent?.trim()
    const frameWidth  = parseInt(animEl.querySelector('FrameWidth')?.textContent)
    const frameHeight = parseInt(animEl.querySelector('FrameHeight')?.textContent)
    const durations   = [...animEl.querySelectorAll('Duration')].map(d => parseInt(d.textContent))

    if (!name || isNaN(frameWidth) || !durations.length) continue
    result[name] = { frameWidth, frameHeight, durations, frameCount: durations.length }
  }

  for (const animEl of doc.querySelectorAll('Anim')) {
    const copyOf = animEl.querySelector('CopyOf')?.textContent?.trim()
    if (!copyOf) continue
    const name = animEl.querySelector('Name')?.textContent?.trim()
    if (name && result[copyOf]) result[name] = result[copyOf]
  }

  return result
}

// ─── Sprite image loading ─────────────────────────────────────────────────────

export async function loadSpriteImage(dex, filename) {
  const { ok, url, error } = await window.electronAPI.getSpriteFile(dex, filename)
  if (!ok) throw new Error(`Failed to fetch ${filename}: ${error}`)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload  = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
    img.src = url
  })
}

// ─── Shadow offset ────────────────────────────────────────────────────────────
// Parse a shadow PNG to find the ground-anchor Y in source pixels.
// The shadow is an ellipse under the character's feet; its Y centroid = ground contact.
// Falls back to frameHeight (bottom-anchor) if the PNG is missing or unreadable.

export async function computeShadowY(dex, name, anim) {
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
    return anim.frameHeight  // fallback: bottom-anchor
  }
}

// ─── Portrait loading ─────────────────────────────────────────────────────────
// Downloads each named portrait PNG, skipping any that don't exist for this Pokémon.
// Returns a map of { emotionName: HTMLImageElement }.

export async function loadPortraits(dex, names) {
  const portraits = {}
  await Promise.all(names.map(async (name) => {
    try {
      const { ok, url, error } = await window.electronAPI.getPortraitFile(dex, `${name}.png`)
      if (!ok) { console.warn(`[portrait] ${name} unavailable: ${error}`); return }
      await new Promise((resolve, reject) => {
        const img = new Image()
        img.onload  = () => { portraits[name] = img; resolve() }
        img.onerror = () => { console.warn(`[portrait] failed to load ${name}`); resolve() }
        img.src = url
      })
    } catch (err) {
      console.warn(`[portrait] ${name} error:`, err.message)
    }
  }))
  console.log(`[portrait] loaded: ${Object.keys(portraits).join(', ')}`)
  return portraits
}

// ─── Main loader ──────────────────────────────────────────────────────────────
// Fetches all sprite data for a Pokémon and returns { animations, sheets, shadowY }.
// Does not touch the canvas — sizing is the caller's responsibility.

export async function loadPet(dex) {
  const { ok, url, error } = await window.electronAPI.getSpriteFile(dex, 'AnimData.xml')
  if (!ok) throw new Error(`AnimData.xml fetch failed: ${error}`)
  const xmlResp = await fetch(url)
  if (!xmlResp.ok) throw new Error(`AnimData.xml HTTP ${xmlResp.status}`)
  const animations = parseAnimXML(await xmlResp.text())

  const sheets  = {}
  const shadowY = {}
  const names = ['Walk', 'Idle', 'Hurt', 'Sleep', 'Hop'].filter(n => animations[n])
  await Promise.all(names.map(async name => {
    const [sheet, sy] = await Promise.all([
      loadSpriteImage(dex, `${name}-Anim.png`),
      computeShadowY(dex, name, animations[name]),
    ])
    sheets[name]  = sheet
    shadowY[name] = sy
    console.log(`[shadow] ${name}: groundY=${sy}px (frameH=${animations[name].frameHeight})`)
  }))

  return { animations, sheets, shadowY }
}
