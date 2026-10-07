"""Stripe customer <-> HubSpot company resolution.

Three passes, most reliable first: exact email domain, contact email domain, fuzzy name.
"""

import re

import pandas as pd

from data import Raw

STOP = {"of", "the", "and", "&", "group", "oy", "oyj", "ab", "as", "gmbh", "ltd", "llc", "inc", "plc", "bv", "b.v.",
        "ag", "sas", "s.l.", "s.r.l.", "aps", "pty", "a/s", "co"}


def tokens(name):
    words = re.findall(r"[a-zà-ÿ0-9]+", (name or "").lower())
    return [w for w in words if w not in STOP]


def name_score(a, b):
    """Share of the shorter name's tokens that prefix-match a token of the other name (first token must match)."""
    ta, tb = tokens(a), tokens(b)
    if not ta or not tb:
        return 0.0
    short, long_ = (ta, tb) if len(ta) <= len(tb) else (tb, ta)
    hit = sum(any(l.startswith(s) or s.startswith(l) for l in long_) for s in short if len(s) >= 3 or s in long_)
    first_ok = any(short[0] == l or (len(short[0]) >= 4 and l.startswith(short[0])) for l in long_)
    if not first_ok or (len(short) > 1 and hit < 2):
        return 0.0
    return hit / len(short)


def resolve(raw: Raw) -> pd.DataFrame:
    cust = raw.customers[raw.customers["company_name"].notna()].copy()
    cust["domain"] = cust["email"].str.split("@").str[1]
    comp = raw.companies.copy()
    contact_dom = raw.contacts.assign(domain=raw.contacts["email"].str.split("@").str[1]).groupby("domain")["company_id"].first()
    by_domain = comp.dropna(subset=["domain"]).set_index("domain")["hs_object_id"]
    names = comp.set_index("hs_object_id")["name"]

    rows = []
    for _, c in cust.iterrows():
        if c["domain"] in by_domain.index:
            rows.append((c["id"], by_domain[c["domain"]], "domain", 1.0))
        elif c["domain"] in contact_dom.index:
            rows.append((c["id"], contact_dom[c["domain"]], "contact_email", 0.95))
        elif c["segment"] == "enterprise":  # fuzzy matching only where a CRM record must exist
            scored = [(name_score(c["company_name"], n), cid) for cid, n in names.items()]
            best = max(scored)
            if best[0] >= 0.66:
                rows.append((c["id"], best[1], "fuzzy_name", round(0.6 + 0.35 * best[0], 2)))
    m = pd.DataFrame(rows, columns=["customer_id", "company_id", "method", "confidence"])
    m = m.merge(cust[["id", "company_name", "segment"]].rename(columns={"id": "customer_id"}), on="customer_id")
    m["hubspot_name"] = m["company_id"].map(names)
    return m
