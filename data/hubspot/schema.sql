-- Hamina Wireless — synthetic HubSpot CRM data (DEMO)
-- Tables mirror HubSpot CRM v3 objects. Object properties use HubSpot's internal
-- property names (dealstage, closedate, hubspot_owner_id, ...). Timestamps are ISO-8601 UTC.
-- Property history (dealstage, closedate) mirrors the `propertiesWithHistory` API.

CREATE TABLE owners (
    id          TEXT PRIMARY KEY,
    email       TEXT NOT NULL,
    firstname   TEXT NOT NULL,
    lastname    TEXT NOT NULL,
    team        TEXT NOT NULL,         -- Enterprise Sales EMEA | Enterprise Sales Americas | SDR
    role        TEXT NOT NULL,         -- account_executive | sdr
    createdate  TEXT NOT NULL          -- start date at Hamina
);

CREATE TABLE companies (
    hs_object_id      TEXT PRIMARY KEY,
    name              TEXT NOT NULL,
    domain            TEXT,
    industry          TEXT,
    country           TEXT,
    city              TEXT,
    numberofemployees INTEGER,
    lifecyclestage    TEXT,            -- lead | opportunity | customer | other
    hubspot_owner_id  TEXT REFERENCES owners(id),
    createdate        TEXT NOT NULL
);

CREATE TABLE contacts (
    hs_object_id   TEXT PRIMARY KEY,
    firstname      TEXT,
    lastname       TEXT,
    email          TEXT,
    jobtitle       TEXT,
    company_id     TEXT REFERENCES companies(hs_object_id),
    lifecyclestage TEXT,
    createdate     TEXT NOT NULL
);

CREATE TABLE deal_stages (
    stage_id      TEXT PRIMARY KEY,    -- HubSpot internal stage id (default pipeline)
    label         TEXT NOT NULL,       -- label as configured in the Hamina portal
    display_order INTEGER NOT NULL,
    probability   REAL NOT NULL,       -- hs_deal_stage_probability used by HubSpot's weighted forecast
    is_closed     INTEGER NOT NULL
);

CREATE TABLE deals (
    hs_object_id              TEXT PRIMARY KEY,
    dealname                  TEXT NOT NULL,
    pipeline                  TEXT NOT NULL,   -- default
    dealtype                  TEXT NOT NULL,   -- newbusiness
    dealstage                 TEXT NOT NULL REFERENCES deal_stages(stage_id),
    amount                    REAL,            -- in deal currency
    deal_currency_code        TEXT NOT NULL,   -- EUR | USD | GBP
    amount_in_home_currency   REAL,            -- EUR
    hs_deal_stage_probability REAL NOT NULL,
    hs_forecast_category      TEXT,            -- pipeline | best_case | commit | closed | omit
    closedate                 TEXT,
    createdate                TEXT NOT NULL,
    hs_lastmodifieddate       TEXT NOT NULL,
    notes_last_contacted      TEXT,            -- last logged engagement
    num_associated_contacts   INTEGER,
    hs_is_closed              INTEGER NOT NULL,
    hs_is_closed_won          INTEGER NOT NULL,
    closed_lost_reason        TEXT,
    lead_source               TEXT,            -- inbound_demo | self_serve_expansion | partner_referral | outbound_sdr | event
    hubspot_owner_id          TEXT REFERENCES owners(id),
    company_id                TEXT REFERENCES companies(hs_object_id)
);

CREATE TABLE deal_property_history (
    deal_id   TEXT NOT NULL REFERENCES deals(hs_object_id),
    property  TEXT NOT NULL,                   -- dealstage | closedate
    value     TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    source_type TEXT NOT NULL                  -- CRM_UI | AUTOMATION
);

CREATE TABLE engagements (
    hs_object_id TEXT PRIMARY KEY,
    type         TEXT NOT NULL,                -- EMAIL | MEETING | CALL | NOTE
    timestamp    TEXT NOT NULL,
    deal_id      TEXT REFERENCES deals(hs_object_id),
    company_id   TEXT REFERENCES companies(hs_object_id),
    owner_id     TEXT REFERENCES owners(id),
    direction    TEXT                          -- INBOUND | OUTBOUND (emails)
);

CREATE INDEX idx_deals_company   ON deals(company_id);
CREATE INDEX idx_history_deal    ON deal_property_history(deal_id);
CREATE INDEX idx_engagement_deal ON engagements(deal_id);
CREATE INDEX idx_contacts_company ON contacts(company_id);
