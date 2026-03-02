;(async () => {
  const settings = await window.electronAPI.getSettings()

  document.getElementById('dex').value          = settings.DEX                   ?? '0025'
  document.getElementById('nickname').value     = settings.NICKNAME              ?? 'Buddy'
  document.getElementById('scale').value        = settings.SCALE                 ?? 2
  document.getElementById('portraitScale').value= settings.PORTRAIT_SCALE        ?? 1.5
  document.getElementById('borderColor').value  = settings.PORTRAIT_BORDER_COLOR ?? '#ffffff'
  document.getElementById('tasksSide').value    = settings.TASKS_SIDE            ?? 'right'
  document.getElementById('tasksHeight').value  = settings.TASKS_HEIGHT           ?? 600
  document.getElementById('tasksColor').value   = settings.TASKS_COLOR            ?? '#060612'

  document.getElementById('save').addEventListener('click', () => {
    window.electronAPI.saveSettings({
      DEX:                   document.getElementById('dex').value.trim(),
      NICKNAME:              document.getElementById('nickname').value.trim(),
      SCALE:                 parseFloat(document.getElementById('scale').value),
      PORTRAIT_SCALE:        parseFloat(document.getElementById('portraitScale').value),
      PORTRAIT_BORDER_COLOR: document.getElementById('borderColor').value,
      TASKS_SIDE:            document.getElementById('tasksSide').value,
      TASKS_HEIGHT:          parseInt(document.getElementById('tasksHeight').value, 10),
      TASKS_COLOR:           document.getElementById('tasksColor').value,
    })
  })
})()
