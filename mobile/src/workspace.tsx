import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { type Api } from './api';
import { type NativeAuthSession, type NativeLawyerProfile } from './nativeAuth';
import { type TrackedOrderCase } from './court';

export type Tracking = {
  id: string;
  caseIds: string[];
  trackedOrderCases: TrackedOrderCase[];
};
export type Workspace = {
  api: Api;
  session: NativeAuthSession;
  profile: NativeLawyerProfile | null;
  tracking: Tracking | null;
  trackingError: string;
  reloadTracking: () => Promise<void>;
  saveTracking: (
    caseIds: string[],
    orders: TrackedOrderCase[],
  ) => Promise<void>;
  navigate: (path: string) => void;
};
export const WorkspaceContext = createContext<Workspace | null>(null);
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('Workspace unavailable.');
  return value;
}
export function useRemote<T>(path: string | null, interval = 0) {
  const { api } = useWorkspace();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    request.current?.abort();
    if (!path) {
      setData(null);
      setBusy(false);
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      const next = await api<T>(path, undefined, undefined, controller.signal);
      if (!controller.signal.aborted) setData(next);
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error ? failure.message : 'Request failed.',
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      if (request.current === controller) request.current = null;
    }
  }, [api, path]);
  useEffect(() => {
    setData(null);
    void load();
    const timer = interval
      ? setInterval(() => {
          if (AppState.currentState === 'active' && !request.current)
            void load();
        }, interval)
      : undefined;
    return () => {
      request.current?.abort();
      if (timer) clearInterval(timer);
    };
  }, [load, interval]);
  return { data, error, busy, reload: load };
}
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const running = useRef(false);
  const run = async (action: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Request failed.');
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return { busy, error, run, setError };
}
