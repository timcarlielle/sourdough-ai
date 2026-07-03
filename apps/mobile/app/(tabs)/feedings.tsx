import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { type Feeding } from "../../lib/api";
import { useSession } from "../../lib/session";
import { colors } from "../../lib/theme";
import { VoiceRecorder } from "../../components/VoiceRecorder";

export default function FeedingsScreen() {
  const { api, meta } = useSession();
  const [feedings, setFeedings] = useState<Feeding[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [starterG, setStarterG] = useState("25");
  const [flourG, setFlourG] = useState("50");
  const [waterG, setWaterG] = useState("50");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!api) return;
    try {
      setFeedings(await api.getFeedings());
    } catch {
      // keep last data; dashboard surfaces connectivity errors
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function saveFeeding() {
    if (!api) return;
    setSaving(true);
    try {
      await api.createFeeding({
        fedAt: new Date().toISOString(),
        starterAmountG: Number(starterG) || 0,
        flourAmountG: Number(flourG) || 0,
        waterAmountG: Number(waterG) || 0,
        notes: notes.trim() || undefined,
      });
      setShowAdd(false);
      setNotes("");
      await load();
    } catch (e) {
      Alert.alert("Couldn't save feeding", e instanceof Error ? e.message : "Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={feedings}
        keyExtractor={(f) => f.id}
        contentContainerStyle={styles.list}
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
        ListHeaderComponent={meta?.features.ai ? <VoiceRecorder onUploaded={load} /> : null}
        ListEmptyComponent={<Text style={styles.empty}>No feedings yet.</Text>}
        renderItem={({ item, index }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>
                {item.starterAmountG}g starter · {item.flourAmountG}g flour · {item.waterAmountG}g water
              </Text>
              <Text style={styles.rowSub}>
                {new Date(item.fedAt).toLocaleString()}
                {item.notes ? ` — ${item.notes}` : ""}
              </Text>
            </View>
            {index === 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>current</Text>
              </View>
            )}
          </View>
        )}
      />

      <TouchableOpacity style={styles.fab} onPress={() => setShowAdd(true)}>
        <Text style={styles.fabText}>＋</Text>
      </TouchableOpacity>

      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Log feeding</Text>
            <View style={styles.amountRow}>
              {[
                { label: "Starter (g)", value: starterG, set: setStarterG },
                { label: "Flour (g)", value: flourG, set: setFlourG },
                { label: "Water (g)", value: waterG, set: setWaterG },
              ].map((f) => (
                <View key={f.label} style={styles.amountField}>
                  <Text style={styles.fieldLabel}>{f.label}</Text>
                  <TextInput
                    style={styles.input}
                    value={f.value}
                    onChangeText={f.set}
                    keyboardType="decimal-pad"
                  />
                </View>
              ))}
            </View>
            <Text style={styles.fieldLabel}>Notes</Text>
            <TextInput
              style={styles.input}
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. whole wheat"
              placeholderTextColor={colors.textFaint}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowAdd(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveButton, saving && { opacity: 0.6 }]} onPress={saveFeeding} disabled={saving}>
                <Text style={styles.saveText}>{saving ? "Saving…" : "Save"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: 16, gap: 10, paddingBottom: 96 },
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
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  fabText: { color: "#fff", fontSize: 26, lineHeight: 30 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.35)" },
  modalCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 36,
  },
  modalTitle: { fontSize: 18, fontWeight: "600", color: colors.text, marginBottom: 14 },
  amountRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  amountField: { flex: 1 },
  fieldLabel: { fontSize: 13, color: colors.textMuted, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
    marginBottom: 8,
  },
  modalButtons: { flexDirection: "row", gap: 10, marginTop: 8 },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelText: { color: colors.textMuted, fontSize: 16 },
  saveButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
