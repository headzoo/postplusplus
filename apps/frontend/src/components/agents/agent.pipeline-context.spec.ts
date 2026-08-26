jest.mock('next/link', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'new' }),
  usePathname: () => '/agents',
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@gitroom/frontend/components/media/media.component', () => ({
  MultiMediaComponent: () => null,
}));

jest.mock('@gitroom/helpers/utils/use.wait.for.class', () => ({
  useWaitForClass: () => false,
}));

jest.mock('@gitroom/frontend/components/pipelines/pipeline.channels', () => ({
  PipelineChannels: () => null,
}));

import {
  buildAgentTransportMetadata,
  mapSelectedPipelineContext,
  stripAgentTransportMetadata,
} from './agent';
import { PipelineSummary } from '@gitroom/frontend/components/pipelines/pipeline.types';

const pipeline: PipelineSummary = {
  id: 'pipeline-1',
  name: 'Product Launch',
  timezone: 'America/New_York',
  color: '#123456',
  active: true,
  scheduleRevision: 4,
  queueCount: 12,
  channels: [
    {
      id: 'channel-1',
      name: 'Postiz on X',
      identifier: 'x',
      picture: 'https://example.com/x.png',
      additionalSettings: 'sensitive-settings',
    },
  ] as PipelineSummary['channels'],
  contextDocuments: [
    {
      id: 'document-1',
      name: 'BRAND.md',
      fileSize: 123,
      updatedAt: '2026-08-11T12:00:00.000Z',
    },
  ],
};

describe('agent pipeline context transport', () => {
  it('maps only compact selected-pipeline fields', () => {
    expect(mapSelectedPipelineContext(pipeline)).toEqual({
      id: 'pipeline-1',
      name: 'Product Launch',
      timezone: 'America/New_York',
      active: true,
      channels: [
        {
          id: 'channel-1',
          name: 'Postiz on X',
          platform: 'x',
          picture: 'https://example.com/x.png',
        },
      ],
      contextDocuments: [
        {
          id: 'document-1',
          name: 'BRAND.md',
          fileSize: 123,
          updatedAt: '2026-08-11T12:00:00.000Z',
        },
      ],
    });
  });

  it('omits pipeline metadata when no pipeline is selected', () => {
    const metadata = buildAgentTransportMetadata(pipeline.channels, null);

    expect(metadata).toContain('[--integrations--]');
    expect(metadata).not.toContain('[--pipeline--]');
  });

  it('serializes integrations and the same compact pipeline context', () => {
    const metadata = buildAgentTransportMetadata(pipeline.channels, pipeline);

    expect(metadata).toContain('[--integrations--]');
    expect(metadata).toContain('[--pipeline--]');
    expect(metadata).toContain('"id":"pipeline-1"');
    expect(metadata).toContain('"contextDocuments"');
    expect(metadata).not.toContain('"queueCount"');
    expect(mapSelectedPipelineContext(pipeline)).not.toHaveProperty(
      'channels.0.additionalSettings'
    );
  });

  it('removes both transport markers while preserving ordinary message text', () => {
    const message =
      'Please prepare a launch post.' +
      buildAgentTransportMetadata(pipeline.channels, pipeline);

    expect(stripAgentTransportMetadata(message)).toBe(
      'Please prepare a launch post.'
    );
  });
});
