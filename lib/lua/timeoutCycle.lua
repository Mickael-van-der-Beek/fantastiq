local key_inactive,
      key_active,
      key_failed,
      key_delayed,
      key_jobDetails,
      key_config,
      key_index = unpack(KEYS)

local timestamp,
      defaultTimeout,
      serializedError = unpack(ARGV)

timestamp = tonumber(timestamp)

redis.call('HSETNX', key_config, 'timeout', defaultTimeout)
local timeout = fantastiq.getConfig(key_config, 'timeout')


local timeoutTime = timestamp - timeout
local count = 0

local jobIds = redis.call('ZRANGEBYSCORE', key_active, 0, timeoutTime)
local allowedAttempts = fantastiq.getConfig(key_config, 'attempts') or 1

for i, jobId in ipairs(jobIds) do
  fantastiq.acknowledge(
    key_inactive,
    key_active,
    key_failed,
    nil, -- no need for key_completed
    key_delayed,
    key_jobDetails,
    key_config,
    key_index,
    timestamp,
    jobId,
    serializedError,
    nil -- no result
  )
end


return #jobIds
