#!/usr/bin/env python3
"""Generate synthetic HubSpot CRM data for Hamina Wireless (DEMO) and load it into SQLite.

Everything is fabricated. The enterprise deals that were won are taken from the synthetic
Stripe data (../stripe/hamina_stripe.db) so the two systems agree: every Stripe enterprise
customer has a closed-won deal, and nothing else closed won before the snapshot.

Each deal has a hidden quality score that drives how far it gets through the pipeline, how
long it takes, how often the close date slips and how much activity it gets. The forecast
model never sees the score; it has to recover it from those observable traces.

Usage:  python3 generate_hubspot_data.py      (run the Stripe generator first)
Output: hamina_hubspot.db  +  csv/<table>.csv
"""

import csv
import math
import random
import sqlite3
import string
import unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path

SEED = 54
ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "hamina_hubspot.db"
CSV_DIR = ROOT / "csv"
SCHEMA_PATH = ROOT / "schema.sql"
STRIPE_DB = ROOT.parent / "stripe" / "hamina_stripe.db"

UTC = timezone.utc
DATA_END = datetime(2026, 9, 30, 23, 59, 59, tzinfo=UTC)  # same snapshot as Stripe
FIRST_DEAL = datetime(2022, 11, 1, tzinfo=UTC)
EMAIL_TLD = "example"
FX_TO_EUR = {"EUR": 1.0, "USD": 1 / 1.10, "GBP": 1 / 0.86}

# Default HubSpot pipeline stage ids, labels as configured for Hamina, HubSpot probabilities.
STAGES = [
    ("appointmentscheduled", "Discovery", 0.10),
    ("qualifiedtobuy", "Qualified", 0.20),
    ("presentationscheduled", "Technical evaluation", 0.40),
    ("decisionmakerboughtin", "Business case", 0.60),
    ("contractsent", "Contract sent", 0.80),
]
WON, LOST = ("closedwon", "Closed won", 1.0), ("closedlost", "Closed lost", 0.0)
STAGE_SHARE = [0.15, 0.20, 0.30, 0.20, 0.15]   # share of the sales cycle spent in each stage
ADVANCE_BASE = [0.6, 0.7, 0.7, 1.0, 1.3]        # logit of moving on from each stage at quality 0

OWNERS = [  # (first, last, team, role, start)
    ("Elina", "Saarela", "Enterprise Sales EMEA", "account_executive", (2022, 10, 3)),
    ("Daniel", "Brooks", "Enterprise Sales Americas", "account_executive", (2023, 4, 11)),
    ("Sofia", "Lindqvist", "Enterprise Sales EMEA", "account_executive", (2025, 8, 18)),
    ("Ryan", "Calloway", "Enterprise Sales Americas", "account_executive", (2026, 3, 2)),
    ("Aino", "Lehto", "SDR", "sdr", (2024, 9, 2)),
    ("Jake", "Morrison", "SDR", "sdr", (2025, 5, 5)),
]
AMERICAS = {"US", "CA"}

DEALS_PER_MONTH = {2022: 0.6, 2023: 0.75, 2024: 1.2, 2025: 2.0, 2026: 6.2}  # 2026: two new AEs + SDR team
SEASONALITY = {1: 1.0, 2: 1.05, 3: 1.15, 4: 1.0, 5: 1.0, 6: 0.85, 7: 0.5, 8: 0.8, 9: 1.3, 10: 1.25, 11: 1.15, 12: 0.6}

LEAD_SOURCES = {"inbound_demo": 30, "self_serve_expansion": 18, "partner_referral": 17, "outbound_sdr": 25, "event": 10}
SOURCE_QUALITY = {"inbound_demo": 0.1, "self_serve_expansion": 0.5, "partner_referral": 0.3, "outbound_sdr": -0.35,
                  "event": 0.0}
LOST_REASONS_EARLY = {"No budget": 30, "Went dark / no response": 35, "Not a fit (too small)": 15,
                      "Timing – revisit next year": 20}
LOST_REASONS_LATE = {"Chose competitor – Ekahau": 30, "Chose competitor – iBwave": 15, "Price": 20,
                     "No decision / budget frozen": 25, "Timing – revisit next year": 10}

COUNTRIES = {"US": 34, "GB": 12, "DE": 12, "FI": 8, "NL": 6, "SE": 6, "DK": 4, "FR": 5, "ES": 4, "CA": 5, "AU": 4}
CURRENCY = {"US": "USD", "CA": "USD", "GB": "GBP"}
CITIES = {"US": ["Austin", "Denver", "Chicago", "Seattle", "Atlanta", "Boston", "Dallas", "Phoenix", "San Diego", "Nashville"],
          "GB": ["London", "Birmingham", "Glasgow", "Bristol", "Leeds"], "DE": ["Munich", "Hamburg", "Cologne", "Düsseldorf", "Leipzig"],
          "FI": ["Helsinki", "Espoo", "Oulu", "Turku", "Kuopio"], "NL": ["Rotterdam", "Utrecht", "Eindhoven", "Groningen"],
          "SE": ["Stockholm", "Gothenburg", "Malmö"], "DK": ["Copenhagen", "Odense"], "FR": ["Paris", "Lyon", "Lille"],
          "ES": ["Madrid", "Barcelona", "Bilbao"], "CA": ["Toronto", "Vancouver", "Montreal"], "AU": ["Sydney", "Melbourne"]}
PLACES = "Northfield Riverside Westbrook Lakeview Ashford Kingsbridge Harborview Elmstead Brightwater Redhill Oakmont " \
         "Fairhaven Stonebridge Clearwater Highland Maplewood Silverlake Eastgate Granite Bay Pinecrest".split()
INDUSTRIES = {  # industry: (weight, name patterns, amount multiplier)
    "university": (20, ["{p} University", "University of {p}", "{p} State College", "{p} Institute of Technology"], 1.15),
    "hospital": (18, ["{p} Medical Center", "{p} Regional Hospital", "{p} Health System", "{p} Children's Hospital"], 1.2),
    "manufacturing": (16, ["{p} Industries", "{p} Components", "{p} Precision Manufacturing", "{p} Steelworks"], 1.0),
    "hospitality": (12, ["{p} Hotels", "{p} Resorts Group", "{p} Hospitality"], 0.85),
    "logistics": (12, ["{p} Logistics", "{p} Distribution Centers", "{p} Freight Terminals"], 0.9),
    "retail": (10, ["{p} Retail Group", "{p} Stores", "{p} Outlets"], 0.95),
    "venues": (6, ["{p} Arena", "{p} Convention Center", "{p} Stadium Group"], 1.1),
    "airport": (6, ["{p} Airport Authority", "{p} International Airport"], 1.3),
}
TITLES = ["Director of IT Infrastructure", "Network Architect", "Head of Network Engineering", "CIO", "IT Manager",
          "Wireless Engineer", "Procurement Manager", "VP of IT", "Network Operations Lead", "Head of IT"]
FIRST = "Anna Mark Laura James Sanna Thomas Julia Peter Emma David Sara Michael Elena Lukas Olivia Mikko Hanna Chris".split()
LAST = "Turner Fischer Virtanen Smith Novak Jensen Martin Becker Clarke Rossi Laine Hughes Moreau Wagner Lindgren Kelly".split()

# HubSpot records for Stripe customers are not always named the same as in Stripe; the
# forecast pipeline has to resolve these (domain, fuzzy name, contact email).
HS_COMPANY_ALIAS = {
    "Kaarna University of Technology": ("Kaarna Tech (KUT)", "kut"),
    "St. Alder Regional Health System": ("St Alder Health", "stalderhealth"),
    "Voltmark Fertigungstechnik GmbH": ("Voltmark", "voltmark"),
    "Halden Ridge State University": ("Halden Ridge State Univ.", None),
    "Northgate Retail Holdings plc": ("Northgate Retail", "northgate-retail"),
    "Pohjanmaa Hospital District": ("Pohjanmaan sairaanhoitopiiri (Pohjanmaa Hospital District)", "pshp"),
}
WON_SOURCES = {"Kaarna University of Technology": "inbound_demo", "St. Alder Regional Health System": "partner_referral",
               "Voltmark Fertigungstechnik GmbH": "event", "Costa Lucera Hotels & Resorts": "outbound_sdr",
               "Halden Ridge State University": "inbound_demo", "Kivimet Paper & Packaging Oyj": "self_serve_expansion",
               "Marlowe Valley University Hospital": "partner_referral", "Aurelia Grand Hotels Group": "inbound_demo",
               "Nordhavn Port Authority": "event", "Rheinfeld Automotive Systems GmbH": "self_serve_expansion",
               "Lakeshore Community College District": "outbound_sdr", "Northgate Retail Holdings plc": "partner_referral",
               "Grand Meridian Resorts": "inbound_demo", "Pohjanmaa Hospital District": "self_serve_expansion"}

rng = random.Random(SEED)
owners, companies, contacts, deals, history, engagements = [], [], [], [], [], []
used_ids = set()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def hs_id():
    while True:
        i = str(rng.randint(10**10, 4 * 10**10))
        if i not in used_ids:
            used_ids.add(i)
            return i


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def sigmoid(x):
    return 1 / (1 + math.exp(-x))


def weighted(options):
    return rng.choices(list(options), weights=list(options.values()))[0]


def slug(text):
    text = unicodedata.normalize("NFKD", text.replace("ø", "o").replace("ß", "ss")).encode("ascii", "ignore").decode()
    return "".join(c if c.isalnum() else "-" for c in text.lower()).strip("-").replace("--", "-")


def work_time(dt):
    """Snap to a weekday during office hours."""
    while dt.weekday() >= 5:
        dt += timedelta(days=1)
    return dt.replace(hour=rng.randint(8, 17), minute=rng.randrange(60), second=rng.randrange(60))


def owner_for(country, when, role="account_executive"):
    team = "Americas" if country in AMERICAS else "EMEA"
    pool = [o for o in owners if o["role"] == role and o["_start"] <= when and (role == "sdr" or team in o["team"])]
    pool = pool or [o for o in owners if o["role"] == role and o["_start"] <= when] or [owners[0]]
    return rng.choice(pool)


# ---------------------------------------------------------------------------
# Builders
# ---------------------------------------------------------------------------
def build_owners():
    for first, last, team, role, start in OWNERS:
        owners.append(dict(id=str(rng.randint(10**7, 9 * 10**7)), email=f"{first.lower()}.{slug(last)}@hamina.{EMAIL_TLD}",
                           firstname=first, lastname=last, team=team, role=role,
                           createdate=iso(datetime(*start, 9, tzinfo=UTC)), _start=datetime(*start, tzinfo=UTC)))


def owner_by_name(full):
    return next(o for o in owners if f"{o['firstname']} {o['lastname']}" == full)


def create_company(name, domain, industry, country, city, owner, when, employees=None):
    comp = dict(hs_object_id=hs_id(), name=name, domain=domain, industry=industry, country=country, city=city,
                numberofemployees=employees or int(rng.lognormvariate(math.log(1800), 0.9)),
                lifecyclestage="lead", hubspot_owner_id=owner["id"], createdate=iso(when))
    companies.append(comp)
    return comp


def create_contacts(comp, domain, when, n, champion=None):
    people = [champion] if champion else []
    while len(people) < n:
        people.append((f"{rng.choice(FIRST)} {rng.choice(LAST)}", rng.choice(TITLES)))
    for name, title in people:
        first, last = name.split(" ", 1)
        contacts.append(dict(hs_object_id=hs_id(), firstname=first, lastname=last,
                             email=f"{slug(first)}.{slug(last).replace('-', '')}@{domain}", jobtitle=title,
                             company_id=comp["hs_object_id"], lifecyclestage="salesqualifiedlead",
                             createdate=iso(when + timedelta(days=rng.randint(0, 20)))))


def random_amount(industry):
    amount = rng.lognormvariate(math.log(115_000), 0.45) * INDUSTRIES.get(industry, (0, 0, 1.0))[2]
    return int(min(300_000, max(50_000, amount)) / 5_000) * 5_000


def cycle_days(amount_eur, quality):
    """Sales cycle length: bigger and weaker deals take longer."""
    return max(45, (75 + 0.6 * amount_eur / 1000) * (1 + 0.18 * max(-1.5, -quality)) * rng.lognormvariate(0, 0.2))


def simulate_path(create, cycle, quality, forced_close=None):
    """Stage entry times plus outcome. forced_close = won on that date (Stripe-backed wins)."""
    if forced_close:
        span = (forced_close - create).total_seconds()
        shares = [s * rng.uniform(0.7, 1.3) for s in STAGE_SHARE]
        times, t = [], create
        for s in shares:
            times.append(t)
            t += timedelta(seconds=span * s / sum(shares))
        return times, "won", forced_close
    times, t = [], create
    for k, share in enumerate(STAGE_SHARE):
        times.append(t)
        dur = timedelta(days=cycle * share * rng.lognormvariate(0, 0.35))
        if rng.random() > sigmoid(ADVANCE_BASE[k] + 1.3 * quality):
            return times, "lost", t + dur * rng.uniform(0.4, 1.4) + timedelta(days=rng.uniform(20, 90))  # lingers before closed-lost
        t += dur
    return times, "won", t


def add_history(deal, prop, value, when, source="CRM_UI"):
    history.append(dict(deal_id=deal["hs_object_id"], property=prop, value=value, timestamp=iso(when), source_type=source))


def add_engagements(deal, comp, owner, quality, start, end, fading_from):
    """Weekly activity; drops off ahead of a loss (fading_from)."""
    base = 0.5 + 1.6 * sigmoid(1.5 * quality)
    rates = {"EMAIL": base * 1.6, "MEETING": base * 0.45, "CALL": base * 0.35, "NOTE": base * 0.3}
    last, t = None, start
    while t < end:
        fade = 0.25 if fading_from and t >= fading_from else 1.0
        for kind, rate in rates.items():
            for _ in range(sum(rng.random() < rate * fade / 4 for _ in range(4))):
                when = work_time(t + timedelta(days=rng.uniform(0, 7)))
                if when <= min(end, DATA_END):
                    engagements.append(dict(hs_object_id=hs_id(), type=kind, timestamp=iso(when),
                                            deal_id=deal["hs_object_id"], company_id=comp["hs_object_id"],
                                            owner_id=owner["id"],
                                            direction=rng.choice(["INBOUND", "OUTBOUND", "OUTBOUND"]) if kind == "EMAIL" else None))
                    last = max(last, when) if last else when
        t += timedelta(days=7)
    return last


def create_deal(comp, owner, amount, currency, create, quality, source, forced_close=None, contacts_n=None):
    amount_eur = amount * FX_TO_EUR[currency]
    cycle = cycle_days(amount_eur, quality)
    stage_times, outcome, closed_at = simulate_path(create, cycle, quality, forced_close)
    if outcome == "won" and not forced_close and closed_at <= DATA_END:
        # Only Stripe-backed deals may be won before the snapshot: this one stalls at contract.
        outcome, closed_at = "lost", closed_at + timedelta(days=rng.randint(5, 40))
        lost_reason = "No decision / budget frozen"
    else:
        lost_reason = None

    deal = dict(hs_object_id=hs_id(), dealname=f"{comp['name']} – Hamina Enterprise", pipeline="default",
                dealtype="newbusiness", deal_currency_code=currency, amount=float(amount),
                amount_in_home_currency=round(amount_eur, 2), createdate=iso(create), lead_source=source,
                hubspot_owner_id=owner["id"], company_id=comp["hs_object_id"],
                num_associated_contacts=contacts_n or 1 + sum(rng.random() < 0.3 + 0.4 * sigmoid(quality) for _ in range(4)))
    is_closed = closed_at <= DATA_END

    # Stage history up to the snapshot.
    reached = [t for t in stage_times if t <= DATA_END]
    for (stage_id, _, _), t in zip(STAGES, reached):
        add_history(deal, "dealstage", stage_id, t)
    if is_closed:
        stage = WON if outcome == "won" else LOST
        add_history(deal, "dealstage", stage[0], closed_at)
    else:
        stage = STAGES[len(reached) - 1]

    # Close-date management: an optimistic first guess, pushed whenever the rep notices it passed.
    expected = create + timedelta(days=cycle * rng.uniform(0.55, 0.85))
    add_history(deal, "closedate", iso(expected), create)
    horizon = closed_at if is_closed else DATA_END
    notice = expected + timedelta(days=rng.randint(3, 30))
    while notice < horizon:
        expected = expected + timedelta(days=rng.choice([30, 30, 45, 60, 90]))
        add_history(deal, "closedate", iso(expected), notice)
        notice = expected + timedelta(days=rng.randint(3, 30))
    if is_closed:
        expected = closed_at
        add_history(deal, "closedate", iso(closed_at), closed_at, "AUTOMATION")

    fading = None
    if outcome == "lost":
        fading = closed_at - timedelta(days=max(14, (closed_at - create).days * 0.35))
    last_activity = add_engagements(deal, comp, owner, quality, create, closed_at if is_closed else DATA_END, fading)

    late = stage_times.index(stage_times[-1]) >= 3
    if is_closed:
        forecast = "closed" if outcome == "won" else "omit"
    else:
        k = len(reached) - 1
        optimism = 1 if owner["lastname"] in ("Brooks", "Calloway") else 0
        forecast = "commit" if k + optimism >= 4 else "best_case" if k + optimism >= 3 else "pipeline"
    deal.update(dealstage=stage[0], hs_deal_stage_probability=stage[2], hs_forecast_category=forecast,
                closedate=iso(expected), hs_is_closed=int(is_closed), hs_is_closed_won=int(is_closed and outcome == "won"),
                closed_lost_reason=(lost_reason or weighted(LOST_REASONS_LATE if late else LOST_REASONS_EARLY))
                if is_closed and outcome == "lost" else None,
                notes_last_contacted=iso(last_activity) if last_activity else None,
                hs_lastmodifieddate=iso(max(closed_at if is_closed else DATA_END - timedelta(days=rng.randint(0, 20)), create)),
                _quality=quality, _outcome=outcome, _closed_at=closed_at)
    deals.append(deal)
    if is_closed and outcome == "won":
        comp["lifecyclestage"] = "customer"
    elif comp["lifecyclestage"] != "customer":
        comp["lifecyclestage"] = "opportunity"
    return deal


# ---------------------------------------------------------------------------
# Deal sets
# ---------------------------------------------------------------------------
def build_won_deals():
    """One closed-won deal per Stripe enterprise customer, closing just before its first term."""
    con = sqlite3.connect(STRIPE_DB)
    rows = con.execute("""
        SELECT c.name, c.email, c.industry, c.address_country, c.address_city, c.contact_name, c.job_title,
               c.account_owner, s.start_date, (SELECT il.amount FROM invoices i JOIN invoice_line_items il ON il.invoice_id = i.id
                                               WHERE i.subscription_id = s.id ORDER BY i.created LIMIT 1)
        FROM customers c JOIN subscriptions s ON s.customer_id = c.id
        WHERE c.segment = 'enterprise' ORDER BY s.start_date""").fetchall()
    con.close()
    for name, email, industry, country, city, contact, title, owner_name, start, first_amount in rows:
        owner = owner_by_name(owner_name)
        hs_name, alias_domain = HS_COMPANY_ALIAS.get(name, (name, None))
        domain = f"{alias_domain}.{EMAIL_TLD}" if alias_domain else email.split("@")[1]
        if name == "Halden Ridge State University":
            domain = None  # missing domain in CRM; only the contact email links it
        closed = datetime.fromtimestamp(start, UTC) - timedelta(days=rng.randint(3, 12))
        amount_eur = first_amount / 100
        currency = CURRENCY.get(country, "EUR")
        quality = rng.gauss(1.0, 0.6)
        create = closed - timedelta(days=cycle_days(amount_eur, quality))
        comp = create_company(hs_name, domain, industry, country, city, owner, create - timedelta(days=rng.randint(5, 60)))
        create_contacts(comp, domain or email.split("@")[1], create, 2 + rng.randint(1, 3), champion=(contact, title))
        create_deal(comp, owner, round(amount_eur / FX_TO_EUR[currency] / 1000) * 1000, currency, work_time(create),
                    quality, WON_SOURCES.get(name, "inbound_demo"), forced_close=closed)


def self_serve_accounts():
    """Teams already paying for self-serve seats: the product-qualified expansion targets."""
    con = sqlite3.connect(STRIPE_DB)
    rows = con.execute("""
        SELECT c.company_name, c.email, c.industry, c.address_country, c.address_city, c.contact_name, c.job_title,
               c.created, s.quantity
        FROM customers c JOIN subscriptions s ON s.customer_id = c.id
        WHERE c.segment = 'self_serve' AND c.company_name IS NOT NULL AND s.quantity >= 2
          AND s.status IN ('active', 'past_due') AND c.persona IN ('it_lead', 'head_of_wireless')""").fetchall()
    con.close()
    rng.shuffle(rows)
    return rows


def build_pipeline_deals():
    pqls = self_serve_accounts()
    month = FIRST_DEAL
    while month <= DATA_END:
        lam = DEALS_PER_MONTH[month.year] * SEASONALITY[month.month]
        n = sum(rng.random() < lam / 8 for _ in range(8))
        for _ in range(n):
            create = work_time(month + timedelta(days=rng.randint(0, 27)))
            if create > DATA_END:
                continue
            source = weighted(LEAD_SOURCES)
            pql = next((r for r in pqls if datetime.fromtimestamp(r[7], UTC) < create - timedelta(days=60)), None) \
                if source == "self_serve_expansion" else None
            if source == "self_serve_expansion" and pql is None:
                source = "inbound_demo"
            if pql:
                pqls.remove(pql)
                name, email, ss_industry, country, city, contact, title, _, _ = pql
                domain = email.split("@")[1]
                industry = weighted({k: v[0] for k, v in INDUSTRIES.items()})
                champion = (contact, title)
            else:
                industry = weighted({k: v[0] for k, v in INDUSTRIES.items()})
                country = weighted(COUNTRIES)
                city = rng.choice(CITIES[country])
                name = rng.choice(INDUSTRIES[industry][1]).format(p=rng.choice(PLACES))
                while any(c["name"] == name for c in companies):
                    name = rng.choice(INDUSTRIES[industry][1]).format(p=rng.choice(PLACES) + " " + rng.choice(PLACES))
                domain, champion = f"{slug(name)}.{EMAIL_TLD}", None
            owner = owner_for(country, create)
            comp = create_company(name, domain, industry, country, city, owner, create - timedelta(days=rng.randint(0, 90)))
            create_contacts(comp, domain, create, 1 + rng.randint(0, 3), champion)
            quality = rng.gauss(-0.25, 1.0) + SOURCE_QUALITY[source]
            create_deal(comp, owner, random_amount(industry), CURRENCY.get(country, "EUR"), create, quality, source)
        month = (month.replace(day=1) + timedelta(days=32)).replace(day=1)


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
TABLES = [("owners", owners), ("companies", companies), ("contacts", contacts), ("deals", deals),
          ("deal_property_history", history), ("engagements", engagements)]


def write_database():
    DB_PATH.unlink(missing_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.executescript(SCHEMA_PATH.read_text())
    con.executemany("INSERT INTO deal_stages VALUES (?, ?, ?, ?, ?)",
                    [(s, label, i, p, 0) for i, (s, label, p) in enumerate(STAGES)]
                    + [(WON[0], WON[1], 5, 1.0, 1), (LOST[0], LOST[1], 6, 0.0, 1)])
    CSV_DIR.mkdir(exist_ok=True)
    for table, rows in TABLES:
        cols = [r[1] for r in con.execute(f"PRAGMA table_info({table})")]
        key = next((c for c in ("createdate", "timestamp") if c in cols), None)
        if key:
            rows.sort(key=lambda r: r[key])
        con.executemany(f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
                        [[r[c] for c in cols] for r in rows])
    con.commit()
    for name in [t for t, _ in TABLES] + ["deal_stages"]:
        cur = con.execute(f"SELECT * FROM {name}")
        with open(CSV_DIR / f"{name}.csv", "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([d[0] for d in cur.description])
            writer.writerows(cur)
    return con


def report(con):
    print(f"Database: {DB_PATH.name}   CSV exports: {CSV_DIR.name}/\n")
    for table, rows in TABLES:
        print(f"  {table:<24}{len(rows):>7,}")
    print("\nDeals by stage (amount EUR)")
    for row in con.execute("""SELECT s.label, COUNT(*), ROUND(SUM(amount_in_home_currency)) FROM deals d
                              JOIN deal_stages s ON s.stage_id = d.dealstage GROUP BY s.label ORDER BY s.display_order"""):
        print(f"  {row[0]:<22}{row[1]:>5}{row[2]:>14,.0f}")
    print("\nDeals created / won / lost per year")
    for row in con.execute("""SELECT substr(createdate, 1, 4), COUNT(*), SUM(hs_is_closed_won),
                                     SUM(hs_is_closed AND NOT hs_is_closed_won) FROM deals GROUP BY 1"""):
        print("  ", *row)
    won, closed = con.execute("SELECT SUM(hs_is_closed_won), SUM(hs_is_closed) FROM deals").fetchone()
    print(f"\n  Win rate on closed deals: {won / closed:.0%}")
    print("  Open pipeline by lead source:")
    for row in con.execute("SELECT lead_source, COUNT(*) FROM deals WHERE NOT hs_is_closed GROUP BY 1"):
        print("    ", *row)


def main():
    build_owners()
    build_won_deals()
    build_pipeline_deals()
    con = write_database()
    report(con)
    con.close()


if __name__ == "__main__":
    main()
