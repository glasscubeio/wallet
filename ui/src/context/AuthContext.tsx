import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { authApi } from "@/lib/api";
import type { User, WalletSummary } from "@/types/api";

interface AuthContextValue {
  user: User | null;
  wallet: WalletSummary | null;
  loading: boolean;
  login: (credentials: { identifier: string; password: string }) => Promise<User>;
  register: (details: {
    username: string;
    email: string;
    password: string;
  }) => Promise<User>;
  logout: () => Promise<void>;
  refresh: (signal?: AbortSignal) => Promise<User | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  // `loading` gates the first render only, so routes never flash the login
  // screen before we know whether the cookie is valid.
  const [loading, setLoading] = useState(true);

  const loadSession = useCallback(async (signal?: AbortSignal): Promise<User | null> => {
    try {
      const data = await authApi.me(signal ? { signal } : undefined);
      setUser(data.user);
      setWallet(data.wallet);
      return data.user;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return null;
      setUser(null);
      setWallet(null);
      return null;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadSession(controller.signal).finally(() => setLoading(false));
    return () => controller.abort();
  }, [loadSession]);

  const login = useCallback<AuthContextValue["login"]>(
    async (credentials) => {
      const data = await authApi.login(credentials);
      setUser(data.user);
      // Login doesn't return the wallet; fetch it so the dashboard has it ready.
      await loadSession();
      return data.user;
    },
    [loadSession],
  );

  const register = useCallback<AuthContextValue["register"]>(async (details) => {
    const data = await authApi.register(details);
    setUser(data.user);
    setWallet(data.wallet);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      setWallet(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, wallet, loading, login, register, logout, refresh: loadSession }),
    [user, wallet, loading, login, register, logout, loadSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
