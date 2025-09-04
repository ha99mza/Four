// src/renderer/src/pages/HomePage.tsx
import { useEffect, useState } from "react"
import OvenCard from "@renderer/components/OvenCard"

type OvenId = "oven1" | "oven2"
type OvenState = { status: "On" | "Off"; temperature: number | null }

declare global {
  interface Window {
    electron: {
      ipcRenderer: {
        invoke: (channel: string, ...args: any[]) => Promise<any>
      }
    }
  }
}

export default function HomePage() {
  const [ovens, setOvens] = useState<Record<OvenId, OvenState>>({
    oven1: { status: "Off", temperature: null },
    oven2: { status: "Off", temperature: null }
  })

  // Récupération périodique des états depuis le main process
  useEffect(() => {
    let mounted = true

    const fetchStates = async () => {
      try {
        const [o1, o2] = await Promise.all([
          window.electron.ipcRenderer.invoke("get-oven-state", "oven1"),
          window.electron.ipcRenderer.invoke("get-oven-state", "oven2")
        ])
        if (!mounted) return

        setOvens({
          oven1: {
            status: (o1?.status === "On" ? "On" : "Off") as "On" | "Off",
            temperature: typeof o1?.temperature === "number" ? o1.temperature : null
          },
          oven2: {
            status: (o2?.status === "On" ? "On" : "Off") as "On" | "Off",
            temperature: typeof o2?.temperature === "number" ? o2.temperature : null
          }
        })
      } catch {
        // En cas d’erreur, on garde l’état courant
      }
    }

    fetchStates()
    const t = setInterval(fetchStates, 10000) // toutes les 2s
    return () => {
      mounted = false
      clearInterval(t)
    }
  }, [])

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <h1 className="text-2xl font-semibold mb-4">Accueil</h1>

      {/* Grid responsive : 1 colonne sur mobile, 2 colonnes sur desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <OvenCard
          ovenId="oven1"
          title="Four 1"
          status={ovens.oven1.status}
          temperature={ovens.oven1.temperature}
        />
        <OvenCard
          ovenId="oven2"
          title="Four 2"
          status={ovens.oven2.status}
          temperature={ovens.oven2.temperature}
        />
      </div>
    </div>
  )
}
