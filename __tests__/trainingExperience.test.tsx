import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from '@jest/globals';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';

import { createBackendError, type ApiClient, type ApiRequestOptions } from '@/api';
import type {
  MyWorkspaceContextDto,
  RelationshipId,
  WorkspaceId,
  WorkspaceMembershipId,
} from '@/contracts';
import { translate } from '@/i18n/messages';
import { protectedQueryScope, createAppQueryClient } from '@/query';
import { ThemeProvider } from '@/theme';
import {
  completeWorkout,
  currentWorkoutKey,
  fetchCurrentTraineeRelationship,
  fetchCurrentWorkout,
  fetchPersonalRecordEvents,
  fetchPersonalRecords,
  fetchProgramProgress,
  fetchTrainingPrograms,
  fetchWorkouts,
  parseCurrentWorkout,
  parseCurrentTraineeRelationship,
  parseTrainingPrograms,
  patchWorkout,
  personalRecordEventsKey,
  personalRecordsKey,
  startWorkout,
  traineeRelationshipKey,
  TrainingExperienceScreen,
  trainingProgramProgressKey,
  trainingProgramsKey,
  trainingRelationshipDiscoveryKey,
  workoutsKey,
} from '@/training';
import { resolveUniqueMobileWorkspaceContext } from '@/workspaceContext';

const workspaceId = 'workspace-1' as WorkspaceId;
const workspaceB = 'workspace-2' as WorkspaceId;
const membershipId = 'membership-1' as WorkspaceMembershipId;
const relationshipA = 'relationship-a' as RelationshipId;
const relationshipB = 'relationship-b' as RelationshipId;
const testQueryClients = new Set<ReturnType<typeof createAppQueryClient>>();

afterEach(async () => {
  await cleanup();
  for (const client of testQueryClients) {
    await client.cancelQueries();
    client.getMutationCache().clear();
    client.clear();
    client.unmount();
  }
  testQueryClients.clear();
});

function workspaceRow(input: Partial<MyWorkspaceContextDto> = {}): MyWorkspaceContextDto {
  return {
    workspace: {
      id: workspaceId,
      type: 'GYM',
      name: 'Cairo Strength',
      ownerUserId: 'owner-1' as never,
      status: 'ACTIVE',
      timezone: 'Africa/Cairo' as never,
      defaultLanguage: 'en',
    },
    membership: {
      id: membershipId,
      workspaceId,
      userId: 'staff-1' as never,
      roles: ['TRAINER'],
      status: 'ACTIVE',
      permissionProfileIds: [],
      accessVersion: 12,
      joinedAt: '2026-01-01T08:00:00.000Z' as never,
      engagementPeriods: [{ startedAt: '2026-01-01T08:00:00.000Z' as never }],
    },
    ...input,
  };
}

function readyContext(role: 'TRAINEE' | 'TRAINER' | 'ASSISTANT_TRAINER' = 'TRAINER') {
  const resolved = resolveUniqueMobileWorkspaceContext({
    generation: 15,
    personas: ['TRAINEE', 'TRAINER', 'ASSISTANT_TRAINER', 'NUTRITIONIST'],
    rows: [
      workspaceRow({
        membership: {
          ...workspaceRow().membership,
          roles: [role],
          userId: role === 'TRAINEE' ? ('trainee-1' as never) : ('staff-1' as never),
        },
      }),
    ],
  });
  expect(resolved.status).toBe('ready');
  if (resolved.status !== 'ready') throw new Error('Expected ready context');
  return resolved;
}

function relationship(id: RelationshipId = relationshipA, overrides: Record<string, unknown> = {}) {
  return {
    id,
    workspaceId,
    traineeUserId: 'trainee-1',
    traineeMembershipId: 'trainee-membership-1',
    homeBranchId: null,
    status: 'ACTIVE',
    version: 4,
    createdAt: '2026-01-01T08:00:00.000Z',
    updatedAt: '2026-01-02T08:00:00.000Z',
    ...overrides,
  };
}

function relationshipsResponse(items = [relationship()]) {
  return { data: items, meta: { hasMore: false, nextCursor: null } };
}

function traineeRelationshipResponse(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      relationship: {
        id: relationshipA,
        workspaceId,
        status: 'ACTIVE',
        version: 2,
        ...overrides,
      },
    },
  };
}

function traineeRelationshipNullResponse() {
  return { data: { relationship: null } };
}

function programsResponse(id = relationshipA, nextCursor: string | null = null) {
  return {
    data: [
      {
        id: 'program-active',
        workspaceId,
        relationshipId: id,
        name: id === relationshipA ? 'Strength base' : 'Hypertrophy base',
        status: 'ACTIVE',
        startedAt: '2026-01-01T08:00:00.000Z',
        currentRevisionId: 'revision-1',
        version: 3,
      },
    ],
    meta: { hasMore: false, nextCursor },
  };
}

function progressResponse() {
  return {
    data: {
      progress: {
        programId: 'program-active',
        programRevisionId: 'revision-1',
        currentDaySequence: 2,
        completedDayCount: 1,
        skippedDayCount: 0,
        version: 5,
      },
    },
  };
}

function workout(id: RelationshipId = relationshipA, overrides: Record<string, unknown> = {}) {
  return {
    id: 'workout-current',
    workspaceId,
    relationshipId: id,
    traineeUserId: 'trainee-1',
    programId: 'program-active',
    programRevisionId: 'revision-1',
    dayKey: 'day-2',
    daySequence: 2,
    performedByUserId: 'trainee-1',
    status: 'IN_PROGRESS',
    startedAt: '2026-01-02T08:00:00.000Z',
    exercises: [
      {
        workoutExerciseKey: 'workout-exercise-1',
        prescriptionId: 'prescription-1',
        exerciseId: 'exercise-1',
        exerciseNameSnapshot: 'Squat',
        order: 1,
        setStructure: 'WORKING',
        targetSets: 1,
        sets: [
          {
            setKey: 'set-1',
            setIndex: 1,
            setType: 'WORKING',
            reps: 5,
            weight: 100,
            completed: false,
          },
        ],
      },
    ],
    version: 7,
    ...overrides,
  };
}

function currentWorkoutResponse(id = relationshipA) {
  return { data: { workout: workout(id) } };
}

function workoutMutationResponse(overrides: Record<string, unknown> = {}) {
  return { data: { workout: workout(relationshipA, overrides) } };
}

function workoutsResponse(id = relationshipA, nextCursor: string | null = null) {
  return {
    data: [workout(id, { id: 'workout-completed', status: 'COMPLETED', completedAt: '2026-01-03T08:00:00.000Z' })],
    meta: { hasMore: false, nextCursor },
  };
}

function recordsResponse(nextCursor: string | null = null) {
  return {
    data: [
      {
        id: 'record-1',
        exerciseId: 'exercise-1',
        recordType: 'MAX_WEIGHT',
        qualifierKey: '',
        value: 100,
        sourceWorkoutId: 'workout-completed',
        sourceWorkoutVersion: 7,
      },
    ],
    meta: { hasMore: false, nextCursor },
  };
}

function eventsResponse() {
  return {
    data: [
      {
        id: 'event-1',
        exerciseId: 'exercise-1',
        recordType: 'MAX_WEIGHT',
        qualifierKey: '',
        eventType: 'ACHIEVED',
        newValue: 100,
        sourceWorkoutId: 'workout-completed',
        sourceWorkoutVersion: 7,
        occurredAt: '2026-01-03T08:00:00.000Z',
      },
    ],
    meta: { hasMore: false, nextCursor: null },
  };
}

function fakeApiClient(
  response: unknown | ((options: ApiRequestOptions<never, never>) => unknown),
  calls: ApiRequestOptions<never, never>[] = [],
): ApiClient {
  return {
    async request(options) {
      calls.push(options as ApiRequestOptions<never, never>);
      return await (typeof response === 'function' ? response(options as never) : response) as never;
    },
  };
}

function trainingApi(calls: ApiRequestOptions<never, never>[] = []): ApiClient {
  return fakeApiClient((options: ApiRequestOptions<never, never>) => {
    const path = String(options.path);
    if (path.endsWith('/me/relationship')) return traineeRelationshipResponse();
    if (path.endsWith('/relationships')) return relationshipsResponse();
    if (path.endsWith('/programs')) return programsResponse();
    if (path.endsWith('/program-active/progress')) return progressResponse();
    if (path.endsWith('/workouts/current')) return currentWorkoutResponse();
    if (path.endsWith('/workouts')) return workoutsResponse(relationshipA, 'workout-completed');
    if (path.endsWith('/personal-record-events')) return eventsResponse();
    if (path.endsWith('/personal-records')) return recordsResponse('record-1');
    if (path.endsWith('/workouts/start')) return workoutMutationResponse();
    if (path.endsWith('/workout-current')) return workoutMutationResponse({ version: 8 });
    if (path.endsWith('/workout-current/complete')) {
      return workoutMutationResponse({ status: 'COMPLETED', completedAt: '2026-01-03T08:00:00.000Z' });
    }
    if (path.endsWith('/workout-completed/corrections')) {
      return workoutMutationResponse({ id: 'workout-completed', status: 'COMPLETED', version: 8 });
    }
    throw new Error(`Unhandled path ${path}`);
  }, calls);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

async function renderWithProviders(element: React.ReactElement) {
  const queryClient = createAppQueryClient();
  queryClient.setDefaultOptions({
    ...queryClient.getDefaultOptions(),
    queries: { ...queryClient.getDefaultOptions().queries, gcTime: Infinity },
    mutations: { ...queryClient.getDefaultOptions().mutations, gcTime: Infinity },
  });
  testQueryClients.add(queryClient);
  return await render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>{element}</ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('MOB-015 training Backend contract calls and guards', () => {
  it('calls exact training routes with AbortSignal, CAS body, and required idempotency keys', async () => {
    const calls: ApiRequestOptions<never, never>[] = [];
    const signal = new AbortController().signal;
    const apiClient = fakeApiClient((options: ApiRequestOptions<never, never>) => {
      const path = String(options.path);
      if (path.endsWith('/me/relationship')) return traineeRelationshipResponse();
      if (path.endsWith('/programs')) return programsResponse();
      if (path.endsWith('/program-active/progress')) return progressResponse();
      if (path.endsWith('/workouts/current')) return currentWorkoutResponse();
      if (path.endsWith('/workouts')) return workoutsResponse();
      if (path.endsWith('/personal-records')) return recordsResponse();
      if (path.endsWith('/personal-record-events')) return eventsResponse();
      return workoutMutationResponse();
    }, calls);

    await fetchCurrentTraineeRelationship({ apiClient, workspaceId, signal });
    await fetchTrainingPrograms({ apiClient, workspaceId, relationshipId: relationshipA, signal });
    await fetchProgramProgress({ apiClient, workspaceId, relationshipId: relationshipA, programId: 'program-active', signal });
    await fetchCurrentWorkout({ apiClient, workspaceId, relationshipId: relationshipA, signal });
    await fetchWorkouts({ apiClient, workspaceId, relationshipId: relationshipA, signal });
    await fetchPersonalRecords({ apiClient, workspaceId, relationshipId: relationshipA, signal });
    await fetchPersonalRecordEvents({ apiClient, workspaceId, relationshipId: relationshipA, signal });
    await startWorkout({ apiClient, workspaceId, relationshipId: relationshipA, idempotencyKey: 'start-key' as never });
    await patchWorkout({
      apiClient,
      workspaceId,
      relationshipId: relationshipA,
      workoutId: 'workout-current',
      body: { expectedVersion: 7, exercises: [], clientMutationId: 'client-1' },
    });
    await completeWorkout({
      apiClient,
      workspaceId,
      relationshipId: relationshipA,
      workoutId: 'workout-current',
      body: { expectedVersion: 7 },
      idempotencyKey: 'complete-key' as never,
    });

    expect(calls.map((call) => [call.method, call.path])).toEqual([
      ['GET', '/workspaces/workspace-1/me/relationship'],
      ['GET', '/workspaces/workspace-1/relationships/relationship-a/programs'],
      ['GET', '/workspaces/workspace-1/relationships/relationship-a/programs/program-active/progress'],
      ['GET', '/workspaces/workspace-1/relationships/relationship-a/workouts/current'],
      ['GET', '/workspaces/workspace-1/relationships/relationship-a/workouts'],
      ['GET', '/workspaces/workspace-1/relationships/relationship-a/personal-records'],
      ['GET', '/workspaces/workspace-1/relationships/relationship-a/personal-record-events'],
      ['POST', '/workspaces/workspace-1/relationships/relationship-a/workouts/start'],
      ['PATCH', '/workspaces/workspace-1/relationships/relationship-a/workouts/workout-current'],
      ['POST', '/workspaces/workspace-1/relationships/relationship-a/workouts/workout-current/complete'],
    ]);
    expect(calls[0]?.query).toBeUndefined();
    expect(calls[0]?.body).toBeUndefined();
    expect(calls[1]?.query).toEqual({ limit: 10, includeArchived: false });
    expect(calls[7]?.idempotencyKey).toBe('start-key');
    expect(calls[8]?.body).toMatchObject({ expectedVersion: 7, clientMutationId: 'client-1' });
    expect(calls[9]?.idempotencyKey).toBe('complete-key');
    expect(calls.every((call) => call.signal === signal || call.method !== 'GET')).toBe(true);
  });

  it('rejects malformed or mismatched training identities before rendering target data', () => {
    expect(parseCurrentTraineeRelationship(traineeRelationshipResponse(), { workspaceId })).toEqual({
      id: relationshipA,
      workspaceId,
      status: 'ACTIVE',
      version: 2,
    });
    expect(parseCurrentTraineeRelationship(traineeRelationshipNullResponse(), { workspaceId })).toBeNull();
    expect(
      parseCurrentTraineeRelationship(traineeRelationshipResponse({ workspaceId: workspaceB }), { workspaceId }),
    ).toBeUndefined();
    expect(
      parseCurrentTraineeRelationship(traineeRelationshipResponse({ status: 'PAUSED' }), { workspaceId }),
    ).toBeUndefined();
    expect(
      parseTrainingPrograms(programsResponse(relationshipA), {
        workspaceId: workspaceB,
        relationshipId: relationshipA,
      }),
    ).toBeNull();
    expect(parseCurrentWorkout({ data: { workout: workout(relationshipB) } }, { workspaceId, relationshipId: relationshipA }))
      .toBeUndefined();
    expect(
      parseTrainingPrograms(
        { data: [{ ...programsResponse().data[0], status: 'UNKNOWN' }], meta: { nextCursor: null } },
        { workspaceId, relationshipId: relationshipA },
      ),
    ).toBeNull();
  });

  it('uses credential-free generation/workspace/membership/persona/relationship query keys', () => {
    const context = readyContext('TRAINER');

    expect(trainingRelationshipDiscoveryKey(context)).toEqual([
      protectedQueryScope,
      15,
      'training',
      'relationship-discovery',
      workspaceId,
      membershipId,
      'TRAINER',
    ]);
    expect(traineeRelationshipKey(readyContext('TRAINEE'))).toEqual([
      protectedQueryScope,
      15,
      'training',
      'trainee-relationship',
      workspaceId,
      membershipId,
      'TRAINEE',
    ]);
    expect(trainingProgramsKey(context, relationshipA)).toEqual([
      protectedQueryScope,
      15,
      'training',
      workspaceId,
      membershipId,
      'TRAINER',
      relationshipA,
      'programs',
      { limit: 10 },
    ]);
    expect(trainingProgramProgressKey(context, relationshipA, 'program-active')).toContain('program-active');
    expect(currentWorkoutKey(context, relationshipA)).toContain('current-workout');
    expect(workoutsKey(context, relationshipA)).toContain('workouts');
    expect(personalRecordsKey(context, relationshipA)).toContain('personal-records');
    expect(personalRecordEventsKey(context, relationshipA)).toContain('personal-record-events');
    expect(JSON.stringify(trainingProgramsKey(context, relationshipA))).not.toMatch(
      /accessToken|refreshToken|authorization/i,
    );
  });
});

describe('MOB-015 training UI', () => {
  it('discovers Trainee relationship through Route B without using staff relationship discovery in RTL', async () => {
    const calls: ApiRequestOptions<never, never>[] = [];
    const screen = await renderWithProviders(
      <TrainingExperienceScreen
        apiClient={trainingApi(calls)}
        context={readyContext('TRAINEE')}
        direction="rtl"
        t={(key) => translate('ar', key)}
      />,
    );

    expect(screen.getByTestId('training-experience-screen').props.style).toMatchObject({
      direction: 'rtl',
    });
    await waitFor(() => {
      expect(screen.getByTestId('training-relationship-detail')).toBeTruthy();
    });
    expect(screen.queryByText('No visible relationships.')).toBeNull();
    expect(screen.queryByText('Training needs a verified coaching relationship before workouts can be loaded.'))
      .toBeNull();
    expect(calls[0]?.path).toBe('/workspaces/workspace-1/me/relationship');
    expect(calls[0]?.query).toBeUndefined();
    expect(calls[0]?.body).toBeUndefined();
    expect(calls.some((call) => call.path === '/workspaces/workspace-1/relationships')).toBe(false);
    expect(calls.some((call) => String(call.path).includes('/relationships/relationship-a/'))).toBe(true);
  });

  it('treats relationship:null as an empty Trainee state without exposing workout mutations', async () => {
    const calls: ApiRequestOptions<never, never>[] = [];
    const apiClient = fakeApiClient((options: ApiRequestOptions<never, never>) => {
      const path = String(options.path);
      if (path.endsWith('/me/relationship')) return traineeRelationshipNullResponse();
      throw new Error(`Unexpected trainee target query ${path}`);
    }, calls);

    const screen = await renderWithProviders(
      <TrainingExperienceScreen
        apiClient={apiClient}
        context={readyContext('TRAINEE')}
        direction="ltr"
        t={(key) => translate('en', key)}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('training-trainee-no-relationship')).toBeTruthy();
    });
    expect(screen.queryByText('Start workout')).toBeNull();
    expect(calls.map((call) => call.path)).toEqual(['/workspaces/workspace-1/me/relationship']);
  });

  it('renders staff training from selected Backend relationship data without presenting previews as complete history', async () => {
    const screen = await renderWithProviders(
      <TrainingExperienceScreen
        apiClient={trainingApi()}
        context={readyContext('TRAINER')}
        direction="ltr"
        t={(key) => translate('en', key)}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('training-relationship-list')).toBeTruthy();
    });
    await fireEvent.press(screen.getByRole('button', { name: /relationship-a/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /relationship-a/i }).props.accessibilityState)
        .toMatchObject({ selected: true });
    });

    await waitFor(() => {
      expect(screen.getByTestId('training-relationship-detail')).toBeTruthy();
      expect(screen.getByText('Strength base')).toBeTruthy();
      expect(screen.getByText('More workouts may be available.')).toBeTruthy();
      expect(screen.getByText('More personal records may be available.')).toBeTruthy();
    });
    expect(screen.queryByText(/complete history|all workouts|all personal records/i)).toBeNull();
  });

  it('patches user-edited set values without completing the workout', async () => {
    const calls: ApiRequestOptions<never, never>[] = [];
    const screen = await renderWithProviders(
      <TrainingExperienceScreen
        apiClient={trainingApi(calls)}
        context={readyContext('ASSISTANT_TRAINER')}
        direction="ltr"
        t={(key) => translate('en', key)}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('training-relationship-list')).toBeTruthy();
    });
    await fireEvent.press(screen.getByRole('button', { name: /relationship-a/i }));
    await waitFor(() => {
      expect(screen.getByText('Save set')).toBeTruthy();
    });

    await fireEvent.changeText(screen.getByLabelText('Reps'), '8');
    await fireEvent.changeText(screen.getByLabelText('Weight'), '112.5');
    await fireEvent.changeText(screen.getByLabelText('Set notes'), 'Felt controlled');
    await fireEvent.press(screen.getByRole('checkbox', { name: /set completed/i }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save set' }));
    await waitFor(() => {
      expect(calls.some((call) => call.method === 'PATCH')).toBe(true);
    });
    const patchCall = calls.find((call) => call.method === 'PATCH');
    expect(patchCall?.body).toEqual({
      expectedVersion: 7,
      exercises: [
        {
          workoutExerciseKey: 'workout-exercise-1',
          sets: [
            {
              setKey: 'set-1',
              reps: 8,
              weight: 112.5,
              completed: true,
              notes: 'Felt controlled',
            },
          ],
        },
      ],
      clientMutationId:
        'mob015:patch-first-set:15:workspace-1:relationship-a:workout-current:7',
    });
    expect(calls.find((call) => String(call.path).endsWith('/workout-current/complete'))).toBeUndefined();

    await fireEvent.press(screen.getByRole('button', { name: 'Complete workout' }));
    await waitFor(() => {
      const completeCall = calls.find((call) =>
        String(call.path).endsWith('/workout-current/complete'),
      );
      expect(completeCall?.body).toEqual({ expectedVersion: 7 });
      expect(completeCall?.idempotencyKey).toMatch(/^mob015:complete:/);
    });
  });

  it('does not expose staff correction UX to Trainee self context', async () => {
    const screen = await renderWithProviders(
      <TrainingExperienceScreen
        apiClient={trainingApi()}
        context={readyContext('TRAINEE')}
        direction="ltr"
        t={(key) => translate('en', key)}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Strength base')).toBeTruthy();
    });
    expect(screen.queryByLabelText('Correction reason')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Submit correction' })).toBeNull();
  });

  it('submits only a user-entered correction reason without fabricating semantic data', async () => {
    const calls: ApiRequestOptions<never, never>[] = [];
    const screen = await renderWithProviders(
      <TrainingExperienceScreen
        apiClient={trainingApi(calls)}
        context={readyContext('TRAINER')}
        direction="ltr"
        t={(key) => translate('en', key)}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('training-relationship-list')).toBeTruthy();
    });
    await fireEvent.press(screen.getByRole('button', { name: /relationship-a/i }));
    await waitFor(() => {
      expect(screen.getByText('Submit correction')).toBeTruthy();
    });

    expect(screen.getByRole('button', { name: 'Submit correction' }).props.accessibilityState)
      .toMatchObject({ disabled: true });
    await fireEvent.changeText(screen.getByLabelText('Correction reason'), 'Reviewed video and fixed reps');
    await fireEvent.press(screen.getByRole('button', { name: 'Submit correction' }));

    await waitFor(() => {
      const correctionCall = calls.find((call) => String(call.path).endsWith('/workout-completed/corrections'));
      expect(correctionCall?.body).toMatchObject({
        expectedVersion: 7,
        reason: 'Reviewed video and fixed reps',
      });
      expect(JSON.stringify(correctionCall?.body)).not.toMatch(/Mobile trainer review correction|updated from app/i);
      expect(correctionCall?.idempotencyKey).toMatch(/^mob015:correct:/);
    });
  });

  it('uses payload-aware correction keys when the reason changes after failure', async () => {
    const calls: ApiRequestOptions<never, never>[] = [];
    const apiClient = fakeApiClient((options: ApiRequestOptions<never, never>) => {
      const path = String(options.path);
      if (path.endsWith('/relationships')) return relationshipsResponse();
      if (path.endsWith('/programs')) return programsResponse();
      if (path.endsWith('/program-active/progress')) return progressResponse();
      if (path.endsWith('/workouts/current')) return currentWorkoutResponse();
      if (path.endsWith('/workouts')) return workoutsResponse(relationshipA, 'workout-completed');
      if (path.endsWith('/personal-record-events')) return eventsResponse();
      if (path.endsWith('/personal-records')) return recordsResponse();
      if (path.endsWith('/workout-completed/corrections')) {
        throw createBackendError(503, {
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Temporary failure' },
        });
      }
      throw new Error(`Unhandled path ${path}`);
    }, calls);
    const screen = await renderWithProviders(
      <TrainingExperienceScreen
        apiClient={apiClient}
        context={readyContext('TRAINER')}
        direction="ltr"
        t={(key) => translate('en', key)}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('training-relationship-list')).toBeTruthy();
    });
    await fireEvent.press(screen.getByRole('button', { name: /relationship-a/i }));
    await waitFor(() => {
      expect(screen.getByText('Submit correction')).toBeTruthy();
    });

    await fireEvent.changeText(screen.getByLabelText('Correction reason'), 'Reason A');
    await fireEvent.press(screen.getByRole('button', { name: 'Submit correction' }));
    await waitFor(() => {
      expect(calls.filter((call) => String(call.path).endsWith('/workout-completed/corrections')))
        .toHaveLength(1);
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Submit correction' }).props.accessibilityState)
        .toMatchObject({ disabled: false });
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Submit correction' }));
    await waitFor(() => {
      expect(calls.filter((call) => String(call.path).endsWith('/workout-completed/corrections')))
        .toHaveLength(2);
    });
    await fireEvent.changeText(screen.getByLabelText('Correction reason'), 'Reason B');
    await fireEvent.press(screen.getByRole('button', { name: 'Submit correction' }));

    await waitFor(() => {
      const correctionCalls = calls.filter((call) =>
        String(call.path).endsWith('/workout-completed/corrections'),
      );
      expect(correctionCalls).toHaveLength(3);
      expect(correctionCalls[0]?.idempotencyKey).toBe(correctionCalls[1]?.idempotencyKey);
      expect(correctionCalls[2]?.idempotencyKey).not.toBe(correctionCalls[0]?.idempotencyKey);
      expect(correctionCalls[2]?.body).toMatchObject({ reason: 'Reason B' });
    });
  });

  it('keeps the same idempotency key across a failed retry for the same logical command', async () => {
    const calls: ApiRequestOptions<never, never>[] = [];
    let startAttempts = 0;
    const apiClient = fakeApiClient((options: ApiRequestOptions<never, never>) => {
      const path = String(options.path);
      if (path.endsWith('/relationships')) return relationshipsResponse();
      if (path.endsWith('/programs')) return programsResponse();
      if (path.endsWith('/program-active/progress')) return progressResponse();
      if (path.endsWith('/workouts/current')) return { data: { workout: null } };
      if (path.endsWith('/workouts')) return workoutsResponse();
      if (path.endsWith('/personal-record-events')) return eventsResponse();
      if (path.endsWith('/personal-records')) return recordsResponse();
      if (path.endsWith('/workouts/start')) {
        startAttempts += 1;
        if (startAttempts === 1) {
          throw createBackendError(503, {
            error: { code: 'SERVICE_UNAVAILABLE', message: 'Temporary failure' },
          });
        }
        return workoutMutationResponse();
      }
      throw new Error(`Unhandled path ${path}`);
    }, calls);

    const screen = await renderWithProviders(
      <TrainingExperienceScreen
        apiClient={apiClient}
        context={readyContext('TRAINER')}
        direction="ltr"
        t={(key) => translate('en', key)}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('training-relationship-list')).toBeTruthy();
    });
    await fireEvent.press(screen.getByRole('button', { name: /relationship-a/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Start workout' }).props.accessibilityState)
        .toMatchObject({ disabled: false });
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Start workout' }));
    await waitFor(() => {
      expect(calls.filter((call) => String(call.path).endsWith('/workouts/start'))).toHaveLength(1);
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Start workout' }).props.accessibilityState)
        .toMatchObject({ disabled: false });
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Start workout' }));

    await waitFor(() => {
      const startCalls = calls.filter((call) => String(call.path).endsWith('/workouts/start'));
      expect(startCalls).toHaveLength(2);
      expect(startCalls[0]?.idempotencyKey).toBe(startCalls[1]?.idempotencyKey);
      expect(startCalls[0]?.idempotencyKey).not.toMatch(/\d{12,}$/);
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Start workout' }).props.accessibilityState)
        .toMatchObject({ disabled: false });
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Start workout' }));
    await waitFor(() => {
      const startCalls = calls.filter((call) => String(call.path).endsWith('/workouts/start'));
      expect(startCalls).toHaveLength(3);
      expect(startCalls[2]?.idempotencyKey).not.toBe(startCalls[0]?.idempotencyKey);
    });
  });

  it('coalesces rapid duplicate command invocations while the logical command is pending', async () => {
    const calls: ApiRequestOptions<never, never>[] = [];
    const start = deferred<unknown>();
    const apiClient = fakeApiClient((options: ApiRequestOptions<never, never>) => {
      const path = String(options.path);
      if (path.endsWith('/relationships')) return relationshipsResponse();
      if (path.endsWith('/programs')) return programsResponse();
      if (path.endsWith('/program-active/progress')) return progressResponse();
      if (path.endsWith('/workouts/current')) return { data: { workout: null } };
      if (path.endsWith('/workouts')) return workoutsResponse();
      if (path.endsWith('/personal-record-events')) return eventsResponse();
      if (path.endsWith('/personal-records')) return recordsResponse();
      if (path.endsWith('/workouts/start')) return start.promise;
      throw new Error(`Unhandled path ${path}`);
    }, calls);

    const screen = await renderWithProviders(
      <TrainingExperienceScreen
        apiClient={apiClient}
        context={readyContext('TRAINER')}
        direction="ltr"
        t={(key) => translate('en', key)}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('training-relationship-list')).toBeTruthy();
    });
    await fireEvent.press(screen.getByRole('button', { name: /relationship-a/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Start workout' }).props.accessibilityState)
        .toMatchObject({ disabled: false });
    });

    const button = screen.getByRole('button', { name: 'Start workout' });
    await fireEvent.press(button);
    await fireEvent.press(button);

    await waitFor(() => {
      expect(calls.filter((call) => String(call.path).endsWith('/workouts/start'))).toHaveLength(1);
    });
    start.resolve(workoutMutationResponse());
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Start workout' }).props.accessibilityState)
        .toMatchObject({ disabled: false });
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Start workout' }));
    await waitFor(() => {
      const startCalls = calls.filter((call) => String(call.path).endsWith('/workouts/start'));
      expect(startCalls).toHaveLength(2);
      expect(startCalls[1]?.idempotencyKey).not.toBe(startCalls[0]?.idempotencyKey);
    });
  });

  it('shows 403 as unavailable training without logout or local bypass', async () => {
    const apiClient: ApiClient = {
      async request(options) {
        if (String(options.path).endsWith('/relationships')) return relationshipsResponse() as never;
        throw createBackendError(403, {
          error: { code: 'PERMISSION_DENIED', message: 'Forbidden' },
        });
      },
    };
    const screen = await renderWithProviders(
      <TrainingExperienceScreen
        apiClient={apiClient}
        context={readyContext('TRAINER')}
        direction="ltr"
        t={(key) => translate('en', key)}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('training-relationship-list')).toBeTruthy();
    });
    await fireEvent.press(screen.getByRole('button', { name: /relationship-a/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(screen.getByText('Training is unavailable.')).toBeTruthy();
    });
  });

  it('keeps late relationship A training data from rendering under relationship B', async () => {
    const lateA = deferred<unknown>();
    const apiClient = fakeApiClient((options: ApiRequestOptions<never, never>) => {
      const path = String(options.path);
      if (path.endsWith('/relationships')) {
        return relationshipsResponse([relationship(relationshipA), relationship(relationshipB)]);
      }
      if (path.includes('/relationship-a/') && path.endsWith('/programs')) return lateA.promise;
      const id = path.includes('/relationship-b/') ? relationshipB : relationshipA;
      if (path.endsWith('/programs')) return programsResponse(id);
      if (path.endsWith('/program-active/progress')) return progressResponse();
      if (path.endsWith('/workouts/current')) return { data: { workout: null } };
      if (path.endsWith('/workouts')) return workoutsResponse(id);
      if (path.endsWith('/personal-record-events')) return eventsResponse();
      if (path.endsWith('/personal-records')) return recordsResponse();
      throw new Error(`Unhandled path ${path}`);
    });

    const screen = await renderWithProviders(
      <TrainingExperienceScreen
        apiClient={apiClient}
        context={readyContext('TRAINER')}
        direction="ltr"
        t={(key) => translate('en', key)}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('training-relationship-list')).toBeTruthy();
    });
    await fireEvent.press(screen.getByRole('button', { name: /relationship-a/i }));
    await fireEvent.press(screen.getByRole('button', { name: /relationship-b/i }));

    await waitFor(() => {
      expect(screen.getByText('Hypertrophy base')).toBeTruthy();
    });
    lateA.resolve(programsResponse(relationshipA));

    await waitFor(() => {
      expect(screen.getByText('Hypertrophy base')).toBeTruthy();
      expect(screen.queryByText('Strength base')).toBeNull();
    });
  });

  it('keeps retry command identity across unmount and remount for the same logical command', async () => {
    const calls: ApiRequestOptions<never, never>[] = [];
    let startAttempts = 0;
    const apiClient = fakeApiClient((options: ApiRequestOptions<never, never>) => {
      const path = String(options.path);
      if (path.endsWith('/me/relationship')) return traineeRelationshipResponse();
      if (path.endsWith('/programs')) return programsResponse();
      if (path.endsWith('/program-active/progress')) return progressResponse();
      if (path.endsWith('/workouts/current')) return { data: { workout: null } };
      if (path.endsWith('/workouts')) return workoutsResponse();
      if (path.endsWith('/personal-record-events')) return eventsResponse();
      if (path.endsWith('/personal-records')) return recordsResponse();
      if (path.endsWith('/workouts/start')) {
        startAttempts += 1;
        if (startAttempts === 1) {
          throw createBackendError(503, {
            error: { code: 'SERVICE_UNAVAILABLE', message: 'Temporary failure' },
          });
        }
        return workoutMutationResponse();
      }
      throw new Error(`Unhandled path ${path}`);
    }, calls);

    const firstScreen = await renderWithProviders(
      <TrainingExperienceScreen
        apiClient={apiClient}
        context={readyContext('TRAINEE')}
        direction="ltr"
        t={(key) => translate('en', key)}
      />,
    );
    await waitFor(() => {
      expect(firstScreen.getByRole('button', { name: 'Start workout' }).props.accessibilityState)
        .toMatchObject({ disabled: false });
    });
    await fireEvent.press(firstScreen.getByRole('button', { name: 'Start workout' }));
    await waitFor(() => {
      expect(calls.filter((call) => String(call.path).endsWith('/workouts/start'))).toHaveLength(1);
    });
    const firstKey = calls.find((call) => String(call.path).endsWith('/workouts/start'))?.idempotencyKey;
    firstScreen.unmount();

    const secondScreen = await renderWithProviders(
      <TrainingExperienceScreen
        apiClient={apiClient}
        context={readyContext('TRAINEE')}
        direction="ltr"
        t={(key) => translate('en', key)}
      />,
    );
    await waitFor(() => {
      expect(secondScreen.getByRole('button', { name: 'Start workout' }).props.accessibilityState)
        .toMatchObject({ disabled: false });
    });
    await fireEvent.press(secondScreen.getByRole('button', { name: 'Start workout' }));

    await waitFor(() => {
      const startCalls = calls.filter((call) => String(call.path).endsWith('/workouts/start'));
      expect(startCalls).toHaveLength(2);
      expect(startCalls[1]?.idempotencyKey).toBe(firstKey);
    });
  });

});
