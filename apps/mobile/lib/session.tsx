import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { ApiClient, normalizeServerUrl, type ServerMeta } from "./api";

const SERVER_URL_KEY = "sourdough.serverUrl";
const TOKEN_KEY = "sourdough.apiToken";
const EMAIL_KEY = "sourdough.email";

type SessionState = {
  loading: boolean;
  serverUrl: string | null;
  meta: ServerMeta | null;
  token: string | null;
  email: string | null;
  api: ApiClient | null;
  /** Validate + persist a server URL. Returns its capabilities. */
  setServer: (input: string) => Promise<ServerMeta>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<ServerMeta | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [url, storedEmail] = await Promise.all([
          AsyncStorage.getItem(SERVER_URL_KEY),
          AsyncStorage.getItem(EMAIL_KEY),
        ]);
        const storedToken = await SecureStore.getItemAsync(TOKEN_KEY);
        setServerUrl(url);
        setEmail(storedEmail);
        setToken(storedToken);
        if (url) {
          // refresh capabilities in the background; ignore failures offline
          new ApiClient(url).getMeta().then(setMeta).catch(() => {});
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setServer = useCallback(async (input: string) => {
    const url = normalizeServerUrl(input);
    const client = new ApiClient(url);
    const serverMeta = await client.getMeta();
    if (serverMeta.name !== "sourdough-ai") {
      throw new Error("That server doesn't look like a Sourdough AI instance.");
    }
    await AsyncStorage.setItem(SERVER_URL_KEY, url);
    setServerUrl(url);
    setMeta(serverMeta);
    return serverMeta;
  }, []);

  const signIn = useCallback(
    async (emailInput: string, password: string) => {
      if (!serverUrl) throw new Error("Set a server first.");
      const client = new ApiClient(serverUrl);
      const res = await client.login(emailInput, password, "Sourdough iOS app");
      await SecureStore.setItemAsync(TOKEN_KEY, res.token);
      await AsyncStorage.setItem(EMAIL_KEY, res.user.email);
      setToken(res.token);
      setEmail(res.user.email);
    },
    [serverUrl],
  );

  const signOut = useCallback(async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken(null);
  }, []);

  const api = useMemo(
    () => (serverUrl && token ? new ApiClient(serverUrl, token) : null),
    [serverUrl, token],
  );

  const value = useMemo(
    () => ({ loading, serverUrl, meta, token, email, api, setServer, signIn, signOut }),
    [loading, serverUrl, meta, token, email, api, setServer, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
