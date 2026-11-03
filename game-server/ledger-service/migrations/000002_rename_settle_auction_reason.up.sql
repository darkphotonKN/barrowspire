-- SETTLE_AUCTION becomes SETTLEMENT: the ledger records that gold settled, never
-- what an auction is (FS-NXP1W Req 32). No caller has appended one yet, so the
-- UPDATE is a guard for dev databases, not a correction of real history.
ALTER TABLE ledger_transactions DROP CONSTRAINT ledger_transactions_reason_check;

UPDATE ledger_transactions SET reason = 'SETTLEMENT' WHERE reason = 'SETTLE_AUCTION';

ALTER TABLE ledger_transactions ADD CONSTRAINT ledger_transactions_reason_check
    CHECK (reason IN ('SETTLEMENT', 'DEPOSIT', 'WITHDRAW', 'TRANSFER'));
