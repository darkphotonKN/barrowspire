-- refresh: every party a pod keeps in its cache, read in one trip and each put back on its TTL
-- (FS-NCC9J R4; I-NCC9J-1 D5), its members' records kept as it goes (R17): those seated on the
-- calling pod are refreshed, the rest go away or are removed by how long since their last refresh.
-- A party that has ended, or ends here as its last member's record expires, is reported gone; one
-- whose members changed is reported swept, with what changed.
--
-- KEYS: each party's key
-- ARGV: now, party TTL, away after, record TTL, the number of parties, then each party id in
--       KEYS' order, then each player id seated on the calling pod

local now, party_ttl, away_ms, expire_ms = ARGV[1], ARGV[2], ARGV[3], ARGV[4]
local count = tonumber(ARGV[5])
local seated = {}
for i = 6 + count, #ARGV do seated[ARGV[i]] = true end

local parties, gone, swept = {}, {}, {}

for i = 6, 5 + count do
	local pid = ARGV[i]
	if redis.call('EXISTS', party_key(pid)) == 0 then
		gone[#gone + 1] = pid
	else
		prune(pid, now)
		local changes = keep_members(pid, now, away_ms, expire_ms, seated)
		if changes.ended then
			gone[#gone + 1] = pid
		else
			keep_alive(pid, party_ttl)
			parties[#parties + 1] = snapshot(pid)
			if changes.removed or changes.flipped then
				changes.party_id = pid
				swept[#swept + 1] = changes
			end
		end
	end
end

local out = {code = 'ok'}
if #parties > 0 then out.parties = parties end
if #gone > 0 then out.gone = gone end
if #swept > 0 then out.swept = swept end
return reply(out)
