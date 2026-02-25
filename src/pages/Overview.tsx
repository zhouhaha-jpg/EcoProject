import { useState, useCallback } from 'react'
import { useStrategy } from '@/context/StrategyContext'
import { STRATEGY_META } from '@/data/realData'
import PowerBalanceChart from '@/components/charts/PowerBalanceChart'
import type { StrategyKey } from '@/types'

/** 与 power_dashboard.html SERIES 颜色一致 */
const COLORS: Record<StrategyKey, string> = {
  uci: '#4e9eff', cicos: '#ff7043', cicar: '#29d4ff',
  cicom: '#ce93d8', pv: '#c6f135', es: '#ffd740',
}
const ORDER: StrategyKey[] = ['uci', 'cicos', 'cicar', 'cicom', 'pv', 'es']
const UCI_REF = 9020.51

export default function Overview() {
  const { dataset } = useStrategy()

  // ── 侧面板数据（由图表 tooltip 回调更新） ──
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

    const ref = values.find(v => v.key === 'uci')?.val ?? UCI_REF
    setDiffs(values.filter(v => v.key !== 'uci').map(v => ({ key: v.key, delta: v.val - ref })))
  }, [])

  return (
    <div className="h-full min-h-0" style={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr) auto', gap: 12, minHeight: 0 }}>
      {/* ── 主区域：图表 + 侧面板（与参考 .chart-row 一致） ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, minHeight: 0, overflow: 'hidden' }}>
        {/* 主图 */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="panel-title-bar">功率时序曲线 · 鼠标移入见详情 · 拖拽方框选择区间统计</div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <PowerBalanceChart onHourHover={handleHourHover} />
          </div>
        </div>

        {/* 侧面板组 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, overflow: 'hidden' }}>
          {/* 实时统计 */}
          <div className="panel">
            <div className="panel-title-bar">当前时刻 · 实时统计</div>
            <div className="stat-grid">
              <div className="stat-cell">
                <div className="stat-label">最大功率</div>
                <div className="stat-value">{stats.max.toFixed(0)}<span className="stat-unit">kW</span></div>
              </div>
              <div className="stat-cell">
                <div className="stat-label">最小功率</div>
                <div className="stat-value">{stats.min.toFixed(0)}<span className="stat-unit">kW</span></div>
              </div>
              <div className="stat-cell">
                <div className="stat-label">均值</div>
                <div className="stat-value">{stats.avg.toFixed(0)}<span className="stat-unit">kW</span></div>
              </div>
              <div className="stat-cell">
                <div className="stat-label">极差</div>
                <div className="stat-value">{stats.range.toFixed(0)}<span className="stat-unit">kW</span></div>
              </div>
            </div>
          </div>

          {/* 方案排行 */}
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
                          width: `${((item.val - 7000) / (11200 - 7000) * 100).toFixed(1)}%`,
                          background: COLORS[item.key],
                        }}
                      />
                    </div>
                    <div className="rank-val">{item.val.toFixed(0)}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 差值面板 */}
          <div className="panel">
            <div className="panel-title-bar">与 P_CA_UCI 的功率差值</div>
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
                        {d.delta >= 0 ? '+' : ''}{d.delta.toFixed(1)} kW
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── 区间统计（与参考一致的 Brush 区域占位） ── */}
      <div className="panel" style={{ minHeight: 80, flexShrink: 0 }}>
        <div className="panel-title-bar">区间统计 · 拖拽图表内方框进行选择</div>
        <div className="brush-result">
          <div className="brush-hint">在上方图表中拖拽方框选取时间区间，此处将显示该区间的统计摘要</div>
        </div>
      </div>
    </div>
  )
}
