import { Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from './layout/MainLayout'
import OverviewPage from './pages/OverviewPage'
import PrefixPage from './pages/PrefixPage'
import EconomicIndicatorsPage from './pages/EconomicIndicatorsPage'
import StorageModulePage from './pages/StorageModulePage'

export default function App() {
  return (
    <div className="h-full w-full">
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="economic" element={<EconomicIndicatorsPage />} />
          <Route path="storage" element={<StorageModulePage />} />
          <Route path="ca" element={<PrefixPage prefix="ca" />} />
          <Route path="pv" element={<PrefixPage prefix="pv" />} />
          <Route path="gm" element={<PrefixPage prefix="gm" />} />
          <Route path="pem" element={<PrefixPage prefix="pem" />} />
          <Route path="g" element={<PrefixPage prefix="g" />} />
        </Route>
      </Routes>
    </div>
  )
}
