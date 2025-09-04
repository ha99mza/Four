// src/renderer/src/App.tsx
import { HashRouter, Routes, Route } from "react-router-dom"
import AppLayout from "@renderer/layouts/AppLayout"
import HomePage from "./pages/HomePage"
import TrackingPage from "./pages/TrakingPage"
import HistoryPage from "./pages/HistoryPage"
import SessionDetailPage from "./pages/SessionDetailPage"
import SettingsPage from "./pages/SettingsPage"
import { Toaster } from "sonner"


function AlertsPage() { return <div className="p-4">Alerte</div> }
//function SettingsPage() { return <div className="p-4">Réglage</div> }

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          {/* Tes routes tracking existantes */}
          <Route path="/tracking/:ovenId" element={<TrackingPage />} />
          <Route path="/session/:ovenId/:sessionId" element={<SessionDetailPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
      <Toaster richColors expand position="top-right" />
    </HashRouter>
    
  )
}
