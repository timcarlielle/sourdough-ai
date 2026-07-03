import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useSession } from "../lib/session";
import { colors } from "../lib/theme";

export default function Index() {
  const { loading, serverUrl, token } = useSession();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!serverUrl) return <Redirect href="/onboarding" />;
  if (!token) return <Redirect href="/login" />;
  return <Redirect href="/(tabs)" />;
}
