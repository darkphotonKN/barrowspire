-- Children first: ledger_entries holds the FK onto ledger_transactions.
-- Dropping each table also drops its indexes and CHECK constraints.
DROP TABLE IF EXISTS ledger_entries;
DROP TABLE IF EXISTS ledger_transactions;
