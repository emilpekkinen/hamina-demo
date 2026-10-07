#!/usr/bin/env python3
"""Generate synthetic paid-marketing data for Hamina Wireless (DEMO).

Campaigns on Google Ads, LinkedIn Ads, Meta Ads, YouTube Ads, review sites (Capterra/G2 PPC) and
Reddit Ads, with weekly platform-reported stats (spend, impressions, clicks, conversions), shaped like
the ad platforms' reporting exports. Budgets, channel mix and unit costs follow public B2B SaaS
benchmarks (see design/marketing-research.md); everything else is invented.

Run this FIRST: the Stripe and HubSpot generators read the spend to time customer acquisition and
deal creation (with carry-over and lag), so the analysis has a real, but noisy, effect to find.

Usage:  python3 generate_marketing_data.py
Output: hamina_marketing.db  +  csv/<table>.csv
"""

import csv
import math
import random
import sqlite3
from datetime import date, timedelta
from pathlib import Path

SEED = 55
ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "hamina_marketing.db"
CSV_DIR = ROOT / "csv"
DATA_START, DATA_END = date(2022, 1, 3), date(2026, 9, 28)  # Monday-aligned weeks, last week ends 2026-10-04

# Paid media budget per year, EUR: ≈ 6–7 % of revenue once scaling (Gartner: paid ≈ 31 % of a marketing
# budget of 8–15 % of ARR; see design/marketing-research.md). 2026 is the full-year plan.
YEARLY_BUDGET = {2022: 6_000, 2023: 35_000, 2024: 75_000, 2025: 140_000, 2026: 210_000}

# Channel share of each year's budget and the date the channel was switched on.
CHANNEL_MIX = {
    2022: {"google_ads": 0.85, "linkedin_ads": 0.15},
    2023: {"google_ads": 0.55, "linkedin_ads": 0.30, "review_sites": 0.05, "youtube_ads": 0.05, "meta_ads": 0.05},
    2024: {"google_ads": 0.45, "linkedin_ads": 0.32, "review_sites": 0.08, "youtube_ads": 0.06, "reddit_ads": 0.04, "meta_ads": 0.05},
    2025: {"google_ads": 0.40, "linkedin_ads": 0.35, "review_sites": 0.08, "youtube_ads": 0.07, "reddit_ads": 0.06, "meta_ads": 0.04},
    2026: {"google_ads": 0.36, "linkedin_ads": 0.37, "review_sites": 0.08, "youtube_ads": 0.08, "reddit_ads": 0.07, "meta_ads": 0.04},
}
CHANNEL_START = {"google_ads": date(2022, 7, 4), "linkedin_ads": date(2022, 9, 5), "review_sites": date(2023, 3, 6),
                 "youtube_ads": date(2023, 4, 3), "meta_ads": date(2023, 5, 1), "reddit_ads": date(2024, 3, 4)}

# Unit economics (EUR, 2022 level): CPM, CTR, click→lead. Implied CPC: Google ≈ €4.8, LinkedIn ≈ €10,
# Capterra ≈ €5, YouTube ≈ €3.8, Reddit ≈ €2, Meta ≈ €1.7. Platform-reported conversions.
UNITS = {
    "google_ads": dict(cpm=240.0, ctr=0.05, cvr=0.06),
    "linkedin_ads": dict(cpm=50.0, ctr=0.005, cvr=0.08),
    "meta_ads": dict(cpm=12.0, ctr=0.007, cvr=0.015),
    "review_sites": dict(cpm=175.0, ctr=0.035, cvr=0.05),
    "youtube_ads": dict(cpm=15.0, ctr=0.004, cvr=0.01),
    "reddit_ads": dict(cpm=12.0, ctr=0.006, cvr=0.025),
}
CPM_INFLATION = 0.06  # per year

# Campaign templates per channel: (name, objective, audience, segment, kind, weight)
# kind: always_on runs all year; burst = 4–8 week flights.
CAMPAIGNS = {
    "google_ads": [("Search – Brand", "conversions", "brand searchers", "self_serve", "always_on", 0.15),
                   ("Search – Wi-Fi planning software (non-brand)", "conversions", "network engineers", "self_serve", "always_on", 0.45),
                   ("Search – Competitor terms (Ekahau, iBwave)", "conversions", "network engineers", "self_serve", "always_on", 0.25),
                   ("Search – Enterprise Wi-Fi design (hospitals, campuses)", "leads", "IT leads", "enterprise", "always_on", 0.15)],
    "linkedin_ads": [("ABM – Hospitals & health systems", "leads", "IT directors, healthcare", "enterprise", "burst", 0.25),
                     ("ABM – Universities", "leads", "network services, higher-ed", "enterprise", "burst", 0.2),
                     ("Webinar promo – Wi-Fi 7 design", "registrations", "wireless engineers", "self_serve", "burst", 0.2),
                     ("Lead gen – Free trial (network engineers)", "leads", "network engineers", "self_serve", "always_on", 0.2),
                     ("Thought leadership – Predictive design", "awareness", "IT leads", "enterprise", "burst", 0.15)],
    "meta_ads": [("Retargeting – website visitors", "conversions", "site visitors", "self_serve", "always_on", 0.8),
                 ("Lookalike – trial users", "conversions", "lookalike", "self_serve", "burst", 0.2)],
    "review_sites": [("Capterra PPC – Network design software", "clicks", "software buyers", "self_serve", "always_on", 0.6),
                     ("G2 – Category sponsorship", "awareness", "software buyers", "self_serve", "always_on", 0.4)],
    "youtube_ads": [("Tutorial pre-roll – Wi-Fi survey how-to", "views", "wireless engineers", "self_serve", "burst", 0.6),
                    ("Product launch – Hamina Onsite", "awareness", "network engineers", "self_serve", "burst", 0.4)],
    "reddit_ads": [("r/networking + r/sysadmin test", "clicks", "network engineers", "self_serve", "burst", 1.0)],
}
# Bursts cluster around conference and budget seasons; summer is quiet.
BURST_MONTHS = [1, 2, 3, 5, 6, 9, 10, 11]
# Feb: Cisco Live EMEA / WLPC US, Jun: Cisco Live US, Oct: WLPC EU; July = Finnish holidays.
SEASON = {1: 1.0, 2: 1.25, 3: 1.15, 4: 0.95, 5: 1.05, 6: 1.1, 7: 0.55, 8: 0.85, 9: 1.2, 10: 1.15, 11: 1.05, 12: 0.7}

rng = random.Random(SEED)


def mondays(start, end):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=7)


def build():
    campaigns, weekly = [], []
    cid = 1000
    for channel, templates in CAMPAIGNS.items():
        for name, objective, audience, segment, kind, weight in templates:
            for year, budget in YEARLY_BUDGET.items():
                share = CHANNEL_MIX[year].get(channel, 0)
                if not share:
                    continue
                if kind == "always_on":
                    flights = [(max(date(year, 1, 1), CHANNEL_START[channel]), date(year, 12, 31))]
                else:  # 2–3 flights a year of 4–8 weeks
                    flights = []
                    for m in sorted(rng.sample(BURST_MONTHS, rng.randint(2, 3))):
                        s = date(year, m, rng.randint(1, 20))
                        flights.append((max(s, CHANNEL_START[channel]), s + timedelta(weeks=rng.randint(4, 8))))
                for start, end in flights:
                    if start > end or start > DATA_END:
                        continue
                    cid += 1
                    campaign = dict(campaign_id=f"cmp_{cid}", platform=channel,
                                    name=f"{name} – {year}" + (f" ({start:%b})" if kind == "burst" else ""),
                                    objective=objective, audience=audience, target_segment=segment, kind=kind,
                                    start_date=start.isoformat(), end_date=min(end, DATA_END + timedelta(days=6)).isoformat(),
                                    _end=end, _weight=weight, _year=year, _flights=len(flights))
                    campaigns.append(campaign)
    # Spread each (channel, year) budget across its campaigns' active weeks, seasonally weighted.
    for year, budget in YEARLY_BUDGET.items():
        for channel, share in CHANNEL_MIX[year].items():
            camps = [c for c in campaigns if c["platform"] == channel and c["_year"] == year]
            units = []
            for c in camps:
                s, e = date.fromisoformat(c["start_date"]), c["_end"]  # plan the whole flight, even past the snapshot
                for wk in mondays(s - timedelta(days=s.weekday()), e):
                    if wk.year == year:
                        burst = 2.2 if c["kind"] == "burst" else 1.0
                        units.append((c, wk, c["_weight"] / c["_flights"] * burst * SEASON[wk.month] * rng.lognormvariate(0, 0.25)))
            total = sum(u for _, _, u in units) or 1
            # Weeks after the snapshot don't exist yet; budget is the full-year plan.
            for c, wk, u in units:
                if wk > DATA_END or wk < DATA_START:
                    continue
                spend = budget * share * u / total
                p = UNITS[channel]
                cpm = p["cpm"] * (1 + CPM_INFLATION) ** (year - 2022) * rng.lognormvariate(0, 0.12)
                impressions = int(spend / cpm * 1000)
                clicks = int(impressions * p["ctr"] * rng.lognormvariate(0, 0.15))
                conversions = int(round(clicks * p["cvr"] * rng.lognormvariate(0, 0.25)))
                weekly.append(dict(week_start=wk.isoformat(), campaign_id=c["campaign_id"], platform=channel,
                                   spend_eur=round(spend, 2), impressions=impressions, clicks=clicks,
                                   conversions=conversions))
    return campaigns, weekly


def write(campaigns, weekly):
    DB_PATH.unlink(missing_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.executescript("""
        CREATE TABLE campaigns (campaign_id TEXT PRIMARY KEY, platform TEXT NOT NULL, name TEXT NOT NULL,
            objective TEXT, audience TEXT, target_segment TEXT, kind TEXT, start_date TEXT, end_date TEXT);
        CREATE TABLE campaign_weekly_stats (week_start TEXT NOT NULL, campaign_id TEXT NOT NULL REFERENCES campaigns(campaign_id),
            platform TEXT NOT NULL, spend_eur REAL NOT NULL, impressions INTEGER, clicks INTEGER, conversions INTEGER);
        CREATE VIEW v_spend_by_month AS
            SELECT substr(week_start, 1, 7) AS month, platform, ROUND(SUM(spend_eur), 2) AS spend_eur,
                   SUM(impressions) AS impressions, SUM(clicks) AS clicks, SUM(conversions) AS conversions
            FROM campaign_weekly_stats GROUP BY 1, 2 ORDER BY 1, 2;
    """)
    live = {w["campaign_id"] for w in weekly}
    campaigns = [c for c in campaigns if c["campaign_id"] in live]
    cols = ["campaign_id", "platform", "name", "objective", "audience", "target_segment", "kind", "start_date", "end_date"]
    con.executemany(f"INSERT INTO campaigns VALUES ({','.join('?' * len(cols))})", [[c[k] for k in cols] for c in campaigns])
    wcols = ["week_start", "campaign_id", "platform", "spend_eur", "impressions", "clicks", "conversions"]
    con.executemany(f"INSERT INTO campaign_weekly_stats VALUES ({','.join('?' * len(wcols))})",
                    [[w[k] for k in wcols] for w in sorted(weekly, key=lambda w: w["week_start"])])
    con.commit()
    CSV_DIR.mkdir(exist_ok=True)
    for name in ["campaigns", "campaign_weekly_stats", "v_spend_by_month"]:
        cur = con.execute(f"SELECT * FROM {name}")
        with open(CSV_DIR / f"{name}.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow([d[0] for d in cur.description])
            w.writerows(cur)
    print(f"{len(campaigns)} campaigns, {len(weekly)} campaign-weeks")
    for row in con.execute("SELECT substr(week_start,1,4), platform, ROUND(SUM(spend_eur)), SUM(clicks), SUM(conversions), "
                           "ROUND(SUM(spend_eur)/SUM(clicks),2), ROUND(SUM(spend_eur)/MAX(SUM(conversions),1)) "
                           "FROM campaign_weekly_stats GROUP BY 1,2"):
        print("  ", *row)
    con.close()


if __name__ == "__main__":
    write(*build())
