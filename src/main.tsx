import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { HashRouter, NavLink, Route, Routes } from "react-router-dom"
import "@fontsource/vazirmatn/400.css"
import "@fontsource/vazirmatn/700.css"
import "./styles.css"
import { Icon } from "./icons"
import { CalendarPage, MorePage, NutritionPage, ProgressPage, TodayPage, WorkoutPage } from "./pages"
import { AppState, useFitness } from "./state"

function Shell() {
  const state = useFitness()
  return (
    <AppState.Provider value={state}>
      <div className="app">
        <Routes>
          <Route path="/" element={<TodayPage />} />
          <Route path="/nutrition" element={<NutritionPage />} />
          <Route path="/workout" element={<WorkoutPage />} />
          <Route path="/progress" element={<ProgressPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/more" element={<MorePage />} />
        </Routes>
        <nav className="nav" aria-label="اصلی">
          <Tab to="/" icon="home" label="امروز" />
          <Tab to="/nutrition" icon="meal" label="تغذیه" />
          <Tab to="/workout" icon="dumbbell" label="تمرین" />
          <Tab to="/calendar" icon="calendar" label="تقویم" />
          <Tab to="/more" icon="user" label="بیشتر" />
        </nav>
      </div>
    </AppState.Provider>
  )
}

function Tab({ to, label, icon }: { to: string; label: string; icon: "home" | "meal" | "dumbbell" | "calendar" | "user" }) {
  return (
    <NavLink to={to} end={to === "/"}>
      <Icon name={icon} filled />
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
