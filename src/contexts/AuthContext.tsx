import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { apiGet, apiPost } from '../lib/api';

export interface User {
  id: string;
  username: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, rememberMe: boolean) => Promise<void>;
  signup: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, check for existing token and validate it
  useEffect(() => {
    const token =
      localStorage.getItem('auth_token') ?? sessionStorage.getItem('auth_token');

    if (!token) {
      setLoading(false);
      return;
    }

    apiGet<User>('/auth/me')
      .then((u) => setUser(u))
      .catch(() => {
        // Token is invalid – clear it
        localStorage.removeItem('auth_token');
        sessionStorage.removeItem('auth_token');
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string, rememberMe: boolean) {
    const { token, user: u } = await apiPost<{ token: string; user: User }>(
      '/auth/login',
      { email, password },
    );

    if (rememberMe) {
      localStorage.setItem('auth_token', token);
      sessionStorage.removeItem('auth_token');
    } else {
      sessionStorage.setItem('auth_token', token);
      localStorage.removeItem('auth_token');
    }

    setUser(u);
  }

  async function signup(username: string, email: string, password: string) {
    await apiPost('/auth/signup', { username, email, password });
  }

  async function logout() {
    localStorage.removeItem('auth_token');
    sessionStorage.removeItem('auth_token');
    setUser(null);
    window.location.href = '/login';
  }

  async function resetPassword(email: string) {
    await apiPost('/auth/forgot-password', { email });
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
