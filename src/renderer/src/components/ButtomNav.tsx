import { Link, useLocation } from "react-router-dom"
import { Button } from "@renderer/components/ui/button"
import {
  Home,
  Thermometer,
  //ThermometerSun,
  History,
  //Bell,
  Settings,
  Ban
} from "lucide-react"

type NavItem = {
  to: string
  label: string
  icon: React.ElementType
}

const NAV_ITEMS: NavItem[] = [
  { to: "/",                label: "Accueil",    icon: Home },
  { to: "/tracking/oven1",  label: "Four 1",     icon: Thermometer },
  { to: "/tracking/oven2",  label: "Four 2",     icon: Thermometer },
  { to: "/history",         label: "Historique", icon: History },
  /* { to: "/alerts",          label: "",     icon: Ban },  */
  { to: "/settings",        label: "Réglage",    icon: Settings }
]

export default function BottomNav() {
  const location = useLocation()
  const isActive = (to: string) => (to === "/" ? location.pathname === "/" : location.pathname.startsWith(to))

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70 dark:border-border">
      <div className="mx-auto max-w-6xl grid grid-cols-3 sm:grid-cols-5 gap-2 p-3">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
          const active = isActive(to)
          return (
            <Button
              key={to}
              asChild
              variant={active ? "secondary" : "ghost"}
              className={[
                "h-16 sm:h-14 py-3 px-3",
                "flex flex-col items-center justify-center gap-1.5",
                "text-xs sm:text-sm",
                "rounded-xl data-[active=true]:ring-1 data-[active=true]:ring-border",
                "transition-transform active:scale-[0.98]"
              ].join(" ")}
              data-active={active}
              aria-current={active ? "page" : undefined}
              aria-label={label}
            >
              <Link to={to} className="flex flex-col items-center gap-1.5">
                <Icon className="h-30 w-30" /> {/* ← icônes agrandies */}
                <span>{label}</span>
              </Link>
            </Button>
          )
        })}
      </div>
    </nav>
  )
}
