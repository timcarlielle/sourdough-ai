import { Redirect, Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";
import { useSession } from "../../lib/session";
import { colors } from "../../lib/theme";

function TabIcon({ glyph, color }: { glyph: string; color: ColorValue }) {
  return <Text style={{ fontSize: 20, color }}>{glyph}</Text>;
}

export default function TabsLayout() {
  const { loading, serverUrl, token } = useSession();
  if (!loading && (!serverUrl || !token)) return <Redirect href="/" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: { backgroundColor: colors.card },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color }) => <TabIcon glyph="◉" color={color} />,
        }}
      />
      <Tabs.Screen
        name="feedings"
        options={{
          title: "Feedings",
          tabBarIcon: ({ color }) => <TabIcon glyph="✚" color={color} />,
        }}
      />
      <Tabs.Screen
        name="bakes"
        options={{
          title: "Bakes",
          tabBarIcon: ({ color }) => <TabIcon glyph="◍" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => <TabIcon glyph="⚙" color={color} />,
        }}
      />
    </Tabs>
  );
}
