const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Sprite / portrait fetching
  getSpriteFile:   (dexNumber, filename) => ipcRenderer.invoke('get-sprite-file', dexNumber, filename),
  getPortraitFile: (dexNumber, filename) => ipcRenderer.invoke('get-portrait-file', dexNumber, filename),

  // Window control
  moveWindow:    (deltaX, deltaY) => ipcRenderer.send('move-window', deltaX, deltaY),
  setIgnoreMouse:(ignore)         => ipcRenderer.send('set-ignore-mouse', ignore),
  getWindowPos:  ()               => ipcRenderer.invoke('get-window-pos'),
  setWindowSize: (w, h)           => ipcRenderer.send('set-window-size', w, h),

  // Context menu
  showContextMenu: () => ipcRenderer.send('show-context-menu'),

  // Settings
  getSettings:  ()     => ipcRenderer.invoke('get-settings'),
  saveSettings: (data) => ipcRenderer.send('save-settings', data),

  // Progress
  getProgress:  ()     => ipcRenderer.invoke('get-progress'),
  saveProgress: (data) => ipcRenderer.send('save-progress', data),

  // Tasks
  getTasks:          ()      => ipcRenderer.invoke('get-tasks'),
  saveTasks:         (tasks) => ipcRenderer.send('save-tasks', tasks),
  resizeTasksWindow: (h)     => ipcRenderer.send('resize-tasks-window', h),

  // Pomodoro
  onShowPomodoro: (cb) => ipcRenderer.on('show-pomodoro', () => cb()),
})
