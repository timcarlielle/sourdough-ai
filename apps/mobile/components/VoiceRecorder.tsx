import { useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { AudioModule, RecordingPresets, useAudioRecorder } from "expo-audio";
import { useSession } from "../lib/session";
import { colors } from "../lib/theme";

/**
 * Record a short voice note ("just fed the starter, 60 grams of each") and upload
 * it to the server's voice pipeline. Only rendered when the server has AI enabled.
 */
export function VoiceRecorder({ bakeId, onUploaded }: { bakeId?: string; onUploaded?: () => void }) {
  const { api } = useSession();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function start() {
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Microphone needed", "Allow microphone access to record voice notes.");
      return;
    }
    setStatus(null);
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecording(true);
  }

  async function stopAndUpload() {
    setRecording(false);
    await recorder.stop();
    const uri = recorder.uri;
    if (!uri || !api) return;
    setUploading(true);
    try {
      await api.uploadVoice(uri, bakeId);
      setStatus("Uploaded — processing on the server. Check Voice logs in the web app.");
      onUploaded?.();
    } catch (e) {
      setStatus(null);
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Voice log</Text>
      <Text style={styles.sub}>
        Say what happened — a feeding, a fold, an outcome — and it's transcribed and saved.
      </Text>
      <TouchableOpacity
        style={[styles.button, recording && styles.buttonRecording, uploading && { opacity: 0.6 }]}
        onPress={recording ? stopAndUpload : start}
        disabled={uploading}
      >
        <Text style={styles.buttonText}>
          {uploading ? "Uploading…" : recording ? "■ Stop & upload" : "● Record"}
        </Text>
      </TouchableOpacity>
      {status && <Text style={styles.status}>{status}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 4,
  },
  title: { fontSize: 15, fontWeight: "600", color: colors.text },
  sub: { fontSize: 13, color: colors.textMuted, marginTop: 2, marginBottom: 10 },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonRecording: { backgroundColor: colors.danger },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  status: { marginTop: 8, fontSize: 13, color: colors.textMuted },
});
