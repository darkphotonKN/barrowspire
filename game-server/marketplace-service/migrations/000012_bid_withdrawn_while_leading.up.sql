-- Whether a bid was leading (WINNING) when its member withdrew it (FS-S109X Req
-- 5, ADR-0055). Only these withdrawals count toward the bid withdrawal cap; an
-- outbid withdrawal promotes nobody and moves no price. Set by the same write
-- that turns the bid CANCELLED, so false on every bid never withdrawn.
ALTER TABLE bids ADD COLUMN IF NOT EXISTS withdrawn_while_leading BOOLEAN NOT NULL DEFAULT false;

-- Withdrawals made before this column never recorded whether they led, so every
-- one keeps counting (FS-S109X Req 6).
UPDATE bids SET withdrawn_while_leading = true WHERE status = 'CANCELLED';
