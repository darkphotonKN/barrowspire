-- read: a party as it stands, by its id or by a member's pointer, put back on its TTL. Called by a
-- pod holding one of its members (FS-NCC9J R4, R6; I-NCC9J-1 D5), so being read keeps it alive.
--
-- KEYS[1] the party's key or the member's pointer
-- ARGV: party id, or "" to follow the member's pointer; member id; now; party TTL

local pid, member, now, party_ttl = ARGV[1], ARGV[2], ARGV[3], ARGV[4]

if pid == '' then
	pid = party_of(member)
	if not pid then return refuse('not_found') end
elseif redis.call('EXISTS', party_key(pid)) == 0 then
	return refuse('not_found')
end

prune(pid, now)
keep_alive(pid, party_ttl)
return reply({code = 'ok', party = snapshot(pid)})
