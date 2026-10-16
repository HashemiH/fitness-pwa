import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { HashRouter, NavLink, Route, Routes } from "react-router-dom"
import "@fontsource/vazirmatn/400.css"
import "@fontsource/vazirmatn/700.css"
import "./styles.css"
import { CalendarPage, MorePage, NutritionPage, ProgressPage, TodayPage, WorkoutPage } from "./pages"
import { AppState, useFitness } from "./state"

function Shell() {
  const state = useFitness()
  return (
    <AppState.Provider value={state}>
      <div className="mx-auto min-h-dvh max-w-md bg-ink text-white">
        <main className="pb-28 pe-[max(1rem,env(safe-area-inset-left))] ps-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="mb-3 flex justify-end">
            <NavLink to="/more" className="min-h-11 px-2 py-2 text-sm text-mint">
              مدیریت
            </NavLink>
          </div>
          <Routes>
            <Route path="/" element={<TodayPage />} />
            <Route path="/nutrition" element={<NutritionPage />} />
            <Route path="/workout" element={<WorkoutPage />} />
            <Route path="/progress" element={<ProgressPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/more" element={<MorePage />} />
          </Routes>
        </main>
        <nav className="fixed inset-x-0 bottom-0 mx-auto flex max-w-md justify-between border-t border-line bg-ink/95 pb-[max(0.4rem,env(safe-area-inset-bottom))] pe-[max(0.5rem,env(safe-area-inset-left))] ps-[max(0.5rem,env(safe-area-inset-right))] pt-2 backdrop-blur">
          <Tab to="/" label="امروز" />
          <Tab to="/nutrition" label="تغذیه" />
          <Tab to="/workout" label="تمرین" />
          <Tab to="/calendar" label="تقویم" />
          <Tab to="/progress" label="پیشرفت" />
        </nav>
      </div>
    </AppState.Provider>
  )
}

function Tab({ to, label }: { to: string; label: string }) {
  return (
    <NavLink to={to} end={to === "/"} className={({ isActive }) => `min-h-11 min-w-14 rounded-xl px-2 py-2 text-center text-xs ${isActive ? "bg-mint font-bold text-ink" : "text-mist"}`}>
      {label}
    </NavLink>
  )
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <Shell />
    </HashRouter>
  </StrictMode>,
)
