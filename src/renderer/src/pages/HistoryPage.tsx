import React, { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@renderer/components/ui/table"
import { Button } from "@renderer/components/ui/button"
import { Input } from "@renderer/components/ui/input"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis
} from "@renderer/components/ui/pagination"

type OvenId = "oven1" | "oven2"

type SessionRow = {
  id: string
  ovenId: OvenId
  productId: string
  operation: string
  quantity: number
  startTime: string | null // ISO
  endTime: string | null   // ISO
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

function fmt(dt: string | null) {
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
  const parts = []
  if (h) parts.push(`${h}h`)
  if (m || h) parts.push(`${m}m`)
  parts.push(`${s}s`)
  return parts.join(" ")
}

const PAGE_SIZE = 7

export default function HistoryPage() {
  const [rows, setRows] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  // Filtre OF
  const [ofQuery, setOfQuery] = useState("")

  // Pagination
  const [page, setPage] = useState(1)

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await window.electron.ipcRenderer.invoke("get-all-sessions", { limit: 2000 })
      if (!res?.ok) throw new Error(res?.error ?? "unknown_error")
      setRows(res.data as SessionRow[])
    } catch (e: any) {
      setError(e?.message ?? "Erreur lors du chargement.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  // Données enrichies
  const enriched = useMemo(() => {
    return rows.map(r => ({
      ...r,
      status: r.endTime ? "Terminé" : "En cours",
      duration: fmtDuration(durationMs(r.startTime, r.endTime))
    }))
  }, [rows])

  // Filtrage par OF (insensible à la casse, substring)
  const filtered = useMemo(() => {
    const q = ofQuery.trim().toLowerCase()
    if (!q) return enriched
    return enriched.filter(r => r.productId?.toLowerCase().includes(q))
  }, [enriched, ofQuery])

  // Reset à la page 1 quand le filtre change ou quand la source change
  // maitenant c'est ca marche mais concernant la structure de la page je veux ne pas avoir a sroll sur la page je que tous les componant tiens sur la page sans avoir a scroll
  useEffect(() => {
    setPage(1)
  }, [ofQuery, rows.length])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageStart = (page - 1) * PAGE_SIZE
  const pageEnd = pageStart + PAGE_SIZE
  const paginated = filtered.slice(pageStart, pageEnd)

  // Pagination items (avec ellipses)
  type PageToken = number | "ellipsis"
  const paginationItems: PageToken[] = useMemo(() => {
    const items: PageToken[] = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) items.push(i)
      return items
    }
    items.push(1)
    if (page > 3) items.push("ellipsis")
    for (let p = Math.max(2, page - 1); p <= Math.min(totalPages - 1, page + 1); p++) {
      if (!items.includes(p)) items.push(p)
    }
    if (page < totalPages - 2) items.push("ellipsis")
    items.push(totalPages)
    return items
  }, [page, totalPages])

  const goTo = (p: number) => setPage(Math.min(totalPages, Math.max(1, p)))

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Historique des sessions</h1>
        <div className="flex gap-2">
          <Input
            placeholder="Filtrer par OF (ex: 5466)"
            value={ofQuery}
            onChange={(e) => setOfQuery(e.target.value)}
            className="w-[240px] h-10 rounded-xl"
          />
          {/* <Button onClick={refresh} className="h-10 px-4 rounded-xl">Rafraîchir</Button> */}
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        {loading ? "Chargement…" : `${filtered.length} résultat(s)`}{filtered.length !== rows.length ? ` (filtré depuis ${rows.length})` : ""}
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Four</TableHead>
              <TableHead>OF</TableHead>
              <TableHead>Opération</TableHead>
              <TableHead className="text-right">Quantité</TableHead>
              <TableHead>Début</TableHead>
              <TableHead>Fin</TableHead>
              <TableHead>Durée</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                  Chargement…
                </TableCell>
              </TableRow>
            ) : paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                  Aucun résultat.
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.ovenId === "oven1" ? "Four 1" : "Four 2"}</TableCell>
                  <TableCell className="tabular-nums">{r.productId}</TableCell>
                  <TableCell>{r.operation}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.quantity}</TableCell>
                  <TableCell>{fmt(r.startTime)}</TableCell>
                  <TableCell>{fmt(r.endTime)}</TableCell>
                  <TableCell className="tabular-nums">{r.duration}</TableCell>
                  <TableCell>
                    {r.endTime ? (
                      <span className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full text-xs">
                        Terminé
                      </span>
                    ) : (
                      <span className="text-yellow-300 bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 rounded-full text-xs">
                        En cours
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="secondary"
                      className="h-8 px-3 rounded-lg"
                      onClick={() => navigate(`/session/${r.ovenId}/${r.id}`)}
                    >
                    Voir détails
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {!loading && filtered.length > 0 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(e) => { e.preventDefault(); goTo(page - 1) }}
                aria-disabled={page === 1}
                className={page === 1 ? "pointer-events-none opacity-50" : ""}
              />
            </PaginationItem>

            {paginationItems.map((token, idx) =>
              token === "ellipsis" ? (
                <PaginationItem key={`ellipsis-${idx}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={token}>
                  <PaginationLink
                    href="#"
                    isActive={token === page}
                    onClick={(e) => { e.preventDefault(); goTo(token) }}
                  >
                    {token}
                  </PaginationLink>
                </PaginationItem>
              )
            )}

            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(e) => { e.preventDefault(); goTo(page + 1) }}
                aria-disabled={page === totalPages}
                className={page === totalPages ? "pointer-events-none opacity-50" : ""}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  )
}
