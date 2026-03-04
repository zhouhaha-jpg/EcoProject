#!/usr/bin/env python3
"""
Chlor-alkali multi-energy system optimizer.
Pure Python implementation using scipy, replacing MATLAB + YALMIP + Gurobi.
Supports: UCI / CICOS / CICAR / CICOM / PV / ES scenarios.
"""

import numpy as np
from scipy.optimize import minimize
import time as _time
import json
import sys

F_CONST = 96485.33289
Z = 2
M_H2 = 2.016
T = 24


def default_params():
    carbon_avg = 0.581e-3
    ef = np.zeros(T)
    ef[0:8]   = carbon_avg * 0.7
    ef[8:11]  = carbon_avg * 1.3
    ef[11:13] = carbon_avg * 1.0
    ef[13:18] = carbon_avg * 1.3
    ef[18:21] = carbon_avg * 1.5
    ef[21]    = carbon_avg * 1.3
    ef[22:24] = carbon_avg * 0.7

    price = np.array([
        0.6281, 0.6339, 0.6282, 0.6105, 0.6024, 0.6150, 0.6273, 0.6440,
        0.6463, 0.6063, 0.5790, 0.5928, 0.6028, 0.5846, 0.5978, 0.6150,
        0.6131, 0.6258, 0.6128, 0.6056, 0.6113, 0.6099, 0.6223, 0.6312,
    ])

    g_profile = np.array([
        0, 0, 0, 0, 0, 0.05, 0.15, 0.3, 0.5, 0.7, 0.85, 0.95,
        1.0, 0.95, 0.85, 0.7, 0.5, 0.3, 0.15, 0.05, 0, 0, 0, 0,
    ])

    return {
        'Delta_G': 483.5e3, 'T_CA': 87, 'A_el': 2.7,
        'r1': 4.45153e-5, 'r2': 6.88874e-9,
        'n_e': 100, 'eta_F': 0.95, 'i_rated': 30000, 'eta_NaCl': 1,
        'n_PV': 10000, 'A_PVcl': 1.675,
        'eta_PV': 0.149, 'eta_inv': 0.978, 'f_PV': 0.8,
        'G_profile': g_profile, 'G_scale': 1.5,
        'h_fg_in': 2668, 'h_fg_out': 966,
        'h_air_in': 991, 'h_air_out': 295,
        'eta_GM': 0.5, 'eta_air': 0.5,
        'EF_GT': 9.9, 'fuel_air_ratio': 2,
        'eta_PE': 0.6, 'W_PE_mol': 286,
        'H_max': 1200, 'H_min_ratio': 0.2, 'H_0_ratio': 0.5,
        'price_grid': price, 'EF_grid': ef,
        'c_carbon': 90, 'price_methane': 3000,
        'w_carbon': 0.5, 'w_cost': 0.5,
        'norm_carbon': 288.63, 'norm_cost': 202486.53,
        'ES_max_ratio': 0.2,
    }


class SystemOptimizer:
    def __init__(self, scenario, objective_type, overrides=None, extra_constraints=None):
        self.scenario = scenario
        self.objective_type = objective_type
        self.extra_constraints = extra_constraints or []

        p = default_params()
        if overrides:
            for k, v in overrides.items():
                if k in p:
                    if isinstance(p[k], np.ndarray) and isinstance(v, list):
                        p[k] = np.array(v, dtype=float)
                    else:
                        p[k] = v
        if scenario == 'pvplus':
            p['n_PV'] = overrides.get('n_PV_pvplus', p['n_PV'] * 2)
        self.p = p

        self.U_rev = p['Delta_G'] / (Z * F_CONST)
        self.k_ohm = (p['r1'] + p['r2'] * p['T_CA']) / p['A_el']
        U_rated = self.U_rev + self.k_ohm * p['i_rated']
        self.P_CA_rated = p['n_e'] * U_rated * p['i_rated'] / 1e3
        self.n_H2_rated = p['eta_F'] * p['n_e'] * p['i_rated'] / (Z * F_CONST)
        self.H2_target = self.n_H2_rated * 3600 * T

        G = np.asarray(p['G_profile'], dtype=float) * p['G_scale']
        self.P_PV = p['n_PV'] * p['A_PVcl'] * G * p['eta_PV'] * p['eta_inv'] * p['f_PV']
        self.K_GT = ((p['h_fg_in'] - p['h_fg_out']) * p['eta_GM'] +
                     (p['h_air_in'] - p['h_air_out']) * p['eta_air'] / p['fuel_air_ratio'])

        self.H_max = p['H_max']
        self.H_min = p['H_min_ratio'] * self.H_max
        self.H_0 = p['H_0_ratio'] * self.H_max

        self.has_ES = scenario == 'es'
        self.is_fixed = scenario == 'unchangeable'
        self.ES_max = p.get('ES_max', p['ES_max_ratio'] * self.P_CA_rated) if self.has_ES else 0

        self.price_grid = np.asarray(p['price_grid'], dtype=float)
        self.EF_grid = np.asarray(p['EF_grid'], dtype=float)

        self.nvar = (7 if self.has_ES else 6) * T

    def _idx(self, group):
        offsets = {'i_CA': 0, 'm_fuel': 1, 'P_grid': 2,
                   'n_H2_PE': 3, 'n_H2_methanol': 4, 'H_storage': 5, 'E_storage': 6}
        o = offsets[group]
        return slice(o * T, (o + 1) * T)

    def _unpack(self, x):
        return {k: x[self._idx(k)] for k in
                (['i_CA', 'm_fuel', 'P_grid', 'n_H2_PE', 'n_H2_methanol', 'H_storage'] +
                 (['E_storage'] if self.has_ES else []))}

    def _derived(self, v):
        i = v['i_CA']
        P_CA = self.p['n_e'] * (self.U_rev + self.k_ohm * i) * i / 1e3
        n_H2_CA = self.p['eta_F'] * self.p['n_e'] * i / (Z * F_CONST)
        P_GT = self.K_GT * v['m_fuel']
        P_PE = self.p['eta_PE'] * self.p['W_PE_mol'] * v['n_H2_PE']
        return P_CA, n_H2_CA, P_GT, P_PE

    def _objective(self, x):
        v = self._unpack(x)
        P_CA, n_H2_CA, P_GT, P_PE = self._derived(v)
        p = self.p

        E_CA = 2 * n_H2_CA * 0.1584 * p['eta_NaCl']
        E_GT = v['m_fuel'] * p['EF_GT']
        E_grid = v['P_grid'] * self.EF_grid
        E_total = E_CA + E_GT + E_grid - 0.5 * v['n_H2_methanol'] * 0.1584

        Cost_grid = v['P_grid'] * self.price_grid
        Cost_fuel = v['m_fuel'] * 3600 / 1000 * p['price_methane']

        obj_carbon = float(np.sum(E_total))
        obj_cost = float(np.sum(Cost_grid + Cost_fuel))

        if self.objective_type == 'carbon':
            return obj_carbon
        if self.objective_type == 'cost':
            return obj_cost
        return (p['w_carbon'] * obj_carbon / p['norm_carbon'] +
                p['w_cost'] * obj_cost / p['norm_cost'])

    def _build_constraints(self):
        cons = []
        p = self.p

        def power_bal(x):
            v = self._unpack(x)
            P_CA, _, P_GT, P_PE = self._derived(v)
            if self.has_ES:
                surplus = self.P_PV + P_GT + P_PE + v['P_grid'] - P_CA
                E = v['E_storage']
                r = np.empty(T)
                r[0] = E[0] - surplus[0]
                r[1:] = E[1:] - E[:-1] - surplus[1:]
                return r
            return self.P_PV + P_GT + P_PE + v['P_grid'] - P_CA
        cons.append({'type': 'eq', 'fun': power_bal})

        def h2_bal(x):
            v = self._unpack(x)
            _, n_H2_CA, _, _ = self._derived(v)
            H = v['H_storage']
            dH = 3.6 * (n_H2_CA - v['n_H2_PE'] - v['n_H2_methanol'])
            r = np.empty(T)
            r[0] = H[0] - self.H_0 - dH[0]
            r[1:] = H[1:] - H[:-1] - dH[1:]
            return r
        cons.append({'type': 'eq', 'fun': h2_bal})

        def prod_target(x):
            i_CA = x[self._idx('i_CA')]
            total = np.sum(p['eta_F'] * p['n_e'] * i_CA / (Z * F_CONST)) * 3600
            return total - self.H2_target
        cons.append({'type': 'eq', 'fun': prod_target})

        def end_storage(x):
            return x[self._idx('H_storage')][-1] - self.H_0
        cons.append({'type': 'eq', 'fun': end_storage})

        def pca_lo(x):
            v = self._unpack(x)
            P_CA, _, _, _ = self._derived(v)
            return P_CA - 0.8 * self.P_CA_rated
        cons.append({'type': 'ineq', 'fun': pca_lo})

        def pca_hi(x):
            v = self._unpack(x)
            P_CA, _, _, _ = self._derived(v)
            return 1.2 * self.P_CA_rated - P_CA
        cons.append({'type': 'ineq', 'fun': pca_hi})

        if self.is_fixed:
            def fixed_i(x):
                return x[self._idx('i_CA')] - p['i_rated']
            cons.append({'type': 'eq', 'fun': fixed_i})

        for ec in self.extra_constraints:
            ctype = ec.get('type', '')
            ts = ec.get('timesteps', list(range(T)))
            val = ec.get('value', 0)
            if ctype == 'P_grid_max':
                def make_pg_max(ts_=ts, val_=val):
                    def fn(x):
                        return val_ - x[self._idx('P_grid')][ts_]
                    return fn
                cons.append({'type': 'ineq', 'fun': make_pg_max()})
            elif ctype == 'P_grid_min':
                def make_pg_min(ts_=ts, val_=val):
                    def fn(x):
                        return x[self._idx('P_grid')][ts_] - val_
                    return fn
                cons.append({'type': 'ineq', 'fun': make_pg_min()})

        return cons

    def _bounds(self):
        i_lo = self.p['i_rated'] if self.is_fixed else 0.5 * self.p['i_rated']
        i_hi = self.p['i_rated'] if self.is_fixed else 1.5 * self.p['i_rated']
        b = ([(i_lo, i_hi)] * T +
             [(0.5, 1.0)] * T +
             [(0.2 * self.P_CA_rated, None)] * T +
             [(0, None)] * T +
             [(0, None)] * T +
             [(self.H_min, self.H_max)] * T)
        if self.has_ES:
            b += [(0, self.ES_max)] * T
        return b

    def _x0(self):
        x = np.zeros(self.nvar)
        x[self._idx('i_CA')] = self.p['i_rated']
        x[self._idx('m_fuel')] = 0.6
        gt_est = self.K_GT * 0.6
        x[self._idx('P_grid')] = np.maximum(
            self.P_CA_rated - self.P_PV - gt_est, 0.2 * self.P_CA_rated)
        x[self._idx('n_H2_PE')] = 0.1
        x[self._idx('n_H2_methanol')] = 0.1
        x[self._idx('H_storage')] = self.H_0
        if self.has_ES:
            x[self._idx('E_storage')] = 0
        return x

    def solve(self):
        t0 = _time.time()
        result = minimize(
            self._objective, self._x0(),
            method='SLSQP', bounds=self._bounds(),
            constraints=self._build_constraints(),
            options={'maxiter': 1000, 'ftol': 1e-9, 'disp': False})
        elapsed = _time.time() - t0
        return self._format(result, elapsed)

    def _format(self, result, elapsed):
        v = self._unpack(result.x)
        P_CA, n_H2_CA, P_GT, P_PE = self._derived(v)
        p = self.p

        E_CA = 2 * n_H2_CA * 0.1584 * p['eta_NaCl']
        E_GT = v['m_fuel'] * p['EF_GT']
        E_grid = v['P_grid'] * self.EF_grid
        E_total = E_CA + E_GT + E_grid - 0.5 * v['n_H2_methanol'] * 0.1584

        Cost_grid = v['P_grid'] * self.price_grid
        Cost_fuel = v['m_fuel'] * 3600 / 1000 * p['price_methane']

        total_carbon = float(np.sum(E_total))
        total_cost = float(np.sum(Cost_grid + Cost_fuel))
        combined = (p['w_carbon'] * total_carbon / p['norm_carbon'] +
                    p['w_cost'] * total_cost / p['norm_cost'])

        H_CA_kg = n_H2_CA * M_H2 / 1000
        H_PEM_kg = v['n_H2_PE'] * M_H2 / 1000
        H_CH_kg = v['n_H2_methanol'] * M_H2 / 1000
        H_HS_t = v['H_storage'] * M_H2 / 1000

        return {
            'success': bool(result.success),
            'solve_time': round(elapsed, 2),
            'message': result.message if not result.success else 'ok',
            'summary': {
                'cost': round(total_cost, 2),
                'carbon': round(total_carbon, 2),
                'combined': round(combined, 2),
            },
            'P_CA': _r(P_CA), 'P_PV': _r(self.P_PV), 'P_GM': _r(P_GT),
            'P_PEM': _r(P_PE), 'P_G': _r(v['P_grid']),
            'H_HS': _r(H_HS_t, 6), 'H_CA': _r(H_CA_kg, 10),
            'H_PEM': _r(H_PEM_kg, 10), 'H_CH': _r(H_CH_kg, 10),
            'P_es_es': _r(v['E_storage']) if self.has_ES else [0.0] * T,
            'ef_g': self.EF_grid.tolist(),
        }


def _r(arr, decimals=4):
    return np.round(arr, decimals).tolist()


STRATEGY_CONFIGS = {
    'uci':   ('unchangeable', 'combined'),
    'cicos': ('changeable',   'cost'),
    'cicar': ('changeable',   'carbon'),
    'cicom': ('changeable',   'combined'),
    'pv':    ('pvplus',       'combined'),
    'es':    ('es',           'combined'),
}


def optimize_single(strategy_key, overrides=None, extra_constraints=None):
    scenario, obj_type = STRATEGY_CONFIGS[strategy_key]
    opt = SystemOptimizer(scenario, obj_type, overrides, extra_constraints)
    return opt.solve()


def optimize_all(overrides=None, extra_constraints=None):
    results = {}
    for key in STRATEGY_CONFIGS:
        results[key] = optimize_single(key, overrides, extra_constraints)
    return _as_dataset(results)


def _as_dataset(results):
    keys = list(STRATEGY_CONFIGS.keys())
    ds = {'summary': {}}
    for field in ['P_CA', 'P_PV', 'P_GM', 'P_PEM', 'P_G', 'H_CA', 'H_PEM', 'H_CH', 'H_HS']:
        ds[field] = {}
    for k in keys:
        r = results[k]
        ds['summary'][k] = r['summary']
        for field in ['P_CA', 'P_PV', 'P_GM', 'P_PEM', 'P_G', 'H_CA', 'H_PEM', 'H_CH', 'H_HS']:
            ds[field][k] = r[field]
    ds['P_es_es'] = results['es']['P_es_es']
    ds['ef_g'] = results['uci']['ef_g']
    return ds


def main():
    if len(sys.argv) > 1:
        with open(sys.argv[1], 'r', encoding='utf-8') as f:
            cfg = json.load(f)
    else:
        cfg = json.loads(sys.stdin.read())

    mode = cfg.get('mode', 'all')
    overrides = cfg.get('params', {})
    extra = cfg.get('extra_constraints', [])

    if mode == 'single':
        strategy = cfg.get('strategy', 'cicom')
        out = optimize_single(strategy, overrides, extra)
    else:
        out = optimize_all(overrides, extra)

    json.dump(out, sys.stdout, ensure_ascii=False)


if __name__ == '__main__':
    main()
