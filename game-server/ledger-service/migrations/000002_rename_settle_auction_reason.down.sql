ALTER TABLE ledger_transactions DROP CONSTRAINT ledger_transactions_reason_check;

UPDATE ledger_transactions SET reason = 'SETTLE_AUCTION' WHERE reason = 'SETTLEMENT';

ALTER TABLE ledger_transactions ADD CONSTRAINT ledger_transactions_reason_check
    CHECK (reason IN ('SETTLE_AUCTION', 'DEPOSIT', 'WITHDRAW', 'TRANSFER'));
