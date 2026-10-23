"""
Terrace Solar plug-in solar savings model.

Production: hourly simulation over a full typical year using the California Energy
Commission CZ2010 weather files (Title 24), with pvlib's implementation of NREL's
PVWatts method (Perez transposition, SAPM open-rack cell temperature, PVWatts DC,
14% system losses, PVWatts inverter at 96% nominal efficiency, DC/AC ratio 1.0).

Consumption: three illustrative household patterns (hourly, by weekday/weekend and season).
Zero-export: solar the home cannot use in that hour is curtailed (value $0).
Battery (Featherweight only): charges only from solar that would otherwise be curtailed,
discharges 4-9 pm first (on-peak), then 9 pm-midnight, limited by home load and by the
kit's inverter capacity.

Output: for each scenario, kWh avoided by SDG&E TOU-DR1 bucket (season x period),
plus annual production. Dollar values are applied in the browser from the rate table,
so rates can be updated without re-running this script.
"""
import json, sys
import numpy as np
import pandas as pd
import pvlib

WEATHER = {
    "coastal": "SAN-DIEGO-LINDBERGH_722900_CZ2010.epw",   # CEC Climate Zone 7
    "inland": "RIVERSIDE_722869_CZ2010.epw",              # CEC Climate Zone 10
}
TILTS = {"upright": 90, "steep": 60, "stand": 30}
AZIMUTHS = {"south": 180, "west": 270, "east": 90, "north": 0}
KW = [0.8, 1.2]
SHADE = {"none": 1.0, "some": 0.8, "heavy": 0.55}
BATTERY = [0, 1, 2, 3, 4]
BATT_USABLE = 0.90       # usable share of nameplate (assumed)
BATT_EFF_ONEWAY = 0.95   # charge and discharge efficiency each way, about 90% round trip (assumed)
LOSSES = 14.0            # PVWatts default system losses, %
INV_EFF = 0.96
YEAR = 2026
HOLIDAYS = pd.to_datetime([  # SDG&E TOU holidays, 2026
    "2026-01-01", "2026-02-16", "2026-05-25", "2026-07-04", "2026-09-07",
    "2026-11-11", "2026-11-26", "2026-12-25"]).date


def local_calendar():
    """Hourly intervals for 2026 in Pacific Standard Time (the EPW clock), with the
    prevailing local clock (PST/PDT) used by SDG&E time-of-use periods."""
    start_std = pd.date_range(f"{YEAR}-01-01 00:00", periods=8760, freq="h", tz="Etc/GMT+8")
    local = start_std.tz_convert("America/Los_Angeles")
    hour = local.hour.values
    month = local.month.values
    dow = local.dayofweek.values
    is_hol = np.isin(local.date, HOLIDAYS)
    weekend = (dow >= 5) | is_hol
    summer = (month >= 6) & (month <= 10)
    # TOU-DR1 periods (SDG&E): on-peak 4-9 pm daily; weekdays super off-peak midnight-6 am,
    # plus 10 am-2 pm in March and April; weekends/holidays super off-peak midnight-2 pm.
    period = np.full(8760, "off", dtype=object)
    period[(hour >= 16) & (hour < 21)] = "on"
    wk_sop = (~weekend) & ((hour < 6) | (((month == 3) | (month == 4)) & (hour >= 10) & (hour < 14)))
    we_sop = weekend & (hour < 14)
    period[wk_sop | we_sop] = "super"
    season = np.where(summer, "summer", "winter")
    return start_std, hour, weekend, summer, season, period


def load_profiles(hour, weekend, summer):
    """Illustrative household demand in kW for each hour.
    low: away on weekdays; medium: home part of the day; high: home most days with cooling."""
    def shape(night, morning, day_wk, day_we, evening, late, ac_day, ac_eve):
        kw = np.empty(8760)
        for i in range(8760):
            h = hour[i]
            if h < 6:
                v = night
            elif h < 9:
                v = morning
            elif h < 16:
                v = day_we if weekend[i] else day_wk
                if summer[i]:
                    v += ac_day
            elif h < 21:
                v = evening + (ac_eve if summer[i] else 0)
            else:
                v = late
            kw[i] = v
        return kw
    return {
        "low":    shape(night=0.15, morning=0.40, day_wk=0.15, day_we=0.35, evening=0.70, late=0.40, ac_day=0.05, ac_eve=0.20),
        "medium": shape(night=0.18, morning=0.45, day_wk=0.30, day_we=0.45, evening=0.85, late=0.45, ac_day=0.15, ac_eve=0.30),
        "high":   shape(night=0.22, morning=0.50, day_wk=0.55, day_we=0.65, evening=1.00, late=0.55, ac_day=0.45, ac_eve=0.50),
    }


def per_kw_ac(epw_path, tilt, azimuth, start_std):
    data, meta = pvlib.iotools.read_epw(epw_path, coerce_year=YEAR)
    # EPW rows are hour-ending in standard time; align to interval start, then use mid-interval sun.
    w = data.iloc[:8760].copy()
    w.index = start_std
    mid = start_std + pd.Timedelta(minutes=30)
    loc = pvlib.location.Location(meta["latitude"], meta["longitude"], tz="Etc/GMT+8", altitude=meta["altitude"])
    sp = loc.get_solarposition(mid, temperature=w["temp_air"].values)
    sp.index = start_std
    dni_extra = pvlib.irradiance.get_extra_radiation(mid)
    dni_extra.index = start_std
    am = pvlib.atmosphere.get_relative_airmass(sp["apparent_zenith"])
    poa = pvlib.irradiance.get_total_irradiance(
        tilt, azimuth, sp["apparent_zenith"], sp["azimuth"],
        w["dni"], w["ghi"], w["dhi"], dni_extra=dni_extra, airmass=am,
        model="perez", albedo=0.2)
    aoi = pvlib.irradiance.aoi(tilt, azimuth, sp["apparent_zenith"], sp["azimuth"])
    iam = pvlib.iam.physical(aoi)
    eff = (poa["poa_direct"].clip(lower=0) * iam + poa["poa_diffuse"].clip(lower=0)).fillna(0)
    p = pvlib.temperature.TEMPERATURE_MODEL_PARAMETERS["sapm"]["open_rack_glass_polymer"]
    tcell = pvlib.temperature.sapm_cell(eff, w["temp_air"], w["wind_speed"], **p)
    dc = pvlib.pvsystem.pvwatts_dc(eff, tcell, pdc0=1000.0, gamma_pdc=-0.0037)
    dc = dc * (1 - LOSSES / 100.0)
    ac = pvlib.inverter.pvwatts(dc, pdc0=1000.0 / INV_EFF, eta_inv_nom=INV_EFF)  # AC nameplate 1 kW
    return np.clip(ac.fillna(0).values, 0, None) / 1000.0  # kWh per hour per kW DC


def simulate(prod, load, batt_kwh, ac_cap_kw, season, period, hour_local):
    use = np.minimum(prod, load)
    excess = prod - use
    avoided = use.copy()
    from_batt = np.zeros(8760)
    if batt_kwh > 0:
        cap = batt_kwh * BATT_USABLE
        soc = 0.0
        for i in range(8760):
            if excess[i] > 0:
                add = min(excess[i] * BATT_EFF_ONEWAY, cap - soc)
                soc += add
            # discharge during on-peak (4-9 pm), then 9 pm-midnight; never during daytime
            if soc > 0 and (period[i] == "on" or hour_local[i] >= 21):
                room = max(load[i] - use[i], 0.0)
                inv_room = max(ac_cap_kw - prod[i], 0.0)
                out = min(room, inv_room, soc * BATT_EFF_ONEWAY)
                if out > 0:
                    soc -= out / BATT_EFF_ONEWAY
                    from_batt[i] = out
        avoided = avoided + from_batt
    buckets = {}
    for s in ("summer", "winter"):
        for p in ("on", "off", "super"):
            m = (season == s) & (period == p)
            buckets[f"{s}_{p}"] = float(avoided[m].sum())
    return buckets, float(use.sum()), float(from_batt.sum()), float(excess.sum())


def main(weather_dir, out_path):
    start_std, hour, weekend, summer, season, period = local_calendar()
    loads = load_profiles(hour, weekend, summer)
    order = ["summer_on", "summer_off", "summer_super", "winter_on", "winter_off", "winter_super"]
    out = {"meta": {}, "prod": {}, "avoid": {}, "check": {}}
    for loc_key, fname in WEATHER.items():
        for t_key, tilt in TILTS.items():
            for a_key, az in AZIMUTHS.items():
                base = per_kw_ac(f"{weather_dir}/{fname}", tilt, az, start_std)
                o_key = f"{loc_key}|{t_key}|{a_key}"
                out["prod"][o_key] = round(float(base.sum()), 1)  # kWh per kW DC per year, unshaded
                for kw in KW:
                    for sh_key, sh in SHADE.items():
                        prod = base * kw * sh
                        for l_key, load in loads.items():
                            for b in BATTERY:
                                bk, used, fb, cur = simulate(prod, load, b, kw, season, period, hour)
                                key = f"{o_key}|{kw}|{sh_key}|{l_key}|{b}"
                                out["avoid"][key] = [round(bk[k]) for k in order]
                                if b == 0:
                                    out["check"][key] = {"prod": round(float(prod.sum())), "used": round(used), "curtailed": round(cur)}
                print(o_key, out["prod"][o_key], file=sys.stderr)
    out["meta"] = {
        "buckets": order,
        "weather": {"coastal": "CEC CZ2010 Climate Zone 7, San Diego Lindbergh Field (722900)",
                    "inland": "CEC CZ2010 Climate Zone 10, Riverside (722869)"},
        "model": "pvlib %s, NREL PVWatts method: Perez transposition, SAPM open-rack cell temperature, -0.37%%/C, %.0f%% system losses, %.0f%% inverter efficiency, DC/AC 1.0" % (pvlib.__version__, LOSSES, INV_EFF * 100),
        "tilts": TILTS, "azimuths": AZIMUTHS, "shade": SHADE,
        "battery": {"usable": BATT_USABLE, "round_trip": round(BATT_EFF_ONEWAY ** 2, 3)},
        "loads_kw": "see build_model.py load_profiles()",
    }
    with open(out_path, "w") as f:
        json.dump(out, f, separators=(",", ":"))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
