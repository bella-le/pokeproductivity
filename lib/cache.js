const path  = require('path')
const fs    = require('fs')
const https = require('https')
const { app } = require('electron')

// ─── Cache helpers ────────────────────────────────────────────────────────────

const CACHE_DIR          = path.join(app.getPath('userData'), 'sprite-cache')
const PORTRAIT_CACHE_DIR = path.join(app.getPath('userData'), 'portrait-cache')

function cachePath(dexNumber, filename) {
  return path.join(CACHE_DIR, dexNumber, filename)
}

function portraitCachePath(dexNumber, filename) {
  return path.join(PORTRAIT_CACHE_DIR, dexNumber, filename)
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    ensureDir(dest)
    const file = fs.createWriteStream(dest)
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close()
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) {
        file.close()
        fs.unlink(dest, () => {})
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      }
      res.pipe(file)
      file.on('finish', () => file.close(resolve))
    }).on('error', (err) => {
      fs.unlink(dest, () => {})
      reject(err)
    })
  })
}

// Fetch a sprite file, caching locally; returns local path
async function fetchSpriteFile(dexNumber, filename) {
  const local = cachePath(dexNumber, filename)
  if (fs.existsSync(local)) {
    console.log(`[cache hit]  sprite/${dexNumber}/${filename}`)
    return local
  }
  const url = `https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/sprite/${dexNumber}/${filename}`
  console.log(`[download]   ${url}`)
  await downloadFile(url, local)
  console.log(`[saved]      ${local}`)
  return local
}

// Fetch a portrait file, caching locally; returns local path
async function fetchPortraitFile(dexNumber, filename) {
  const local = portraitCachePath(dexNumber, filename)
  if (fs.existsSync(local)) {
    console.log(`[cache hit]  portrait/${dexNumber}/${filename}`)
    return local
  }
  const url = `https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/portrait/${dexNumber}/${filename}`
  console.log(`[download]   ${url}`)
  await downloadFile(url, local)
  console.log(`[saved]      ${local}`)
  return local
}

module.exports = { fetchSpriteFile, fetchPortraitFile }
