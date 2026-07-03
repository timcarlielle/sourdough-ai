import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useSession } from "../../lib/session";
import { colors } from "../../lib/theme";

export default function SettingsScreen() {
  const router = useRouter();
  const { serverUrl, email, meta, signOut } = useSession();

  function confirmSignOut() {
    Alert.alert("Log out?", "You'll need your password to log back in.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/login");
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.label}>Account</Text>
        <Text style={styles.value}>{email ?? "—"}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Server</Text>
        <Text style={styles.value}>{serverUrl}</Text>
        {meta && (
          <Text style={styles.sub}>
            v{meta.version} · AI features {meta.features.ai ? "enabled" : "disabled"}
          </Text>
        )}
        <TouchableOpacity onPress={() => router.replace("/onboarding")}>
          <Text style={styles.link}>Change server</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={styles.signOut} onPress={confirmSignOut}>
        <Text style={styles.signOutText}>Log out</Text>
      </TouchableOpacity>
      <Text style={styles.footer}>Sourdough AI — self-hosted sourdough tracking</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16, gap: 12 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  label: { fontSize: 12, color: colors.textFaint, textTransform: "uppercase", marginBottom: 4 },
  value: { fontSize: 15, color: colors.text },
  sub: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  link: { color: colors.primary, marginTop: 10, fontSize: 14 },
  signOut: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  signOutText: { color: colors.danger, fontSize: 16 },
  footer: { textAlign: "center", color: colors.textFaint, fontSize: 12, marginTop: "auto", marginBottom: 8 },
});
