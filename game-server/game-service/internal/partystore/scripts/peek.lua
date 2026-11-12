-- peek: a member's party as it stands, by their pointer, read without keeping anything: no
-- member's record refreshed, no TTL put back (FS-NCC9J §Change: Changing character leaves the
-- party, C9, C13). The roster is sent it, and a player whose record is gone is compared by it.
-- snapshot drops an invite whose record has lapsed from the party's list, as every read does.
--
-- KEYS[1] the member's pointer
-- ARGV: member id

local pid = party_of(ARGV[1])
if not pid then return refuse('not_found') end
return reply({code = 'ok', party = snapshot(pid)})
