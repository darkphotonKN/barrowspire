-- read: a member's party as it stands, by their pointer, put back on its TTL: the read a pod makes
-- as it seats them (FS-NCC9J R4, R6; I-NCC9J-1 D5), so being read keeps it alive. Its members'
-- records are kept as refresh keeps them (R17), the reader's own refreshed: a member seated again
-- within the record's TTL stays, and is no longer away; one whose record had expired is removed:
-- the party, if it stands, is returned without them, with the removal, for the rest to be told.
--
-- KEYS[1] the member's pointer
-- ARGV: member id, now, party TTL, away after, record TTL

local member, now, party_ttl, away_ms, expire_ms = ARGV[1], ARGV[2], ARGV[3], ARGV[4], ARGV[5]

local pid = party_of(member)
if not pid then return refuse('not_found') end

prune(pid, now)
local changes = keep_members(pid, now, away_ms, expire_ms, {[member] = true})
if changes.ended then return refuse('not_found') end
keep_alive(pid, party_ttl)

local out = {code = 'ok', party = snapshot(pid)}
if changes.removed or changes.flipped then
	changes.party_id = pid
	out.swept = {changes}
end
return reply(out)
