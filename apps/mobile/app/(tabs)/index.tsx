import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { ApiError, type Dashboard } from "../../lib/api";
import { useSession } from "../../lib/session";
import { colors } from "../../lib/theme";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = ms / (60 * 60 * 1000);
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min ago`;
  if (h < 48) return `${h.toFixed(1)} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function DashboardScreen() {
  const { api, signOut } = useSession();
  const [data, setData] = useState<Dashboard | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!api) return;
    try {
      setData(await api.getDashboard());
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await signOut();
        return;
      }
      setError("Couldn't reach your server.");
    }
  }, [api, signOut]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const latest = data?.latestStarterReadings?.[0];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
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
    >
      {error && <Text style={styles.error}>{error}</Text>}

      {(data?.insights?.length ?? 0) > 0 && (
        <Card title="Your sourdough coach">
          {data!.insights!.map((line, i) => (
            <Text key={i} style={styles.insight}>
              ▸ {line}
            </Text>
          ))}
        </Card>
      )}

      <Card title="Starter">
        {data?.lastStarterCycle ? (
          <>
            <Text style={styles.big}>Fed {timeAgo(data.lastStarterCycle.startedAt)}</Text>
            {data.starterPrediction?.predictedPeakAt && (
              <Text style={styles.muted}>
                Predicted peak: {new Date(data.starterPrediction.predictedPeakAt).toLocaleString()}
              </Text>
            )}
            {!data.starterPrediction?.predictedPeakAt && data.starterPredictionStatus && (
              <Text style={styles.muted}>{data.starterPredictionStatus}</Text>
            )}
          </>
        ) : (
          <Text style={styles.muted}>No starter cycle yet. Log a feeding to start.</Text>
        )}
      </Card>

      <Card title="Live readings">
        {latest ? (
          <View style={styles.readingRow}>
            <View style={styles.reading}>
              <Text style={styles.readingLabel}>Temp</Text>
              <Text style={styles.readingValue}>
                {latest.ambientTempC != null ? `${latest.ambientTempC.toFixed(1)}°C` : "—"}
              </Text>
            </View>
            <View style={styles.reading}>
              <Text style={styles.readingLabel}>Rise</Text>
              <Text style={styles.readingValue}>
                {latest.distanceMm != null ? `${(latest.distanceMm / 10).toFixed(1)} cm` : "—"}
              </Text>
            </View>
            <View style={styles.reading}>
              <Text style={styles.readingLabel}>Updated</Text>
              <Text style={styles.readingValue}>{timeAgo(latest.recordedAt)}</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.muted}>No readings yet. Connect a starter monitor.</Text>
        )}
      </Card>

      <Card title="Current bake">
        {data?.currentBake ? (
          <>
            <Text style={styles.big}>{data.currentBake.recipe?.title ?? "Bake in progress"}</Text>
            <Text style={styles.muted}>Started {timeAgo(data.currentBake.startedAt)}</Text>
          </>
        ) : (
          <Text style={styles.muted}>No active bake.</Text>
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  cardTitle: { fontSize: 13, fontWeight: "600", color: colors.textMuted, marginBottom: 8, textTransform: "uppercase" },
  big: { fontSize: 18, fontWeight: "600", color: colors.text },
  muted: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  insight: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  error: { color: colors.danger, marginBottom: 4 },
  readingRow: { flexDirection: "row", justifyContent: "space-between" },
  reading: { flex: 1 },
  readingLabel: { fontSize: 12, color: colors.textFaint },
  readingValue: { fontSize: 16, fontWeight: "600", color: colors.text, marginTop: 2 },
});
