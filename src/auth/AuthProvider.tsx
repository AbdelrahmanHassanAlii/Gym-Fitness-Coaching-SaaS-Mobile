import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import {
  createAuthSessionController,
  type AuthSessionController,
  type AuthState,
  type CompleteMfaLoginInput,
  type LoginInput,
} from './session';

interface AuthContextValue {
  state: AuthState;
  controller: AuthSessionController;
  login: (input: LoginInput) => Promise<AuthState>;
  completeMfaLogin: (input: CompleteMfaLoginInput) => Promise<AuthState>;
  logout: () => Promise<AuthState>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps extends PropsWithChildren {
  controller?: AuthSessionController;
}

export function AuthProvider({ children, controller }: AuthProviderProps) {
  const ownsController = !controller;
  const sessionController = useMemo(
    () => controller ?? createAuthSessionController(),
    [controller],
  );
  const [state, setState] = useState<AuthState>(() => sessionController.getState());

  useEffect(() => sessionController.subscribe(setState), [sessionController]);

  useEffect(() => {
    void sessionController.initialize().catch(() => undefined);
  }, [sessionController]);

  useEffect(
    () => () => {
      if (ownsController) sessionController.dispose();
    },
    [ownsController, sessionController],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      controller: sessionController,
      login: (input) => sessionController.login(input),
      completeMfaLogin: (input) => sessionController.completeMfaLogin(input),
      logout: () => sessionController.logout(),
    }),
    [sessionController, state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthSession(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuthSession must be used within AuthProvider.');
  return value;
}
