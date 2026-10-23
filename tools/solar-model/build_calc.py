"""
Data for the simple bill-slider calculator (assets/data/calc-model.json).

Reuses the hourly production model in build_model.py (CEC CZ2010 weather, pvlib PVWatts method).
For a range of household sizes (monthly kWh), it records:
  - the home's own usage by "hour group"
  - the solar the home uses (plus battery power) by the same hour groups
Hour groups are chosen so every SDG&E plan's time-of-use periods can be built from them:
  A  4-9 pm, every day                  (on-peak on every SDG&E TOU plan)
  B  weekdays 10 am-2 pm, March/April   (super off-peak on TOU-DR1 and EV-TOU-5)
  C  weekends/holidays before 2 pm      (super off-peak on TOU-DR1 and EV-TOU-5)
  D  weekdays 6 am-4 pm, except B       (off-peak)
  E  weekdays midnight-6 am             (super off-peak on TOU-DR1 and EV-TOU-5)
  F  all other hours (9 pm-midnight, weekend 2-4 pm)  (off-peak)
each split into summer (June-October) and winter.
"""
import json, sys
import numpy as np
import build_model as bm

LEVELS_KWH = [120, 160, 200, 250, 300, 375, 450, 550, 650, 800, 950, 1100, 1300, 1500]  # monthly household use
SETUPS = {  # space -> (kW, tilt key); results average south- and west-facing
    "balcony": (1.2, "upright"),
    "window": (0.8, "steep"),
}
FACES = ["south", "west"]
BATTS = [0, 1, 2, 4]


def groups(start_std, hour, weekend, summer):
    local = start_std.tz_convert("America/Los_Angeles")
    month = local.month.values
    g = np.full(8760, "F", dtype=object)
    g[(hour >= 16) & (hour < 21)] = "A"
    marapr = (month == 3) | (month == 4)
    g[(~weekend) & marapr & (hour >= 10) & (hour < 14)] = "B"
    g[weekend & (hour < 14)] = "C"
    g[(~weekend) & (hour >= 6) & (hour < 16) & ~(marapr & (hour >= 10) & (hour < 14))] = "D"
    g[(~weekend) & (hour < 6)] = "E"
    season = np.where(summer, "s", "w")
    return np.char.add(season.astype(str), g.astype(str))


def battery_sim(prod, load, use, batt_kwh, ac_cap, hour):
    excess = prod - use
    out = np.zeros(8760)
    if batt_kwh <= 0:
        return out
    cap, soc = batt_kwh * bm.BATT_USABLE, 0.0
    for i in range(8760):
        if excess[i] > 0:
            soc += min(excess[i] * bm.BATT_EFF_ONEWAY, cap - soc)
        if soc > 0 and hour[i] >= 16:  # 4 pm to midnight, peak first because it comes first
            room = max(load[i] - use[i], 0.0)
            inv_room = max(ac_cap - prod[i], 0.0)
            o = min(room, inv_room, soc * bm.BATT_EFF_ONEWAY)
            if o > 0:
                soc -= o / bm.BATT_EFF_ONEWAY
                out[i] = o
    return out


def main(weather_dir, out_path):
    start_std, hour, weekend, summer, season, period = bm.local_calendar()
    grp = groups(start_std, hour, weekend, summer)
    keys = [s + g for s in ("s", "w") for g in "ABCDEF"]
    base = bm.load_profiles(hour, weekend, summer)["medium"]
    base_month = base.sum() / 12.0
    prod_kw = {}
    for space, (kw, tilt) in SETUPS.items():
        for face in FACES:
            prod_kw[(space, face)] = bm.per_kw_ac(f"{weather_dir}/{bm.WEATHER['coastal']}", bm.TILTS[tilt], bm.AZIMUTHS[face], start_std)
    out = {"version": "2026-10-23", "groups": keys, "levels": LEVELS_KWH, "batts": BATTS,
           "weather": "CEC CZ2010 Climate Zone 7, San Diego Lindbergh Field", "faces": FACES,
           "load": [], "setups": {}}
    for lvl in LEVELS_KWH:
        load = base * (lvl / base_month)
        out["load"].append([round(float(load[grp == k].sum()), 1) for k in keys])
    for space, (kw, tilt) in SETUPS.items():
        rows = {}
        prod_total = []
        for b in BATTS:
            per_level = []
            for lvl in LEVELS_KWH:
                load = base * (lvl / base_month)
                acc = np.zeros(len(keys))
                for face in FACES:
                    prod = prod_kw[(space, face)] * kw
                    use = np.minimum(prod, load)
                    fb = battery_sim(prod, load, use, b, kw, hour)
                    avoided = use + fb
                    acc += np.array([avoided[grp == k].sum() for k in keys])
                per_level.append([round(float(v / len(FACES)), 1) for v in acc])
            rows[str(b)] = per_level
        prod_total = round(float(np.mean([prod_kw[(space, f)].sum() * kw for f in FACES])))
        out["setups"][space] = {"kw": kw, "tilt": tilt, "prodKwh": prod_total, "avoid": rows}
        print(space, "production", prod_total, file=sys.stderr)
    with open(out_path, "w") as f:
        json.dump(out, f, separators=(",", ":"))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
