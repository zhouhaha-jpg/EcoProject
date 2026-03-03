/**
 * 存储模块页：储氢罐 H_HS（6 组）+ 储能罐 P_es_es（1 组）
 * 横坐标均为时间（1h–24h），数据从 API/数据库读取
 */
import { useState, useCallback } from 'react'
import { useStrategy } from '@/context/StrategyContext'
import HydrogenStorageChart from '@/components/charts/HydrogenStorageChart'
import EnergyStorageChart from '@/components/charts/EnergyStorageChart'
import type { StrategyKey } from '@/types'

const COLORS: Record<StrategyKey, string> = {
  uci: '#4e9eff', cicos: '#ff7043', cicar: '#29d4ff',
  cicom: '#ce93d8', pv: '#c6f135', es: '#ffd740',
}

export default function StorageModulePage() {
  const { datasetLoading, datasetError } = useStrategy()
  const [stats, setStats] = useState<{ max: number; min: number; avg: number; range: number }>({
    max: 0, min: 0, avg: 0, range: 0,
  })
  const [ranking, setRanking] = useState<{ key: StrategyKey; val: number }[]>([])
  const [diffs, setDiffs] = useState<{ key: StrategyKey; delta: number }[]>([])

  const handleHourHover = useCallback((_hourIdx: number, values: { key: StrategyKey; val: number }[]) => {
    const nums = values.map(v => v.val)
    const mx = Math.max(...nums)
    const mn = Math.min(...nums)
    const avg = nums.reduce((a, b) => a + b, 0) / nums.length
    setStats({ max: mx, min: mn, avg, range: mx - mn })
    const sorted = [...values].sort((a, b) => b.val - a.val)
    setRanking(sorted)
    const ref = values.find(v => v.key === 'uci')?.val ?? 0
    setDiffs(values.filter(v => v.key !== 'uci').map(v => ({ key: v.key, delta: v.val - ref })))
  }, [])

  if (datasetLoading) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        加载数据中…
      </div>
    )
  }

  return (
    <div
      className="h-full min-h-0 overflow-hidden"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr',
        gridTemplateRows: '1fr 0.52fr',
        gap: 12,
        minHeight: 0,
      }}
    >
      {/* 储氢罐 + 右侧统计面板 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, minHeight: 0, overflow: 'hidden' }}>
        <div className="panel min-h-0 flex flex-col">
          <div className="panel-title-bar">
            储氢罐 H_HS (t) · 鼠标移入见详情
            {datasetError && (
              <span style={{ color: '#ff7043', marginLeft: 8, fontSize: 12 }}>（本地数据）</span>
            )}
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <HydrogenStorageChart onHourHover={handleHourHover} />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, overflow: 'hidden' }}>
          <div className="panel">
            <div className="panel-title-bar">当前时刻 · 实时统计</div>
            <div className="stat-grid">
              <div className="stat-cell">
                <div className="stat-label">最大</div>
                <div className="stat-value">{stats.max.toFixed(3)}<span className="stat-unit">t</span></div>
              </div>
              <div className="stat-cell">
                <div className="stat-label">最小</div>
                <div className="stat-value">{stats.min.toFixed(3)}<span className="stat-unit">t</span></div>
              </div>
              <div className="stat-cell">
                <div className="stat-label">均值</div>
                <div className="stat-value">{stats.avg.toFixed(3)}<span className="stat-unit">t</span></div>
              </div>
              <div className="stat-cell">
                <div className="stat-label">极差</div>
                <div className="stat-value">{stats.range.toFixed(3)}<span className="stat-unit">t</span></div>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title-bar">当前时刻 · 方案排行</div>
            <div className="rank-list">
              {ranking.length === 0 ? (
                <div style={{ color: '#3d6080', fontSize: 11, textAlign: 'center', padding: '12px 0' }}>
                  移动鼠标至图表查看
                </div>
              ) : (
                ranking.map((item, i) => (
                  <div key={item.key} className="rank-item">
                    <div className="rank-num" style={{ color: i === 0 ? '#00d4ff' : i === 1 ? '#ffd740' : '#3d6080' }}>{i + 1}</div>
                    <div className="rank-dot" style={{ background: COLORS[item.key] }} />
                    <div className="rank-name">{item.key}</div>
                    <div className="rank-bar-wrap">
                      <div
                        className="rank-bar"
                        style={{
                          width: `${Math.min(100, ((item.val - stats.min) / (stats.range || 1)) * 100).toFixed(1)}%`,
                          background: COLORS[item.key],
                        }}
                      />
                    </div>
                    <div className="rank-val">{item.val.toFixed(3)}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-title-bar">与 UCI 的差值</div>
            <div className="diff-panel-body">
              {diffs.length === 0 ? (
                <div style={{ color: '#3d6080', fontSize: 11, textAlign: 'center', padding: '12px 0' }}>
                  移动鼠标至图表查看
                </div>
              ) : (
                diffs.map(d => {
                  const cls = d.delta >= 0 ? 'diff-pos' : 'diff-neg'
                  return (
                    <div key={d.key} className="diff-item">
                      <div className="diff-name" style={{ color: COLORS[d.key] }}>{d.key}</div>
                      <div className={`diff-num ${cls}`}>
                        {d.delta >= 0 ? '+' : ''}{d.delta.toFixed(3)} t
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 储能罐：1 组数据 */}
      <div className="panel min-h-0 flex flex-col">
        <div className="panel-title-bar">
          储能罐 P_es_es (kW)
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <EnergyStorageChart />
        </div>
      </div>
    </div>
  )
}
