CREATE TABLE IF NOT EXISTS ledger_transactions (
    -- caller-minted and deterministic; the ledger never mints one
    transaction_id UUID PRIMARY KEY NOT NULL,
    reason TEXT NOT NULL CHECK (reason IN ('SETTLE_AUCTION', 'DEPOSIT', 'WITHDRAW', 'TRANSFER')),
    reference_id UUID NOT NULL, -- soft reference to the originating event (e.g. a bid's id)
    currency TEXT NOT NULL DEFAULT 'GOLD' CHECK (currency IN ('GOLD')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ledger_entries (
    id UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES ledger_transactions(transaction_id),
    account_id UUID NOT NULL, -- soft reference to wallet-service's accounts.id
    direction TEXT NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
    -- amount is always positive; direction carries the sign, so a sign error is
    -- unrepresentable rather than merely unlikely
    amount BIGINT NOT NULL CHECK (amount > 0),
    -- carried down from the parent so the read paths below can sort and paginate
    -- without joining. Legs are written in the same transaction as their parent,
    -- so the two timestamps agree.
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "what moved in this window" — reconciliation scans by time
CREATE INDEX idx_ledger_transactions_date ON ledger_transactions(created_at);

-- "what did this bid produce" — tracing an event back to its record
CREATE INDEX idx_ledger_transactions_reference_id ON ledger_transactions(reference_id);

-- "why is this account's gold what it is" — the per-account statement.
-- Trailing id makes (created_at, id) a total order, so keyset pagination has a
-- unique cursor and cannot skip or repeat rows that share a timestamp.
CREATE INDEX idx_ledger_entries_account_id_created_at_id ON ledger_entries(account_id, created_at, id);

-- the same cursor, unscoped: the global admin feed across every account
CREATE INDEX idx_ledger_entries_created_at_id ON ledger_entries(created_at, id);

-- the FK join, and "give me both legs of this transaction"
CREATE INDEX idx_ledger_entries_transaction_id ON ledger_entries(transaction_id);
