
import React, { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@renderer/components/ui/card"
import { Button } from "@renderer/components/ui/button"
import { ArrowBigLeft } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts"

type OvenId = "oven1" | "oven2"
type TempPoint = { value: number; timestamp: string }
type SessionMeta = {
  id: string
  ovenId: OvenId
  productId: string
  operation: string
  quantity: number
  startTime: string | null
  endTime: string | null
}

declare global {
  interface Window {
    electron: {
      ipcRenderer: {
        invoke: (channel: string, ...args: any[]) => Promise<any>
      }
    }
  }
}

// ← Ajuste cette valeur selon la hauteur réelle de ta BottomNav
const NAV_HEIGHT = 72 // px

function fmtDate(dt: string | null) {
  if (!dt) return "—"
  const d = new Date(dt)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString()
}
function durationMs(start: string | null, end: string | null) {
  if (!start) return 0
  const s = Date.parse(start)
  const e = end ? Date.parse(end) : Date.now()
  return Math.max(0, e - s)
}
function fmtDuration(ms: number) {
  const sec = Math.floor(ms / 1000)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const parts: string[] = []
  if (h) parts.push(`${h}h`)
  if (m || h) parts.push(`${m}m`)
  parts.push(`${s}s`)
  return parts.join(" ")
}

export default function SessionDetailPage() {
  const { ovenId, sessionId } = useParams<{ ovenId: OvenId; sessionId: string }>()
  const navigate = useNavigate()

  const [meta, setMeta] = useState<SessionMeta | null>(null)
  const [temps, setTemps] = useState<TempPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    const run = async () => {
      try {
        setLoading(true)
        setError(null)
        const resMeta = await window.electron.ipcRenderer.invoke("get-session-by-id", { ovenId, sessionId })
        if (!resMeta?.ok) throw new Error(resMeta?.error ?? "session_not_found")
        const m: SessionMeta = resMeta.data
        if (!mounted) return
        setMeta(m)

        const resTemp = await window.electron.ipcRenderer.invoke("get-session-temperatures", {
          productId: m.productId,
          startTime: m.startTime,
          endTime: m.endTime
        })
        if (!resTemp?.ok) throw new Error(resTemp?.error ?? "temps_error")
        if (!mounted) return
        setTemps(resTemp.data as TempPoint[])
      } catch (e: any) {
        setError(e?.message ?? "Erreur")
      } finally {
        if (mounted) setLoading(false)
      }
    }
    run()
    return () => { mounted = false }
  }, [ovenId, sessionId])

  const stats = useMemo(() => {
    if (!temps.length) return { avg: 0, min: 0, max: 0 }
    let sum = 0, min = Number.POSITIVE_INFINITY, max = Number.NEGATIVE_INFINITY
    for (const t of temps) {
      const v = Number(t.value)
      if (!Number.isNaN(v)) {
        sum += v
        if (v < min) min = v
        if (v > max) max = v
      }
    }
    return { avg: sum / temps.length, min, max }
  }, [temps])

  const chartData = useMemo(() => temps.map(p => ({ t: p.timestamp, v: Number(p.value) })), [temps])
  const xTick = (iso: string) => {
    const d = new Date(iso)
    return `${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}:${d.getSeconds().toString().padStart(2,"0")}`
  }

  return (
    <div
      className="w-full overflow-hidden" // pas de scroll global
      style={{ height: `calc(100vh - ${NAV_HEIGHT}px)` }}
    >
      {/* Colonne verticale: header + contenu. min-h-0 permet au grid interne de se dimensionner */}
      <div className="h-full flex flex-col min-h-0">
        {/* Header compact, fixe en hauteur */}
        <div className="shrink-0 h-12 px-4 sm:px-6 flex items-center justify-between border-b">
          <h1 className="text-lg sm:text-xl font-semibold">
            Détail session — {ovenId === "oven1" ? "Four 1" : "Four 2"}
          </h1>
          <Button variant="ghost" onClick={() => navigate(-1)}><ArrowBigLeft /> Retour</Button>
        </div>

        {/* Zone principale: grid sans scroll, hauteur restante */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 sm:p-6 min-h-0">
          {/* Colonne gauche (infos + stats) */}
          <Card className="rounded-2xl overflow-hidden min-h-0">
            <CardHeader className="py-3">
              <CardTitle className="text-base">Infos & Statistiques</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {/* Grille ultra-compacte, pas de scroll */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="text-muted-foreground">OF</div>
                <div className="font-medium truncate">{meta?.productId ?? "—"}</div>

                <div className="text-muted-foreground">Opération</div>
                <div className="font-medium truncate">{meta?.operation ?? "—"}</div>

                <div className="text-muted-foreground">Quantité</div>
                <div className="font-medium tabular-nums">{meta?.quantity ?? "—"}</div>

                <div className="text-muted-foreground">Début</div>
                <div className="font-medium">{fmtDate(meta?.startTime ?? null)}</div>

                <div className="text-muted-foreground">Fin</div>
                <div className="font-medium">
                  {meta?.endTime ? fmtDate(meta.endTime) : <span className="text-yellow-300">En cours</span>}
                </div>

                <div className="text-muted-foreground">Durée</div>
                <div className="font-medium tabular-nums">
                  {fmtDuration(durationMs(meta?.startTime ?? null, meta?.endTime ?? null))}
                </div>

                {/* Ligne stats */}
                <div className="text-muted-foreground">Moyenne</div>
                <div className="font-semibold tabular-nums">{temps.length ? `${Math.round(stats.avg)}°C` : "—"}</div>

                <div className="text-muted-foreground">Min</div>
                <div className="font-semibold tabular-nums">{temps.length ? `${Math.round(stats.min)}°C` : "—"}</div>

                <div className="text-muted-foreground">Max</div>
                <div className="font-semibold tabular-nums">{temps.length ? `${Math.round(stats.max)}°C` : "—"}</div>
              </div>

              {error && (
                <div className="mt-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">
                  {String(error)}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chart: occupe 2/3 et TOUTE la hauteur restante */}
          <Card className="lg:col-span-2 rounded-2xl overflow-hidden min-h-0 flex flex-col">
            <CardHeader className="py-3">
              <CardTitle className="text-base">Température vs Temps</CardTitle>
            </CardHeader>
            {/* h-full dans un flex-col + min-h-0 assure 0 scroll et plein espace au chart */}
            <CardContent className="flex-1 min-h-0 p-2">
              {loading ? (
                <div className="h-full flex items-center justify-center text-muted-foreground">Chargement…</div>
              ) : chartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-muted-foreground">Aucune donnée</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="t" tickFormatter={xTick} minTickGap={24} />
                    <YAxis dataKey="v" allowDecimals={false} />
                    <Tooltip
                      labelFormatter={(iso) => new Date(iso).toLocaleString()}
                      formatter={(v) => [`${v} °C`, "Température"]}
                    />
                    <Bar dataKey="v" fill="#DE6E1F" stroke="#DE6E1F" barSize={8} radius={[6,6,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
