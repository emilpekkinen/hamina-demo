"""Small previews of the raw source tables for the app's data room (row counts, ranges, sample rows)."""

import sqlite3

from data import HUBSPOT_DB, ROOT, STRIPE_DB

MKT_DB = ROOT / "data" / "marketing" / "hamina_marketing.db"

# (table label, row-count table, preview SQL) — samples are the most recent rows before the snapshot.
SOURCES = [
    ("stripe", "Stripe", "Billing: who pays, how much, and how reliably.", STRIPE_DB,
     "SELECT date(MIN(created),'unixepoch'), date(MAX(created),'unixepoch') FROM charges", [
        ("customers", "customers", """SELECT id, name, COALESCE(company_name, '–'), segment, address_country, date(created,'unixepoch')
            FROM customers ORDER BY created DESC LIMIT 6""", ["id", "name", "company", "segment", "country", "created"]),
        ("subscriptions", "subscriptions", """SELECT s.id, c.name, p.plan, s.quantity, s.status, date(s.current_period_end,'unixepoch')
            FROM subscriptions s JOIN customers c ON c.id = s.customer_id JOIN prices p ON p.id = s.price_id
            ORDER BY s.current_period_start DESC LIMIT 6""", ["id", "customer", "plan", "seats", "status", "period_end"]),
        ("invoices", "invoices", """SELECT i.number, c.name, printf('€%,.0f', i.total/100.0), i.status, i.collection_method,
            COALESCE(date(i.due_date,'unixepoch'), '–'), COALESCE(date(i.paid_at,'unixepoch'), 'unpaid')
            FROM invoices i JOIN customers c ON c.id = i.customer_id ORDER BY i.created DESC LIMIT 6""",
         ["number", "customer", "total", "status", "collection", "due", "paid"]),
        ("charges", "charges", """SELECT id, printf('€%,.0f', amount/100.0), status, COALESCE(failure_code, '–'), payment_method_type,
            datetime(created,'unixepoch') FROM charges ORDER BY created DESC LIMIT 6""",
         ["id", "amount", "status", "failure", "method", "created"]),
    ]),
    ("hubspot", "HubSpot", "CRM: who is being sold to, and how deals move.", HUBSPOT_DB,
     "SELECT substr(MIN(createdate),1,10), substr(MAX(createdate),1,10) FROM deals", [
        ("deals", "deals", """SELECT d.dealname, s.label, printf('%s %,.0f', d.deal_currency_code, d.amount), substr(d.closedate,1,10),
            o.firstname || ' ' || o.lastname, d.lead_source
            FROM deals d JOIN deal_stages s ON s.stage_id = d.dealstage JOIN owners o ON o.id = d.hubspot_owner_id
            ORDER BY d.createdate DESC LIMIT 6""", ["deal", "stage", "amount", "close_date", "owner", "source"]),
        ("deal_property_history", "deal_property_history", """SELECT d.dealname, h.property, substr(h.value,1,24), substr(h.timestamp,1,16), h.source_type
            FROM deal_property_history h JOIN deals d ON d.hs_object_id = h.deal_id ORDER BY h.timestamp DESC LIMIT 6""",
         ["deal", "property", "value", "changed_at", "source"]),
        ("engagements", "engagements", """SELECT e.type, substr(e.timestamp,1,16), d.dealname, COALESCE(e.direction, '–')
            FROM engagements e JOIN deals d ON d.hs_object_id = e.deal_id ORDER BY e.timestamp DESC LIMIT 6""",
         ["type", "timestamp", "deal", "direction"]),
        ("companies", "companies", """SELECT name, COALESCE(domain, '–'), industry, country, lifecyclestage FROM companies
            ORDER BY createdate DESC LIMIT 6""", ["name", "domain", "industry", "country", "lifecycle"]),
    ]),
    ("ads", "Ad platforms", "Marketing: what was spent where, and what the platforms report.", MKT_DB,
     "SELECT MIN(week_start), MAX(week_start) FROM campaign_weekly_stats", [
        ("campaigns", "campaigns", """SELECT name, platform, kind, target_segment, start_date, end_date FROM campaigns
            ORDER BY start_date DESC LIMIT 6""", ["name", "platform", "kind", "segment", "start", "end"]),
        ("campaign_weekly_stats", "campaign_weekly_stats", """SELECT week_start, platform, printf('€%,.0f', spend_eur), impressions, clicks, conversions
            FROM campaign_weekly_stats ORDER BY week_start DESC, spend_eur DESC LIMIT 6""",
         ["week", "platform", "spend", "impressions", "clicks", "conversions"]),
    ]),
]


def previews():
    out = []
    for sid, name, desc, db, range_sql, tables in SOURCES:
        con = sqlite3.connect(db)
        lo, hi = con.execute(range_sql).fetchone()
        tbls = []
        for label, count_table, sql, cols in tables:
            n = con.execute(f"SELECT COUNT(*) FROM {count_table}").fetchone()[0]
            rows = [[v for v in r] for r in con.execute(sql).fetchall()]
            tbls.append(dict(name=label, rows=int(n), columns=cols, sample=rows))
        con.close()
        out.append(dict(id=sid, name=name, description=desc, dateRange=[lo, hi], totalRows=sum(t["rows"] for t in tbls), tables=tbls))
    return out
