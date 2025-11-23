const {
  app,
  BrowserWindow,
  shell,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
} = require('electron');
const path = require('path');
const { URL } = require('url');
const fs = require('fs');

let mainWindow;
let appEventListeners = [];
let tray;
let willQuit = false;

// Security: Allow only safe protocols for external links (enforce HTTPS)
const ALLOWED_PROTOCOLS = new Set(['https:', 'mailto:', 'tel:']);

// Security: Validate external URLs before opening
function isSafeUrl(urlString) {
  try {
    const url = new URL(urlString);
    return ALLOWED_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

// Security: Sanitize error messages to prevent information disclosure
function sanitizeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: 'Application error occurred', // Generic message to prevent information disclosure
      stack: null, // Remove stack traces entirely
    };
  }
  return 'Unknown error';
}

function createWindow() {
  // Verify icon file exists before using
  const iconPath = path.join(__dirname, 'icon.png');
  if (!fs.existsSync(iconPath)) {
    console.error('Icon file not found:', iconPath);
    // Continue without icon rather than crash
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // Use persistent session to save login information
      partition: 'persist:bluesky-client-session',
      // Security: Enable web security for better protection
      webSecurity: true,
      // Security: Enable sandbox for additional protection
      sandbox: true,
      // Security: Additional security settings
      enableRemoteModule: false,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      // Security: Preload script for secure IPC communication
      preload: path.join(__dirname, 'preload.js'),
    },
    title: 'Bluesky Client',
    // Security: Prevent window from being accessed by other scripts
    show: false,
  });

  // Load Bluesky website
  mainWindow.loadURL('https://bsky.app');

  // Show window after loading
  mainWindow.once('ready-to-show', () => {
    // Remove the menu completely (title bar only remains)
    mainWindow.setMenu(null);
    mainWindow.show();
  });

  // Combined did-finish-load handler for scroll refresh and cache management
  mainWindow.webContents.on('did-finish-load', () => {
    // Prevent concurrent injections with improved race condition handling
    if (mainWindow._isLoading) {
      console.warn('Page loading in progress, skipping duplicate injection');
      return;
    }

    mainWindow._isLoading = true;
    mainWindow._loadingStartTime = Date.now();

    // Clear existing cache interval if any
    if (mainWindow._cacheInterval) {
      clearInterval(mainWindow._cacheInterval);
      mainWindow._cacheInterval = null;
    }

    // Inject scroll refresh functionality with error handling
    try {
      mainWindow.webContents
        .executeJavaScript(
          `
        // Clean up existing listeners and elements before creating new ones
        if (window.scrollRefreshCleanup) {
          window.scrollRefreshCleanup();
        }

        // Store all references for proper cleanup - prevents closure leaks
        const ScrollRefreshManager = {
          data: {
            isAtTop: true,
            wheelDeltaAccumulator: 0,
            threshold: -150,
            indicator: null,
            indicatorTimeout: null
          },
          handlers: {
            handleScroll: null,
            handleWheel: null,
            handleMouseMove: null,
            handleScrollShow: null
          },
          elements: {
            indicator: null,
            floatingBtn: null,
            spinnerStyle: null,
            btnStyle: null
          },
          timeouts: {
            floatAnimation: null,
            indicatorTimeout: null,
            idleCheck: null,
            mouseHide: null,
            scrollShow: null
          },
          intervals: {
            idle: null
          }
        };

        // Create refresh indicator with proper reference management
        function createRefreshIndicator() {
          if (ScrollRefreshManager.elements.indicator) return;

          const indicator = document.createElement('div');
          indicator.id = 'scroll-refresh-indicator';
          indicator.style.cssText = \`
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%) translateY(-100px);
            background: #0066cc;
            color: white;
            padding: 12px 20px;
            border-radius: 25px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            font-weight: 600;
            z-index: 10000;
            transition: transform 0.3s ease, opacity 0.3s ease;
            box-shadow: 0 4px 20px rgba(0, 102, 204, 0.3);
            pointer-events: none;
            user-select: none;
            display: flex;
            align-items: center;
            gap: 8px;
            opacity: 0;
          \`;

          const icon = document.createElement('div');
          icon.textContent = '↻';
          icon.style.cssText = \`
            font-size: 16px;
            animation: spin 1s linear infinite;
            animation-play-state: running;
          \`;

          const text = document.createElement('span');
          text.textContent = 'Refreshing...';

          indicator.appendChild(icon);
          indicator.appendChild(text);
          document.body.appendChild(indicator);

          ScrollRefreshManager.elements.indicator = indicator;
          ScrollRefreshManager.data.indicator = indicator;

          // Add CSS animation if not exists
          if (!document.getElementById('refresh-spinner-style')) {
            const style = document.createElement('style');
            style.id = 'refresh-spinner-style';
            style.textContent = \`
              @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            \`;
            document.head.appendChild(style);
            ScrollRefreshManager.elements.spinnerStyle = style;
          }
        }

        function showRefreshIndicator() {
          createRefreshIndicator();
          const indicator = ScrollRefreshManager.elements.indicator;
          if (indicator) {
            indicator.style.transform = 'translateX(-50%) translateY(0)';
            indicator.style.opacity = '1';
          }
        }

        function hideRefreshIndicator() {
          const indicator = ScrollRefreshManager.elements.indicator;
          if (indicator) {
            indicator.style.transform = 'translateX(-50%) translateY(-100px)';
            indicator.style.opacity = '0';
          }
        }

        // Scroll handler with minimal closure references
        ScrollRefreshManager.handlers.handleScroll = function() {
          const data = ScrollRefreshManager.data;
          data.isAtTop = window.scrollY <= 10;

          if (!data.isAtTop) {
            data.wheelDeltaAccumulator = 0;
            hideRefreshIndicator();
          }
        };

        // Wheel handler with proper cleanup and input validation
        ScrollRefreshManager.handlers.handleWheel = function(event) {
          const data = ScrollRefreshManager.data;

          // Input validation for wheel event
          if (!event || typeof event.deltaY !== 'number' || !isFinite(event.deltaY)) {
            return;
          }

          // Reasonable limits for wheel delta to prevent abuse
          const delta = Math.abs(event.deltaY);
          if (delta > 1000) return;

          if (!data.isAtTop) return;

          if (event.deltaY < 0) {
            data.wheelDeltaAccumulator += Math.abs(event.deltaY);

            if (data.wheelDeltaAccumulator >= Math.abs(data.threshold)) {
              showRefreshIndicator();

              if (ScrollRefreshManager.timeouts.indicatorTimeout) {
                clearTimeout(ScrollRefreshManager.timeouts.indicatorTimeout);
              }

              ScrollRefreshManager.timeouts.indicatorTimeout = setTimeout(() => {
                window.location.reload();
              }, 500);
            }
          } else {
            data.wheelDeltaAccumulator = 0;
            hideRefreshIndicator();

            if (ScrollRefreshManager.timeouts.indicatorTimeout) {
              clearTimeout(ScrollRefreshManager.timeouts.indicatorTimeout);
              ScrollRefreshManager.timeouts.indicatorTimeout = null;
            }
          }
        };

        // Create floating always on top button with proper reference management
        function createFloatingPinButton() {
          if (document.getElementById('floating-pin-btn')) return;

          const button = document.createElement('button');
          button.id = 'floating-pin-btn';
          button.innerHTML = '📌';
          button.title = 'Toggle Always on Top';
          button.style.cssText = \`
            position: fixed;
            bottom: 90px;
            left: 30px;
            width: 50px;
            height: 50px;
            background: rgba(255, 165, 0, 0.8);
            color: white;
            border: none;
            border-radius: 50%;
            font-size: 20px;
            font-weight: bold;
            cursor: pointer;
            z-index: 10001;
            box-shadow: 0 4px 15px rgba(255, 165, 0, 0.3);
            backdrop-filter: blur(10px);
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            user-select: none;
            outline: none;
            opacity: 0.7;
            transform: scale(0.9);
          \`;

          // Event handlers stored in manager for proper cleanup
          const mouseEnterHandler = () => {
            button.style.background = 'rgba(255, 165, 0, 0.95)';
            button.style.opacity = '1';
            button.style.transform = 'scale(1.05)';
            button.style.boxShadow = '0 6px 20px rgba(255, 165, 0, 0.4)';
          };

          const mouseLeaveHandler = () => {
            button.style.background = 'rgba(255, 165, 0, 0.8)';
            button.style.opacity = '0.7';
            button.style.transform = 'scale(0.9)';
            button.style.boxShadow = '0 4px 15px rgba(255, 165, 0, 0.3)';
          };

          const clickHandler = () => {
            // Toggle always on top state via IPC
            window.electronAPI?.toggleAlwaysOnTop();
          };

          button.addEventListener('mouseenter', mouseEnterHandler);
          button.addEventListener('mouseleave', mouseLeaveHandler);
          button.addEventListener('click', clickHandler);

          // Store handlers for cleanup
          ScrollRefreshManager.handlers.pinMouseEnter = mouseEnterHandler;
          ScrollRefreshManager.handlers.pinMouseLeave = mouseLeaveHandler;
          ScrollRefreshManager.handlers.pinClick = clickHandler;

          document.body.appendChild(button);

          // Store reference for cleanup
          ScrollRefreshManager.elements.pinButton = button;
        }

        // Create floating refresh button with proper reference management
        function createFloatingRefreshButton() {
          if (document.getElementById('floating-refresh-btn')) return;

          const button = document.createElement('button');
          button.id = 'floating-refresh-btn';
          button.innerHTML = '↻';
          button.title = 'Refresh page';
          button.style.cssText = \`
            position: fixed;
            bottom: 30px;
            left: 30px;
            width: 50px;
            height: 50px;
            background: rgba(0, 102, 204, 0.8);
            color: white;
            border: none;
            border-radius: 50%;
            font-size: 20px;
            font-weight: bold;
            cursor: pointer;
            z-index: 10001;
            box-shadow: 0 4px 15px rgba(0, 102, 204, 0.3);
            backdrop-filter: blur(10px);
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            user-select: none;
            outline: none;
            opacity: 0.7;
            transform: scale(0.9);
          \`;

          // Event handlers stored in manager for proper cleanup
          const mouseEnterHandler = () => {
            button.style.background = 'rgba(0, 102, 204, 0.95)';
            button.style.opacity = '1';
            button.style.transform = 'scale(1.05)';
            button.style.boxShadow = '0 6px 20px rgba(0, 102, 204, 0.4)';
          };

          const mouseLeaveHandler = () => {
            button.style.background = 'rgba(0, 102, 204, 0.8)';
            button.style.opacity = '0.7';
            button.style.transform = 'scale(0.9)';
            button.style.boxShadow = '0 4px 15px rgba(0, 102, 204, 0.3)';
          };

          const clickHandler = () => {
            button.style.animation = 'spin 0.5s ease-in-out';
            button.style.background = 'rgba(0, 160, 0, 0.9)';
            setTimeout(() => window.location.reload(), 500);
          };

          const mouseDownHandler = () => {
            button.style.transform = 'scale(0.85)';
            button.style.background = 'rgba(0, 82, 204, 0.9)';
          };

          const mouseUpHandler = () => {
            button.style.transform = 'scale(1.05)';
            button.style.background = 'rgba(0, 102, 204, 0.95)';
          };

          // Store handlers for cleanup
          button._handlers = {
            mouseEnter: mouseEnterHandler,
            mouseLeave: mouseLeaveHandler,
            click: clickHandler,
            mouseDown: mouseDownHandler,
            mouseUp: mouseUpHandler
          };

          // Add event listeners
          button.addEventListener('mouseenter', mouseEnterHandler);
          button.addEventListener('mouseleave', mouseLeaveHandler);
          button.addEventListener('click', clickHandler);
          button.addEventListener('mousedown', mouseDownHandler);
          button.addEventListener('mouseup', mouseUpHandler);

          document.body.appendChild(button);
          ScrollRefreshManager.elements.floatingBtn = button;

          // Add CSS animation if not exists
          if (!document.getElementById('floating-btn-style')) {
            const style = document.createElement('style');
            style.id = 'floating-btn-style';
            style.textContent = \`
              @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
              @keyframes gentle-float {
                0%, 100% { transform: translateY(0px); }
                50% { transform: translateY(-5px); }
              }
            \`;
            document.head.appendChild(style);
            ScrollRefreshManager.elements.btnStyle = style;
          }

          // Floating animation with proper timeout management
          ScrollRefreshManager.timeouts.floatAnimation = setTimeout(() => {
            if (button && button.style) {
              button.style.animation = 'gentle-float 3s ease-in-out infinite';
            }
          }, 1000);

          // Mouse move handler with proper cleanup and input validation
          ScrollRefreshManager.handlers.handleMouseMove = function(e) {
            // Input validation for mouse event
            if (!e || typeof e.clientX !== 'number' || !isFinite(e.clientX)) {
              return;
            }

            // Reasonable bounds for clientX to prevent abuse
            if (e.clientX < 0 || e.clientX > 10000) return;

            if (ScrollRefreshManager.timeouts.mouseHide) {
              clearTimeout(ScrollRefreshManager.timeouts.mouseHide);
            }

            if (e.clientX < 100) {
              button.style.opacity = '0.9';
              button.style.transform = 'scale(1)';
            } else if (e.clientX > 150) {
              ScrollRefreshManager.timeouts.mouseHide = setTimeout(() => {
                if (button && button.style) {
                  button.style.opacity = '0.4';
                  button.style.transform = 'scale(0.8)';
                }
              }, 1000);
            }
          };

          // Scroll show handler with proper timeout management
          ScrollRefreshManager.handlers.handleScrollShow = function() {
            if (button && button.style) {
              button.style.opacity = '0.9';
              button.style.transform = 'scale(1)';

              if (ScrollRefreshManager.timeouts.scrollShow) {
                clearTimeout(ScrollRefreshManager.timeouts.scrollShow);
              }

              ScrollRefreshManager.timeouts.scrollShow = setTimeout(() => {
                if (button && button.style) {
                  button.style.opacity = '0.7';
                  button.style.transform = 'scale(0.9)';
                }
              }, 2000);
            }
          };

          // Add global event listeners with stored references
          document.addEventListener('mousemove', ScrollRefreshManager.handlers.handleMouseMove);
          window.addEventListener('scroll', ScrollRefreshManager.handlers.handleScrollShow, { passive: true });
        }

        // Create the floating pin button
        createFloatingPinButton();

        // Create the floating refresh button
        createFloatingRefreshButton();

        // Add event listeners with stored references
        window.addEventListener('scroll', ScrollRefreshManager.handlers.handleScroll, { passive: true });
        window.addEventListener('wheel', ScrollRefreshManager.handlers.handleWheel, { passive: true });

        // Idle cleanup interval with proper reference
        ScrollRefreshManager.intervals.idle = setInterval(() => {
          const data = ScrollRefreshManager.data;
          if (data.wheelDeltaAccumulator > 0 && !ScrollRefreshManager.timeouts.indicatorTimeout) {
            data.wheelDeltaAccumulator *= 0.9;
            if (data.wheelDeltaAccumulator < 10) {
              data.wheelDeltaAccumulator = 0;
              hideRefreshIndicator();
            }
          }
        }, 100);

        // Store interval reference for cleanup
        window.scrollRefreshInterval = ScrollRefreshManager.intervals.idle;

        // Comprehensive cleanup function with proper reference management
        window.scrollRefreshCleanup = function() {
          const manager = ScrollRefreshManager;

          // Clear intervals
          if (manager.intervals.idle) {
            clearInterval(manager.intervals.idle);
            manager.intervals.idle = null;
          }

          // Clear all timeouts
          Object.keys(manager.timeouts).forEach(key => {
            if (manager.timeouts[key]) {
              clearTimeout(manager.timeouts[key]);
              manager.timeouts[key] = null;
            }
          });

          // Remove scroll event listeners with exact function references
          if (manager.handlers.handleScroll) {
            window.removeEventListener('scroll', manager.handlers.handleScroll);
          }
          if (manager.handlers.handleWheel) {
            window.removeEventListener('wheel', manager.handlers.handleWheel);
          }
          if (manager.handlers.handleMouseMove) {
            document.removeEventListener('mousemove', manager.handlers.handleMouseMove);
          }
          if (manager.handlers.handleScrollShow) {
            window.removeEventListener('scroll', manager.handlers.handleScrollShow);
          }

          // Remove pin button and its event listeners
          if (manager.elements.pinButton) {
            const pinButton = manager.elements.pinButton;
            if (manager.handlers.pinMouseEnter) {
              pinButton.removeEventListener('mouseenter', manager.handlers.pinMouseEnter);
            }
            if (manager.handlers.pinMouseLeave) {
              pinButton.removeEventListener('mouseleave', manager.handlers.pinMouseLeave);
            }
            if (manager.handlers.pinClick) {
              pinButton.removeEventListener('click', manager.handlers.pinClick);
            }
            pinButton.remove();
            manager.elements.pinButton = null;
          }

          // Remove floating button and its event listeners
          if (manager.elements.floatingBtn) {
            const button = manager.elements.floatingBtn;
            if (button._handlers) {
              button.removeEventListener('mouseenter', button._handlers.mouseEnter);
              button.removeEventListener('mouseleave', button._handlers.mouseLeave);
              button.removeEventListener('click', button._handlers.click);
              button.removeEventListener('mousedown', button._handlers.mouseDown);
              button.removeEventListener('mouseup', button._handlers.mouseUp);
              delete button._handlers;
            }
            button.remove();
            manager.elements.floatingBtn = null;
          }

          // Remove other elements
          if (manager.elements.indicator) {
            manager.elements.indicator.remove();
            manager.elements.indicator = null;
          }

          if (manager.elements.spinnerStyle) {
            manager.elements.spinnerStyle.remove();
            manager.elements.spinnerStyle = null;
          }

          if (manager.elements.btnStyle) {
            manager.elements.btnStyle.remove();
            manager.elements.btnStyle = null;
          }

          // Clear global references
          delete window.scrollRefreshData;
          delete window.scrollRefreshCleanup;
          delete window.scrollRefreshInterval;

          // Clear manager object to prevent any remaining references
          Object.keys(manager).forEach(key => {
            if (typeof manager[key] === 'object' && manager[key] !== null) {
              Object.keys(manager[key]).forEach(subKey => {
                manager[key][subKey] = null;
              });
            }
            manager[key] = null;
          });
        };
      `
        )
        .catch((error) => {
          console.warn('Failed to inject scroll refresh functionality:', error);
        });
    } catch (error) {
      console.warn('Error executing JavaScript:', error);
    } finally {
      // Reset loading flag with proper timing and validation
      const loadingDuration =
        Date.now() - (mainWindow._loadingStartTime || Date.now());
      const resetDelay = Math.max(100, Math.min(1000, loadingDuration)); // Adaptive delay

      setTimeout(() => {
        if (mainWindow) {
          mainWindow._isLoading = false;
          delete mainWindow._loadingStartTime;
        }
      }, resetDelay);
    }

    // Set up cache clearing
    const clearCache = () => {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        try {
          mainWindow.webContents.session.clearCache();
        } catch (error) {
          // Ignore errors if webContents is already destroyed
        }
      }
    };

    // Clear cache every 30 minutes
    mainWindow._cacheInterval = setInterval(clearCache, 30 * 60 * 1000);

    // Add memory pressure monitoring for proactive cleanup
    if (!mainWindow._memoryMonitorInterval) {
      mainWindow._memoryMonitorInterval = setInterval(() => {
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
          try {
            mainWindow.webContents
              .executeJavaScript(
                `
              // Monitor memory usage and perform cleanup if needed
              if (window.performance && window.performance.memory) {
                const memInfo = window.performance.memory;
                const usageRatio = memInfo.usedJSHeapSize / memInfo.jsHeapSizeLimit;

                // If memory usage is high (>80%), perform proactive cleanup
                if (usageRatio > 0.8) {
                  console.warn('High memory usage detected:', Math.round(usageRatio * 100) + '%');

                  // Force garbage collection if available
                  if (window.gc) {
                    window.gc();
                  }

                  // Perform cleanup if function exists
                  if (window.scrollRefreshCleanup) {
                    window.scrollRefreshCleanup();
                  }
                }
              }
            `
              )
              .catch((error) => {
                // Silently ignore memory monitoring errors
              });
          } catch (error) {
            // Silently ignore memory monitoring errors
          }
        }
      }, 60000); // Check every minute
    }
  });

  // Handle external links with security validation
  const windowOpenHandler = ({ url }) => {
    // Security: Validate URL before opening externally
    if (isSafeUrl(url)) {
      shell.openExternal(url);
    } else {
      console.warn(`Blocked potentially unsafe URL: ${url}`);
    }
    return { action: 'deny' };
  };

  mainWindow.webContents.setWindowOpenHandler(windowOpenHandler);

  // Security: Prevent navigation to external sites
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (parsedUrl.origin !== 'https://bsky.app') {
      event.preventDefault();
    }
  });

  // Handle window close event - minimize to tray instead of quitting
  mainWindow.on('close', async (event) => {
    if (!willQuit) {
      event.preventDefault();

      // Perform JavaScript cleanup before hiding to prevent memory leaks
      try {
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
          await mainWindow.webContents.executeJavaScript(
            'if(window.scrollRefreshCleanup) window.scrollRefreshCleanup()'
          );
        }
      } catch (error) {
        console.warn('JavaScript cleanup during minimize failed:', error);
      }

      mainWindow.hide();

      // Show notification (optional)
      if (process.platform === 'win32') {
        try {
          await mainWindow.webContents.executeJavaScript(`
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('Bluesky Client', {
                body: 'App minimized to system tray. Click tray icon to restore.',
                icon: '/icon.png'
              });
            }
          `);
        } catch (notificationError) {
          console.warn('Failed to show notification:', notificationError);
        }
      }
    }
  });

  // Consolidated window cleanup
  mainWindow.on('closed', () => {
    // Clear the window open handler only if webContents still exists
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
      try {
        mainWindow.webContents.setWindowOpenHandler(null);
      } catch (error) {
        // Ignore errors if webContents is already destroyed
      }
    }

    // Clear all intervals
    if (mainWindow && mainWindow._cacheInterval) {
      clearInterval(mainWindow._cacheInterval);
      mainWindow._cacheInterval = null;
    }

    if (mainWindow && mainWindow._memoryMonitorInterval) {
      clearInterval(mainWindow._memoryMonitorInterval);
      mainWindow._memoryMonitorInterval = null;
    }

    // Clear loading flags
    if (mainWindow) {
      delete mainWindow._isLoading;
      delete mainWindow._loadingStartTime;
    }

    // Clear global reference
    mainWindow = null;
  });

  // Clean up JavaScript when window is destroyed
  mainWindow.on('destroyed', () => {
    // At this point, webContents is already being cleaned up by Electron
    // Ensure we clear all remaining resources
    if (mainWindow) {
      // Clear any remaining intervals
      if (mainWindow._cacheInterval) {
        clearInterval(mainWindow._cacheInterval);
        mainWindow._cacheInterval = null;
      }

      if (mainWindow._memoryMonitorInterval) {
        clearInterval(mainWindow._memoryMonitorInterval);
        mainWindow._memoryMonitorInterval = null;
      }

      // Clear loading flags
      delete mainWindow._isLoading;
      delete mainWindow._loadingStartTime;

      // Clear global reference
      mainWindow = null;
    }
  });

  // Handle renderer process crashes with improved cleanup
  mainWindow.webContents.on('render-process-gone', async (event, details) => {
    console.warn('Renderer process gone:', details);

    // Attempt cleanup only if process was killed (not crashed)
    if (details.reason === 'killed' || details.reason === 'clean-exit') {
      try {
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
          // Try to execute JavaScript cleanup if webContents is still responsive
          await mainWindow.webContents
            .executeJavaScript(
              'if(window.scrollRefreshCleanup) window.scrollRefreshCleanup()'
            )
            .catch((error) => {
              console.warn(
                'JavaScript cleanup during render-process-gone failed:',
                error
              );
            });
        }
      } catch (error) {
        console.warn(
          'Failed to execute JavaScript cleanup during render-process-gone:',
          error
        );
      }
    } else {
      console.log(
        'Renderer process crashed, automatic cleanup will occur on window destruction'
      );
    }

    // Clear all intervals since renderer is gone
    if (mainWindow && mainWindow._cacheInterval) {
      clearInterval(mainWindow._cacheInterval);
      mainWindow._cacheInterval = null;
    }

    if (mainWindow && mainWindow._memoryMonitorInterval) {
      clearInterval(mainWindow._memoryMonitorInterval);
      mainWindow._memoryMonitorInterval = null;
    }
  });

  // Handle unresponsive renderer process
  mainWindow.webContents.on('unresponsive', () => {
    console.warn('Renderer process is unresponsive, attempting cleanup...');

    try {
      // Clear all intervals since renderer is unresponsive
      if (mainWindow && mainWindow._cacheInterval) {
        clearInterval(mainWindow._cacheInterval);
        mainWindow._cacheInterval = null;
      }

      if (mainWindow && mainWindow._memoryMonitorInterval) {
        clearInterval(mainWindow._memoryMonitorInterval);
        mainWindow._memoryMonitorInterval = null;
      }
    } catch (error) {
      console.warn('Failed to cleanup during unresponsive event:', error);
    }
  });

  // Handle responsive renderer after being unresponsive
  mainWindow.webContents.on('responsive', () => {
    console.log('Renderer process is responsive again');

    // Restart cache management if needed
    const clearCache = () => {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        try {
          mainWindow.webContents.session.clearCache();
        } catch (error) {
          // Ignore errors if webContents is already destroyed
        }
      }
    };

    if (!mainWindow._cacheInterval) {
      mainWindow._cacheInterval = setInterval(clearCache, 30 * 60 * 1000);
    }
  });
}

function createTray() {
  // Create tray icon with file existence check
  const iconPath = path.join(__dirname, 'icon.png');

  if (!fs.existsSync(iconPath)) {
    console.error('Tray icon file not found:', iconPath);
    // Create a simple fallback icon or continue without tray
    const trayIcon = nativeImage.createEmpty();
    tray = new Tray(trayIcon);
  } else {
    const trayIcon = nativeImage
      .createFromPath(iconPath)
      .resize({ width: 16, height: 16 });
    tray = new Tray(trayIcon);
  }
  tray.setToolTip('Bluesky Client');

  // Create tray context menu
  const trayMenu = Menu.buildFromTemplate([
    {
      label: 'Show/Hide',
      click: () => {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Refresh',
      accelerator: 'F5',
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.reload();
        }
      },
    },
    {
      label: 'Open Bluesky in Browser',
      click: () => {
        shell.openExternal('https://bsky.app');
      },
    },
    { type: 'separator' },
    {
      label: 'Exit',
      accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
      click: () => {
        willQuit = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(trayMenu);

  // Double-click to show window
  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

function cleanupApp() {
  // Clean up all app event listeners
  appEventListeners.forEach(({ event, listener }) => {
    app.off(event, listener);
  });
  appEventListeners = [];

  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }

  // Clean up tray
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

// Safe event listener registration
function addAppListener(event, listener) {
  app.on(event, listener);
  appEventListeners.push({ event, listener });
}

// IPC handler for toggle always on top
ipcMain.on('toggle-always-on-top', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const currentState = mainWindow.isAlwaysOnTop();
    mainWindow.setAlwaysOnTop(!currentState);

    // Notify renderer about the state change
    mainWindow.webContents.send('always-on-top-changed', !currentState);
  }
});

// Register app events with cleanup tracking
addAppListener('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    cleanupApp();
    app.quit();
  }
});

addAppListener('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

addAppListener('before-quit', () => {
  willQuit = true;
});

// Security: Handle uncaught exceptions safely with graceful shutdown
addAppListener('uncaughtException', (error) => {
  const sanitizedError = sanitizeError(error);
  console.error('Uncaught Exception:', sanitizedError);

  // Attempt graceful cleanup
  performGracefulCleanup()
    .then(() => {
      console.log('Graceful cleanup completed');
      process.exit(1);
    })
    .catch((cleanupError) => {
      console.error('Cleanup failed:', cleanupError);
      // Force exit after timeout if cleanup fails
      setTimeout(() => process.exit(1), 5000);
    });
});

// Security: Handle unhandled rejections safely with cleanup
addAppListener('unhandledRejection', (reason, promise) => {
  const sanitizedReason = sanitizeError(reason);
  console.error('Unhandled Rejection at:', promise, 'reason:', sanitizedReason);

  // Attempt cleanup if window exists (non-blocking for rejections)
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents
        .executeJavaScript(
          'if(window.scrollRefreshCleanup) window.scrollRefreshCleanup()'
        )
        .catch((error) => {
          console.warn(
            'JavaScript cleanup failed during unhandled rejection:',
            error
          );
        });
    } catch (error) {
      console.warn(
        'Failed to execute JavaScript cleanup during unhandled rejection:',
        error
      );
    }
  }
});

// Graceful cleanup function for proper resource management
async function performGracefulCleanup() {
  const cleanupPromises = [];

  // Cleanup JavaScript if window exists
  if (mainWindow && !mainWindow.isDestroyed()) {
    cleanupPromises.push(
      new Promise((resolve) => {
        try {
          mainWindow.webContents
            .executeJavaScript(
              'if(window.scrollRefreshCleanup) window.scrollRefreshCleanup()'
            )
            .then(() => resolve())
            .catch((error) => {
              console.warn('JavaScript cleanup failed:', error);
              resolve(); // Continue even if cleanup fails
            });
        } catch (error) {
          console.warn('Failed to execute JavaScript cleanup:', error);
          resolve(); // Continue even if cleanup fails
        }
      })
    );
  }

  // Wait for JavaScript cleanup (with timeout)
  if (cleanupPromises.length > 0) {
    await Promise.race([
      Promise.all(cleanupPromises),
      new Promise((resolve) => setTimeout(resolve, 3000)), // 3 second timeout
    ]);
  }

  // Perform main app cleanup
  try {
    cleanupApp();
  } catch (cleanupError) {
    console.error('App cleanup failed:', cleanupError);
  }
}

app.whenReady().then(() => {
  createWindow();
  createTray();
});
