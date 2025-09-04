import BottomNav from "@renderer/components/ButtomNav"
import { Outlet } from "react-router-dom"

export default function AppLayout() {
  return (
    <div className="min-h-screen pb-20"> 
      <Outlet />
      <BottomNav />
    </div>
  )
}