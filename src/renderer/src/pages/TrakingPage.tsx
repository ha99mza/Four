import React, { useEffect, useMemo, useState } from "react"
import { useParams } from "react-router-dom"
import { Button } from "@renderer/components/ui/button"
import { Play, Pause } from "lucide-react"
import Keyboard from "react-simple-keyboard"
import "react-simple-keyboard/build/css/index.css"
import "@renderer/styles/keyboard.css"

type OvenId = "oven1" | "oven2"
type LoggingSpec = { intervalSec: number; aggregation: "avg" | "last"; alignToMinute: boolean }

declare global {
  interface Window {
    electron: {
      ipcRenderer: {
        invoke: (channel: string, ...args: any[]) => Promise<any>
        on: (channel: string, listener: (event: any, ...args: any[]) => void) => () => void
        removeListener: (channel: string, listener: (...args: any[]) => void) => void
      }
    }
  }
}

export default function TrackingPage() {
  const { ovenId = "oven1" as OvenId } = useParams<{ ovenId: OvenId }>()
  const ovenName = ovenId === "oven1" ? "Oven I" : "Oven II"

  const [orderNumber, setOrderNumber] = useState<string>("")
  const [operation, setOperation] = useState<string>("")
  const [quantity, setQuantity] = useState<number | "">("")
  const [isRunning, setIsRunning] = useState(false)
  const [startTime, setStartTime] = useState<Date | null>(null)
  const [latestTemp, setLatestTemp] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Réglages
  const [opsForOven, setOpsForOven] = useState<string[]>([])
  const [logSpec, setLogSpec] = useState<LoggingSpec | null>(null)

  // 👉 état du clavier
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const [activeField, setActiveField] = useState<"orderNumber" | "quantity" | null>(null)

  // ---- utils clavier ----
  const getActiveValue = () => {
    if (activeField === "orderNumber") return orderNumber
    if (activeField === "quantity") return quantity === "" ? "" : String(quantity)
    return ""
  }
  const setActiveValue = (next: string) => {
    // ne garder que des chiffres
    const digits = next.replace(/\D+/g, "")
    if (activeField === "orderNumber") {
      setOrderNumber(digits)
    } else if (activeField === "quantity") {
      setQuantity(digits === "" ? "" : Number(digits))
    }
  }

  // --- Charge réglages (opérations + logging) selon le four ---
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const res = await window.electron.ipcRenderer.invoke("get-settings")
      const data = res?.data as {
        operations: { oven1: string[]; oven2: string[] }
        logging: { oven1: LoggingSpec; oven2: LoggingSpec }
      }
      if (!mounted) return
      const baseOps = ovenId === "oven1" ? data.operations.oven1 : data.operations.oven2
      setLogSpec(ovenId === "oven1" ? data.logging.oven1 : data.logging.oven2)

      // si l’opération courante n’est pas dans la liste (ex: session existante), on l’ajoute pour l’afficher
      if (operation && !baseOps.includes(operation)) {
        setOpsForOven([...baseOps, operation])
      } else {
        setOpsForOven(baseOps)
      }
    })()
    return () => { mounted = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ovenId])

  // --- Remplit à partir de la session active (ou draft si pas de session) ---
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const res = await window.electron.ipcRenderer.invoke("get-active-session", ovenId)
      if (!mounted) return

      setIsRunning(Boolean(res?.isRunning))
      setLatestTemp(typeof res?.temperature === "number" ? res.temperature : null)

      if (res?.isRunning) {
        setOrderNumber(res.productId ?? "")
        setOperation(res.operation ?? "")
        setQuantity(typeof res.quantity === "number" ? res.quantity : "")
        setStartTime(res.startTime ? new Date(res.startTime) : null)
        // session en cours -> cacher clavier
        setKeyboardVisible(false)
        setActiveField(null)
      } else {
        const draftRaw = localStorage.getItem(`draft-${ovenId}`)
        if (draftRaw) {
          try {
            const d = JSON.parse(draftRaw)
            setOrderNumber(d?.orderNumber ?? "")
            setOperation(d?.operation ?? "")
            setQuantity(typeof d?.quantity === "number" ? d.quantity : "")
          } catch {
            setOrderNumber(""); setOperation(""); setQuantity("")
          }
        } else {
          setOrderNumber(""); setOperation(""); setQuantity("")
        }
        setStartTime(null)
      }
    })()
    return () => { mounted = false }
  }, [ovenId])

  // --- Sauvegarde le draft quand pas de session en cours ---
  useEffect(() => {
    if (!isRunning) {
      const draft = { orderNumber, operation, quantity: typeof quantity === "number" ? quantity : "" }
      localStorage.setItem(`draft-${ovenId}`, JSON.stringify(draft))
    }
  }, [isRunning, orderNumber, operation, quantity, ovenId])

  // --- Température en temps réel ---
  useEffect(() => {
    const unsubscribe = window.electron.ipcRenderer.on("temperature-update", (_e, payload) => {
      if (payload?.ovenId === ovenId && typeof payload?.value === "number") {
        setLatestTemp(payload.value)
      }
    })
    return () => { if (typeof unsubscribe === "function") unsubscribe() }
  }, [ovenId])

  const canStart = useMemo(() => {
    return (
      !isRunning &&
      orderNumber.trim().length > 0 &&
      operation.trim().length > 0 &&
      typeof quantity === "number" &&
      quantity > 0
    )
  }, [isRunning, orderNumber, operation, quantity])

  const handleStart = async () => {
    setError(null)
    if (!canStart) {
      setError("Veuillez remplir OF, Opération et Quantité (> 0).")
      return
    }
    const res = await window.electron.ipcRenderer.invoke("start-temperature-logging", {
      ovenId,
      orderNumber: orderNumber.trim(),
      operation,
      quantity: Number(quantity)
    })
    if (res?.ok) {
      setIsRunning(true)
      setStartTime(new Date())
      localStorage.removeItem(`draft-${ovenId}`)
      setKeyboardVisible(false)
      setActiveField(null)
    } else {
      if (res?.error === "already_running") setError("Une session est déjà en cours pour ce four.")
      else if (res?.error === "db_not_ready") setError("La base de données n'est pas disponible.")
      else setError("Impossible de démarrer la session.")
    }
  }

  const handleStop = async () => {
    setError(null)
    const res = await window.electron.ipcRenderer.invoke("stop-temperature-logging", ovenId)
    if (res?.ok) {
      setIsRunning(false)
      setStartTime(null)
      const draft = { orderNumber, operation, quantity: typeof quantity === "number" ? quantity : "" }
      localStorage.setItem(`draft-${ovenId}`, JSON.stringify(draft))
    } else {
      if (res?.error === "not_running") setError("Aucune session en cours pour ce four.")
      else setError("Impossible d'arrêter la session.")
    }
  }

  // ---- Gestion des clics dans les inputs pour ouvrir le clavier ----
  const openKeyboardFor = (field: "orderNumber" | "quantity") => {
    if (isRunning) return
    setActiveField(field)
    setKeyboardVisible(true)
  }

  // ---- Gestion des touches du clavier ----
  const onKeyPress = (button: string) => {
    if (!activeField) return
    const current = getActiveValue()

    if (/^\d$/.test(button)) {
      setActiveValue(current + button)
      return
    }
    switch (button) {
      case "{effacer}":
        setActiveValue(current.slice(0, -1))
        break
      case "{retour}":
        setKeyboardVisible(false)
        setActiveField(null)
        break
      case "{valider}":
        setKeyboardVisible(false)
        setActiveField(null)
        break
      default:
        // ignore
        break
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{ovenName} — Tracking</h1>
      </div>

      {/* Température en direct */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">Température actuelle</div>
          <div className="text-2xl font-bold tabular-nums">
            {latestTemp != null ? `${Math.round(latestTemp)}°C` : "—"}
          </div>
        </div>
        {logSpec && (
          <div className="mt-2 text-xs text-muted-foreground">
            Enregistrement : {logSpec.intervalSec}s • {logSpec.aggregation === "avg" ? "moyenne" : "dernière valeur"}
            {logSpec.alignToMinute ? " • aligné à l’horloge" : ""}
          </div>
        )}
      </div>

      {/* Formulaire session */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Ordre de fabrication (OF)</label>
            <input
              type="text"
              inputMode="numeric"
              className="w-full h-11 rounded-lg bg-background border border-input px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="ex: 54662025"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value.replace(/\D+/g, ""))}
              onFocus={() => openKeyboardFor("orderNumber")}
              onClick={() => openKeyboardFor("orderNumber")}
              disabled={isRunning}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Opération</label>
            <select
              className="w-full h-11 rounded-lg bg-background border border-input px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={operation}
              onChange={(e) => setOperation(e.target.value)}
              disabled={isRunning || opsForOven.length === 0}
            >
              <option value="">{opsForOven.length ? "— Sélectionner —" : "— Aucune opération —"}</option>
              {opsForOven.map((op) => (
                <option key={op} value={op}>{op}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Quantité</label>
            <input
              type="text"
              inputMode="numeric"
              min={1}
              className="w-full h-11 rounded-lg bg-background border border-input px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="ex: 50"
              value={quantity === "" ? "" : String(quantity)}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D+/g, "")
                setQuantity(digits === "" ? "" : Number(digits))
              }}
              onFocus={() => openKeyboardFor("quantity")}
              onClick={() => openKeyboardFor("quantity")}
              disabled={isRunning}
            />
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          {!isRunning ? (
            <Button onClick={handleStart} disabled={!canStart} className="h-11 px-6 rounded-xl">
              <Play color="#24BD35" strokeWidth="4px" />
              <span className="ml-2">Start</span>
            </Button>
          ) : (
            <Button variant="destructive" onClick={handleStop} className="h-11 px-6 rounded-xl">
              <Pause color="#E31212" strokeWidth="4px" />
              <span className="ml-2">Stop</span>
            </Button>
          )}
        </div>
      </div>

      {/* --- CLAVIER NUMÉRIQUE --- */}
      {keyboardVisible && activeField && !isRunning && (
        <div className="fixed left-0 right-0 bottom-20 z-50 mx-auto max-w-2xl px-4">
          <div className="keyboard-scale rounded-2xl border border-border bg-card shadow-lg overflow-hidden">
            { <div className="px-3 py-2 text-xs text-muted-foreground border-b">
              {/* Clavier numérique — {activeField === "orderNumber" ? "OF" : "Quantité"} */}
            </div> }
            <div className="p-2">
              <Keyboard
                onKeyPress={onKeyPress}
                layout={{
                  default: ["1 2 3", "4 5 6", "7 8 9", "{retour} 0 {effacer}", "{valider}"],
                }}
                display={{
                  "{retour}": "Retour",
                  "{effacer}": "Effacer",
                  "{valider}": "Valider",
                }}
                theme="hg-theme-default keyboard-dark"
                buttonTheme={[
                  { class: "sk-action", buttons: "{retour} {effacer}" },
                  { class: "sk-validate", buttons: "{valider}" },
                ]}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
