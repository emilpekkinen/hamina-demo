"""Load the Stripe and HubSpot exports and build point-in-time ("as of") views.

Everything downstream takes an `as_of` timestamp and must only use information that was
known at that moment, so the same code can produce today's forecast and honest backtests.
"""

import sqlite3
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
STRIPE_DB = ROOT / "data" / "stripe" / "hamina_stripe.db"
HUBSPOT_DB = ROOT / "data" / "hubspot" / "hamina_hubspot.db"


def _sec(s):
    return pd.to_datetime(s, unit="s")


def _iso(s):
    return pd.to_datetime(s, utc=True).dt.tz_localize(None)


@dataclass
class Raw:
    customers: pd.DataFrame
    subscriptions: pd.DataFrame
    terms: pd.DataFrame          # one row per billed license period (invoice line item)
    charges: pd.DataFrame
    deals: pd.DataFrame
    history: pd.DataFrame
    engagements: pd.DataFrame
    companies: pd.DataFrame
    contacts: pd.DataFrame
    owners: pd.DataFrame
    stages: pd.DataFrame


def load() -> Raw:
    s = sqlite3.connect(STRIPE_DB)
    customers = pd.read_sql("SELECT * FROM customers", s)
    customers["created"] = _sec(customers["created"])
    subs = pd.read_sql("SELECT * FROM subscriptions", s)
    for c in ["created", "start_date", "current_period_start", "current_period_end", "cancel_at", "canceled_at", "ended_at"]:
        subs[c] = _sec(subs[c])
    terms = pd.read_sql("""
        SELECT il.id AS line_id, i.id AS invoice_id, i.number, i.customer_id, i.subscription_id, i.status AS invoice_status,
               i.billing_reason, i.collection_method, i.created AS invoiced_at, i.due_date, i.paid_at,
               il.period_start, il.period_end, il.quantity, il.unit_amount, il.amount, p.plan,
               p.recurring_interval, p.recurring_interval_count, c.segment
        FROM invoice_line_items il
        JOIN invoices i ON i.id = il.invoice_id
        JOIN prices p ON p.id = il.price_id
        JOIN customers c ON c.id = i.customer_id""", s)
    for c in ["invoiced_at", "due_date", "paid_at", "period_start", "period_end"]:
        terms[c] = _sec(terms[c])
    terms["months"] = np.where(terms["recurring_interval"] == "year", 12, 1) * terms["recurring_interval_count"]
    terms["amount_eur"] = terms["amount"] / 100
    terms["mrr"] = terms["amount_eur"] / terms["months"]
    charges = pd.read_sql("SELECT id, invoice_id, customer_id, amount, status, failure_code, created, amount_refunded FROM charges", s)
    charges["created"] = _sec(charges["created"])
    refunds = pd.read_sql("SELECT r.charge_id, r.amount, r.created, ch.invoice_id FROM refunds r JOIN charges ch ON ch.id = r.charge_id", s)
    refunds["created"] = _sec(refunds["created"])
    terms = terms.merge(refunds[["invoice_id", "created"]].rename(columns={"created": "refunded_at"}), on="invoice_id", how="left")
    s.close()

    h = sqlite3.connect(HUBSPOT_DB)
    deals = pd.read_sql("SELECT * FROM deals", h)
    for c in ["closedate", "createdate", "hs_lastmodifieddate", "notes_last_contacted"]:
        deals[c] = _iso(deals[c])
    history = pd.read_sql("SELECT * FROM deal_property_history", h)
    history["timestamp"] = _iso(history["timestamp"])
    engagements = pd.read_sql("SELECT * FROM engagements", h)
    engagements["timestamp"] = _iso(engagements["timestamp"])
    companies = pd.read_sql("SELECT * FROM companies", h)
    contacts = pd.read_sql("SELECT * FROM contacts", h)
    owners = pd.read_sql("SELECT * FROM owners", h)
    stages = pd.read_sql("SELECT * FROM deal_stages ORDER BY display_order", h)
    h.close()
    return Raw(customers, subs, terms, charges, deals, history, engagements, companies, contacts, owners, stages)


# ---------------------------------------------------------------------------
# Stripe point-in-time helpers
# ---------------------------------------------------------------------------
def terms_as_of(raw: Raw, as_of) -> pd.DataFrame:
    """Billed periods known at `as_of`, with payment status as it looked then."""
    t = raw.terms[raw.terms["invoiced_at"] <= as_of].copy()
    t["paid"] = t["paid_at"].notna() & (t["paid_at"] <= as_of)
    t["refunded"] = t["refunded_at"].notna() & (t["refunded_at"] <= as_of)
    # Written-off periods: the subscription was ended for non-payment before as_of.
    failed = raw.subscriptions[(raw.subscriptions["cancellation_reason"] == "payment_failed")
                               & (raw.subscriptions["ended_at"] <= as_of)][["id", "ended_at"]]
    t = t.merge(failed.rename(columns={"id": "subscription_id", "ended_at": "written_off_at"}), on="subscription_id", how="left")
    t["valid"] = ~t["refunded"] & ~(t["written_off_at"].notna() & (t["written_off_at"] <= t["period_end"]))
    # A written-off period stops counting from the write-off date.
    t["effective_end"] = t["period_end"].where(t["written_off_at"].isna(), t[["period_end", "written_off_at"]].min(axis=1))
    return t


def mrr_at(terms: pd.DataFrame, when, by="segment") -> pd.Series:
    live = terms[~terms["refunded"] & (terms["period_start"] <= when) & (terms["effective_end"] > when)]
    return live.groupby(by)["mrr"].sum()


def customer_mrr_at(terms: pd.DataFrame, when) -> pd.Series:
    live = terms[~terms["refunded"] & (terms["period_start"] <= when) & (terms["effective_end"] > when)]
    return live.groupby("customer_id")["mrr"].sum()


def month_ends(start, end):
    return pd.date_range(start, end, freq="ME") + pd.Timedelta(hours=23, minutes=59, seconds=59)


def cash_by_month(raw: Raw, start, end) -> pd.Series:
    """Cash revenue (successful charges minus refunds) per month, like the Stripe revenue view."""
    ch = raw.charges[(raw.charges["status"] == "succeeded")]
    s = ch.groupby(ch["created"].dt.to_period("M"))["amount"].sum() / 100
    r = raw.terms.dropna(subset=["refunded_at"])
    rf = r.groupby(r["refunded_at"].dt.to_period("M"))["amount_eur"].sum()
    out = s.sub(rf, fill_value=0)
    idx = pd.period_range(start, end, freq="M")
    return out.reindex(idx, fill_value=0.0)


# ---------------------------------------------------------------------------
# HubSpot point-in-time helpers
# ---------------------------------------------------------------------------
def deal_state_at(raw: Raw, when) -> pd.DataFrame:
    """Stage, close date and activity of every deal that existed at `when`."""
    d = raw.deals[raw.deals["createdate"] <= when].copy()
    hist = raw.history[raw.history["timestamp"] <= when]
    st = hist[hist["property"] == "dealstage"].sort_values("timestamp").groupby("deal_id").last()
    d["stage_at"] = d["hs_object_id"].map(st["value"])
    d["stage_since"] = d["hs_object_id"].map(st["timestamp"])
    cd = hist[hist["property"] == "closedate"].sort_values("timestamp")
    d["closedate_at"] = d["hs_object_id"].map(_iso(cd.groupby("deal_id")["value"].last()))
    d["pushes"] = d["hs_object_id"].map(cd[cd["source_type"] == "CRM_UI"].groupby("deal_id").size() - 1).fillna(0).clip(lower=0)
    d["is_open_at"] = ~d["stage_at"].isin(["closedwon", "closedlost"])
    e = raw.engagements[raw.engagements["timestamp"] <= when]
    recent = e[e["timestamp"] > when - pd.Timedelta(days=30)]
    d["activity_30d"] = d["hs_object_id"].map(recent.groupby("deal_id").size()).fillna(0)
    d["meetings_60d"] = d["hs_object_id"].map(
        e[(e["type"] == "MEETING") & (e["timestamp"] > when - pd.Timedelta(days=60))].groupby("deal_id").size()).fillna(0)
    d["last_activity_at"] = d["hs_object_id"].map(e.groupby("deal_id")["timestamp"].max())
    return d
