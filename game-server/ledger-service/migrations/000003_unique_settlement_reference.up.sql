CREATE UNIQUE INDEX idx_ledger_transactions_settlement_reference ON ledger_transactions(reference_id) WHERE reason = 'SETTLEMENT';
