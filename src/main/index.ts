import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { registerIpc } from './ipc'
import { ensureResolvedToolPaths } from './config'
import { installAgentIfNeeded, pokeAgentIfStale } from './agent-installer'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1000,
    minHeight: 640,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0d1117',
    webPreferences: { preload: join(__dirname, '../preload/index.js') },
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

void app.whenReady().then(async () => {
  registerIpc()
  try {
    await ensureResolvedToolPaths()
    await installAgentIfNeeded()
  } catch (e) {
    console.error('startup setup failed:', e)
  }
  // launchd can stop firing the agent's interval without ever failing loudly;
  // nudge it whenever it has gone quiet while the Mac was awake.
  setInterval(() => void pokeAgentIfStale().catch(e => console.error('agent poke failed:', e)), 60_000)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => app.quit())
