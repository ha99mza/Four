import { useEffect, useState } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@renderer/components/ui/card"
import { Button } from "@renderer/components/ui/button"
import { Input } from "@renderer/components/ui/input"
//import { Switch } from "@renderer/components/ui/switch"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@renderer/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@renderer/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@renderer/components/ui/alert-dialog"
import { toast } from "sonner"

type OvenId = "oven1" | "oven2"

type Settings = {
  operations: { oven1: string[]; oven2: string[] }
  logging: {
    oven1: { intervalSec: number; aggregation: "avg" | "last"; alignToMinute: boolean }
    oven2: { intervalSec: number; aggregation: "avg" | "last"; alignToMinute: boolean }
  }
}

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)

  // Confirmation suppression
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [targetOven, setTargetOven] = useState<OvenId | null>(null)
  const [targetIndex, setTargetIndex] = useState<number | null>(null)

  useEffect(() => {
    window.electron.ipcRenderer.invoke("get-settings").then((res) => setS(res.data as Settings))
  }, [])

  const save = async () => {
    try {
      setSaving(true)
      const res = await window.electron.ipcRenderer.invoke("save-settings", s)
      if (res?.ok) {
        toast.success("Les réglages ont été enregistrés avec succès.")
      } else {
        toast.error("Impossible d’enregistrer les réglages.")
      }
    } catch {
      toast.error("Une erreur est survenue durant la sauvegarde.")
    } finally {
      setSaving(false)
    }
  }

  const askDelete = (ov: OvenId, idx: number) => {
    setTargetOven(ov)
    setTargetIndex(idx)
    setConfirmOpen(true)
  }

  const confirmDelete = () => {
    if (!s || targetOven == null || targetIndex == null) return
    const list = s.operations[targetOven]
    const next = list.filter((_, j) => j !== targetIndex)
    setS({ ...s, operations: { ...s.operations, [targetOven]: next } })
    setConfirmOpen(false)
    setTargetOven(null)
    setTargetIndex(null)
    toast("Opération supprimée.")
  }

  if (!s) return <div className="p-4">Chargement…</div>

  // Options d’intervalle (tu avais ajouté 10s, on le conserve)
  const INTERVAL_OPTIONS = [10, 30, 60, 90, 120] as const

  const renderLogging = (ov: OvenId, label: string) => (
    <Card>
      <CardHeader><CardTitle>{label}</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Intervalle */}
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">Intervalle</div>
          <Select
            value={String(s.logging[ov].intervalSec)}
            onValueChange={(v) =>
              setS({
                ...s,
                logging: { ...s.logging, [ov]: { ...s.logging[ov], intervalSec: Number(v) } }
              })
            }
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder="Choisir…" />
            </SelectTrigger>
            <SelectContent>
              {INTERVAL_OPTIONS.map((sec) => (
                <SelectItem key={sec} value={String(sec)}>
                  {sec} s
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Agrégation */}
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">Agrégation</div>
          <select
            className="w-full h-10 rounded-md bg-background border border-input px-3"
            value={s.logging[ov].aggregation}
            onChange={(e) =>
              setS({
                ...s,
                logging: { ...s.logging, [ov]: { ...s.logging[ov], aggregation: e.target.value as "avg" | "last" } }
              })
            }
          >
            <option value="avg">Moyenne sur l’intervalle</option>
            <option value="last">Dernière valeur</option>
          </select>
        </div>

        {/* Aligner sur l’horloge */}
        {/* <div className="space-y-2 flex items-end justify-between">
          <div>
            <div className="text-sm text-muted-foreground">Aligner sur l’horloge</div>
            <div className="text-xs text-muted-foreground">Ex: 00s, 60s, 120s…</div>
          </div>
          <Switch
            checked={s.logging[ov].alignToMinute}
            onCheckedChange={(v) =>
              setS({
                ...s,
                logging: { ...s.logging, [ov]: { ...s.logging[ov], alignToMinute: Boolean(v) } }
              })
            }
          />
        </div> */}
      </CardContent>
    </Card>
  )

  const renderOps = (ov: OvenId, label: string) => (
    <Card>
      <CardHeader><CardTitle>{label}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {s.operations[ov].map((name, i) => (
          <div key={`${ov}-${i}`} className="flex gap-2">
            <Input
              value={name}
              onChange={(e) => {
                const next = [...s.operations[ov]]
                next[i] = e.target.value
                setS({ ...s, operations: { ...s.operations, [ov]: next } })
              }}
            />
            <Button
              type="button"
              variant="destructive"
              onClick={() => askDelete(ov, i)}
            >
              Supprimer
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            setS({
              ...s,
              operations: {
                ...s.operations,
                [ov]: [...s.operations[ov], "Nouvelle opération"]
              }
            })
          }
        >
          + Ajouter une opération
        </Button>
      </CardContent>
    </Card>
  )

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Réglages</h1>

      <Tabs defaultValue="enregistrement">
        <TabsList>
          <TabsTrigger value="enregistrement">Enregistrement</TabsTrigger>
          <TabsTrigger value="operationsF1">Opérations Four 1</TabsTrigger>
          <TabsTrigger value="operationsF2">Opérations Four 2</TabsTrigger>
        </TabsList>

        <TabsContent value="enregistrement" className="space-y-4 pt-4">
          {renderLogging("oven1", "Four 1")}
          {renderLogging("oven2", "Four 2")}
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>
              {saving ? "Enregistrement…" : "Sauvegarder"}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="operationsF1" className="space-y-4 pt-4">
          {renderOps("oven1", "Opérations — Four 1")}
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>
              {saving ? "Enregistrement…" : "Sauvegarder"}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="operationsF2" className="space-y-4 pt-4">
          {renderOps("oven2", "Opérations — Four 2")}
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>
              {saving ? "Enregistrement…" : "Sauvegarder"}
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog de confirmation de suppression */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette opération ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. L’opération sera retirée de la liste pour ce four.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
