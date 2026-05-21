package store

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/go-redis/redis/v8"
)

var consumeTokenScript = redis.NewScript(`
local v = redis.call("GET", KEYS[1])
if (not v) then
  return 0
end
if (v == ARGV[1]) then
  redis.call("DEL", KEYS[1])
  return 1
end
return 0
`)

type WorkspaceStore struct {
	rdb *redis.Client
}

func NewWorkspaceStore(rdb *redis.Client) *WorkspaceStore {
	return &WorkspaceStore{rdb: rdb}
}

func (s *WorkspaceStore) GetPodAddress(ctx context.Context, workspaceID string) (string, error) {
	key := fmt.Sprintf("workspace:pod_ip:%s", workspaceID)
	addr, err := s.rdb.Get(ctx, key).Result()
	if err == redis.Nil {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("redis get pod address: %w", err)
	}
	return addr, nil
}

func (s *WorkspaceStore) ValidateAndConsumeWSToken(ctx context.Context, workspaceID, token string) (bool, error) {
	key := fmt.Sprintf("ws:token:%s", workspaceID)
	res, err := consumeTokenScript.Run(ctx, s.rdb, []string{key}, token).Int()
	if err != nil {
		return false, fmt.Errorf("consume ws token: %w", err)
	}
	return res == 1, nil
}

func (s *WorkspaceStore) RecordActivity(ctx context.Context, workspaceID string) error {
	key := fmt.Sprintf("workspace:last_activity:%s", workspaceID)
	nowUnix := strconv.FormatInt(time.Now().Unix(), 10)

	pipe := s.rdb.Pipeline()
	pipe.Set(ctx, key, nowUnix, 0)
	pipe.Expire(ctx, key, time.Hour)
	if _, err := pipe.Exec(ctx); err != nil {
		return fmt.Errorf("record activity: %w", err)
	}
	return nil
}

func (s *WorkspaceStore) Close() error {
	return s.rdb.Close()
}
