local key = KEYS[1]

local tokens = tonumber(redis.call('HGET', key, 'tokens') or '0')
local version = tonumber(redis.call('HGET', key, 'version') or '0')

if tokens <= 0 then
  return {0, 0, version}
end

local new_tokens = tokens - 1
local new_version = version + 1

redis.call('HSET', key, 'tokens', new_tokens, 'version', new_version)

return {1, new_tokens, new_version}
