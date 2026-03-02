;(async () => {
  const settings = await window.electronAPI.getSettings()

  document.getElementById('dex').value          = settings.DEX                   ?? '0025'
  document.getElementById('nickname').value     = settings.NICKNAME              ?? 'Buddy'
  document.getElementById('scale').value        = settings.SCALE                 ?? 2
  document.getElementById('portraitScale').value= settings.PORTRAIT_SCALE        ?? 1.5
  document.getElementById('borderColor').value  = settings.PORTRAIT_BORDER_COLOR ?? '#ffffff'

  document.getElementById('save').addEventListener('click', () => {
    window.electronAPI.saveSettings({
      DEX:                   document.getElementById('dex').value.trim(),
      NICKNAME:              document.getElementById('nickname').value.trim(),
      SCALE:                 parseFloat(document.getElementById('scale').value),
      PORTRAIT_SCALE:        parseFloat(document.getElementById('portraitScale').value),
      PORTRAIT_BORDER_COLOR: document.getElementById('borderColor').value,
    })
  })
})()
