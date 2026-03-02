const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getSpriteFile: (dexNumber, filename) =>
    ipcRenderer.invoke('get-sprite-file', dexNumber, filename),

  getPortraitFile: (dexNumber, filename) =>
    ipcRenderer.invoke('get-portrait-file', dexNumber, filename),

  // Tell main process to move the window by a delta (for dragging)
  moveWindow: (deltaX, deltaY) =>
    ipcRenderer.send('move-window', deltaX, deltaY),

  // Tell main process whether clicks should pass through the window
  setIgnoreMouse: (ignore) =>
    ipcRenderer.send('set-ignore-mouse', ignore),

  // Get the window's current [x, y] screen position (used to init walk state)
  getWindowPos: () =>
    ipcRenderer.invoke('get-window-pos'),

  // Resize the native window to match the canvas after sprites are loaded
  setWindowSize: (w, h) =>
    ipcRenderer.send('set-window-size', w, h),
})
