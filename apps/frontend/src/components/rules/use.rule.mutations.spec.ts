/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import { renderHook, act } from '@testing-library/react';
import {
  useCreateRule,
  useUpdateRule,
  useDeleteRule,
  useSetRuleActivation,
  useReplaceRuleAssignments,
} from './use.rule.mutations';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useSWRConfig } from 'swr';
import { RULES_KEY } from './use.rules.list';
import { ruleDetailKey } from './use.rule.detail';

jest.mock('@gitroom/helpers/utils/custom.fetch');
jest.mock('swr', () => ({
  ...jest.requireActual('swr'),
  useSWRConfig: jest.fn(),
}));

const mockFetch = useFetch as jest.MockedFunction<typeof useFetch>;
const mockUseSWRConfig = useSWRConfig as jest.MockedFunction<
  typeof useSWRConfig
>;

describe('useCreateRule', () => {
  const mutate = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSWRConfig.mockReturnValue({ mutate } as ReturnType<
      typeof useSWRConfig
    >);
  });

  it('should create a rule successfully', async () => {
    const mockResponse = { id: 'rule-1', name: 'New Rule' };
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockResponse),
    });

    mockFetch.mockReturnValue(fetchMock);

    const { result } = renderHook(() => useCreateRule());

    const dto = {
      name: 'New Rule',
      enabled: true,
      action: 'REMOVE' as const,
      initialDelayHours: 24,
      conditionMatch: 'ANY' as const,
      conditions: [],
    };

    let response;
    await act(async () => {
      response = await result.current(dto);
    });

    expect(fetchMock).toHaveBeenCalledWith('/rules', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
    expect(response).toEqual(mockResponse);
    expect(mutate).toHaveBeenCalledWith(RULES_KEY);
  });

  it('should throw error on failed creation', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      json: jest.fn().mockResolvedValue({ message: 'Creation failed' }),
    });

    mockFetch.mockReturnValue(fetchMock);

    const { result } = renderHook(() => useCreateRule());

    const dto = {
      name: 'New Rule',
      enabled: true,
      action: 'REMOVE' as const,
      initialDelayHours: 24,
      conditionMatch: 'ANY' as const,
      conditions: [],
    };

    await expect(result.current(dto)).rejects.toThrow('Creation failed');
  });
});

describe('useUpdateRule', () => {
  const mutate = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSWRConfig.mockReturnValue({ mutate } as ReturnType<
      typeof useSWRConfig
    >);
  });

  it('should update a rule successfully', async () => {
    const mockResponse = { id: 'rule-1', name: 'Updated Rule' };
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockResponse),
    });

    mockFetch.mockReturnValue(fetchMock);

    const { result } = renderHook(() => useUpdateRule());

    const dto = {
      name: 'Updated Rule',
      enabled: true,
      action: 'REMOVE' as const,
      initialDelayHours: 24,
      conditionMatch: 'ANY' as const,
      conditions: [],
    };

    let response;
    await act(async () => {
      response = await result.current('rule-1', dto);
    });

    expect(fetchMock).toHaveBeenCalledWith('/rules/rule-1', {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
    expect(response).toEqual(mockResponse);
    expect(mutate).toHaveBeenCalledWith(RULES_KEY);
    expect(mutate).toHaveBeenCalledWith(ruleDetailKey('rule-1'));
  });
});

describe('useDeleteRule', () => {
  const mutate = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSWRConfig.mockReturnValue({ mutate } as ReturnType<
      typeof useSWRConfig
    >);
  });

  it('should delete a rule successfully', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
    });

    mockFetch.mockReturnValue(fetchMock);

    const { result } = renderHook(() => useDeleteRule());

    await act(async () => {
      await result.current('rule-1');
    });

    expect(fetchMock).toHaveBeenCalledWith('/rules/rule-1', {
      method: 'DELETE',
    });
    expect(mutate).toHaveBeenCalledWith(RULES_KEY);
  });
});

describe('useSetRuleActivation', () => {
  const mutate = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSWRConfig.mockReturnValue({ mutate } as ReturnType<
      typeof useSWRConfig
    >);
  });

  it('should update rule activation successfully', async () => {
    const mockResponse = { id: 'rule-1', enabled: false };
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockResponse),
    });

    mockFetch.mockReturnValue(fetchMock);

    const { result } = renderHook(() => useSetRuleActivation());

    const dto = { enabled: false };

    let response;
    await act(async () => {
      response = await result.current('rule-1', dto);
    });

    expect(fetchMock).toHaveBeenCalledWith('/rules/rule-1/activation', {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
    expect(response).toEqual(mockResponse);
    expect(mutate).toHaveBeenCalledWith(RULES_KEY);
    expect(mutate).toHaveBeenCalledWith(ruleDetailKey('rule-1'));
  });
});

describe('useReplaceRuleAssignments', () => {
  const mutate = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSWRConfig.mockReturnValue({ mutate } as ReturnType<
      typeof useSWRConfig
    >);
  });

  it('should replace assignments successfully', async () => {
    const mockResponse = { id: 'rule-1' };
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockResponse),
    });

    mockFetch.mockReturnValue(fetchMock);

    const { result } = renderHook(() => useReplaceRuleAssignments());

    const dto = {
      integrationIds: ['int-1', 'int-2'],
      pipelineIds: ['pip-1'],
    };

    let response;
    await act(async () => {
      response = await result.current('rule-1', dto);
    });

    expect(fetchMock).toHaveBeenCalledWith('/rules/rule-1/assignments', {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
    expect(response).toEqual(mockResponse);
    expect(mutate).toHaveBeenCalledWith(RULES_KEY);
    expect(mutate).toHaveBeenCalledWith(ruleDetailKey('rule-1'));
  });
});
