-- refresh: every party a pod keeps in its cache, read in one trip and each put back on its TTL
-- (FS-NCC9J R4; I-NCC9J-1 D5). A party that has ended is reported gone.
--
-- KEYS: each party's key
-- ARGV: now, party TTL, then each party id in KEYS' order

local now, party_ttl = ARGV[1], ARGV[2]
local parties, gone = {}, {}

for i = 3, #ARGV do
	local pid = ARGV[i]
	if redis.call('EXISTS', party_key(pid)) == 0 then
		gone[#gone + 1] = pid
	else
		prune(pid, now)
		keep_alive(pid, party_ttl)
		parties[#parties + 1] = snapshot(pid)
	end
end

local out = {code = 'ok'}
if #parties > 0 then out.parties = parties end
if #gone > 0 then out.gone = gone end
return reply(out)
