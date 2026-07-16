import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { DammColors } from '@/constants/theme';

function TabIcon({ name, color }: { name: string; color: string }) {
  return <SymbolView name={name as any} size={22} tintColor={color} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: DammColors.primary,
        tabBarInactiveTintColor: DammColors.textMuted,
        tabBarStyle: {
          backgroundColor: DammColors.surface,
          borderTopColor: DammColors.border,
          borderTopWidth: 0.5,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}>
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => <TabIcon name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Tareas',
          tabBarIcon: ({ color }) => <TabIcon name="checklist" color={color} />,
        }}
      />
      <Tabs.Screen
        name="assistant"
        options={{
          title: 'Asistente',
          tabBarIcon: ({ color }) => <TabIcon name="sparkles" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color }) => (
            <TabIcon name="person.circle.fill" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
