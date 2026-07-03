import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { type Bake } from "../../lib/api";
import { useSession } from "../../lib/session";
import { colors } from "../../lib/theme";

export default function BakesScreen() {
  const { api } = useSession();
  const [bakes, setBakes] = useState<Bake[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!api) return;
    try {
      setBakes(await api.getBakes());
    } catch {
      // dashboard surfaces connectivity errors
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.list}
      data={bakes}
      keyExtractor={(b) => b.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          tintColor={colors.primary}
        />
      }
      ListEmptyComponent={<Text style={styles.empty}>No bakes yet. Start one from the web app.</Text>}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{item.recipe?.title ?? item.doughBatchName ?? "Bake"}</Text>
            <Text style={styles.rowSub}>
              {new Date(item.startedAt).toLocaleDateString()} ·{" "}
              {item.endedAt ? "completed" : "in progress"}
            </Text>
          </View>
          {!item.endedAt && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>active</Text>
            </View>
          )}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: 16, gap: 10 },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: 32 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  rowTitle: { fontSize: 15, fontWeight: "600", color: colors.text },
  rowSub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  badge: { backgroundColor: colors.badgeBg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: colors.badgeText, fontSize: 11, fontWeight: "600" },
});
