import type { QueryClient } from '@tanstack/react-query';

import {
  ApiClientError,
  createApiClient,
  isApiClientError,
  type ApiClient,
  type ApiCredentials,
} from '@/api';
import {
  hasNativeRefreshToken,
  isMfaRequiredData,
  mobileAuthClientType,
  type AuthTokenResponseDto,
  type LoginRequestDto,
  type LoginResponseDto,
  type MfaFactorType,
  type MfaLoginVerifyRequestDto,
  type MfaRequiredDataDto,
  type RefreshRequestDto,
  type SafeUserDto,
} from '@/contracts';
import {
  appQueryClient,
  clearProtectedQueryCache,
  isProtectedQuery,
  protectedQueryScope,
} from '@/query';
import {
  secureStorage,
  sensitiveStorageKeys,
  type SensitiveValueStore,
} from '@/storage';

export type AuthStatus =
  | 'initializing'
  | 'unauthenticated'
  | 'authenticated'
  | 'mfa_required'
  | 'security_failure';

export interface AuthenticatedSession {
  user: SafeUserDto | null;
  restrictedUntilVerified: boolean;
  generation: number;
}

export interface AuthState {
  status: AuthStatus;
  session?: AuthenticatedSession;
  mfa?: MfaRequiredDataDto;
  error?: AuthSessionError;
}

export type AuthSessionErrorReason =
  | 'secure_storage_read_failed'
  | 'secure_storage_write_failed'
  | 'secure_storage_delete_failed'
  | 'login_failed'
  | 'bootstrap_refresh_failed'
  | 'logout_server_failed'
  | 'stale_credential_result';

export class AuthSessionError extends Error {
  readonly reason: AuthSessionErrorReason;
  override readonly cause?: unknown;

  constructor(reason: AuthSessionErrorReason, message: string, cause?: unknown) {
    super(message);
    this.name = 'AuthSessionError';
    this.reason = reason;
    this.cause = cause;
  }
}

export interface LoginInput {
  identifier: string;
  password: string;
}

export interface CompleteMfaLoginInput {
  mfaChallengeToken: string;
  factorType: MfaFactorType;
  credential: string;
}

export interface AuthSessionControllerOptions {
  apiClient?: ApiClient;
  credentialStore?: SensitiveValueStore;
  queryClient?: QueryClient;
}

type Listener = (state: AuthState) => void;
type CredentialMutation<T> = () => Promise<T>;

const unauthenticatedState: AuthState = { status: 'unauthenticated' };

export class AuthSessionController {
  private apiClient?: ApiClient;
  private readonly credentialStore: SensitiveValueStore;
  private readonly queryClient: QueryClient;
  private readonly listeners = new Set<Listener>();
  private credentialMutationQueue: Promise<unknown> = Promise.resolve();
  private state: AuthState = { status: 'initializing' };
  private accessToken: string | null = null;
  private currentRefreshToken: string | null = null;
  private pendingRefreshToken: string | null = null;
  private generation = 0;
  private refreshCallbackGeneration: number | null = null;
  private bootstrapPromise: Promise<void> | null = null;
  private credentialStorageUncertain = false;
  private readonly unsubscribeQueryCache: () => void;

  constructor({
    apiClient,
    credentialStore = secureStorage,
    queryClient = appQueryClient,
  }: AuthSessionControllerOptions = {}) {
    this.credentialStore = credentialStore;
    this.queryClient = queryClient;
    this.apiClient = apiClient;
    this.unsubscribeQueryCache = this.queryClient.getQueryCache().subscribe(() => {
      this.removeStaleProtectedQueries();
    });
  }

  readonly authSeam = {
    getAccessToken: () => this.accessToken,
    getRefreshToken: () => {
      if (this.currentRefreshToken) {
        this.refreshCallbackGeneration = this.generation;
      }
      return this.currentRefreshToken;
    },
    onCredentialsRefreshed: async (credentials: ApiCredentials) => {
      await this.handleCredentialsRefreshed(credentials);
    },
    onSessionExpired: async (error: ApiClientError) => {
      await this.handleTerminalSessionFailure(error);
    },
  };

  getState(): AuthState {
    return this.state;
  }

  getCurrentGeneration(): number {
    return this.generation;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async initialize(): Promise<void> {
    this.bootstrapPromise ??= this.bootstrap();
    return await this.bootstrapPromise;
  }

  async login(input: LoginInput): Promise<AuthState> {
    const generation = this.startNewGeneration({ clearCache: true });
    this.setState({ status: 'initializing' });

    try {
      const response = await this.getApiClient().request<LoginResponseDto, undefined, LoginRequestDto>({
        method: 'POST',
        path: '/auth/login',
        body: {
          identifier: input.identifier,
          password: input.password,
          clientType: mobileAuthClientType,
        },
        accessToken: null,
      });

      if (isMfaRequiredData(response.data)) {
        this.clearCredentialMemory();
        this.setState({ status: 'mfa_required', mfa: response.data });
        return this.state;
      }

      if (!hasNativeRefreshToken(response.data)) {
        throw malformedAuthResponse('Native login did not return a refresh token.');
      }

      await this.persistCredentialForGeneration(generation, response.data.refreshToken);
      this.commitAuthenticatedGeneration(generation, {
        accessToken: response.data.accessToken,
        refreshToken: response.data.refreshToken,
        user: response.data.user ?? null,
        restrictedUntilVerified: response.data.restrictedUntilVerified,
      });

      return this.state;
    } catch (error) {
      if (generation !== this.generation) {
        throw toAuthSessionError('stale_credential_result', error);
      }
      this.clearCredentialMemory();
      this.clearProtectedSessionState();
      const authError = isApiClientError(error)
        ? new AuthSessionError('login_failed', 'Login failed.', error)
        : toAuthSessionError('secure_storage_write_failed', error);
      this.setState({ status: 'security_failure', error: authError });
      throw authError;
    }
  }

  async completeMfaLogin(input: CompleteMfaLoginInput): Promise<AuthState> {
    const generation = this.startNewGeneration({ clearCache: true });
    this.setState({ status: 'initializing' });

    try {
      const response = await this.getApiClient().request<
        AuthTokenResponseDto,
        undefined,
        MfaLoginVerifyRequestDto
      >({
        method: 'POST',
        path: '/auth/mfa/login/verify',
        body: input,
        accessToken: null,
      });

      if (!hasNativeRefreshToken(response.data)) {
        throw malformedAuthResponse('Native MFA completion did not return a refresh token.');
      }

      await this.persistCredentialForGeneration(generation, response.data.refreshToken);
      this.commitAuthenticatedGeneration(generation, {
        accessToken: response.data.accessToken,
        refreshToken: response.data.refreshToken,
        user: response.data.user ?? null,
        restrictedUntilVerified: response.data.restrictedUntilVerified,
      });

      return this.state;
    } catch (error) {
      if (generation !== this.generation) {
        throw toAuthSessionError('stale_credential_result', error);
      }
      this.clearCredentialMemory();
      this.clearProtectedSessionState();
      const authError = isApiClientError(error)
        ? new AuthSessionError('login_failed', 'MFA login failed.', error)
        : toAuthSessionError('secure_storage_write_failed', error);
      this.setState({ status: 'security_failure', error: authError });
      throw authError;
    }
  }

  async logout(): Promise<AuthState> {
    const logoutGeneration = this.generation;
    const accessToken = this.accessToken;
    const operationGeneration = this.startNewGeneration({ clearCache: true });
    this.clearCredentialMemory();
    this.setState(unauthenticatedState);

    let serverError: unknown;
    if (accessToken) {
      try {
        await this.getApiClient().request({
          method: 'POST',
          path: '/auth/logout',
          accessToken,
        });
      } catch (error) {
        serverError = error;
      }
    }

    try {
      await this.deleteCredentialForLogout(logoutGeneration);
    } catch (error) {
      if (operationGeneration !== this.generation) {
        return this.state;
      }
      const authError = toAuthSessionError('secure_storage_delete_failed', error);
      this.setState({ status: 'security_failure', error: authError });
      throw authError;
    }

    if (serverError) {
      if (operationGeneration !== this.generation) {
        return this.state;
      }
      const authError = new AuthSessionError(
        'logout_server_failed',
        'Server logout could not be confirmed after local credential removal.',
        serverError,
      );
      this.setState({ status: 'unauthenticated', error: authError });
      return { status: 'unauthenticated', error: authError };
    }

    return unauthenticatedState;
  }

  async handleTerminalSessionFailure(error: ApiClientError): Promise<void> {
    const expiredGeneration = this.refreshCallbackGeneration ?? this.generation;
    this.refreshCallbackGeneration = null;
    if (expiredGeneration !== this.generation) return;

    this.startNewGeneration({ clearCache: true });
    this.clearCredentialMemory();
    try {
      await this.deleteCredentialForLogout(expiredGeneration);
      this.setState(unauthenticatedState);
    } catch (deleteError) {
      this.setState({
        status: 'security_failure',
        error: toAuthSessionError('secure_storage_delete_failed', deleteError),
      });
      throw deleteError;
    }

    if (error.kind === 'authentication') return;
  }

  setProtectedQueryDataIfCurrent<TData>(
    generation: number,
    queryKey: readonly unknown[],
    data: TData,
  ): boolean {
    if (generation !== this.generation || this.state.status !== 'authenticated') return false;
    this.queryClient.setQueryData(this.protectedQueryKey(generation, queryKey), data);
    return true;
  }

  protectedQueryKey(generation: number, parts: readonly unknown[]): readonly unknown[] {
    return [protectedQueryScope, generation, ...parts] as const;
  }

  dispose(): void {
    this.unsubscribeQueryCache();
  }

  private async bootstrap(): Promise<void> {
    if (this.credentialStorageUncertain) {
      const authError = new AuthSessionError(
        'secure_storage_read_failed',
        'Secure credential storage is uncertain after a previous failed mutation.',
      );
      this.setState({ status: 'security_failure', error: authError });
      throw authError;
    }

    const generation = this.startNewGeneration({ clearCache: true });
    this.setState({ status: 'initializing' });

    let storedRefreshToken: string | null;
    try {
      storedRefreshToken = await this.credentialStore.read(sensitiveStorageKeys.nativeRefreshToken);
    } catch (error) {
      const authError = toAuthSessionError('secure_storage_read_failed', error);
      this.clearCredentialMemory();
      this.setState({ status: 'security_failure', error: authError });
      throw authError;
    }

    if (!storedRefreshToken) {
      this.clearCredentialMemory();
      this.setState(unauthenticatedState);
      return;
    }

    this.currentRefreshToken = storedRefreshToken;
    try {
      const response = await this.getApiClient().request<AuthTokenResponseDto, undefined, RefreshRequestDto>({
        method: 'POST',
        path: '/auth/refresh',
        body: { clientType: mobileAuthClientType, refreshToken: storedRefreshToken },
        accessToken: null,
      });

      if (!hasNativeRefreshToken(response.data)) {
        throw malformedAuthResponse('Native bootstrap refresh did not return a rotated token.');
      }

      await this.persistCredentialForGeneration(generation, response.data.refreshToken);
      this.commitAuthenticatedGeneration(generation, {
        accessToken: response.data.accessToken,
        refreshToken: response.data.refreshToken,
        user: response.data.user ?? null,
        restrictedUntilVerified: response.data.restrictedUntilVerified,
      });
    } catch (error) {
      if (generation !== this.generation) {
        throw toAuthSessionError('stale_credential_result', error);
      }
      this.clearCredentialMemory();
      this.clearProtectedSessionState();
      const authError = isApiClientError(error)
        ? new AuthSessionError('bootstrap_refresh_failed', 'Bootstrap refresh failed.', error)
        : toAuthSessionError('secure_storage_write_failed', error);
      this.setState({ status: 'security_failure', error: authError });
      throw authError;
    }
  }

  private async handleCredentialsRefreshed(credentials: ApiCredentials): Promise<void> {
    const generation = this.refreshCallbackGeneration ?? this.generation;
    try {
      await this.persistCredentialForGeneration(generation, credentials.refreshToken);
      if (generation !== this.generation || this.state.status !== 'authenticated') {
        throw new AuthSessionError(
          'stale_credential_result',
          'Refreshed credentials belong to a stale session generation.',
        );
      }

      this.accessToken = credentials.accessToken;
      this.currentRefreshToken = credentials.refreshToken;
      this.pendingRefreshToken = null;
      this.setState({
        ...this.state,
        session: this.state.session
          ? { ...this.state.session, generation }
          : { user: null, restrictedUntilVerified: false, generation },
      });
    } finally {
      this.refreshCallbackGeneration = null;
    }
  }

  private getApiClient(): ApiClient {
    this.apiClient ??= createApiClient({ auth: this.authSeam });
    return this.apiClient;
  }

  private async persistCredentialForGeneration(
    generation: number,
    refreshToken: string,
  ): Promise<void> {
    if (generation === this.generation) {
      this.pendingRefreshToken = refreshToken;
    }

    await this.enqueueCredentialMutation(async () => {
      if (generation !== this.generation) {
        throw new AuthSessionError(
          'stale_credential_result',
          'Credential write was skipped for a stale session generation.',
        );
      }

      try {
        await this.credentialStore.write(sensitiveStorageKeys.nativeRefreshToken, refreshToken);
      } catch (error) {
        this.credentialStorageUncertain = true;
        if (generation === this.generation) {
          await this.bestEffortDeleteAfterFailedWrite();
        }
        throw toAuthSessionError('secure_storage_write_failed', error);
      }
      if (generation !== this.generation) {
        await this.repairStoredCredentialForCurrentGeneration();
        throw new AuthSessionError(
          'stale_credential_result',
          'Credential write completed after the session generation changed.',
        );
      }
      this.credentialStorageUncertain = false;
    });
  }

  private async deleteCredentialForLogout(logoutGeneration: number): Promise<void> {
    await this.enqueueCredentialMutation(async () => {
      try {
        await this.credentialStore.delete(sensitiveStorageKeys.nativeRefreshToken);
      } catch (error) {
        this.credentialStorageUncertain = true;
        const repairRefreshToken = this.currentRefreshToken ?? this.pendingRefreshToken;
        if (logoutGeneration !== this.generation && repairRefreshToken) {
          try {
            await this.credentialStore.write(
              sensitiveStorageKeys.nativeRefreshToken,
              repairRefreshToken,
            );
            this.credentialStorageUncertain = false;
            return;
          } catch {
            // Preserve the original delete failure; storage state is uncertain.
          }
        }
        throw toAuthSessionError('secure_storage_delete_failed', error);
      }
      const repairRefreshToken = this.currentRefreshToken ?? this.pendingRefreshToken;
      if (logoutGeneration !== this.generation && repairRefreshToken) {
        await this.credentialStore.write(
          sensitiveStorageKeys.nativeRefreshToken,
          repairRefreshToken,
        );
      }
      this.credentialStorageUncertain = false;
    });
  }

  private async bestEffortDeleteAfterFailedWrite(): Promise<void> {
    try {
      await this.credentialStore.delete(sensitiveStorageKeys.nativeRefreshToken);
    } catch {
      // The security_failure state reports storage uncertainty to callers.
    }
  }

  private async repairStoredCredentialForCurrentGeneration(): Promise<void> {
    if (this.currentRefreshToken) {
      await this.credentialStore.write(
        sensitiveStorageKeys.nativeRefreshToken,
        this.currentRefreshToken,
      );
      this.credentialStorageUncertain = false;
      return;
    }

    await this.credentialStore.delete(sensitiveStorageKeys.nativeRefreshToken);
    this.credentialStorageUncertain = false;
  }

  private async enqueueCredentialMutation<T>(mutation: CredentialMutation<T>): Promise<T> {
    const next = this.credentialMutationQueue.then(mutation, mutation);
    this.credentialMutationQueue = next.catch(() => undefined);
    return await next;
  }

  private startNewGeneration({ clearCache }: { clearCache: boolean }): number {
    this.generation += 1;
    this.accessToken = null;
    this.currentRefreshToken = null;
    this.pendingRefreshToken = null;
    if (clearCache) this.clearProtectedSessionState();
    return this.generation;
  }

  private clearProtectedSessionState(): void {
    void this.queryClient.cancelQueries({ predicate: isProtectedQuery });
    clearProtectedQueryCache(this.queryClient);
  }

  private removeStaleProtectedQueries(): void {
    const staleQueries = this.queryClient.getQueryCache().findAll({
      predicate: (query) => {
        const queryKey = query.queryKey;
        if (queryKey[0] !== protectedQueryScope) return false;
        return this.state.status !== 'authenticated' || queryKey[1] !== this.generation;
      },
    });

    for (const query of staleQueries) {
      this.queryClient.removeQueries({ queryKey: query.queryKey, exact: true });
    }
  }

  private commitAuthenticatedGeneration(
    generation: number,
    credentials: ApiCredentials & {
      user: SafeUserDto | null;
      restrictedUntilVerified: boolean;
    },
  ): void {
    if (generation !== this.generation) {
      throw new AuthSessionError(
        'stale_credential_result',
        'Authenticated result belongs to a stale session generation.',
      );
    }

    this.accessToken = credentials.accessToken;
    this.currentRefreshToken = credentials.refreshToken;
    this.pendingRefreshToken = null;
    this.setState({
      status: 'authenticated',
      session: {
        user: credentials.user,
        restrictedUntilVerified: credentials.restrictedUntilVerified,
        generation,
      },
    });
  }

  private clearCredentialMemory(): void {
    this.accessToken = null;
    this.currentRefreshToken = null;
    this.pendingRefreshToken = null;
  }

  private setState(state: AuthState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}

export function createAuthSessionController(options?: AuthSessionControllerOptions) {
  return new AuthSessionController(options);
}

function malformedAuthResponse(message: string): ApiClientError {
  return new ApiClientError({
    kind: 'malformed_response',
    source: 'transport',
    message,
  });
}

function toAuthSessionError(reason: AuthSessionErrorReason, error: unknown): AuthSessionError {
  if (error instanceof AuthSessionError) return error;
  return new AuthSessionError(reason, messageForReason(reason), error);
}

function messageForReason(reason: AuthSessionErrorReason): string {
  switch (reason) {
    case 'secure_storage_read_failed':
      return 'Secure credential storage could not be read.';
    case 'secure_storage_write_failed':
      return 'Secure credential storage could not be updated.';
    case 'secure_storage_delete_failed':
      return 'Secure credential storage could not be cleared.';
    case 'logout_server_failed':
      return 'Server logout could not be confirmed.';
    case 'stale_credential_result':
      return 'A stale credential result was ignored.';
    case 'bootstrap_refresh_failed':
      return 'Stored credentials could not restore a session.';
    case 'login_failed':
      return 'Login failed.';
  }
}
