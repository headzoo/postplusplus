-- Extend AdminScheduleLogKey for Hot triage and Follower cultivate schedule logs.

ALTER TYPE "AdminScheduleLogKey" ADD VALUE 'HOT_TRIAGE';
ALTER TYPE "AdminScheduleLogKey" ADD VALUE 'FOLLOWER_CULTIVATE';
