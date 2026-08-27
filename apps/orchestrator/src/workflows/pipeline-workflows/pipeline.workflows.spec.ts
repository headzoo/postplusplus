const claimPipelineSlot = jest.fn();
const finalizePipelineSlot = jest.fn();
const discoverDuePipelineSlots = jest.fn();
const startChild = jest.fn();
const sleep = jest.fn();
const continueAsNew = jest.fn();
const getPost = jest.fn();
const getPostsList = jest.fn();
const changeState = jest.fn();
const inAppNotification = jest.fn();
const updatePost = jest.fn();
const sendWebhooks = jest.fn();
const isCommentable = jest.fn();
const postComment = jest.fn();
const getIntegrationById = jest.fn();
const refreshTokenWithCause = jest.fn();
const internalPlugs = jest.fn();
const globalPlugsV107 = jest.fn();
const processInternalPlug = jest.fn();
const processPlugV107 = jest.fn();
const checkPostStatus = jest.fn();
const postSocialPending = jest.fn();
const finalizePost = jest.fn();
const resolvePostRulesV109 = jest.fn();
const processPostRuleV109 = jest.fn();

jest.mock('@temporalio/workflow', () => ({
  proxyActivities: () => ({
    claimPipelineSlot,
    finalizePipelineSlot,
    discoverDuePipelineSlots,
    getPost,
    getPostsList,
    changeState,
    inAppNotification,
    updatePost,
    sendWebhooks,
    isCommentable,
    postComment,
    getIntegrationById,
    refreshTokenWithCause,
    internalPlugs,
    globalPlugsV107,
    processInternalPlug,
    processPlugV107,
    checkPostStatus,
    postSocialPending,
    finalizePost,
    resolvePostRulesV109,
    processPostRuleV109,
  }),
  startChild,
  sleep,
  continueAsNew,
  defineSignal: (name: string) => name,
  setHandler: jest.fn(),
  ActivityFailure: class ActivityFailure extends Error {},
  ApplicationFailure: class ApplicationFailure extends Error {},
}));

jest.mock(
  '@gitroom/orchestrator/workflows/post-workflows/post.workflow.v1.0.6',
  () => ({ postWorkflowV106: 'postWorkflowV106' })
);

import { pipelineSlotWorkflowV1 } from './pipeline.slot.workflow.v1';
import { pipelineSchedulerWorkflowV1 } from './pipeline.scheduler.workflow.v1';
import { pipelineSlotWorkflowV2 } from './pipeline.slot.workflow.v2';
import { pipelineSchedulerWorkflowV2 } from './pipeline.scheduler.workflow.v2';
import { postWorkflowV108 } from '../post-workflows/post.workflow.v1.0.8';
import { postWorkflowV109 } from '../post-workflows/post.workflow.v1.0.9';
import { InfiniteWorkflowRegister } from '@gitroom/nestjs-libraries/temporal/infinite.workflow.register';

describe('Pipeline Temporal workflow boundaries', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('dispatches one existing post workflow per channel root and finalizes persisted state', async () => {
    claimPipelineSlot.mockResolvedValue({
      outcome: 'CLAIMED',
      executionId: 'execution',
      roots: [
        { postId: 'twitter-root', organizationId: 'org', taskQueue: 'x' },
        {
          postId: 'linkedin-root',
          organizationId: 'org',
          taskQueue: 'linkedin',
        },
      ],
    });
    startChild.mockImplementation(async () => ({
      result: async () => undefined,
    }));
    finalizePipelineSlot.mockResolvedValue({ outcome: 'PUBLISHED' });

    await expect(
      pipelineSlotWorkflowV1({
        pipelineId: 'pipeline',
        scheduleRevision: 2,
        scheduledFor: '2026-08-10T10:00:00.000Z',
      })
    ).resolves.toEqual({ outcome: 'PUBLISHED' });

    expect(startChild).toHaveBeenCalledTimes(2);
    expect(startChild).toHaveBeenNthCalledWith(
      1,
      'postWorkflowV106',
      expect.objectContaining({
        workflowId: 'post_twitter-root',
        taskQueue: 'main',
        args: [
          { taskQueue: 'x', postId: 'twitter-root', organizationId: 'org' },
        ],
        typedSearchAttributes: expect.anything(),
      })
    );
    expect(startChild).toHaveBeenNthCalledWith(
      2,
      'postWorkflowV106',
      expect.objectContaining({
        workflowId: 'post_linkedin-root',
        args: [
          {
            taskQueue: 'linkedin',
            postId: 'linkedin-root',
            organizationId: 'org',
          },
        ],
      })
    );
    expect(finalizePipelineSlot).toHaveBeenCalledWith({
      executionId: 'execution',
    });
  });

  it('finalizes a claimed slot after a child failure without replaying provider work', async () => {
    claimPipelineSlot.mockResolvedValue({
      outcome: 'CLAIMED',
      executionId: 'execution',
      roots: [{ postId: 'root', organizationId: 'org', taskQueue: 'x' }],
    });
    startChild.mockRejectedValue(new Error('provider failed'));
    finalizePipelineSlot.mockResolvedValue({
      outcome: 'FAILED',
      reason: 'Provider rejected the post',
    });

    await expect(
      pipelineSlotWorkflowV1({
        pipelineId: 'pipeline',
        scheduleRevision: 2,
        scheduledFor: '2026-08-10T10:00:00.000Z',
      })
    ).resolves.toMatchObject({ outcome: 'FAILED' });
    expect(finalizePipelineSlot).toHaveBeenCalledWith({
      executionId: 'execution',
    });
  });

  it('uses occurrence IDs for scheduler children and tolerates duplicate ticks', async () => {
    discoverDuePipelineSlots.mockResolvedValue({
      candidates: [
        {
          occurrenceId: 'pipeline:pipeline:2:2026-08-10T10:00:00.000Z',
          pipelineId: 'pipeline',
          scheduleRevision: 2,
          scheduledFor: '2026-08-10T10:00:00.000Z',
        },
      ],
    });
    startChild.mockRejectedValue(
      Object.assign(new Error('workflow already started'), {
        name: 'WorkflowExecutionAlreadyStartedError',
      })
    );
    sleep.mockRejectedValue(new Error('stop after first tick'));

    await expect(pipelineSchedulerWorkflowV1()).rejects.toThrow(
      'stop after first tick'
    );
    expect(startChild).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        workflowId: 'pipeline:pipeline:2:2026-08-10T10:00:00.000Z',
        args: [
          {
            pipelineId: 'pipeline',
            scheduleRevision: 2,
            scheduledFor: '2026-08-10T10:00:00.000Z',
          },
        ],
      })
    );
  });

  it('pages through every due candidate before sleeping', async () => {
    discoverDuePipelineSlots
      .mockResolvedValueOnce({
        candidates: [
          {
            occurrenceId: 'pipeline:first',
            pipelineId: 'first',
            scheduleRevision: 1,
            scheduledFor: '2026-08-10T10:00:00.000Z',
          },
        ],
        next: {
          pipelineId: 'first',
          scheduledFor: '2026-08-10T10:00:00.000Z',
        },
      })
      .mockResolvedValueOnce({
        candidates: [
          {
            occurrenceId: 'pipeline:second',
            pipelineId: 'second',
            scheduleRevision: 1,
            scheduledFor: '2026-08-10T10:00:00.000Z',
          },
        ],
      });
    startChild.mockResolvedValue({});
    sleep.mockRejectedValue(new Error('stop after first tick'));

    await expect(pipelineSchedulerWorkflowV1()).rejects.toThrow(
      'stop after first tick'
    );

    expect(startChild).toHaveBeenCalledTimes(2);
    expect(discoverDuePipelineSlots).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        after: {
          pipelineId: 'first',
          scheduledFor: '2026-08-10T10:00:00.000Z',
        },
      })
    );
  });

  it('sleeps and retries after discovery exhausts its activity retries', async () => {
    discoverDuePipelineSlots.mockRejectedValue(
      new Error('discovery exhausted')
    );
    sleep.mockRejectedValue(new Error('stop after failed discovery'));

    await expect(pipelineSchedulerWorkflowV1()).rejects.toThrow(
      'stop after failed discovery'
    );

    expect(startChild).not.toHaveBeenCalled();
    expect(sleep).toHaveBeenCalledWith(30 * 1000);
  });

  it('dispatches V2 slots through postWorkflowV109', async () => {
    claimPipelineSlot.mockResolvedValue({
      outcome: 'CLAIMED',
      executionId: 'execution-v2',
      roots: [{ postId: 'root-v2', organizationId: 'org', taskQueue: 'x' }],
    });
    startChild.mockResolvedValue({ result: async () => undefined });
    finalizePipelineSlot.mockResolvedValue({ outcome: 'PUBLISHED' });

    await pipelineSlotWorkflowV2({
      pipelineId: 'pipeline',
      scheduleRevision: 3,
      scheduledFor: '2026-08-10T11:00:00.000Z',
    });

    expect(startChild).toHaveBeenCalledWith(
      postWorkflowV109,
      expect.objectContaining({
        workflowId: 'post_root-v2',
        args: [{ taskQueue: 'x', postId: 'root-v2', organizationId: 'org' }],
      })
    );
  });

  it('dispatches V2 scheduler occurrences through V2 slots with versioned IDs', async () => {
    discoverDuePipelineSlots.mockResolvedValue({
      candidates: [
        {
          occurrenceId: 'pipeline:pipeline:3:2026-08-10T11:00:00.000Z',
          pipelineId: 'pipeline',
          scheduleRevision: 3,
          scheduledFor: '2026-08-10T11:00:00.000Z',
        },
      ],
    });
    startChild.mockResolvedValue({});
    sleep.mockRejectedValue(new Error('stop after first V2 tick'));

    await expect(pipelineSchedulerWorkflowV2()).rejects.toThrow(
      'stop after first V2 tick'
    );
    expect(startChild).toHaveBeenCalledWith(
      pipelineSlotWorkflowV2,
      expect.objectContaining({
        workflowId: 'pipeline-v2:pipeline:pipeline:3:2026-08-10T11:00:00.000Z',
      })
    );
  });

  it('carries plug source through V107 and removes delayed runs by compound identity', async () => {
    const integration = {
      id: 'integration',
      organizationId: 'org',
      providerIdentifier: 'x',
      disabled: false,
      refreshNeeded: false,
    };
    const post = {
      id: 'post',
      organizationId: 'org',
      state: 'QUEUE',
      publishDate: new Date(0),
      settings: '{}',
      intervalInDays: null,
      integration,
    };
    getPost.mockResolvedValue(post);
    getPostsList.mockResolvedValue([post]);
    postSocialPending.mockResolvedValue([
      {
        id: 'post',
        postId: 'provider-post',
        releaseURL: 'https://example.com/post',
        status: 'success',
      },
    ]);
    internalPlugs.mockResolvedValue([]);
    globalPlugsV107.mockResolvedValue([
      {
        type: 'global',
        source: 'channel',
        plugId: 'shared-id',
        delay: 10,
        totalRuns: 2,
      },
      {
        type: 'global',
        source: 'pipeline',
        plugId: 'shared-id',
        delay: 15,
        totalRuns: 1,
      },
    ]);
    processPlugV107.mockResolvedValue(true);

    await postWorkflowV108({
      taskQueue: 'x',
      postId: 'post',
      organizationId: 'org',
    });

    expect(globalPlugsV107).toHaveBeenCalledWith('post', integration);
    expect(processPlugV107).toHaveBeenCalledTimes(2);
    expect(processPlugV107).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        source: 'channel',
        plugId: 'shared-id',
        currentRun: 1,
      })
    );
    expect(processPlugV107).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        source: 'pipeline',
        plugId: 'shared-id',
        currentRun: 1,
      })
    );
  });

  it('starts repeat children on postWorkflowV108', async () => {
    const integration = {
      id: 'integration',
      organizationId: 'org',
      providerIdentifier: 'x',
      disabled: false,
      refreshNeeded: false,
    };
    const post = {
      id: 'repeat-post',
      organizationId: 'org',
      state: 'QUEUE',
      publishDate: new Date(0),
      settings: '{}',
      intervalInDays: 1,
      integration,
    };
    getPost.mockResolvedValue(post);
    getPostsList.mockResolvedValue([post]);
    postSocialPending.mockResolvedValue([
      {
        id: 'repeat-post',
        postId: 'provider-post',
        releaseURL: 'https://example.com/post',
        status: 'success',
      },
    ]);
    internalPlugs.mockResolvedValue([]);
    globalPlugsV107.mockResolvedValue([]);
    startChild.mockResolvedValue({});

    await postWorkflowV108({
      taskQueue: 'x',
      postId: 'repeat-post',
      organizationId: 'org',
    });

    expect(startChild).toHaveBeenCalledWith(
      postWorkflowV108,
      expect.objectContaining({
        parentClosePolicy: 'ABANDON',
        args: [
          expect.objectContaining({
            postId: 'repeat-post',
            postNow: true,
          }),
        ],
      })
    );
  });

  it('waits for V1 termination before idempotently starting the V2 scheduler', async () => {
    const order: string[] = [];
    const v1Handle = {
      describe: jest.fn().mockResolvedValue({ status: { name: 'RUNNING' } }),
      terminate: jest.fn().mockImplementation(async () => {
        order.push('terminated-v1');
      }),
    };
    const workflow = {
      getHandle: jest.fn((workflowId: string) => {
        if (workflowId === 'pipeline-scheduler-workflow-v1') {
          return v1Handle;
        }
        return {
          describe: jest.fn().mockRejectedValue(
            Object.assign(new Error('workflow not found'), {
              name: 'WorkflowNotFoundError',
            })
          ),
          terminate: jest.fn(),
          signal: jest.fn(),
        };
      }),
      start: jest.fn().mockImplementation(async (workflowType: string) => {
        if (workflowType === 'pipelineSchedulerWorkflowV2') {
          order.push('started-v2');
        }
      }),
    };
    const register = new InfiniteWorkflowRegister(
      {
        client: { getRawClient: () => ({ workflow }) },
      } as any,
      { install: jest.fn().mockResolvedValue(undefined) } as any
    );
    const previousRunCron = process.env.RUN_CRON;
    process.env.RUN_CRON = '1';

    try {
      await register.onModuleInit();
    } finally {
      if (previousRunCron === undefined) {
        delete process.env.RUN_CRON;
      } else {
        process.env.RUN_CRON = previousRunCron;
      }
    }

    expect(order).toEqual(['terminated-v1', 'started-v2']);
    expect(workflow.start).toHaveBeenCalledWith(
      'pipelineSchedulerWorkflowV2',
      expect.objectContaining({ workflowId: 'pipeline-scheduler-workflow-v2' })
    );
  });

  it('treats missing V1 and already-started V2 as scheduler steady state', async () => {
    const workflow = {
      getHandle: jest.fn().mockReturnValue({
        describe: jest.fn().mockRejectedValue(
          Object.assign(new Error('workflow not found'), {
            name: 'WorkflowNotFoundError',
          })
        ),
      }),
      start: jest.fn().mockRejectedValue(
        Object.assign(new Error('workflow already started'), {
          name: 'WorkflowExecutionAlreadyStartedError',
        })
      ),
    };
    const register = new InfiniteWorkflowRegister(
      {
        client: { getRawClient: () => ({ workflow }) },
      } as any,
      { install: jest.fn().mockResolvedValue(undefined) } as any
    );
    const previousRunCron = process.env.RUN_CRON;
    process.env.RUN_CRON = '1';

    try {
      await expect(register.onModuleInit()).resolves.toBeUndefined();
    } finally {
      if (previousRunCron === undefined) {
        delete process.env.RUN_CRON;
      } else {
        process.env.RUN_CRON = previousRunCron;
      }
    }
  });

  it('resolves Rules work items and merges them with internal Plugs by delay in V109', async () => {
    const integration = {
      id: 'integration',
      organizationId: 'org',
      providerIdentifier: 'x',
      disabled: false,
      refreshNeeded: false,
    };
    const post = {
      id: 'post',
      organizationId: 'org',
      state: 'QUEUE',
      publishDate: new Date(0),
      settings: '{}',
      intervalInDays: null,
      integration,
    };
    getPost.mockResolvedValue(post);
    getPostsList.mockResolvedValue([post]);
    postSocialPending.mockResolvedValue([
      {
        id: 'post',
        postId: 'provider-post',
        releaseURL: 'https://example.com/post',
        status: 'success',
      },
    ]);
    internalPlugs.mockResolvedValue([
      { type: 'internal-plug', delay: 20, integration: 'internal-int' },
    ]);
    resolvePostRulesV109.mockResolvedValue([
      {
        type: 'rule',
        runId: 'run-1',
        ruleId: 'rule-1',
        postId: 'post',
        evaluationIndex: 0,
        delay: 10,
      },
      {
        type: 'rule',
        runId: 'run-1',
        ruleId: 'rule-1',
        postId: 'post',
        evaluationIndex: 1,
        delay: 30,
      },
    ]);
    processPostRuleV109.mockResolvedValue({
      status: 'COMPLETED',
      terminalRun: false,
    });

    await postWorkflowV109({
      taskQueue: 'x',
      postId: 'post',
      organizationId: 'org',
    });

    expect(resolvePostRulesV109).toHaveBeenCalledWith(
      'org',
      'post',
      'integration'
    );
    expect(processPostRuleV109).toHaveBeenCalledTimes(2);
    expect(processPostRuleV109).toHaveBeenNthCalledWith(1, {
      organizationId: 'org',
      runId: 'run-1',
      ruleId: 'rule-1',
      postId: 'post',
      evaluationIndex: 0,
    });
    expect(processInternalPlug).toHaveBeenCalledTimes(1);
  });

  it('removes remaining Rule evaluations when terminalRun is true in V109', async () => {
    const integration = {
      id: 'integration',
      organizationId: 'org',
      providerIdentifier: 'x',
      disabled: false,
      refreshNeeded: false,
    };
    const post = {
      id: 'post',
      organizationId: 'org',
      state: 'QUEUE',
      publishDate: new Date(0),
      settings: '{}',
      intervalInDays: null,
      integration,
    };
    getPost.mockResolvedValue(post);
    getPostsList.mockResolvedValue([post]);
    postSocialPending.mockResolvedValue([
      {
        id: 'post',
        postId: 'provider-post',
        releaseURL: 'https://example.com/post',
        status: 'success',
      },
    ]);
    internalPlugs.mockResolvedValue([]);
    resolvePostRulesV109.mockResolvedValue([
      {
        type: 'rule',
        runId: 'run-1',
        ruleId: 'rule-1',
        postId: 'post',
        evaluationIndex: 0,
        delay: 10,
      },
      {
        type: 'rule',
        runId: 'run-1',
        ruleId: 'rule-1',
        postId: 'post',
        evaluationIndex: 1,
        delay: 20,
      },
      {
        type: 'rule',
        runId: 'run-1',
        ruleId: 'rule-1',
        postId: 'post',
        evaluationIndex: 2,
        delay: 30,
      },
    ]);
    processPostRuleV109.mockResolvedValue({
      status: 'COMPLETED',
      terminalRun: true,
    });

    await postWorkflowV109({
      taskQueue: 'x',
      postId: 'post',
      organizationId: 'org',
    });

    expect(processPostRuleV109).toHaveBeenCalledTimes(1);
    expect(processPostRuleV109).toHaveBeenNthCalledWith(1, {
      organizationId: 'org',
      runId: 'run-1',
      ruleId: 'rule-1',
      postId: 'post',
      evaluationIndex: 0,
    });
  });

  it('retries PROCESSING Rule evaluations without aborting the workflow in V109', async () => {
    const integration = {
      id: 'integration',
      organizationId: 'org',
      providerIdentifier: 'x',
      disabled: false,
      refreshNeeded: false,
    };
    const post = {
      id: 'post',
      organizationId: 'org',
      state: 'QUEUE',
      publishDate: new Date(0),
      settings: '{}',
      intervalInDays: null,
      integration,
    };
    getPost.mockResolvedValue(post);
    getPostsList.mockResolvedValue([post]);
    postSocialPending.mockResolvedValue([
      {
        id: 'post',
        postId: 'provider-post',
        releaseURL: 'https://example.com/post',
        status: 'success',
      },
    ]);
    internalPlugs.mockResolvedValue([]);
    resolvePostRulesV109.mockResolvedValue([
      {
        type: 'rule',
        runId: 'run-1',
        ruleId: 'rule-1',
        postId: 'post',
        evaluationIndex: 0,
        delay: 10,
      },
    ]);
    processPostRuleV109
      .mockResolvedValueOnce({
        status: 'PROCESSING',
        terminalRun: false,
      })
      .mockResolvedValueOnce({
        status: 'COMPLETED',
        terminalRun: true,
      });

    await postWorkflowV109({
      taskQueue: 'x',
      postId: 'post',
      organizationId: 'org',
    });

    expect(processPostRuleV109).toHaveBeenCalledTimes(2);
  });

  it('starts repeat children on postWorkflowV109 in V109', async () => {
    const integration = {
      id: 'integration',
      organizationId: 'org',
      providerIdentifier: 'x',
      disabled: false,
      refreshNeeded: false,
    };
    const post = {
      id: 'repeat-post',
      organizationId: 'org',
      state: 'QUEUE',
      publishDate: new Date(0),
      settings: '{}',
      intervalInDays: 1,
      integration,
    };
    getPost.mockResolvedValue(post);
    getPostsList.mockResolvedValue([post]);
    postSocialPending.mockResolvedValue([
      {
        id: 'repeat-post',
        postId: 'provider-post',
        releaseURL: 'https://example.com/post',
        status: 'success',
      },
    ]);
    internalPlugs.mockResolvedValue([]);
    resolvePostRulesV109.mockResolvedValue([]);
    startChild.mockResolvedValue({});

    await postWorkflowV109({
      taskQueue: 'x',
      postId: 'repeat-post',
      organizationId: 'org',
    });

    expect(startChild).toHaveBeenCalledWith(
      postWorkflowV109,
      expect.objectContaining({
        parentClosePolicy: 'ABANDON',
        args: [
          expect.objectContaining({
            postId: 'repeat-post',
            postNow: true,
          }),
        ],
      })
    );
  });

  it('retries FAILED Rule evaluations with exponential backoff in V109', async () => {
    const integration = {
      id: 'integration',
      organizationId: 'org',
      providerIdentifier: 'x',
      disabled: false,
      refreshNeeded: false,
    };
    const post = {
      id: 'post',
      organizationId: 'org',
      state: 'QUEUE',
      publishDate: new Date(0),
      settings: '{}',
      intervalInDays: null,
      integration,
    };
    getPost.mockResolvedValue(post);
    getPostsList.mockResolvedValue([post]);
    postSocialPending.mockResolvedValue([
      {
        id: 'post',
        postId: 'provider-post',
        releaseURL: 'https://example.com/post',
        status: 'success',
      },
    ]);
    internalPlugs.mockResolvedValue([]);
    resolvePostRulesV109.mockResolvedValue([
      {
        type: 'rule',
        runId: 'run-1',
        ruleId: 'rule-1',
        postId: 'post',
        evaluationIndex: 0,
        delay: 10,
      },
    ]);
    processPostRuleV109
      .mockResolvedValueOnce({
        status: 'FAILED',
        terminalRun: false,
        errorSummary: 'Transient error',
      })
      .mockResolvedValueOnce({
        status: 'FAILED',
        terminalRun: false,
        errorSummary: 'Transient error',
      })
      .mockResolvedValueOnce({
        status: 'COMPLETED',
        terminalRun: true,
      });

    await postWorkflowV109({
      taskQueue: 'x',
      postId: 'post',
      organizationId: 'org',
    });

    expect(processPostRuleV109).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledWith(30000);
    expect(sleep).toHaveBeenCalledWith(60000);
  });

  it('abandons FAILED Rule evaluation after retry budget exhaustion in V109', async () => {
    const integration = {
      id: 'integration',
      organizationId: 'org',
      providerIdentifier: 'x',
      disabled: false,
      refreshNeeded: false,
    };
    const post = {
      id: 'post',
      organizationId: 'org',
      state: 'QUEUE',
      publishDate: new Date(0),
      settings: '{}',
      intervalInDays: null,
      integration,
    };
    getPost.mockResolvedValue(post);
    getPostsList.mockResolvedValue([post]);
    postSocialPending.mockResolvedValue([
      {
        id: 'post',
        postId: 'provider-post',
        releaseURL: 'https://example.com/post',
        status: 'success',
      },
    ]);
    internalPlugs.mockResolvedValue([]);
    resolvePostRulesV109.mockResolvedValue([
      {
        type: 'rule',
        runId: 'run-1',
        ruleId: 'rule-1',
        postId: 'post',
        evaluationIndex: 0,
        delay: 10,
      },
      {
        type: 'rule',
        runId: 'run-1',
        ruleId: 'rule-1',
        postId: 'post',
        evaluationIndex: 1,
        delay: 20,
      },
    ]);
    processPostRuleV109.mockResolvedValue({
      status: 'FAILED',
      terminalRun: false,
      errorSummary: 'Persistent error',
    });

    await postWorkflowV109({
      taskQueue: 'x',
      postId: 'post',
      organizationId: 'org',
    });

    expect(processPostRuleV109).toHaveBeenCalledTimes(10);
    expect(processPostRuleV109).toHaveBeenNthCalledWith(6, {
      organizationId: 'org',
      runId: 'run-1',
      ruleId: 'rule-1',
      postId: 'post',
      evaluationIndex: 1,
    });
  });

  it('converts absolute delays to sequential waits for rule evaluations in V109', async () => {
    const integration = {
      id: 'integration',
      organizationId: 'org',
      providerIdentifier: 'x',
      disabled: false,
      refreshNeeded: false,
    };
    const post = {
      id: 'post',
      organizationId: 'org',
      state: 'QUEUE',
      publishDate: new Date(0),
      settings: '{}',
      intervalInDays: null,
      integration,
    };
    getPost.mockResolvedValue(post);
    getPostsList.mockResolvedValue([post]);
    postSocialPending.mockResolvedValue([
      {
        id: 'post',
        postId: 'provider-post',
        releaseURL: 'https://example.com/post',
        status: 'success',
      },
    ]);
    internalPlugs.mockResolvedValue([]);
    resolvePostRulesV109.mockResolvedValue([
      {
        type: 'rule',
        runId: 'run-1',
        ruleId: 'rule-1',
        postId: 'post',
        evaluationIndex: 0,
        delay: 1000,
      },
      {
        type: 'rule',
        runId: 'run-1',
        ruleId: 'rule-1',
        postId: 'post',
        evaluationIndex: 1,
        delay: 2000,
      },
    ]);
    processPostRuleV109.mockResolvedValue({
      status: 'COMPLETED',
      terminalRun: false,
    });

    await postWorkflowV109({
      taskQueue: 'x',
      postId: 'post',
      organizationId: 'org',
    });

    const sleepCalls = (sleep as jest.Mock).mock.calls;
    const ruleSleeps = sleepCalls.filter(
      (call) => call[0] >= 900 && call[0] <= 2100
    );
    expect(ruleSleeps.length).toBe(2);
    expect(ruleSleeps[0][0]).toBeGreaterThanOrEqual(900);
    expect(ruleSleeps[0][0]).toBeLessThanOrEqual(1100);
    expect(ruleSleeps[1][0]).toBeGreaterThanOrEqual(1900);
    expect(ruleSleeps[1][0]).toBeLessThanOrEqual(2100);
  });

  it('anchors rule delays to publication instant not workflow start for scheduled posts in V109', async () => {
    const futurePublishDate = new Date(Date.now() + 60000);
    const integration = {
      id: 'integration',
      organizationId: 'org',
      providerIdentifier: 'x',
      disabled: false,
      refreshNeeded: false,
    };
    const post = {
      id: 'post',
      organizationId: 'org',
      state: 'QUEUE',
      publishDate: futurePublishDate,
      settings: '{}',
      intervalInDays: null,
      integration,
    };
    getPost.mockResolvedValue(post);
    getPostsList.mockResolvedValue([post]);
    postSocialPending.mockResolvedValue([
      {
        id: 'post',
        postId: 'provider-post',
        releaseURL: 'https://example.com/post',
        status: 'success',
      },
    ]);
    internalPlugs.mockResolvedValue([]);
    resolvePostRulesV109.mockResolvedValue([
      {
        type: 'rule',
        runId: 'run-1',
        ruleId: 'rule-1',
        postId: 'post',
        evaluationIndex: 0,
        delay: 5000,
      },
    ]);
    processPostRuleV109.mockResolvedValue({
      status: 'COMPLETED',
      terminalRun: false,
    });

    await postWorkflowV109({
      taskQueue: 'x',
      postId: 'post',
      organizationId: 'org',
    });

    const sleepCalls = (sleep as jest.Mock).mock.calls;
    const ruleDelaySleep = sleepCalls.find(
      (call) => call[0] >= 4000 && call[0] <= 5000
    );
    expect(ruleDelaySleep).toBeDefined();
    expect(ruleDelaySleep![0]).toBeGreaterThan(0);
  });

  it('waits full configured delay for thread comments on scheduled posts in V109', async () => {
    const futurePublishDate = new Date(Date.now() + 60000);
    const integration = {
      id: 'integration',
      organizationId: 'org',
      providerIdentifier: 'x',
      disabled: false,
      refreshNeeded: false,
    };
    const rootPost = {
      id: 'post',
      organizationId: 'org',
      state: 'QUEUE',
      publishDate: futurePublishDate,
      settings: '{}',
      intervalInDays: null,
      integration,
      delay: null,
    };
    const commentPost = {
      ...rootPost,
      id: 'post-comment',
      delay: 2,
    };
    getPost.mockResolvedValue(rootPost);
    getPostsList.mockResolvedValue([rootPost, commentPost]);
    isCommentable.mockResolvedValue(true);
    postSocialPending.mockResolvedValue([
      {
        id: 'post',
        postId: 'provider-post',
        releaseURL: 'https://example.com/post',
        status: 'success',
      },
    ]);
    postComment.mockResolvedValue([
      {
        id: 'post-comment',
        postId: 'provider-comment',
        releaseURL: 'https://example.com/comment',
        status: 'success',
      },
    ]);
    internalPlugs.mockResolvedValue([]);
    resolvePostRulesV109.mockResolvedValue([]);

    await postWorkflowV109({
      taskQueue: 'x',
      postId: 'post',
      organizationId: 'org',
    });

    const sleepCalls = (sleep as jest.Mock).mock.calls;
    const threadCommentDelay = sleepCalls.find(
      (call) => call[0] >= 100000 && call[0] <= 120000
    );
    expect(threadCommentDelay).toBeDefined();
    expect(threadCommentDelay![0]).toBeGreaterThan(0);
  });
});
