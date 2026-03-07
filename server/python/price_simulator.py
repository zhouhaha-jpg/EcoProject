#!/usr/bin/env python3
"""
浙江省现货电价波动模拟器。

三级降级机制中的 Level 2 — 当爬虫不可用时，基于浙江省分时电价基准 + 几何布朗运动(GBM)
随机波动生成逼近真实市场特征的 24h 价格曲线。

模型: P(t) = P_base(t) × exp(σ·W(t) - 0.5σ²)
- P_base: 浙江省分时电价基准（浙发改价格〔2024〕21号）
- W(t): 有自相关性的标准布朗运动
- σ: 波动率（现货市场通常 10%-20%）

Level 3 兜底: 纯浙江省分时电价表（无波动）。
"""

import numpy as np
from datetime import date

# ═══════ 浙江省分时电价基准 ═══════
# 依据: 浙发改价格〔2024〕21号
SHARP_PEAK = 1.25   # 尖峰
PEAK       = 0.95   # 高峰
NORMAL     = 0.62   # 平段
VALLEY     = 0.35   # 低谷

# 默认 24h 分时电价（非夏冬季）
BASE_PRICE = np.array([
    VALLEY, VALLEY, VALLEY, VALLEY, VALLEY, VALLEY, VALLEY, VALLEY,  # 0-7
    PEAK, PEAK, PEAK,                                                  # 8-10
    NORMAL, NORMAL,                                                    # 11-12
    PEAK, PEAK, PEAK, PEAK,                                           # 13-16
    NORMAL, NORMAL, NORMAL, NORMAL, NORMAL,                           # 17-21
    VALLEY, VALLEY,                                                    # 22-23
])

# 演示用戏剧性种子（产生一个高峰时段价格尖峰的有趣曲线）
DRAMATIC_SEED = 20260307


def get_tou_baseline(dt=None):
    """获取浙江省分时电价基准 24h 数组（考虑夏冬季尖峰时段）"""
    if dt is None:
        dt = date.today()
    month = dt.month if hasattr(dt, 'month') else dt
    base = BASE_PRICE.copy()

    is_summer = month in [7, 8]
    is_winter = month in [1, 12]

    if is_summer:
        base[13:15] = SHARP_PEAK   # 夏季尖峰 13:00-15:00
    elif is_winter:
        base[18:20] = SHARP_PEAK   # 冬季尖峰 18:00-20:00

    return base


def simulate_spot_price(dt=None, seed=None, sigma=0.15):
    """
    基于浙江省分时电价结构 + GBM 随机扰动，生成 24h 现货模拟价格。

    Args:
        dt: 日期 (date 对象), 用于判断夏冬季尖峰。默认今天。
        seed: 随机种子。None 则随机；传入整数可复现结果。
        sigma: 波动率 (0.10-0.20 之间)。

    Returns:
        np.ndarray, 24 个浮点数 (元/kWh)
    """
    if dt is None:
        dt = date.today()

    rng = np.random.default_rng(seed)
    base = get_tou_baseline(dt)

    # 几何布朗运动增量
    dW = rng.normal(0, 1, 24)
    # 加入日内相关性：相邻时段波动有正相关
    for i in range(1, 24):
        dW[i] = 0.6 * dW[i - 1] + 0.8 * dW[i]

    spot = base * np.exp(sigma * dW - 0.5 * sigma ** 2)

    # 5% 概率产生极端价格尖峰（模拟尾部风险事件）
    if rng.random() < 0.05:
        spike_hour = int(rng.integers(8, 22))  # 白天时段
        spot[spike_hour] *= rng.uniform(1.5, 2.5)

    return np.round(np.clip(spot, 0.15, 2.50), 4)


def get_fallback_price(dt=None):
    """Level 3 兜底: 返回纯浙江省分时电价基准（无波动）"""
    return get_tou_baseline(dt).tolist()


if __name__ == '__main__':
    # 自测：演示戏剧性种子效果
    prices_dramatic = simulate_spot_price(seed=DRAMATIC_SEED)
    prices_random = simulate_spot_price()
    base = get_tou_baseline()

    print("浙江省分时电价基准:")
    print(f"  {base.tolist()}")
    print(f"\n戏剧性种子 ({DRAMATIC_SEED}) 模拟价格:")
    print(f"  {prices_dramatic.tolist()}")
    print(f"  范围: {prices_dramatic.min():.4f} ~ {prices_dramatic.max():.4f}")
    print(f"\n随机种子模拟价格:")
    print(f"  {prices_random.tolist()}")
    print(f"  范围: {prices_random.min():.4f} ~ {prices_random.max():.4f}")
