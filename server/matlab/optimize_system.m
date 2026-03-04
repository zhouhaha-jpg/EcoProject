function result = optimize_system(params)
%% OPTIMIZE_SYSTEM Parameterized chlor-alkali optimization
%  Accepts a struct with override parameters, returns optimization results.
%  Usage: result = optimize_system(struct('scenario','changeable','objective_type','combined','n_PV',20000))

%% Default parameters
p = struct();
p.scenario = 'changeable';
p.objective_type = 'combined';
p.No_timesteps = 24;
p.F_const = 96485.33289;
p.z = 2;
p.Delta_G = 483.5e3;
p.T_CA = 87;
p.A_el = 2.7;
p.r1 = 0.0000445153;
p.r2 = 0.00000000688874;
p.n_e = 100;
p.eta_F = 0.95;
p.i_rated = 30000;
p.eta_NaCl = 1;
p.n_PV = 10000;
p.A_PVcl = 1.675;
p.eta_PV = 0.149;
p.eta_inv = 0.978;
p.f_PV = 0.8;
p.G_scale = 1.5;
p.G_profile = [0 0 0 0 0 0.05 0.15 0.3 0.5 0.7 0.85 0.95 1.0 0.95 0.85 0.7 0.5 0.3 0.15 0.05 0 0 0 0];
p.h_fg_in = 2668;
p.h_fg_out = 966;
p.h_air_in = 991;
p.h_air_out = 295;
p.eta_GM = 0.5;
p.eta_air = 0.5;
p.EF_GT = 9.9;
p.fuel_air_ratio = 2;
p.eta_PE = 0.6;
p.W_PE_mol = 286;
p.H_max = 1200;
p.H_min_ratio = 0.2;
p.H_0_ratio = 0.5;
p.c_carbon = 90;
p.price_methane = 3000;
p.w_carbon = 0.5;
p.w_cost = 0.5;
p.norm_carbon = 288.63;
p.norm_cost = 202486.53;
p.ES_max_ratio = 0.2;

carbon_average = 0.581e-3;
p.EF_grid = zeros(1, 24);
p.EF_grid(1:8) = carbon_average * 0.7;
p.EF_grid(9:11) = carbon_average * 1.3;
p.EF_grid(12:13) = carbon_average * 1.0;
p.EF_grid(14:18) = carbon_average * 1.3;
p.EF_grid(19:21) = carbon_average * 1.5;
p.EF_grid(22) = carbon_average * 1.3;
p.EF_grid(23:24) = carbon_average * 0.7;

p.price_grid = [0.6281 0.6339 0.6282 0.6105 0.6024 0.6150 0.6273 0.6440 ...
                0.6463 0.6063 0.5790 0.5928 0.6028 0.5846 0.5978 0.6150 ...
                0.6131 0.6258 0.6128 0.6056 0.6113 0.6099 0.6223 0.6312];

%% Apply overrides from params
if nargin > 0
    fnames = fieldnames(params);
    for i = 1:length(fnames)
        p.(fnames{i}) = params.(fnames{i});
    end
end

if strcmp(p.scenario, 'pvplus')
    p.n_PV = p.n_PV * 2;
end

%% Derived constants
T = p.No_timesteps;
U_rev = p.Delta_G / (p.z * p.F_const);
k_ohm = (p.r1 + p.r2*p.T_CA) / p.A_el;
U_rated = U_rev + k_ohm * p.i_rated;
P_CA_rated = p.n_e * U_rated * p.i_rated / 1e3;
n_H2_rated = p.eta_F * (p.n_e * p.i_rated) / (p.z * p.F_const);
H2_target = n_H2_rated * 3600 * T;
G_irradiance = p.G_profile * p.G_scale;
P_PV = p.n_PV * p.A_PVcl * G_irradiance * p.eta_PV * p.eta_inv * p.f_PV;
H_max = p.H_max;
H_min = p.H_min_ratio * H_max;
H_0 = p.H_0_ratio * H_max;

has_ES = strcmp(p.scenario, 'es');
is_fixed = strcmp(p.scenario, 'unchangeable');

%% Decision variables
i_CA = sdpvar(1, T);
m_fuel = sdpvar(1, T);
P_grid = sdpvar(1, T);
n_H2_PE = sdpvar(1, T);
n_H2_methanol = sdpvar(1, T);
H_storage = sdpvar(1, T);
if has_ES
    E_storage = sdpvar(1, T);
    ES_max = p.ES_max_ratio * P_CA_rated;
end

%% Intermediate variables
U_CA = U_rev + k_ohm * i_CA;
P_CA = p.n_e * U_CA .* i_CA / 1e3;
n_H2_CA = p.eta_F * (p.n_e * i_CA) / (p.z * p.F_const);
m_air = m_fuel / p.fuel_air_ratio;
P_GT = m_fuel * (p.h_fg_in - p.h_fg_out) * p.eta_GM + m_air * (p.h_air_in - p.h_air_out) * p.eta_air;
P_PE = p.eta_PE * n_H2_PE * p.W_PE_mol;

%% Constraints
Constraints = [];

if has_ES
    for t = 1:T
        if t == 1
            Constraints = [Constraints, E_storage(t) == P_PV(t) + P_GT(t) + P_PE(t) + P_grid(t) - P_CA(t)];
        else
            Constraints = [Constraints, E_storage(t) == E_storage(t-1) + P_PV(t) + P_GT(t) + P_PE(t) + P_grid(t) - P_CA(t)];
        end
    end
    Constraints = [Constraints, 0 <= E_storage <= ES_max];
else
    for t = 1:T
        Constraints = [Constraints, P_PV(t) + P_GT(t) + P_PE(t) + P_grid(t) == P_CA(t)];
    end
end

for t = 1:T
    if t == 1
        Constraints = [Constraints, H_storage(t) == H_0 + n_H2_CA(t)*3.6 - n_H2_PE(t)*3.6 - n_H2_methanol(t)*3.6];
    else
        Constraints = [Constraints, H_storage(t) == H_storage(t-1) + n_H2_CA(t)*3.6 - n_H2_PE(t)*3.6 - n_H2_methanol(t)*3.6];
    end
end

Constraints = [Constraints, H_storage(T) == H_0];
Constraints = [Constraints, sum(n_H2_CA) * 3600 == H2_target];

for t = 1:T
    Constraints = [Constraints, 0.8*P_CA_rated <= P_CA(t) <= 1.2*P_CA_rated];
end

if is_fixed
    Constraints = [Constraints, i_CA == p.i_rated];
end

Constraints = [Constraints, 1 >= m_fuel >= 0.5];
Constraints = [Constraints, 0.2*P_CA_rated <= P_grid];
Constraints = [Constraints, n_H2_PE >= 0];
Constraints = [Constraints, H_min <= H_storage <= H_max];
Constraints = [Constraints, n_H2_methanol >= 0];

%% Objective
E_CA = 2 * n_H2_CA * 0.1584 * p.eta_NaCl;
E_GT = m_fuel * p.EF_GT;
E_grid_em = P_grid .* p.EF_grid;
E_total = E_CA + E_GT + E_grid_em - 0.5*n_H2_methanol*0.1584;

Cost_grid = P_grid .* p.price_grid;
Cost_fuel = m_fuel * 3600 / 1000 * p.price_methane;

Obj_carbon = sum(E_total);
Obj_cost = sum(Cost_grid + Cost_fuel);
Obj_combined = p.w_carbon*Obj_carbon/p.norm_carbon + p.w_cost*Obj_cost/p.norm_cost;

if strcmp(p.objective_type, 'carbon')
    Objective = Obj_carbon;
elseif strcmp(p.objective_type, 'cost')
    Objective = Obj_cost;
else
    Objective = Obj_combined;
end

%% Solve
options = sdpsettings('solver', 'gurobi', 'verbose', 0);
options.gurobi.TimeLimit = 300;
options.gurobi.MIPGap = 1e-4;
options.gurobi.Method = 2;

sol = optimize(Constraints, Objective, options);

%% Format result
result = struct();
result.success = (sol.problem == 0);
result.P_CA = value(P_CA);
result.P_PV = P_PV;
result.P_GM = value(P_GT);
result.P_PEM = value(P_PE);
result.P_G = value(P_grid);
result.H_HS = value(H_storage) * 2.016 / 1000;
result.H_CA = value(n_H2_CA) * 2.016 / 1000;
result.H_PEM = value(n_H2_PE) * 2.016 / 1000;
result.H_CH = value(n_H2_methanol) * 2.016 / 1000;
result.ef_g = p.EF_grid;
if has_ES
    result.P_es_es = value(E_storage);
else
    result.P_es_es = zeros(1, T);
end
result.cost = value(Obj_cost);
result.carbon = value(Obj_carbon);
result.combined = value(Obj_combined);

end
