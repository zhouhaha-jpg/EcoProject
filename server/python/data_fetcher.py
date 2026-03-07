#!/usr/bin/env python3
"""
实时数据采集调度器。

职责：
  - 从 Open-Meteo 获取逐时太阳辐射和风速
  - 通过 price_simulator 生成电价（Level 2/3 降级）
  - 通过 carbon_model 计算碳因子
  - 写入 SQLite realtime_data 表
  - 检测异动，生成 alert_events 记录
  - 输出 JSON 结果到 stdout（供 Node.js 读取）

使用方式：
  1. 独立运行（一次性采集）：python data_fetcher.py
  2. 带调度运行（每小时采集）：python data_fetcher.py --schedule
  3. 被 Node.js 子进程调用：python data_fetcher.py --once --lat 30.26 --lon 120.19
  4. 获取历史数据：python data_fetcher.py --date 2025-07-15 --lat 30.26 --lon 120.19
"""

import argparse
import json
import os
import sqlite3
import sys
import traceback
from datetime import date, datetime
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError

import numpy as np

# 同目录模块
sys.path.insert(0, str(Path(__file__).parent))
from carbon_model import estimate_carbon_factor, get_fallback_ef
from price_simulator import simulate_spot_price, get_fallback_price, get_tou_baseline, DRAMATIC_SEED

DB_PATH = str(Path(__file__).parent.parent / 'db' / 'eco.db')
USER_AGENT = 'EcoProject/1.0 (Smart Park Energy Platform)'
OPEN_METEO_FORECAST = 'https://api.open-meteo.com/v1/forecast'
OPEN_METEO_ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive'


def get_db():
    """获取 SQLite 连接（WAL 模式）"""
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.row_factory = sqlite3.Row
    return conn


def get_park_coordinates(conn):
    """从 park_config 表读取园区坐标"""
    try:
        lat_row = conn.execute("SELECT value FROM park_config WHERE key='latitude'").fetchone()
        lon_row = conn.execute("SELECT value FROM park_config WHERE key='longitude'").fetchone()
        if lat_row and lon_row:
            return float(lat_row['value']), float(lon_row['value'])
    except Exception:
        pass
    return 30.26, 120.19  # 默认杭州


# ═══════════════════════════════════════
#  Layer 1: Open-Meteo 太阳辐射 + 风速
# ═══════════════════════════════════════

def fetch_solar_forecast(lat, lon):
    """从 Open-Meteo 获取未来 48h 预报数据"""
    url = (
        f"{OPEN_METEO_FORECAST}?"
        f"latitude={lat}&longitude={lon}"
        f"&hourly=shortwave_radiation,wind_speed_10m,wind_speed_80m,temperature_2m"
        f"&timezone=Asia/Shanghai&forecast_days=2"
    )
    req = Request(url, headers={'User-Agent': USER_AGENT})
    resp = urlopen(req, timeout=15)
    data = json.loads(resp.read().decode())
    return data['hourly']


def fetch_solar_archive(lat, lon, target_date):
    """从 Open-Meteo Archive 获取历史数据"""
    ds = target_date if isinstance(target_date, str) else target_date.isoformat()
    url = (
        f"{OPEN_METEO_ARCHIVE}?"
        f"latitude={lat}&longitude={lon}"
        f"&start_date={ds}&end_date={ds}"
        f"&hourly=shortwave_radiation,wind_speed_10m,wind_speed_80m,temperature_2m"
        f"&timezone=Asia/Shanghai"
    )
    req = Request(url, headers={'User-Agent': USER_AGENT})
    resp = urlopen(req, timeout=15)
    data = json.loads(resp.read().decode())
    return data['hourly']


def get_solar_data(lat, lon, target_date=None):
    """
    获取太阳辐射和风速数据。

    Returns:
        (radiation_24h, wind10_24h, wind80_24h, temp_24h, source)
    """
    try:
        if target_date and target_date < date.today():
            hourly = fetch_solar_archive(lat, lon, target_date)
        else:
            hourly = fetch_solar_forecast(lat, lon)

        rad = hourly['shortwave_radiation'][:24]
        w10 = hourly['wind_speed_10m'][:24]
        w80 = hourly['wind_speed_80m'][:24]
        temp = hourly['temperature_2m'][:24]

        # 补齐到 24h
        while len(rad) < 24:
            rad.append(0)
            w10.append(0)
            w80.append(0)
            temp.append(temp[-1] if temp else 20)

        return rad, w10, w80, temp, 'openmeteo'
    except Exception as e:
        print(f"[data_fetcher] Open-Meteo 获取失败: {e}", file=sys.stderr)
        # Fallback: 典型日照曲线
        g = [0, 0, 0, 0, 0, 0, 0, 11, 89, 282, 507, 671,
             777, 769, 723, 639, 463, 244, 57, 0, 0, 0, 0, 0]
        w = [2.0] * 24
        t = [20.0] * 24
        return g, w, w, t, 'fallback'


# ═══════════════════════════════════════
#  Layer 2/3: 电价
# ═══════════════════════════════════════

def get_price_data(target_date=None, seed=None):
    """
    获取 24h 电价数据。Level 1 爬虫暂未实现，直接走 Level 2 模拟器。

    Returns:
        (prices_24h, source)
    """
    try:
        dt = target_date or date.today()
        # Level 2: 模拟器
        prices = simulate_spot_price(dt=dt, seed=seed)
        return prices.tolist(), 'simulator'
    except Exception as e:
        print(f"[data_fetcher] 模拟器失败: {e}", file=sys.stderr)
        # Level 3: 兜底
        return get_fallback_price(target_date), 'fallback'


# ═══════════════════════════════════════
#  异动检测
# ═══════════════════════════════════════

def detect_anomalies(new_prices, carbon_factors):
    """
    检测电价和碳因子是否出现需要预警的异动。

    Returns:
        list of alert dicts
    """
    alerts = []
    baseline = get_tou_baseline()
    prices = np.array(new_prices)
    ratio = prices / np.maximum(baseline, 0.01)

    # 电价异动
    critical_hours = np.where(ratio > 2.0)[0]
    if len(critical_hours) > 0:
        alerts.append({
            'event_type': 'price_spike',
            'severity': 'critical',
            'title': f'电价极端飙升预警：{len(critical_hours)}个时段电价超基准200%',
            'detail': json.dumps({
                'hours': critical_hours.tolist(),
                'max_ratio': round(float(ratio.max()), 2),
                'max_price': round(float(prices.max()), 4)
            }, ensure_ascii=False)
        })
    else:
        warning_hours = np.where(ratio > 1.5)[0]
        if len(warning_hours) > 0:
            alerts.append({
                'event_type': 'price_spike',
                'severity': 'warning',
                'title': f'电价异常波动：{len(warning_hours)}个时段电价超基准150%',
                'detail': json.dumps({
                    'hours': warning_hours.tolist(),
                    'max_ratio': round(float(ratio.max()), 2)
                }, ensure_ascii=False)
            })

    mean_shift = abs(np.mean(prices) - np.mean(baseline)) / np.mean(baseline)
    if mean_shift > 0.2:
        alerts.append({
            'event_type': 'price_shift',
            'severity': 'warning',
            'title': f'日均电价偏移 {mean_shift * 100:.0f}%',
            'detail': json.dumps({
                'new_avg': round(float(np.mean(prices)), 4),
                'base_avg': round(float(np.mean(baseline)), 4)
            }, ensure_ascii=False)
        })

    # 碳因子异动（连续 3 个时段碳因子 > 0.8e-3 视为火电高峰预警）
    ef = np.array(carbon_factors)
    high_carbon_mask = ef > 0.75e-3
    for i in range(22):
        if high_carbon_mask[i] and high_carbon_mask[i + 1] and high_carbon_mask[i + 2]:
            alerts.append({
                'event_type': 'carbon_surge',
                'severity': 'warning',
                'title': f'碳排放持续偏高：{i}:00-{i + 3}:00 碳因子连续超标',
                'detail': json.dumps({
                    'hours': list(range(i, i + 3)),
                    'values': [round(float(ef[j]), 7) for j in range(i, i + 3)]
                }, ensure_ascii=False)
            })
            break  # 只报一次

    return alerts


# ═══════════════════════════════════════
#  SQLite 写入
# ═══════════════════════════════════════

def save_to_db(conn, data_date_str, radiation, wind10, wind80, temp,
               prices, carbon_factors, price_source, solar_source, carbon_source):
    """将 24h 数据写入 realtime_data 表（UPSERT）"""
    sql = """
        INSERT INTO realtime_data
          (data_date, hour, shortwave_radiation, wind_speed_10m, wind_speed_80m,
           temperature, price_grid, ef_grid, price_source, solar_source, carbon_source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(data_date, hour)
        DO UPDATE SET
          shortwave_radiation=excluded.shortwave_radiation,
          wind_speed_10m=excluded.wind_speed_10m,
          wind_speed_80m=excluded.wind_speed_80m,
          temperature=excluded.temperature,
          price_grid=excluded.price_grid,
          ef_grid=excluded.ef_grid,
          price_source=excluded.price_source,
          solar_source=excluded.solar_source,
          carbon_source=excluded.carbon_source,
          fetched_at=CURRENT_TIMESTAMP
    """
    for h in range(24):
        conn.execute(sql, (
            data_date_str, h,
            radiation[h], wind10[h], wind80[h], temp[h],
            prices[h], carbon_factors[h],
            price_source, solar_source, carbon_source,
        ))
    conn.commit()


def save_alerts(conn, alerts):
    """写入预警事件"""
    sql = """
        INSERT INTO alert_events (event_type, severity, title, detail)
        VALUES (?, ?, ?, ?)
    """
    for a in alerts:
        conn.execute(sql, (a['event_type'], a['severity'], a['title'], a['detail']))
    conn.commit()


def update_health(conn, source_name, status, error=None):
    """更新数据源健康状态"""
    if status == 'ok':
        conn.execute(
            """UPDATE data_source_health
               SET status='ok', last_success=CURRENT_TIMESTAMP, fallback_active=0, updated_at=CURRENT_TIMESTAMP
               WHERE source_name=?""",
            (source_name,)
        )
    else:
        conn.execute(
            """UPDATE data_source_health
               SET status=?, last_error=?, fallback_active=1, updated_at=CURRENT_TIMESTAMP
               WHERE source_name=?""",
            (status, str(error)[:500] if error else None, source_name)
        )
    conn.commit()


# ═══════════════════════════════════════
#  主采集流程
# ═══════════════════════════════════════

def fetch_all(lat=None, lon=None, target_date=None, seed=None):
    """
    执行一次完整的三路数据采集。

    Returns:
        dict 包含所有数据和元信息，同时写入 DB。
    """
    conn = get_db()

    if lat is None or lon is None:
        lat, lon = get_park_coordinates(conn)

    if target_date is None:
        target_date = date.today()

    data_date_str = target_date.isoformat()

    # 1. 采集太阳辐射和风速
    radiation, wind10, wind80, temp, solar_source = get_solar_data(lat, lon, target_date)
    update_health(conn, 'solar', 'ok' if solar_source == 'openmeteo' else 'degraded')

    # 2. 采集电价
    prices, price_source = get_price_data(target_date, seed=seed)
    update_health(conn, 'price', 'ok' if price_source == 'crawler' else 'degraded' if price_source == 'simulator' else 'error')

    # 3. 计算碳因子
    carbon_source = 'model'
    try:
        carbon_factors = estimate_carbon_factor(wind80, radiation)
        if solar_source == 'fallback':
            carbon_source = 'fallback'
    except Exception as e:
        print(f"[data_fetcher] 碳因子计算失败: {e}", file=sys.stderr)
        carbon_factors = get_fallback_ef()
        carbon_source = 'fallback'
    update_health(conn, 'carbon', 'ok' if carbon_source == 'model' else 'degraded')

    # 4. 写入 DB
    save_to_db(conn, data_date_str, radiation, wind10, wind80, temp,
               prices, carbon_factors, price_source, solar_source, carbon_source)

    # 5. 异动检测
    alerts = detect_anomalies(prices, carbon_factors)
    if alerts:
        save_alerts(conn, alerts)

    conn.close()

    # 构造优化器所需的 overrides 格式
    rad_arr = np.array(radiation)
    g_max = max(float(rad_arr.max()), 1.0)
    g_profile = (rad_arr / g_max).tolist()
    g_scale = g_max / 1000 * 1.5

    result = {
        'date': data_date_str,
        'prices': prices,
        'solar': radiation,
        'carbon': carbon_factors,
        'wind10': wind10,
        'wind80': wind80,
        'temperature': temp,
        'sources': {
            'price': price_source,
            'solar': solar_source,
            'carbon': carbon_source,
        },
        'alerts': alerts,
        'optimizer_overrides': {
            'price_grid': prices,
            'EF_grid': carbon_factors,
            'G_profile': g_profile,
            'G_scale': round(g_scale, 4),
        },
        'fetched_at': datetime.now().isoformat(),
    }
    return result


def main():
    parser = argparse.ArgumentParser(description='实时数据采集调度器')
    parser.add_argument('--once', action='store_true', help='执行一次采集后退出')
    parser.add_argument('--schedule', action='store_true', help='启动定时调度（每小时执行）')
    parser.add_argument('--date', type=str, help='指定日期 YYYY-MM-DD（历史回溯）')
    parser.add_argument('--lat', type=float, help='园区纬度')
    parser.add_argument('--lon', type=float, help='园区经度')
    parser.add_argument('--seed', type=int, default=None, help='电价模拟器随机种子')
    parser.add_argument('--dramatic', action='store_true', help='使用戏剧性演示种子')
    args = parser.parse_args()

    target_date = None
    if args.date:
        target_date = date.fromisoformat(args.date)

    seed = args.seed
    if args.dramatic:
        seed = DRAMATIC_SEED

    if args.schedule:
        try:
            from apscheduler.schedulers.blocking import BlockingScheduler
        except ImportError:
            print("错误: 需要安装 apscheduler (pip install apscheduler>=3.10)", file=sys.stderr)
            sys.exit(1)

        scheduler = BlockingScheduler()

        def job():
            try:
                result = fetch_all(lat=args.lat, lon=args.lon, seed=seed)
                print(json.dumps(result, ensure_ascii=False))
                sys.stdout.flush()
            except Exception as e:
                print(f"[data_fetcher] 采集失败: {e}", file=sys.stderr)
                traceback.print_exc(file=sys.stderr)

        scheduler.add_job(job, 'interval', hours=1, id='fetch_all')
        # 启动时先执行一次
        job()
        print("[data_fetcher] 定时调度已启动，每小时执行一次", file=sys.stderr)
        scheduler.start()
    else:
        # 单次执行
        result = fetch_all(lat=args.lat, lon=args.lon, target_date=target_date, seed=seed)
        print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
