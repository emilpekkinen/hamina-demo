-- Hamina Wireless — synthetic Stripe data (DEMO)
-- Tables mirror Stripe API objects. Like Stripe: amounts are integer minor
-- units (cents), currency is lowercase ISO, timestamps are Unix epoch seconds (UTC).
-- A few non-Stripe convenience columns are flattened out of `metadata`
-- (segment, persona, industry, plan, ...) so the data is easy to slice.

PRAGMA foreign_keys = ON;

CREATE TABLE products (
    id          TEXT PRIMARY KEY,           -- prod_...
    name        TEXT NOT NULL,
    description TEXT,
    active      INTEGER NOT NULL DEFAULT 1,
    created     INTEGER NOT NULL
);

CREATE TABLE prices (
    id                       TEXT PRIMARY KEY,   -- price_...
    product_id               TEXT NOT NULL REFERENCES products(id),
    nickname                 TEXT,
    plan                     TEXT NOT NULL,      -- 6_month | 12_month | enterprise
    currency                 TEXT NOT NULL,
    unit_amount              INTEGER NOT NULL,   -- cents
    type                     TEXT NOT NULL,      -- recurring
    recurring_interval       TEXT,               -- month | year
    recurring_interval_count INTEGER,
    active                   INTEGER NOT NULL DEFAULT 1,
    created                  INTEGER NOT NULL
);

CREATE TABLE customers (
    id                  TEXT PRIMARY KEY,    -- cus_...
    name                TEXT NOT NULL,       -- person (self-serve) or organisation (enterprise)
    email               TEXT NOT NULL UNIQUE,
    description         TEXT,
    company_name        TEXT,                -- NULL for independent consultants
    contact_name        TEXT,
    job_title           TEXT,
    segment             TEXT NOT NULL,       -- self_serve | enterprise
    persona             TEXT,                -- network_consultant | it_lead | head_of_wireless (self-serve)
    industry            TEXT,                -- university | manufacturing | hospital | hospitality (enterprise), others for self-serve
    acquisition_channel TEXT,
    account_owner       TEXT,                -- Hamina account executive (enterprise)
    address_country     TEXT,                -- ISO 3166-1 alpha-2
    address_city        TEXT,
    currency            TEXT NOT NULL,
    delinquent          INTEGER NOT NULL DEFAULT 0,
    created             INTEGER NOT NULL,
    metadata            TEXT                 -- JSON
);

CREATE TABLE subscriptions (
    id                    TEXT PRIMARY KEY,  -- sub_...
    customer_id           TEXT NOT NULL REFERENCES customers(id),
    price_id              TEXT NOT NULL REFERENCES prices(id),   -- current price
    quantity              INTEGER NOT NULL,                      -- licenses (seats)
    status                TEXT NOT NULL,     -- active | past_due | canceled
    collection_method     TEXT NOT NULL,     -- charge_automatically | send_invoice
    days_until_due        INTEGER,
    currency              TEXT NOT NULL,
    created               INTEGER NOT NULL,
    start_date            INTEGER NOT NULL,
    current_period_start  INTEGER NOT NULL,
    current_period_end    INTEGER NOT NULL,
    cancel_at_period_end  INTEGER NOT NULL DEFAULT 0,
    cancel_at             INTEGER,
    canceled_at           INTEGER,
    ended_at              INTEGER,
    cancellation_reason   TEXT,              -- cancellation_requested | payment_failed
    cancellation_feedback TEXT               -- unused | too_expensive | switched_service | ...
);

CREATE TABLE invoices (
    id                TEXT PRIMARY KEY,      -- in_...
    number            TEXT NOT NULL UNIQUE,
    customer_id       TEXT NOT NULL REFERENCES customers(id),
    subscription_id   TEXT REFERENCES subscriptions(id),
    status            TEXT NOT NULL,         -- paid | open | uncollectible
    billing_reason    TEXT NOT NULL,         -- subscription_create | subscription_cycle
    collection_method TEXT NOT NULL,
    currency          TEXT NOT NULL,
    subtotal          INTEGER NOT NULL,
    tax               INTEGER NOT NULL DEFAULT 0,
    total             INTEGER NOT NULL,
    amount_due        INTEGER NOT NULL,
    amount_paid       INTEGER NOT NULL,
    amount_remaining  INTEGER NOT NULL,
    attempt_count     INTEGER NOT NULL DEFAULT 0,
    created           INTEGER NOT NULL,
    due_date          INTEGER,               -- send_invoice only
    paid_at           INTEGER,
    period_start      INTEGER NOT NULL,      -- license period this invoice bills for
    period_end        INTEGER NOT NULL,
    payment_intent_id TEXT,
    charge_id         TEXT                   -- latest charge attempt
);

CREATE TABLE invoice_line_items (
    id              TEXT PRIMARY KEY,        -- il_...
    invoice_id      TEXT NOT NULL REFERENCES invoices(id),
    subscription_id TEXT REFERENCES subscriptions(id),
    price_id        TEXT NOT NULL REFERENCES prices(id),
    description     TEXT,
    quantity        INTEGER NOT NULL,
    unit_amount     INTEGER NOT NULL,
    amount          INTEGER NOT NULL,
    currency        TEXT NOT NULL,
    period_start    INTEGER NOT NULL,
    period_end      INTEGER NOT NULL
);

CREATE TABLE charges (
    id                     TEXT PRIMARY KEY, -- ch_... (card / SEPA debit) or py_... (bank transfer)
    payment_intent_id      TEXT,
    invoice_id             TEXT REFERENCES invoices(id),
    customer_id            TEXT NOT NULL REFERENCES customers(id),
    amount                 INTEGER NOT NULL,
    amount_captured        INTEGER NOT NULL,
    amount_refunded        INTEGER NOT NULL DEFAULT 0,
    currency               TEXT NOT NULL,
    status                 TEXT NOT NULL,    -- succeeded | failed
    paid                   INTEGER NOT NULL,
    refunded               INTEGER NOT NULL DEFAULT 0,
    failure_code           TEXT,
    failure_message        TEXT,
    payment_method_type    TEXT NOT NULL,    -- card | sepa_debit | bank_transfer
    card_brand             TEXT,
    card_last4             TEXT,
    card_exp_month         INTEGER,
    card_exp_year          INTEGER,
    card_country           TEXT,
    description            TEXT,
    receipt_email          TEXT,
    balance_transaction_id TEXT,
    created                INTEGER NOT NULL
);

CREATE TABLE refunds (
    id                     TEXT PRIMARY KEY, -- re_...
    charge_id              TEXT NOT NULL REFERENCES charges(id),
    payment_intent_id      TEXT,
    amount                 INTEGER NOT NULL,
    currency               TEXT NOT NULL,
    reason                 TEXT,
    status                 TEXT NOT NULL,
    balance_transaction_id TEXT,
    created                INTEGER NOT NULL
);

CREATE TABLE balance_transactions (
    id                 TEXT PRIMARY KEY,     -- txn_...
    type               TEXT NOT NULL,        -- charge | payment | refund
    reporting_category TEXT NOT NULL,        -- charge | refund
    source_id          TEXT NOT NULL,        -- charge or refund id
    amount             INTEGER NOT NULL,     -- gross (negative for refunds)
    fee                INTEGER NOT NULL,     -- Stripe processing fee
    net                INTEGER NOT NULL,
    currency           TEXT NOT NULL,
    description        TEXT,
    status             TEXT NOT NULL,        -- available | pending
    created            INTEGER NOT NULL,
    available_on       INTEGER NOT NULL
);

CREATE INDEX idx_subscriptions_customer ON subscriptions(customer_id);
CREATE INDEX idx_invoices_customer      ON invoices(customer_id);
CREATE INDEX idx_invoices_subscription  ON invoices(subscription_id);
CREATE INDEX idx_invoices_created       ON invoices(created);
CREATE INDEX idx_lines_invoice          ON invoice_line_items(invoice_id);
CREATE INDEX idx_charges_customer       ON charges(customer_id);
CREATE INDEX idx_charges_invoice        ON charges(invoice_id);
CREATE INDEX idx_charges_created        ON charges(created);
CREATE INDEX idx_refunds_charge         ON refunds(charge_id);
CREATE INDEX idx_bt_source              ON balance_transactions(source_id);
CREATE INDEX idx_bt_created             ON balance_transactions(created);

-- ---------------------------------------------------------------------------
-- Convenience views (EUR amounts, ISO dates)
-- ---------------------------------------------------------------------------

-- One row per charge attempt, flattened with customer, plan and fee info.
CREATE VIEW v_transactions AS
SELECT
    ch.id                                      AS charge_id,
    datetime(ch.created, 'unixepoch')          AS charged_at,
    ch.status,
    ch.amount / 100.0                          AS amount_eur,
    ch.amount_refunded / 100.0                 AS amount_refunded_eur,
    bt.fee / 100.0                             AS stripe_fee_eur,
    bt.net / 100.0                             AS net_eur,
    ch.payment_method_type,
    ch.failure_code,
    i.number                                   AS invoice_number,
    i.billing_reason,
    pr.plan,
    il.quantity,
    c.id                                       AS customer_id,
    c.name                                     AS customer_name,
    c.email                                    AS customer_email,
    c.company_name,
    c.segment,
    c.persona,
    c.industry,
    c.address_country                          AS country,
    i.subscription_id
FROM charges ch
JOIN customers c                 ON c.id = ch.customer_id
LEFT JOIN invoices i             ON i.id = ch.invoice_id
LEFT JOIN invoice_line_items il  ON il.invoice_id = i.id
LEFT JOIN prices pr              ON pr.id = il.price_id
LEFT JOIN balance_transactions bt ON bt.id = ch.balance_transaction_id;

-- Cash revenue per calendar year: successful charges minus refunds.
CREATE VIEW v_revenue_by_year AS
WITH g AS (
    SELECT strftime('%Y', created, 'unixepoch') AS year,
           COUNT(*) AS successful_charges, SUM(amount) AS gross
    FROM charges WHERE status = 'succeeded' GROUP BY 1
), r AS (
    SELECT strftime('%Y', created, 'unixepoch') AS year, SUM(amount) AS refunded
    FROM refunds WHERE status = 'succeeded' GROUP BY 1
)
SELECT g.year,
       g.successful_charges,
       g.gross / 100.0                              AS gross_eur,
       COALESCE(r.refunded, 0) / 100.0              AS refunds_eur,
       (g.gross - COALESCE(r.refunded, 0)) / 100.0  AS net_revenue_eur
FROM g LEFT JOIN r USING (year)
ORDER BY g.year;

CREATE VIEW v_revenue_by_month AS
WITH g AS (
    SELECT strftime('%Y-%m', created, 'unixepoch') AS month,
           COUNT(*) AS successful_charges, SUM(amount) AS gross
    FROM charges WHERE status = 'succeeded' GROUP BY 1
), r AS (
    SELECT strftime('%Y-%m', created, 'unixepoch') AS month, SUM(amount) AS refunded
    FROM refunds WHERE status = 'succeeded' GROUP BY 1
)
SELECT g.month,
       g.successful_charges,
       g.gross / 100.0                              AS gross_eur,
       COALESCE(r.refunded, 0) / 100.0              AS refunds_eur,
       (g.gross - COALESCE(r.refunded, 0)) / 100.0  AS net_revenue_eur
FROM g LEFT JOIN r USING (month)
ORDER BY g.month;

-- Net cash revenue per year split by segment and plan (refunds booked on refund date).
CREATE VIEW v_revenue_by_year_plan AS
WITH movements AS (
    SELECT ch.created, ch.amount AS amount, ch.invoice_id, ch.customer_id
    FROM charges ch WHERE ch.status = 'succeeded'
    UNION ALL
    SELECT re.created, -re.amount, ch.invoice_id, ch.customer_id
    FROM refunds re JOIN charges ch ON ch.id = re.charge_id WHERE re.status = 'succeeded'
)
SELECT strftime('%Y', m.created, 'unixepoch') AS year,
       c.segment,
       pr.plan,
       SUM(m.amount) / 100.0 AS net_revenue_eur
FROM movements m
JOIN customers c           ON c.id = m.customer_id
JOIN invoice_line_items il ON il.invoice_id = m.invoice_id
JOIN prices pr             ON pr.id = il.price_id
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;

-- Subscriptions with plan, ISO dates and normalised MRR.
CREATE VIEW v_subscriptions AS
SELECT
    s.id                                              AS subscription_id,
    s.status,
    c.id                                              AS customer_id,
    c.name                                            AS customer_name,
    c.segment,
    c.persona,
    c.industry,
    pr.plan,
    s.quantity,
    pr.unit_amount * s.quantity / 100.0               AS term_amount_eur,
    CASE WHEN s.status IN ('active', 'past_due') THEN
        ROUND(pr.unit_amount * s.quantity / 100.0 /
              (CASE pr.recurring_interval WHEN 'year' THEN 12 ELSE 1 END * pr.recurring_interval_count), 2)
        ELSE 0 END                                    AS mrr_eur,
    date(s.start_date, 'unixepoch')                   AS start_date,
    date(s.current_period_start, 'unixepoch')         AS current_period_start,
    date(s.current_period_end, 'unixepoch')           AS current_period_end,
    s.cancel_at_period_end,
    date(s.canceled_at, 'unixepoch')                  AS canceled_at,
    date(s.ended_at, 'unixepoch')                     AS ended_at,
    s.cancellation_reason,
    s.cancellation_feedback
FROM subscriptions s
JOIN customers c ON c.id = s.customer_id
JOIN prices pr   ON pr.id = s.price_id;

-- MRR at each month end, from paid (non-refunded) license periods covering that date.
CREATE VIEW v_mrr_by_month AS
WITH RECURSIVE months(month_start) AS (
    SELECT '2022-01-01'
    UNION ALL
    SELECT date(month_start, '+1 month') FROM months WHERE month_start < '2025-12-01'
), month_ends AS (
    SELECT strftime('%Y-%m', month_start) AS month,
           CAST(strftime('%s', month_start, '+1 month') AS INTEGER) - 1 AS month_end
    FROM months
), lines AS (
    SELECT il.period_start, il.period_end, c.segment,
           il.amount * 1.0 /
               (CASE pr.recurring_interval WHEN 'year' THEN 12 ELSE 1 END * pr.recurring_interval_count) AS mrr
    FROM invoice_line_items il
    JOIN invoices i   ON i.id = il.invoice_id
    JOIN prices pr    ON pr.id = il.price_id
    JOIN customers c  ON c.id = i.customer_id
    LEFT JOIN charges ch ON ch.id = i.charge_id
    WHERE i.status = 'paid' AND COALESCE(ch.refunded, 0) = 0
)
SELECT me.month,
       COUNT(l.mrr)                                                                   AS active_subscriptions,
       ROUND(COALESCE(SUM(CASE WHEN l.segment = 'self_serve' THEN l.mrr END), 0) / 100.0, 2) AS self_serve_mrr_eur,
       ROUND(COALESCE(SUM(CASE WHEN l.segment = 'enterprise' THEN l.mrr END), 0) / 100.0, 2) AS enterprise_mrr_eur,
       ROUND(COALESCE(SUM(l.mrr), 0) / 100.0, 2)                                      AS total_mrr_eur
FROM month_ends me
LEFT JOIN lines l ON l.period_start <= me.month_end AND l.period_end > me.month_end
GROUP BY me.month
ORDER BY me.month;
