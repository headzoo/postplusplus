import {
  condition,
  continueAsNew,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';
import {
  ChannelInteractionActivity,
  ChannelInteractionMaintenanceCandidate,
} from '@gitroom/orchestrator/activities/channel-interaction.activity';
import { channelInteractionMaintenanceSignal } from '@gitroom/orchestrator/signals/channel-interaction-maintenance.signal';

const MAINTENANCE_CADENCE_MS = 60 * 60 * 1000;
const WINDOWS = ['week', 'month', '90_day', 'year'] as const;

export type ChannelInteractionMaintenanceWorkflowV2Request = {
  after?: string;
  followerSync?: {
    candidate: ChannelInteractionMaintenanceCandidate;
    generation: string;
    cursor?: string;
  };
};

const {
  abortFollowerSync,
  beginFollowerSync,
  completeFollowerSync,
  fetchAndApplyFollowerPage,
  listCandidates,
  rebuildWindow,
  reconcileSubscriptions,
} = proxyActivities<ChannelInteractionActivity>({
  startToCloseTimeout: '2 minutes',
  taskQueue: 'main',
  retry: {
    maximumAttempts: 3,
    initialInterval: '10 seconds',
    backoffCoefficient: 2,
  },
});

export async function channelInteractionMaintenanceWorkflowV2(
  request: ChannelInteractionMaintenanceWorkflowV2Request = {}
): Promise<never> {
  let poked = false;
  setHandler(channelInteractionMaintenanceSignal, () => {
    poked = true;
  });

  const nextRequest = (after?: string) =>
    continueAsNew<typeof channelInteractionMaintenanceWorkflowV2>(
      poked ? {} : { after }
    );

  if (request.followerSync) {
    const { candidate, generation, cursor } = request.followerSync;
    try {
      const page = await fetchAndApplyFollowerPage({
        candidate,
        generation,
        ...(cursor ? { cursor } : {}),
      });
      if (page.hasMore) {
        if (!page.nextCursor) {
          throw new Error(
            'Follower page indicated more results without a cursor'
          );
        }
        return continueAsNew<typeof channelInteractionMaintenanceWorkflowV2>(
          poked
            ? {}
            : {
                after: request.after,
                followerSync: {
                  candidate,
                  generation,
                  cursor: page.nextCursor,
                },
              }
        );
      }
      await completeFollowerSync({ candidate, generation });
    } catch {
      await abortFollowerSync({ candidate, generation });
    }
    await rebuildWindows(candidate);
    return nextRequest(candidate.id);
  }

  const discovered = await listCandidates(request.after);
  const candidate = discovered.candidates[0];
  if (!candidate) {
    await condition(() => poked, MAINTENANCE_CADENCE_MS);
    return continueAsNew<typeof channelInteractionMaintenanceWorkflowV2>({});
  }

  try {
    await reconcileSubscriptions(candidate);
  } catch {
    // Provider failures are isolated to one integration and retried next cadence.
  }

  if (candidate.maintenance === 'cleanup') {
    return nextRequest(candidate.id);
  }

  try {
    const sync = await beginFollowerSync(candidate);
    if (sync.supported) {
      return continueAsNew<typeof channelInteractionMaintenanceWorkflowV2>(
        poked
          ? {}
          : {
              after: request.after,
              followerSync: { candidate, generation: sync.generation },
            }
      );
    }
  } catch {
    // Follower support is optional and never blocks subscription reconciliation.
  }

  await rebuildWindows(candidate);
  return nextRequest(candidate.id);
}

async function rebuildWindows(
  candidate: ChannelInteractionMaintenanceCandidate
) {
  for (const window of WINDOWS) {
    try {
      await rebuildWindow({ candidate, window });
    } catch {
      // A single rollup may be retried during the next hourly maintenance pass.
    }
  }
}
