import { useState } from "react";
import { useRouter } from "expo-router";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSession } from "../lib/session";
import { colors } from "../lib/theme";

export default function Onboarding() {
  const router = useRouter();
  const { setServer } = useSession();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await setServer(url);
      router.replace("/login");
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : "Couldn't reach that server. Check the address and that your Sourdough AI instance is running.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Your Sourdough server</Text>
        <Text style={styles.subtitle}>
          This app connects to a self-hosted Sourdough AI instance. Enter your server address —
          for example https://sourdough.example.com
        </Text>
        <TextInput
          style={styles.input}
          value={url}
          onChangeText={setUrl}
          placeholder="https://your-server"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onSubmitEditing={connect}
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <TouchableOpacity style={[styles.button, busy && styles.buttonDisabled]} onPress={connect} disabled={busy}>
          <Text style={styles.buttonText}>{busy ? "Checking…" : "Connect"}</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>
          Don't have a server yet? Sourdough AI is open source and runs anywhere Docker does.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: colors.background },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
  },
  title: { fontSize: 20, fontWeight: "600", color: colors.text },
  subtitle: { marginTop: 8, fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  input: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  error: { marginTop: 10, color: colors.danger, fontSize: 14 },
  button: {
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  hint: { marginTop: 16, fontSize: 12, color: colors.textFaint, textAlign: "center" },
});
