import { app, BrowserWindow, ipcMain } from "electron"
import { join } from "path"
import { electronApp, optimizer, is } from "@electron-toolkit/utils"
import icon from "../../resources/icon.png?asset"
import { SerialPort } from "serialport"
import { ReadlineParser } from "@serialport/parser-readline"
import { MongoClient, ObjectId } from "mongodb"
import Store from "electron-store"
import "dotenv/config"

type OvenId = "oven1" | "oven2"
type ActiveSession = {
  sessionId: string
  productId: string
  operation: string
  quantity: number
  startTime: string
}

const store = new Store()

// ---- MongoDB ----
const mongo = new MongoClient("mongodb://localhost:27017")
let db: ReturnType<MongoClient["db"]>

async function initMongo() {
  await mongo.connect()
  db = mongo.db("ovens_db")
  console.log("MongoDB connected")
}

// ---- Serial ----
const SERIAL_PATH = process.env.SERIAL_PATH || "/dev/ttyS2" // Linux: "/dev/ttyS2"
const BAUD_RATE = Number(process.env.SERIAL_BAUD || 115200)

// Dernière valeur reçue par four (affichage temps réel)
const latest: Record<OvenId, number | null> = { oven1: null, oven2: null }

// Accumulateurs (pour moyenne sur l'intervalle)
const minuteAgg: Record<OvenId, { sum: number; count: number }> = {
  oven1: { sum: 0, count: 0 },
  oven2: { sum: 0, count: 0 }
}

// ---- SETTINGS (opérations + logging) ----
type Settings = {
  operations: {
    oven1: string[]
    oven2: string[]
  }
  logging: {
    oven1: { intervalSec: number; aggregation: "avg" | "last"; alignToMinute: boolean }
    oven2: { intervalSec: number; aggregation: "avg" | "last"; alignToMinute: boolean }
  }
}

const defaultSettings: Settings = {
  operations: {
    oven1: ["Colle Blanche", "Colle Noir", "1er Peinture", "Déshydratation", "2éme Peinture", "Vernis Dolphon"],
    oven2: ["Colle Blanche", "Colle Noir", "1er Peinture", "Déshydratation", "2éme Peinture", "Vernis Dolphon"]
  },
  logging: {
    oven1: { intervalSec: 60, aggregation: "avg", alignToMinute: false },
    oven2: { intervalSec: 60, aggregation: "avg", alignToMinute: false }
  }
}

function getSettings(): Settings {
  const s = store.get("settings") as Settings | undefined
  return { ...defaultSettings, ...(s || {}) }
}

// Timers d'enregistrement configurables (+ timeout d’alignement)
const sampleTimers: Record<OvenId, NodeJS.Timeout | null> = { oven1: null, oven2: null }
const alignTimeouts: Record<OvenId, NodeJS.Timeout | null> = { oven1: null, oven2: null }

function clearTimersFor(ovenId: OvenId) {
  if (sampleTimers[ovenId]) { clearInterval(sampleTimers[ovenId]!); sampleTimers[ovenId] = null }
  if (alignTimeouts[ovenId]) { clearTimeout(alignTimeouts[ovenId]!); alignTimeouts[ovenId] = null }
}

function startLoggingTimer(ovenId: OvenId) {
  clearTimersFor(ovenId)
  const active = store.get(`activeSession-${ovenId}`)
  if (!active) return

  const s = getSettings().logging[ovenId]
  const ms = Math.max(5_000, (s.intervalSec || 60) * 1000) // garde une sécurité min 5s

  if (s.alignToMinute) {
    const toNext = ms - (Date.now() % ms)
    alignTimeouts[ovenId] = setTimeout(() => {
      flushMinute(ovenId).catch(console.error)
      sampleTimers[ovenId] = setInterval(() => flushMinute(ovenId).catch(console.error), ms)
    }, toNext)
  } else {
    sampleTimers[ovenId] = setInterval(() => flushMinute(ovenId).catch(console.error), ms)
  }
}

// ---- Serial reader ----
function initSerialReader() {
  const port = new SerialPort({ path: SERIAL_PATH, baudRate: BAUD_RATE })
  const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }))

  port.on("open", () => console.log(`Serial ouvert sur ${SERIAL_PATH} @${BAUD_RATE}`))
  port.on("error", (err) => console.error("Serial error:", err.message))

  parser.on("data", async (line: string) => {
    try {
      const data = JSON.parse(line.trim())
      if (typeof data.temp1 === "number") await handleTemperature("oven1", data.temp1)
      if (typeof data.temp2 === "number") await handleTemperature("oven2", data.temp2)
    } catch {
      // ligne non JSON → ignore
    }
  })
}

async function handleTemperature(ovenId: OvenId, value: number) {
  latest[ovenId] = value

  // Broadcast aux fenêtres (pour affichage temps réel)
  const payload = { ovenId, value, timestamp: new Date().toISOString() }
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("temperature-update", payload)
  }

  // Accumule pour le flush (si agrégation = avg)
  minuteAgg[ovenId].sum += value
  minuteAgg[ovenId].count += 1
}

async function flushMinute(ovenId: OvenId) {
  const key = `activeSession-${ovenId}`
  const active = store.get(key) as ActiveSession | undefined
  if (!active || !db) {
    // Pas de session → reset l'accumulateur et sortir
    minuteAgg[ovenId] = { sum: 0, count: 0 }
    return
  }

  const { sum, count } = minuteAgg[ovenId]
  const s = getSettings().logging[ovenId]

  let tempToSave: number | null = null
  if (s.aggregation === "avg") {
    tempToSave = count > 0 ? (sum / count) : (typeof latest[ovenId] === "number" ? latest[ovenId] : null)
  } else { // "last"
    tempToSave = typeof latest[ovenId] === "number" ? latest[ovenId] : null
  }

  if (tempToSave != null) {
    await db.collection(active.productId).insertOne({
      ovenId,
      temperature: Number(tempToSave.toFixed(2)),
      timestamp: new Date()
    })
  }

  // Reset accumulateur pour la prochaine fenêtre
  minuteAgg[ovenId] = { sum: 0, count: 0 }
}

// ---- IPC ----

// État four (On/Off + temp)
ipcMain.handle("get-oven-state", async (_e, ovenId: OvenId) => {
  const active = store.get(`activeSession-${ovenId}`) as ActiveSession | undefined
  return {
    status: active ? "On" : "Off",
    temperature: latest[ovenId] ?? null
  }
})

// Réglages: lire / sauvegarder
ipcMain.handle("get-settings", async () => {
  return { ok: true, data: getSettings() }
})

ipcMain.handle("save-settings", async (_e, next: Settings) => {
  // merge propre avec défauts
  const merged: Settings = {
    ...defaultSettings,
    ...next,
    operations: {
      oven1: next.operations?.oven1 ?? defaultSettings.operations.oven1,
      oven2: next.operations?.oven2 ?? defaultSettings.operations.oven2
    },
    logging: {
      oven1: { ...defaultSettings.logging.oven1, ...(next.logging?.oven1 || {}) },
      oven2: { ...defaultSettings.logging.oven2, ...(next.logging?.oven2 || {}) }
    }
  }
  store.set("settings", merged)

  // Réapplique l’intervalle si sessions actives
  ;(["oven1","oven2"] as const).forEach((ov) => startLoggingTimer(ov))

  return { ok: true }
})

// Start logging
ipcMain.handle(
  "start-temperature-logging",
  async (_e, args: { ovenId: OvenId; orderNumber: string; operation: string; quantity: number }) => {
    const { ovenId, orderNumber, operation, quantity } = args
    const key = `activeSession-${ovenId}`

    if (!db) return { ok: false, error: "db_not_ready" }
    if (store.has(key)) return { ok: false, error: "already_running" } // une session par four

    const startTime = new Date()
    const productId = String(orderNumber).trim() // OF = productId

    // Crée l'entrée de session
    const res = await db.collection(`sessions_${ovenId}`).insertOne({
      productId,
      ovenId,
      operation,
      quantity,
      startTime,
      endTime: null
    })

    const activeSession: ActiveSession = {
      sessionId: res.insertedId.toString(),
      productId,
      operation,
      quantity,
      startTime: startTime.toISOString()
    }
    store.set(key, activeSession)

    // Reset de l'accumulateur et (re)démarre le timer selon réglages
    minuteAgg[ovenId] = { sum: 0, count: 0 }
    startLoggingTimer(ovenId)

    console.log(`Session demarree ${ovenId} -> OF=${productId}, op=${operation}, qty=${quantity}`)
    return { ok: true }
  }
)

// Stop logging
ipcMain.handle("stop-temperature-logging", async (_e, ovenId: OvenId) => {
  const key = `activeSession-${ovenId}`
  const active = store.get(key) as ActiveSession | undefined
  if (!active) return { ok: false, error: "not_running" }
  if (!db) return { ok: false, error: "db_not_ready" }

  // Flush final puis stop des timers
  await flushMinute(ovenId).catch(console.error)

  await db
    .collection(`sessions_${ovenId}`)
    .updateOne({ _id: new ObjectId(active.sessionId) }, { $set: { endTime: new Date() } })

  store.delete(key)
  clearTimersFor(ovenId)

  console.log(`Session arretee ${ovenId} -> OF=${active.productId}`)
  return { ok: true }
})

ipcMain.handle("get-latest-temperature", async (_e, ovenId: OvenId) => latest[ovenId] ?? null)

// Historique: toutes sessions
ipcMain.handle("get-all-sessions", async (_e, args?: { limit?: number }) => {
  const limit = args?.limit ?? 500
  if (!db) return { ok: false, error: "db_not_ready" }

  const [s1, s2] = await Promise.all([
    db.collection("sessions_oven1").find({}).sort({ startTime: -1 }).limit(limit).toArray(),
    db.collection("sessions_oven2").find({}).sort({ startTime: -1 }).limit(limit).toArray()
  ])

  const mapDoc = (doc: any) => ({
    id: String(doc._id),
    ovenId: doc.ovenId as "oven1" | "oven2",
    productId: String(doc.productId ?? ""),
    operation: String(doc.operation ?? ""),
    quantity: typeof doc.quantity === "number" ? doc.quantity : Number(doc.quantity ?? 0),
    startTime: doc.startTime ? new Date(doc.startTime).toISOString() : null,
    endTime: doc.endTime ? new Date(doc.endTime).toISOString() : null
  })

  const merged = [...s1.map(mapDoc), ...s2.map(mapDoc)]
  merged.sort((a, b) => {
    const ta = a.startTime ? Date.parse(a.startTime) : 0
    const tb = b.startTime ? Date.parse(b.startTime) : 0
    return tb - ta
  })

  return { ok: true, data: merged }
})

// Détail session
ipcMain.handle(
  "get-session-by-id",
  async (_e, args: { ovenId: "oven1" | "oven2"; sessionId: string }) => {
    if (!db) return { ok: false, error: "db_not_ready" }
    const { ovenId, sessionId } = args
    const doc = await db.collection(`sessions_${ovenId}`).findOne({ _id: new ObjectId(sessionId) })
    if (!doc) return { ok: false, error: "not_found" }

    return {
      ok: true,
      data: {
        id: String(doc._id),
        ovenId: doc.ovenId,
        productId: String(doc.productId ?? ""),
        operation: String(doc.operation ?? ""),
        quantity: typeof doc.quantity === "number" ? doc.quantity : Number(doc.quantity ?? 0),
        startTime: doc.startTime ? new Date(doc.startTime).toISOString() : null,
        endTime: doc.endTime ? new Date(doc.endTime).toISOString() : null
      }
    }
  }
)

// Températures d'une session (collection = productId)
ipcMain.handle(
  "get-session-temperatures",
  async (
    _e,
    args: { productId: string; startTime?: string | null; endTime?: string | null; limit?: number }
  ) => {
    if (!db) return { ok: false, error: "db_not_ready" }
    const { productId, startTime, endTime, limit = 20000 } = args

    const col = db.collection(productId)
    const q: any = {}
    if (startTime || endTime) {
      q.timestamp = {}
      if (startTime) q.timestamp.$gte = new Date(startTime)
      if (endTime) q.timestamp.$lte = new Date(endTime)
    }

    const docs = await col
      .find(q, { projection: { _id: 0, temperature: 1, timestamp: 1 } })
      .sort({ timestamp: 1 })
      .limit(limit)
      .toArray()

    const data = docs.map((d) => ({
      value: Number(d.temperature),
      timestamp: new Date(d.timestamp).toISOString()
    }))
    return { ok: true, data }
  }
)

// Restaure une session active (pour pré-remplir la TrackingPage)
ipcMain.handle("get-active-session", async (_e, ovenId: OvenId) => {
  const key = `activeSession-${ovenId}`
  const active = store.get(key) as ActiveSession | undefined
  const temperature = latest[ovenId] ?? null

  if (!active) {
    return { isRunning: false, temperature }
  }

  return {
    isRunning: true,
    temperature,
    productId: active.productId,
    operation: active.operation,
    quantity: active.quantity,
    startTime: active.startTime
  }
})

// ---- Window / App bootstrap ----
function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    //kiosk: true,
    autoHideMenuBar: true,
    ...(process.platform === "linux" ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false
    }
  })

  mainWindow.on("ready-to-show", () => mainWindow.show())

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"])
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId("com.oven.app")
  await initMongo()
  initSerialReader()
  createWindow()
  console.log("SERIAL_PATH:", process.env.SERIAL_PATH)

  // Si des sessions étaient actives (store), relance les timers selon réglages
  ;(["oven1","oven2"] as const).forEach((ov) => startLoggingTimer(ov))

  app.on("browser-window-created", (_, window) => optimizer.watchWindowShortcuts(window))
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
