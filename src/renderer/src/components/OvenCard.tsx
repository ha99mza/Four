
import { Link } from "react-router-dom"
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@renderer/components/ui/card"
import { Button } from "@renderer/components/ui/button"
import { Thermometer } from "lucide-react"

type OvenId = "oven1" | "oven2"

type Props = {
  ovenId: OvenId
  title: string
  status: "On" | "Off"
  temperature: number | null
}

export default function OvenCard({ ovenId, title, status, temperature }: Props) {
  const statusClasses =
    status === "On"
      ? "text-green-400 bg-green-500/10 border-green-500/20"
      : "text-red-400 bg-red-500/10 border-red-500/20"

  return (
    <Card className="w-full rounded-2xl border border-border bg-card shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Statut</span>
          <span className={`text-sm font-medium px-2 py-1 rounded-full border ${statusClasses}`}>
            {status}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Température</span>
          <div className="flex items-center gap-1">
            <Thermometer className="h-4 w-4" />
            <span className="text-sm font-semibold">
              {temperature != null ? `${Math.round(temperature)}°C` : "—"}
            </span>
          </div>
        </div>
      </CardContent>

      <CardFooter className="pt-2">
        <Button asChild className="w-full h-11 rounded-xl">
          <Link to={`/tracking/${ovenId}`}>Sélectionner</Link>
        </Button>
      </CardFooter>
    </Card>
  )
}
