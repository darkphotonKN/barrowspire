-- Tree v2 voids every existing spend (FS-8RZ51 §Change: Tree v2 V20): the
-- tree became a graph with locked sides, and mapping old ranks onto it would
-- invent choices the player never made. Emptying passive_ranks is a one-time
-- full refund for every character, the ability and the specialization
-- included: each reads back no ranks, no specialization and earned(level)
-- unspent. It is R5's one refund path, used once, here. The table, its key
-- and its rank check are unchanged.
DELETE FROM passive_ranks;
