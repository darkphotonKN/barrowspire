-- create: the player leads a new party of one (FS-NCC9J R15; FS-R82NV R4a).
--
-- KEYS[1] the creator's pointer
-- ARGV: new party id, creator id, creator name, creator class, now, party TTL

local pid, creator, name, class, now, party_ttl = ARGV[1], ARGV[2], ARGV[3], ARGV[4], ARGV[5], ARGV[6]

if party_of(creator) then return refuse('already_in_party') end

local leader = {player_id = creator, name = name, class = class, joined_at = now}
redis.call('HSET', party_key(pid), 'leader', creator, 'created_at', now, 'members', cjson.encode({leader}), 'version', 1)
redis.call('SET', pointer_key(creator), pid)
seen(pid, creator, now)
keep_alive(pid, party_ttl)

return reply({code = 'ok', party = snapshot(pid)})
