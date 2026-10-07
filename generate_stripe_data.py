#!/usr/bin/env python3
"""Generate synthetic Stripe data for Hamina Wireless (DEMO) and load it into SQLite.

Everything here is fabricated: customers, organisations, emails and payments are
invented for demo purposes. Only the yearly revenue totals are calibrated to the
company's published revenue chart (2022-2025).

Usage:  python3 generate_stripe_data.py
Output: hamina_stripe.db  +  csv/<table>.csv
"""

import calendar
import csv
import json
import random
import sqlite3
import string
import unicodedata
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SEED = 53
ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "hamina_stripe.db"
CSV_DIR = ROOT / "csv"
SCHEMA_PATH = ROOT / "schema.sql"

UTC = timezone.utc
DATA_END = datetime(2025, 12, 31, 23, 59, 59, tzinfo=UTC)  # snapshot moment
FIRST_SALE_MONTH = (2022, 2)

# Net cash revenue per calendar year in EUR (charges - refunds). The chart shows
# 0,1 / 0,5 / 1,1 / 2,1 M EUR and +90 % for 2025 vs 2024; exact values below are
# read off the bar heights (the 2022 bar sits at roughly 0.06 M).
REVENUE_TARGETS = {2022: 58_000, 2023: 504_000, 2024: 1_115_000, 2025: 2_119_000}

# Reserved TLD so no generated address can ever reach a real mailbox.
EMAIL_TLD = "example"

PRICE_6M = 599_00
PRICE_12M = 1_000_00

# Self-serve month-over-month growth inside each year (shapes the monthly curve).
MONTHLY_GROWTH = {2022: 1.18, 2023: 1.09, 2024: 1.05, 2025: 1.04}
SEASONALITY = {1: 0.95, 2: 1.0, 3: 1.05, 4: 1.0, 5: 1.0, 6: 0.95,
               7: 0.8, 8: 0.9, 9: 1.1, 10: 1.1, 11: 1.1, 12: 0.85}

# Custom enterprise contracts: annual, invoiced upfront, paid by bank transfer.
# `terms` are the yearly contract values in EUR (first term, then renewals).
ENTERPRISE_DEALS = [
    dict(name="Kaarna University of Technology", industry="university", country="FI", city="Tampere",
         contact=("Hannele Rautio", "Director of IT Infrastructure"), owner="Elina Saarela",
         start=(2023, 3, 14), terms=[110_000, 121_000, 145_000]),
    dict(name="St. Alder Regional Health System", industry="hospital", country="US", city="Minneapolis",
         contact=("Marcus Ellery", "VP, Network & Infrastructure"), owner="Daniel Brooks",
         start=(2023, 9, 5), terms=[135_000, 150_000, 165_000]),
    dict(name="Voltmark Fertigungstechnik GmbH", industry="manufacturing", country="DE", city="Stuttgart",
         contact=("Katrin Oberländer", "Head of IT Infrastructure"), owner="Elina Saarela",
         start=(2024, 2, 12), terms=[180_000, 198_000]),
    dict(name="Costa Lucera Hotels & Resorts", industry="hospitality", country="ES", city="Palma",
         contact=("Javier Montalbán", "Group IT Director"), owner="Elina Saarela",
         start=(2024, 6, 3), terms=[124_000], churned=True, feedback="too_expensive"),
    dict(name="Halden Ridge State University", industry="university", country="US", city="Columbus",
         contact=("Rebecca Lindholm", "Associate CIO, Network Services"), owner="Daniel Brooks",
         start=(2025, 1, 20), terms=[210_000]),
    dict(name="Kivimet Paper & Packaging Oyj", industry="manufacturing", country="FI", city="Lahti",
         contact=("Pekka Vuorinen", "Head of OT & Plant Networks"), owner="Elina Saarela",
         start=(2025, 4, 8), terms=[160_000]),
    dict(name="Marlowe Valley University Hospital", industry="hospital", country="GB", city="Leeds",
         contact=("Imogen Hartley", "Head of Digital Infrastructure"), owner="Daniel Brooks",
         start=(2025, 7, 1), terms=[285_000]),
    dict(name="Aurelia Grand Hotels Group", industry="hospitality", country="NL", city="Amsterdam",
         contact=("Willem Verhoeven", "Director of Hotel Technology"), owner="Elina Saarela",
         start=(2025, 10, 6), terms=[115_000]),
]

# ---------------------------------------------------------------------------
# Reference pools for self-serve customers
# ---------------------------------------------------------------------------
COUNTRY_WEIGHTS = {"US": 30, "GB": 10, "DE": 9, "FI": 8, "SE": 5, "NL": 5, "CA": 5, "AU": 4, "FR": 4,
                   "NO": 3, "DK": 3, "CH": 3, "ES": 2, "IT": 2, "IE": 2, "BE": 2, "AT": 2, "NZ": 1}
EEA = {"DE", "FI", "SE", "NL", "FR", "NO", "DK", "ES", "IT", "IE", "BE", "AT"}
SEPA = EEA | {"CH"}

CITIES = {
    "US": ["Austin", "Denver", "Chicago", "Seattle", "Atlanta", "Boston", "Dallas", "Raleigh", "Phoenix", "Portland"],
    "GB": ["London", "Manchester", "Bristol", "Leeds", "Edinburgh", "Birmingham"],
    "DE": ["Berlin", "Munich", "Hamburg", "Cologne", "Frankfurt", "Stuttgart"],
    "FI": ["Helsinki", "Espoo", "Tampere", "Turku", "Oulu", "Jyväskylä"],
    "SE": ["Stockholm", "Gothenburg", "Malmö", "Uppsala"],
    "NL": ["Amsterdam", "Rotterdam", "Utrecht", "Eindhoven"],
    "CA": ["Toronto", "Vancouver", "Calgary", "Montreal", "Ottawa"],
    "AU": ["Sydney", "Melbourne", "Brisbane", "Perth"],
    "FR": ["Paris", "Lyon", "Toulouse", "Nantes"],
    "NO": ["Oslo", "Bergen", "Trondheim"],
    "DK": ["Copenhagen", "Aarhus", "Odense"],
    "CH": ["Zurich", "Basel", "Bern", "Lausanne"],
    "ES": ["Madrid", "Barcelona", "Valencia"],
    "IT": ["Milan", "Rome", "Turin", "Bologna"],
    "IE": ["Dublin", "Cork", "Galway"],
    "BE": ["Brussels", "Antwerp", "Ghent"],
    "AT": ["Vienna", "Graz", "Linz"],
    "NZ": ["Auckland", "Wellington"],
}

NAMES = {
    "finnish": (
        "Mikko Jukka Antti Ville Sami Timo Petri Janne Lauri Eero Tuomas Juho Marko Kari Anna Laura Sanna Heidi Katja Riikka".split(),
        "Virtanen Korhonen Mäkinen Nieminen Mäkelä Hämäläinen Laine Heikkinen Koskinen Järvinen Lehtonen Saarinen Salminen Heinonen Niemi Kinnunen Salonen Turunen Lahtinen Ahonen".split()),
    "nordic": (
        "Erik Lars Anders Johan Magnus Henrik Mats Nils Ola Jonas Mikkel Søren Rasmus Bjørn Kristian Emma Sara Ingrid Karin Frida".split(),
        "Johansson Andersson Karlsson Nilsson Eriksson Larsson Olsen Hansen Jensen Pedersen Berg Lindqvist Nygaard Dahl Holm Lund Strand Madsen Sørensen Halvorsen".split()),
    "german": (
        "Thomas Michael Stefan Andreas Markus Christian Tobias Florian Jan Lukas Daniel Matthias Sven Uwe Dirk Julia Katharina Sabine Anja Lena".split(),
        "Müller Schmidt Schneider Fischer Weber Meyer Wagner Becker Schulz Hoffmann Koch Richter Klein Wolf Schröder Neumann Braun Zimmermann Krüger Hartmann".split()),
    "dutch": (
        "Jeroen Bas Sander Pieter Maarten Thijs Ruben Wouter Niels Daan Joost Koen Bram Sanne Lotte Femke".split(),
        ["de Jong", "Jansen", "de Vries", "van den Berg", "van Dijk", "Bakker", "Visser", "Smit", "Meijer",
         "de Boer", "Mulder", "Bos", "Vos", "Peeters", "Hendriks", "Dekker"]),
    "french": (
        "Pierre Julien Nicolas Antoine Thomas Guillaume Mathieu Olivier Sébastien Laurent Romain Maxime Camille Sophie Julie Claire".split(),
        "Martin Bernard Dubois Durand Moreau Laurent Lefebvre Leroy Roux Fournier Girard Bonnet Lambert Fontaine Rousseau Mercier".split()),
    "spanish": (
        "Carlos Javier Miguel Alejandro Pablo Sergio Daniel David Raúl Álvaro María Laura Marta Elena".split(),
        "García Fernández López Martínez Sánchez Pérez Gómez Ruiz Díaz Moreno Navarro Torres Romero Vega".split()),
    "italian": (
        "Marco Luca Andrea Matteo Alessandro Davide Stefano Simone Paolo Giulia Chiara Francesca".split(),
        "Rossi Russo Ferrari Esposito Bianchi Romano Colombo Ricci Marino Greco Bruno Gallo Conti Costa".split()),
    "english": (
        "James John Robert Michael David Chris Matt Daniel Andrew Josh Ryan Kevin Brian Jason Eric Steve Mark Paul Tom Ben "
        "Sarah Jessica Emily Rachel Megan Laura Amanda Nicole Kate Olivia Priya Raj Wei Carlos Ahmed".split(),
        "Smith Johnson Williams Brown Jones Miller Davis Wilson Anderson Taylor Thomas Moore Jackson Martin Lee Thompson "
        "White Harris Clark Lewis Walker Hall Young King Wright Scott Green Baker Adams Nelson Mitchell Campbell Roberts "
        "Carter Phillips Evans Turner Parker Collins Edwards Patel Nguyen Kim Murphy Kelly".split()),
}
NAME_POOL = {"FI": "finnish", "SE": "nordic", "NO": "nordic", "DK": "nordic", "DE": "german", "AT": "german",
             "CH": "german", "NL": "dutch", "BE": "dutch", "FR": "french", "ES": "spanish", "IT": "italian"}

LEGAL_SUFFIX = {"FI": "Oy", "SE": "AB", "NO": "AS", "DK": "ApS", "DE": "GmbH", "AT": "GmbH", "CH": "AG",
                "NL": "B.V.", "BE": "BV", "FR": "SAS", "ES": "S.L.", "IT": "S.r.l.", "GB": "Ltd", "IE": "Ltd",
                "US": "LLC", "CA": "Inc.", "AU": "Pty Ltd", "NZ": "Ltd"}

WORD_A = ("Nordic Polar Bright Harbor Summit Blue Iron Silver Green Clear North West Alpine Baltic Cedar Vertex "
          "Signal Beacon Apex Nova Lumen Atlas Orbit Pine Granite Aurora Delta Crest Stone Maple").split()
WORD_B = "wave link field peak bridge point line gate core path works port view mark stream".split()

PERSONAS = {
    "network_consultant": dict(
        weight=45, p_annual=0.65, qty=[(1, 85), (2, 12), (3, 3)],
        titles=["Wireless Network Consultant", "Wi-Fi Design Engineer", "Founder & Wireless Consultant",
                "Network Design Consultant", "Senior WLAN Consultant", "RF Engineer"],
        companies=[("network_consulting", "{last} Wireless Consulting"), ("network_consulting", "{last} Network Services"),
                   ("network_consulting", "{word} Wi-Fi Solutions"), ("network_consulting", "{word} Networks"),
                   ("network_consulting", "{word} RF Consulting"), ("network_consulting", "{word} Wireless")]),
    "it_lead": dict(
        weight=35, p_annual=0.45, qty=[(1, 75), (2, 18), (3, 7)],
        titles=["IT Manager", "Head of IT", "IT Lead", "IT Infrastructure Manager", "Network Administrator", "IT Director"],
        companies=[("logistics", "{word} Logistics"), ("retail", "{word} Retail Group"), ("food_beverage", "{word} Foods"),
                   ("education", "{word} Schools"), ("healthcare", "{word} Clinics"), ("manufacturing", "{word} Industries"),
                   ("real_estate", "{word} Properties"), ("hospitality", "{word} Hotels"), ("construction", "{word} Construction"),
                   ("professional_services", "{word} Partners"), ("logistics", "{word} Warehousing"), ("media", "{word} Media")]),
    "head_of_wireless": dict(
        weight=20, p_annual=0.70, qty=[(1, 50), (2, 25), (3, 15), (5, 10)],
        titles=["Head of Wireless", "Wireless Practice Lead", "Director of Wireless Engineering", "Wireless Architect",
                "Mobility Team Lead", "Head of Network Engineering"],
        companies=[("it_services", "{word} Systems Integration"), ("it_services", "{word} Managed Services"),
                   ("telecom", "{word} Telecom"), ("it_services", "{word} IT Solutions"), ("telecom", "{word} Communications"),
                   ("it_services", "{word} Technology Group"), ("network_consulting", "{word} Wireless Engineering")]),
}

CHANNELS = {"organic_search": 30, "word_of_mouth": 20, "linkedin": 12, "webinar": 10, "youtube": 8,
            "partner_referral": 8, "conference": 7, "paid_search": 5}
CHURN_FEEDBACK = {"unused": 35, "too_expensive": 20, "switched_service": 10, "missing_features": 8, "other": 12, None: 15}

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------
rng = random.Random(SEED)
ALNUM = string.ascii_letters + string.digits

products, prices, customers, subscriptions = [], [], [], []
invoices, line_items, charges, refunds, balance_txns = [], [], [], [], []
net_cash = {"self_serve": defaultdict(int), "enterprise": defaultdict(int)}  # segment -> year -> cents
used_emails, used_prefixes = set(), set()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def new_id(prefix, length=24, lead=""):
    return f"{prefix}_{lead}" + "".join(rng.choices(ALNUM, k=length - len(lead)))


def ts(dt):
    return int(dt.timestamp())


def add_months(dt, n):
    y = dt.year + (dt.month - 1 + n) // 12
    m = (dt.month - 1 + n) % 12 + 1
    return dt.replace(year=y, month=m, day=min(dt.day, calendar.monthrange(y, m)[1]))


def weighted(options):
    """options: dict {value: weight} or list of (value, weight)."""
    items = list(options.items()) if isinstance(options, dict) else options
    return rng.choices([v for v, _ in items], weights=[w for _, w in items])[0]


def slug(text):
    text = text.replace("ø", "o").replace("Ø", "O").replace("ß", "ss").replace("æ", "ae")
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return "".join(c if c.isalnum() else "-" for c in text.lower()).strip("-").replace("--", "-")


def eur(cents):
    return f"€{cents / 100:,.2f}"


def random_dt_in_month(year, month):
    days = calendar.monthrange(year, month)[1]
    while True:
        dt = datetime(year, month, rng.randint(1, days), tzinfo=UTC)
        if dt.weekday() < 5 or rng.random() < 0.25:  # fewer weekend purchases
            break
    hour = int(min(23, max(0, rng.gauss(13, 4.5))))
    return dt.replace(hour=hour, minute=rng.randrange(60), second=rng.randrange(60))


def unique_email(local, domain):
    email, n = f"{local}@{domain}", 1
    while email in used_emails:
        n += 1
        email = f"{local}{n}@{domain}"
    used_emails.add(email)
    return email


def invoice_prefix():
    while True:
        p = "".join(rng.choices(string.ascii_uppercase + string.digits, k=8))
        if p not in used_prefixes:
            used_prefixes.add(p)
            return p


def stripe_fee(pm, amount):
    if pm["type"] == "bank_transfer":
        return min(round(amount * 0.005), 500)
    if pm["type"] == "sepa_debit":
        return min(round(amount * 0.008), 600) + 35
    country = pm["country"]
    pct = 0.015 if country in EEA else 0.025 if country == "GB" else 0.0325
    return round(amount * pct) + 25


# ---------------------------------------------------------------------------
# Catalog
# ---------------------------------------------------------------------------
def build_catalog():
    created = ts(datetime(2022, 1, 17, 9, 30, tzinfo=UTC))
    planner = dict(id=new_id("prod", 14), name="Hamina Network Planner",
                   description="Wi-Fi network design and planning software, per-user license.",
                   active=1, created=created)
    enterprise = dict(id=new_id("prod", 14), name="Hamina Enterprise",
                      description="Custom enterprise agreement: organisation-wide licensing, onboarding and support.",
                      active=1, created=ts(datetime(2023, 1, 9, 10, 0, tzinfo=UTC)))
    products.extend([planner, enterprise])
    p6 = dict(id=new_id("price", 24, "1"), product_id=planner["id"], nickname="Network Planner – 6-Month License",
              plan="6_month", currency="eur", unit_amount=PRICE_6M, type="recurring",
              recurring_interval="month", recurring_interval_count=6, active=1, created=created)
    p12 = dict(id=new_id("price", 24, "1"), product_id=planner["id"], nickname="Network Planner – 12-Month License",
               plan="12_month", currency="eur", unit_amount=PRICE_12M, type="recurring",
               recurring_interval="year", recurring_interval_count=1, active=1, created=created)
    prices.extend([p6, p12])
    return planner, enterprise, p6, p12


def term_months(price):
    return price["recurring_interval_count"] * (12 if price["recurring_interval"] == "year" else 1)


# ---------------------------------------------------------------------------
# Stripe object builders
# ---------------------------------------------------------------------------
def create_customer(when, **fields):
    cust = dict(id=new_id("cus", 14), currency="eur", delinquent=0, created=ts(when),
                persona=None, acquisition_channel=None, account_owner=None, **fields)
    meta_keys = ("segment", "persona", "industry", "company_name", "job_title", "acquisition_channel", "account_owner")
    cust["metadata"] = json.dumps({k: cust[k] for k in meta_keys if cust.get(k)}, ensure_ascii=False)
    cust["_inv_prefix"], cust["_inv_seq"] = invoice_prefix(), 0
    customers.append(cust)
    return cust


def create_subscription(cust, price, qty, when, collection="charge_automatically"):
    start = ts(when)
    sub = dict(id=new_id("sub", 24, "1"), customer_id=cust["id"], price_id=price["id"], quantity=qty,
               status="active", collection_method=collection,
               days_until_due=30 if collection == "send_invoice" else None, currency="eur",
               created=start, start_date=start, current_period_start=start,
               current_period_end=ts(add_months(when, term_months(price))),
               cancel_at_period_end=0, cancel_at=None, canceled_at=None, ended_at=None,
               cancellation_reason=None, cancellation_feedback=None,
               _cust=cust, _price=price, _anchor=when, _months=term_months(price), _terms=1)
    subscriptions.append(sub)
    return sub


def create_invoice(cust, sub, price, qty, when, reason, period_start, period_end, product_name):
    amount = price["unit_amount"] * qty
    cust["_inv_seq"] += 1
    send = sub["collection_method"] == "send_invoice"
    inv = dict(id=new_id("in", 24, "1"), number=f"{cust['_inv_prefix']}-{cust['_inv_seq']:04d}",
               customer_id=cust["id"], subscription_id=sub["id"], status="open", billing_reason=reason,
               collection_method=sub["collection_method"], currency="eur", subtotal=amount, tax=0, total=amount,
               amount_due=amount, amount_paid=0, amount_remaining=amount, attempt_count=0, created=ts(when),
               due_date=ts(when + timedelta(days=30)) if send else None, paid_at=None,
               period_start=ts(period_start), period_end=ts(period_end),
               payment_intent_id=new_id("pi", 24, "3"), charge_id=None)
    invoices.append(inv)
    per = "year" if term_months(price) == 12 else "6 months"
    line_items.append(dict(
        id=new_id("il", 24, "1"), invoice_id=inv["id"], subscription_id=sub["id"], price_id=price["id"],
        description=f"{qty} × {product_name} (at {eur(price['unit_amount'])} / {per})",
        quantity=qty, unit_amount=price["unit_amount"], amount=amount, currency="eur",
        period_start=ts(period_start), period_end=ts(period_end)))
    return inv


def create_charge(cust, inv, when, ok, failure=None):
    """One payment attempt against an invoice. `failure` = (code, message) when not ok."""
    pm, amount = cust["_pm"], inv["amount_due"]
    is_card = pm["type"] == "card"
    ch = dict(id=new_id("py" if pm["type"] == "bank_transfer" else "ch", 24, "3"),
              payment_intent_id=inv["payment_intent_id"], invoice_id=inv["id"], customer_id=cust["id"],
              amount=amount, amount_captured=amount if ok else 0, amount_refunded=0, currency="eur",
              status="succeeded" if ok else "failed", paid=int(ok), refunded=0,
              failure_code=None if ok else failure[0], failure_message=None if ok else failure[1],
              payment_method_type=pm["type"],
              card_brand=pm["brand"] if is_card else None, card_last4=pm["last4"] if is_card else None,
              card_exp_month=pm["exp"][1] if is_card else None, card_exp_year=pm["exp"][0] if is_card else None,
              card_country=pm["country"] if is_card else None,
              description="Subscription creation" if inv["billing_reason"] == "subscription_create" else "Subscription update",
              receipt_email=cust["email"], balance_transaction_id=None, created=ts(when))
    charges.append(ch)
    inv["attempt_count"] += 1
    inv["charge_id"] = ch["id"]
    if ok:
        fee = stripe_fee(pm, amount)
        available = when + timedelta(days=3 if is_card else 5)
        bt = dict(id=new_id("txn", 24, "3"), type="payment" if pm["type"] == "bank_transfer" else "charge",
                  reporting_category="charge", source_id=ch["id"], amount=amount, fee=fee, net=amount - fee,
                  currency="eur", description=f"Payment for invoice {inv['number']}",
                  status="available" if available <= DATA_END else "pending", created=ts(when), available_on=ts(available))
        balance_txns.append(bt)
        ch["balance_transaction_id"] = bt["id"]
        inv.update(status="paid", amount_paid=amount, amount_remaining=0, paid_at=ts(when))
        net_cash[cust["segment"]][when.year] += amount
    return ch


def create_refund(cust, ch, when):
    amount = ch["amount"]
    bt = dict(id=new_id("txn", 24, "3"), type="refund", reporting_category="refund", source_id=None,
              amount=-amount, fee=0, net=-amount, currency="eur", description=f"REFUND FOR CHARGE ({ch['description']})",
              status="available", created=ts(when), available_on=ts(when))
    re = dict(id=new_id("re", 24, "3"), charge_id=ch["id"], payment_intent_id=ch["payment_intent_id"], amount=amount,
              currency="eur", reason="requested_by_customer", status="succeeded",
              balance_transaction_id=bt["id"], created=ts(when))
    bt["source_id"] = re["id"]
    refunds.append(re)
    balance_txns.append(bt)
    ch.update(amount_refunded=amount, refunded=1)
    net_cash[cust["segment"]][when.year] -= amount


# ---------------------------------------------------------------------------
# Enterprise contracts
# ---------------------------------------------------------------------------
def build_enterprise(enterprise_product):
    for deal in ENTERPRISE_DEALS:
        start = datetime(*deal["start"], rng.randint(8, 15), rng.randrange(60), rng.randrange(60), tzinfo=UTC)
        contact, title = deal["contact"]
        domain = f"{slug(deal['name'].split(' GmbH')[0].split(' Oyj')[0])}.{EMAIL_TLD}"
        cust = create_customer(
            start - timedelta(days=rng.randint(20, 60), hours=rng.randint(0, 5)),
            name=deal["name"], email=unique_email(f"accounts.payable", domain),
            description=f"Enterprise agreement – {deal['industry']}", company_name=deal["name"],
            contact_name=contact, job_title=title, segment="enterprise", industry=deal["industry"],
            address_country=deal["country"], address_city=deal["city"])
        cust.update(account_owner=deal["owner"])
        cust["metadata"] = json.dumps({"segment": "enterprise", "industry": deal["industry"], "contact_name": contact,
                                       "job_title": title, "account_owner": deal["owner"]}, ensure_ascii=False)
        cust["_pm"] = dict(type="bank_transfer", country=deal["country"])

        sub = None
        for i, value in enumerate(deal["terms"]):
            period_start = add_months(start, 12 * i)
            period_end = add_months(start, 12 * (i + 1))
            price = dict(id=new_id("price", 24, "1"), product_id=enterprise_product["id"],
                         nickname=f"Enterprise – {deal['name']} – {period_start.year} term", plan="enterprise",
                         currency="eur", unit_amount=value * 100, type="recurring", recurring_interval="year",
                         recurring_interval_count=1, active=1, created=ts(period_start - timedelta(days=rng.randint(3, 10))))
            prices.append(price)
            if sub is None:
                sub = create_subscription(cust, price, 1, start, collection="send_invoice")
                reason = "subscription_create"
            else:
                sub.update(price_id=price["id"], current_period_start=ts(period_start), current_period_end=ts(period_end))
                reason = "subscription_cycle"
            inv = create_invoice(cust, sub, price, 1, period_start, reason, period_start, period_end, "Hamina Enterprise")
            paid_at = period_start + timedelta(days=rng.randint(9, 34), hours=rng.randint(0, 6), minutes=rng.randrange(60))
            create_charge(cust, inv, paid_at, ok=True)

        if deal.get("churned"):
            end = add_months(start, 12 * len(deal["terms"]))
            sub.update(status="canceled", cancel_at_period_end=1, cancel_at=ts(end), ended_at=ts(end),
                       canceled_at=ts(end - timedelta(days=rng.randint(30, 60))),
                       cancellation_reason="cancellation_requested", cancellation_feedback=deal.get("feedback"))


# ---------------------------------------------------------------------------
# Self-serve licenses
# ---------------------------------------------------------------------------
def draw_offer():
    persona = weighted({k: v["weight"] for k, v in PERSONAS.items()})
    spec = PERSONAS[persona]
    plan = "12m" if rng.random() < spec["p_annual"] else "6m"
    return persona, plan, weighted(spec["qty"])


def make_selfserve_customer(when, persona):
    spec = PERSONAS[persona]
    country = weighted(COUNTRY_WEIGHTS)
    firsts, lasts = NAMES[NAME_POOL.get(country, "english")]
    first, last = rng.choice(firsts), rng.choice(lasts)
    name = f"{first} {last}"
    title = rng.choice(spec["titles"])

    if persona == "network_consultant" and rng.random() < 0.15:  # independent, no company
        company, industry = None, "network_consulting"
        domain, local = f"{rng.choice(['mailbox', 'postbox', 'inbox'])}.{EMAIL_TLD}", f"{slug(first)}.{slug(last).replace('-', '')}"
        title = "Independent Wireless Consultant"
    else:
        industry, pattern = rng.choice(spec["companies"])
        base = pattern.format(last=last, word=rng.choice(WORD_A) + rng.choice(WORD_B))
        company = f"{base} {LEGAL_SUFFIX[country]}" if rng.random() < 0.6 else base
        domain, local = f"{slug(base)}.{EMAIL_TLD}", f"{slug(first)}.{slug(last).replace('-', '')}"

    cust = create_customer(
        when, name=name, email=unique_email(local, domain),
        description=f"{title}, {company}" if company else title,
        company_name=company, contact_name=name, job_title=title, segment="self_serve", industry=industry,
        address_country=country, address_city=rng.choice(CITIES[country]))
    cust.update(persona=persona, acquisition_channel=weighted(CHANNELS))
    cust["metadata"] = json.dumps({"segment": "self_serve", "persona": persona, "job_title": title,
                                   "company_name": company, "acquisition_channel": cust["acquisition_channel"]},
                                  ensure_ascii=False)
    if country in SEPA and rng.random() < 0.08:
        cust["_pm"] = dict(type="sepa_debit", country=country)
    else:
        brand = weighted({"visa": 50, "mastercard": 35, "amex": 15} if country == "US" else {"visa": 55, "mastercard": 40, "amex": 5})
        cust["_pm"] = dict(type="card", country=country, brand=brand, last4=f"{rng.randrange(10000):04d}",
                           exp=(when.year + rng.randint(1, 4), rng.randint(1, 12)))
    return cust


def new_purchase(when, persona, plan, qty, p6, p12, clean=False):
    """A new customer buys a license through checkout. `clean` skips failures/refunds."""
    cust = make_selfserve_customer(when - timedelta(seconds=rng.randint(25, 240)), persona)
    price = p12 if plan == "12m" else p6
    sub = create_subscription(cust, price, qty, when)
    inv = create_invoice(cust, sub, price, qty, when, "subscription_create",
                         when, add_months(when, term_months(price)), "Hamina Network Planner")
    paid_at = when
    if not clean and cust["_pm"]["type"] == "card" and rng.random() < 0.03:  # declined, retried at checkout
        create_charge(cust, inv, when, ok=False, failure=("card_declined", "Your card was declined."))
        paid_at = when + timedelta(seconds=rng.randint(60, 540))
    ch = create_charge(cust, inv, paid_at, ok=True)

    if not clean and rng.random() < 0.015:  # refund shortly after purchase
        refund_at = paid_at + timedelta(days=rng.randint(1, 12), hours=rng.randint(0, 9), minutes=rng.randrange(60))
        if refund_at <= DATA_END:
            create_refund(cust, ch, refund_at)
            sub.update(status="canceled", canceled_at=ts(refund_at), ended_at=ts(refund_at),
                       cancellation_reason="cancellation_requested", cancellation_feedback="other")
    return sub


def renewal_probability(sub):
    six_month = term_months(sub["_price"]) == 6
    p = 0.58 if six_month else 0.74
    p += min(0.12, 0.04 * (sub["_terms"] - 1))  # loyalty grows with tenure
    p += {"network_consultant": 0.04, "it_lead": -0.05, "head_of_wireless": 0.02}[sub["_cust"]["persona"]]
    return p


def collect_renewal(cust, inv, when):
    """Charge a renewal invoice with Stripe-style retries. Returns paid | past_due | failed."""
    pm = cust["_pm"]
    failure, p_recover = None, 0.55
    if pm["type"] == "card" and (when.year, when.month) > pm["exp"]:
        if rng.random() < 0.5:  # card network auto-updated the expiry
            pm["exp"] = (pm["exp"][0] + 3, pm["exp"][1])
        else:
            failure, p_recover = ("expired_card", "Your card has expired."), 0.6
    if failure is None and rng.random() < (0.05 if pm["type"] == "card" else 0.02):
        failure = rng.choice([("card_declined", "Your card was declined."),
                              ("card_declined", "Your card has insufficient funds.")]) if pm["type"] == "card" \
            else ("payment_failed", "The SEPA Direct Debit payment failed: insufficient funds.")
    if failure is None:
        create_charge(cust, inv, when, ok=True)
        return "paid", when

    create_charge(cust, inv, when, ok=False, failure=failure)
    success_on = rng.choice([1, 1, 2]) if rng.random() < p_recover else None
    last = when
    for attempt, offset in enumerate((3, 8), start=1):
        last = when + timedelta(days=offset, minutes=rng.randint(0, 90))
        if last > DATA_END:
            return "past_due", last
        if attempt == success_on:
            if failure[0] == "expired_card":  # customer updated the card
                pm.update(last4=f"{rng.randrange(10000):04d}", exp=(last.year + rng.randint(2, 4), rng.randint(1, 12)))
            create_charge(cust, inv, last, ok=True)
            return "paid", last
        create_charge(cust, inv, last, ok=False, failure=failure)
    return "failed", last


def process_renewal(sub, p6, p12):
    cust, when = sub["_cust"], sub["_next"]
    if rng.random() > renewal_probability(sub):  # voluntary churn at period end
        period_len = sub["current_period_end"] - sub["current_period_start"]
        sub.update(status="canceled", cancel_at_period_end=1, cancel_at=ts(when), ended_at=ts(when),
                   canceled_at=sub["current_period_start"] + int(period_len * rng.uniform(0.35, 0.99)),
                   cancellation_reason="cancellation_requested", cancellation_feedback=weighted(CHURN_FEEDBACK))
        return

    price, qty = sub["_price"], sub["quantity"]
    if price is p6 and rng.random() < 0.18:
        price = p12  # upgrade to annual
    elif price is p12 and rng.random() < 0.03:
        price = p6
    r = rng.random()
    if r < 0.06:
        qty += 1  # seat expansion
    elif r < 0.08 and qty > 1:
        qty -= 1

    months = term_months(price)
    period_end = add_months(sub["_anchor"], sub["_months"] + months)
    inv = create_invoice(cust, sub, price, qty, when, "subscription_cycle", when, period_end, "Hamina Network Planner")
    sub.update(price_id=price["id"], quantity=qty, current_period_start=ts(when), current_period_end=ts(period_end),
               _price=price, _months=sub["_months"] + months, _terms=sub["_terms"] + 1, _next=period_end)

    outcome, at = collect_renewal(cust, inv, when)
    if outcome == "past_due":
        sub["status"], cust["delinquent"] = "past_due", 1
    elif outcome == "failed":
        inv["status"], cust["delinquent"] = "uncollectible", 1
        sub.update(status="canceled", canceled_at=ts(at), ended_at=ts(at), cancellation_reason="payment_failed")


def month_range():
    y, m = FIRST_SALE_MONTH
    while (y, m) <= (DATA_END.year, DATA_END.month):
        yield y, m
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def build_self_serve(p6, p12):
    # Self-serve has to deliver whatever the enterprise contracts leave of each year's target.
    ss_target = {y: t * 100 - net_cash["enterprise"][y] for y, t in REVENUE_TARGETS.items()}
    months = list(month_range())
    cumulative = {}
    for year in REVENUE_TARGETS:
        ms = [m for y, m in months if y == year]
        weights = [MONTHLY_GROWTH[year] ** i * SEASONALITY[m] for i, m in enumerate(ms)]
        running = 0.0
        for m, w in zip(ms, weights):
            running += w
            cumulative[(year, m)] = ss_target[year] * running / sum(weights)

    active = []
    for year, month in months:
        next_month = add_months(datetime(year, month, 1, tzinfo=UTC), 1)
        for sub in sorted((s for s in active if s["_next"] < next_month), key=lambda s: s["_next"]):
            process_renewal(sub, p6, p12)
        active = [s for s in active if s["status"] == "active"]

        # New customers fill the rest of the month's revenue budget. December stops a
        # little short so the year-end close below has room to land on the target.
        budget = cumulative[(year, month)] - (6_000_00 if month == 12 else 0)
        while True:
            persona, plan, qty = draw_offer()
            amount = (PRICE_12M if plan == "12m" else PRICE_6M) * qty
            if net_cash["self_serve"][year] + amount > budget:
                break
            sub = new_purchase(random_dt_in_month(year, month), persona, plan, qty, p6, p12)
            if sub["status"] == "active":
                sub["_next"] = add_months(sub["_anchor"], sub["_months"])
                active.append(sub)

        if month == 12:  # close the year: single-seat purchases that best fit the remaining gap
            gap = ss_target[year] - net_cash["self_serve"][year]
            a, b = min(((a, max(0, round((gap - a * PRICE_6M) / PRICE_12M))) for a in range(10)),
                       key=lambda ab: abs(gap - ab[0] * PRICE_6M - ab[1] * PRICE_12M))
            for plan in ["6m"] * a + ["12m"] * b:
                persona = weighted({k: v["weight"] for k, v in PERSONAS.items()})
                sub = new_purchase(random_dt_in_month(year, 12), persona, plan, 1, p6, p12, clean=True)
                sub["_next"] = add_months(sub["_anchor"], sub["_months"])
                active.append(sub)

    # Subscriptions still running at the snapshot: some have already scheduled a cancellation.
    for sub in active:
        if rng.random() > renewal_probability(sub) and rng.random() < 0.45:
            lo = sub["current_period_start"] + 86_400
            hi = min(ts(DATA_END), sub["current_period_end"] - 3_600)
            if lo < hi:
                sub.update(cancel_at_period_end=1, cancel_at=sub["current_period_end"], canceled_at=rng.randint(lo, hi),
                           cancellation_reason="cancellation_requested", cancellation_feedback=weighted(CHURN_FEEDBACK))


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
TABLES = [("products", products), ("prices", prices), ("customers", customers), ("subscriptions", subscriptions),
          ("invoices", invoices), ("invoice_line_items", line_items), ("charges", charges), ("refunds", refunds),
          ("balance_transactions", balance_txns)]
EXPORT_VIEWS = ["v_transactions", "v_revenue_by_year", "v_revenue_by_month", "v_mrr_by_month"]


def write_database():
    DB_PATH.unlink(missing_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.executescript(SCHEMA_PATH.read_text())
    CSV_DIR.mkdir(exist_ok=True)
    for table, rows in TABLES:
        cols = [r[1] for r in con.execute(f"PRAGMA table_info({table})")]
        if "created" in cols:
            rows.sort(key=lambda r: r["created"])
        con.executemany(f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
                        [[r[c] for c in cols] for r in rows])
    con.commit()
    for name in [t for t, _ in TABLES] + EXPORT_VIEWS:
        cur = con.execute(f"SELECT * FROM {name}")
        with open(CSV_DIR / f"{name}.csv", "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([d[0] for d in cur.description])
            writer.writerows(cur)
    return con


def report(con):
    print(f"Database: {DB_PATH.name}   CSV exports: {CSV_DIR.name}/\n")
    print("Rows per table")
    for table, rows in TABLES:
        print(f"  {table:<22}{len(rows):>7,}")
    print("\nNet cash revenue vs target (EUR)")
    print(f"  {'year':<6}{'target':>12}{'actual':>14}{'diff':>9}{'self-serve':>14}{'enterprise':>14}")
    for year, charged, gross, refunded, net in con.execute("SELECT * FROM v_revenue_by_year"):
        y = int(year)
        print(f"  {year:<6}{REVENUE_TARGETS[y]:>12,}{net:>14,.0f}{net - REVENUE_TARGETS[y]:>9,.0f}"
              f"{net_cash['self_serve'][y] / 100:>14,.0f}{net_cash['enterprise'][y] / 100:>14,.0f}")
    y24, y25 = (r[0] for r in con.execute(
        "SELECT net_revenue_eur FROM v_revenue_by_year WHERE year IN ('2024', '2025') ORDER BY year"))
    print(f"\n  2025 vs 2024: {y25 / y24 - 1:+.0%}")


def main():
    planner, enterprise, p6, p12 = build_catalog()
    build_enterprise(enterprise)
    build_self_serve(p6, p12)
    con = write_database()
    report(con)
    con.close()


if __name__ == "__main__":
    main()
