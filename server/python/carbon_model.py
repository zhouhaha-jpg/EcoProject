#!/usr/bin/env python3
"""
碳因子风光反推模型 — 基于 Open-Meteo 风速和太阳辐射估算浙江电网实时碳排放因子。

模型原理：
  EF_grid(t) = EF_thermal × (1 - R_re(t) / R_max × 0.6)
  R_re(t) = clip(α·P_wind_ratio(t) + β·P_solar_ratio(t), 0, R_max)

参数来源：
  - EF_thermal = 0.85e-3 tCO2/kWh（全国煤电平均碳因子）
  - α = 0.08（浙江风电装机权重）
  - β = 0.12（浙江光伏装机权重）
  - R_max = 0.45（浙江可再生+核+水电历史最高占比上限）
"""

import numpy as np

# 模型常量
EF_THERMAL = 0.85e-3   # tCO2/kWh
ALPHA_WIND = 0.08       # 风电装机权重
BETA_SOLAR = 0.12       # 光伏装机权重
R_MAX = 0.45            # 可再生+核+水电最高占比
G_MAX = 1000.0          # W/m², 晴天最大辐射

# 兜底碳因子（无气象数据时使用，与原 optimizer.py 硬编码一致）
_carbon_avg = 0.581e-3
FALLBACK_EF = np.array([
    *([_carbon_avg * 0.7] * 8),
    *([_carbon_avg * 1.3] * 3),
    *([_carbon_avg * 1.0] * 2),
    *([_carbon_avg * 1.3] * 5),
    *([_carbon_avg * 1.5] * 3),
    _carbon_avg * 1.3,
    *([_carbon_avg * 0.7] * 2),
])


def wind_power_ratio(wind_speed_80m):
    """风机功率曲线近似：cut-in 3m/s, rated 12m/s, cut-out 25m/s"""
    w = np.asarray(wind_speed_80m, dtype=float)
    return np.where(w < 3, 0,
           np.where(w < 12, (w - 3) / 9,
           np.where(w < 25, 1.0, 0)))


def estimate_carbon_factor(wind_speed_80m, shortwave_radiation):
    """
    基于风速和太阳辐射估算浙江电网实时碳排放因子。

    Args:
        wind_speed_80m: 24h 80m高度风速数组 (m/s)
        shortwave_radiation: 24h 太阳辐射数组 (W/m²)

    Returns:
        24h 碳因子列表 (tCO2/kWh)，与 optimizer.py EF_grid 同量纲
    """
    P_wind = wind_power_ratio(wind_speed_80m)
    P_solar = np.clip(np.asarray(shortwave_radiation, dtype=float) / G_MAX, 0, 1)
    R_re = np.clip(ALPHA_WIND * P_wind + BETA_SOLAR * P_solar, 0, R_MAX)
    ef = EF_THERMAL * (1 - R_re / R_MAX * 0.6)
    return np.round(ef, 7).tolist()


def get_fallback_ef():
    """返回兜底碳因子 24h 数组"""
    return FALLBACK_EF.tolist()


if __name__ == '__main__':
    # 自测：用典型数据验证
    test_wind = [2, 2, 1.5, 1, 1, 2, 3, 4, 5, 6, 7, 8,
                 9, 8, 7, 6, 5, 4, 3, 2, 1, 1, 1, 2]
    test_solar = [0, 0, 0, 0, 0, 0, 0, 11, 89, 282, 507, 671,
                  777, 769, 723, 639, 463, 244, 57, 0, 0, 0, 0, 0]
    ef = estimate_carbon_factor(test_wind, test_solar)
    print(f"碳因子范围: {min(ef):.7f} ~ {max(ef):.7f} tCO2/kWh")
    print(f"24h碳因子: {ef}")
