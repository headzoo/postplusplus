import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';

export interface PipelineScheduleSlot {
  dayOfWeek: number;
  minuteOfDay: number;
}

export interface PipelineContextDocument {
  id: string;
  name: string;
  description?: string | null;
  fileSize: number;
  updatedAt: string;
}

export interface PipelineSummary {
  id: string;
  name: string;
  timezone: string;
  color: string;
  active: boolean;
  scheduleRevision: number;
  channels: Integrations[];
  queueCount: number;
  nextSlot?: string;
  projectedEnqueueFor?: string;
  contextDocuments?: PipelineContextDocument[];
}

export interface PipelineDetail extends PipelineSummary {
  scheduleSlots: PipelineScheduleSlot[];
  integrations: { integrationId: string; integration: Integrations }[];
  blockedContextDocuments: PipelineContextDocument[];
  queueItems: PipelineQueueItem[];
  projections: { itemId: string; projectedFor?: string }[];
}

export interface PipelineQueueItem {
  id: string;
  group: string;
  status: 'QUEUED' | 'PUBLISHING' | 'FAILED' | 'PUBLISHED' | 'REMOVED';
  position: number;
  error?: string | null;
  posts: Array<{
    id: string;
    parentPostId?: string | null;
    content: string;
    delay: number;
    state?: string;
    publishDate?: string | Date | null;
    canEdit?: boolean;
    intervalInDays?: number | null;
    integration: Integrations;
    settings?: Record<string, unknown>;
    image?: Array<{
      id: string;
      path: string;
      alt?: string;
      thumbnail?: string;
      thumbnailTimestamp?: number;
    }>;
    tags?: Array<{ tag: { name: string } }>;
  }>;
}

export interface CreatePipelinePayload {
  name: string;
  timezone: string;
  color?: string;
  integrations: { id: string }[];
  contextDocumentIds?: string[];
}

export type UpdatePipelinePayload = CreatePipelinePayload;

export interface UpdatePipelineSchedulePayload {
  scheduleSlots: PipelineScheduleSlot[];
}

export interface PipelineScheduleOccurrence {
  id: string;
  pipelineId: string;
  pipelineName: string;
  pipelineTimezone: string;
  pipelineColor: string;
  active: boolean;
  scheduleRevision: number;
  dayOfWeek: number;
  minuteOfDay: number;
  scheduledFor: string;
}

export interface PipelineCalendarPost {
  id: string;
  content: string;
  publishDate: string;
  releaseURL: null;
  releaseId: null;
  state?: string;
  intervalInDays: null;
  group: string;
  creationMethod: 'QUEUE';
  pipelineId: string;
  pipelineItemId: string;
  pipelineColor: string;
  tags: Array<{ tag: { name: string; color?: string } }>;
  integration: Integrations;
}

export interface DeletePipelineScheduleSlotPayload
  extends PipelineScheduleSlot {}

export interface DeletePipelineScheduleSlotResult {
  pipelineId: string;
  dayOfWeek: number;
  minuteOfDay: number;
  scheduleRevision: number;
}

export interface MovePipelineScheduleSlotPayload {
  sourceDayOfWeek: number;
  sourceMinuteOfDay: number;
  targetDayOfWeek: number;
  targetMinuteOfDay: number;
  expectedScheduleRevision: number;
}

export interface MovePipelineScheduleSlotResult {
  pipelineId: string;
  source: PipelineScheduleSlot;
  target: PipelineScheduleSlot;
  scheduleRevision: number;
}

export interface PipelineScheduleDragItem {
  source: PipelineScheduleSlot;
  occurrenceId?: string;
  pipelineId?: string;
  pipelineName?: string;
  pipelineTimezone?: string;
  pipelineColor?: string;
  active?: boolean;
  expectedScheduleRevision?: number;
}

export interface ReorderPipelineQueuePayload {
  itemIds: string[];
}

export interface PipelineAutopost {
  id: string;
  title: string;
  content?: string | null;
  lastUrl?: string | null;
  syncLast: boolean;
  url: string;
  active: boolean;
  addPicture: boolean;
  generateContent: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PipelineAutopostPayload {
  title: string;
  content?: string;
  lastUrl?: string;
  syncLast: boolean;
  url: string;
  active: boolean;
  addPicture: boolean;
  generateContent: boolean;
}
