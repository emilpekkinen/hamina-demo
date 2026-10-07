"""Monthly 'marketing pressure' index the Stripe and HubSpot generators use to time acquisition.

Effective spend = Σ channel spend × channel effectiveness, carried over with geometric adstock
(decay per month) and shifted by `lag` months. Returns {(year, month): index}, or {} if the
marketing data hasn't been generated.
"""

import sqlite3
from pathlib import Path

DB = Path(__file__).resolve().parent / "hamina_marketing.db"

# Hidden "true" effectiveness per € by segment; the analysis tries to recover the ordering.
SELF_SERVE_EFFECT = {"google_ads": 1.0, "review_sites": 1.3, "linkedin_ads": 0.45, "meta_ads": 0.35,
                     "youtube_ads": 0.5, "reddit_ads": 0.3}
ENTERPRISE_EFFECT = {"linkedin_ads": 1.0, "google_ads": 0.55, "youtube_ads": 0.15, "review_sites": 0.2,
                     "meta_ads": 0.05, "reddit_ads": 0.05}


def monthly_index(effect, decay, lag):
    if not DB.exists():
        return {}
    con = sqlite3.connect(DB)
    rows = con.execute("SELECT month, platform, spend_eur FROM v_spend_by_month").fetchall()
    con.close()
    eff = {}
    for month, platform, spend in rows:
        key = (int(month[:4]), int(month[5:7]))
        eff[key] = eff.get(key, 0.0) + spend * effect.get(platform, 0.0)
    out, carry = {}, 0.0
    y, m = 2022, 1
    keys = []
    while (y, m) <= (2026, 12):
        carry = eff.get((y, m), 0.0) + decay * carry
        keys.append((y, m))
        out[(y, m)] = carry
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    shifted = {k: (out[keys[i - lag]] if i >= lag else 0.0) for i, k in enumerate(keys)}
    return shifted
