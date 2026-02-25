import { Routes, Route } from 'react-router-dom'
import MainLayout from './layout/MainLayout'
import Overview from './pages/Overview'
import Energy from './pages/Energy'
import Production from './pages/Production'
import Equipment from './pages/Equipment'
import HSE from './pages/HSE'

export default function App() {
  return (
    <div className="scanlines">
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Overview />} />
          <Route path="energy" element={<Energy />} />
          <Route path="production" element={<Production />} />
          <Route path="equipment" element={<Equipment />} />
          <Route path="hse" element={<HSE />} />
        </Route>
      </Routes>
    </div>
  )
}
