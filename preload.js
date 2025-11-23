const { contextBridge, ipcRenderer } = require('electron');

// Securely expose specific functionality to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Toggle always on top state
  toggleAlwaysOnTop: () => {
    ipcRenderer.send('toggle-always-on-top');
  },

  // Update pin button appearance based on always on top state
  updatePinButton: (isAlwaysOnTop) => {
    const pinButton = document.getElementById('floating-pin-btn');
    if (pinButton) {
      if (isAlwaysOnTop) {
        pinButton.innerHTML = '📌';
        pinButton.style.background = 'rgba(255, 69, 0, 0.9)';
        pinButton.style.boxShadow = '0 6px 20px rgba(255, 69, 0, 0.5)';
      } else {
        pinButton.innerHTML = '📍';
        pinButton.style.background = 'rgba(255, 165, 0, 0.8)';
        pinButton.style.boxShadow = '0 4px 15px rgba(255, 165, 0, 0.3)';
      }
    }
  },
});

// Listen for always on top state updates
ipcRenderer.on('always-on-top-changed', (event, isAlwaysOnTop) => {
  window.electronAPI.updatePinButton(isAlwaysOnTop);
});
