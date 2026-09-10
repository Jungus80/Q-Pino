import { StatusChip, cycleStatus } from '@/components/StatusChip';
import { getEquipmentById, type EquipmentRow } from '@/db/repos/equipment';
import { listClaimsForEquipment, type ClaimRow } from '@/db/repos/claims';
import { getInstitution } from '@/db/repos/institutions';
import { saveEquipmentEdit } from '@/db/editEquipment';
import { useObserverName } from '@/hooks/use-observer-name';
import type { FieldStatus } from '@/core/schema/observation';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' });
}

const FIELD_LABEL: Record<string, string> = {
  manufacturer: 'Fabricante',
  model: 'Modelo',
  serial: 'Serial',
  count: 'Cantidad',
  installYear: 'Año de instalación',
  match: 'Coincidencia con equipo existente',
  unassigned_equipment_claim: 'Dato sin asignar (ambiguo)',
};

const SOURCE_LABEL: Record<string, string> = {
  voice: '🎙️ Voz',
  text: '⌨️ Texto',
  photo: '📷 Foto',
};

export default function EquipmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const observer = useObserverName();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [equipment, setEquipment] = useState<EquipmentRow | null>(null);
  const [institutionName, setInstitutionName] = useState('');
  const [claims, setClaims] = useState<ClaimRow[]>([]);

  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [serial, setSerial] = useState('');
  const [count, setCount] = useState('');
  const [installYear, setInstallYear] = useState('');
  const [statusManufacturer, setStatusManufacturer] = useState<FieldStatus>('Desconocido');
  const [statusModel, setStatusModel] = useState<FieldStatus>('Desconocido');
  const [statusAge, setStatusAge] = useState<FieldStatus>('Desconocido');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const eq = await getEquipmentById(id);
    setEquipment(eq);
    if (eq) {
      setManufacturer(eq.manufacturer ?? '');
      setModel(eq.model ?? '');
      setSerial(eq.serial ?? '');
      setCount(eq.count != null ? String(eq.count) : '');
      setInstallYear(eq.installYearLo != null ? String(eq.installYearLo) : '');
      setStatusManufacturer(eq.statusManufacturer);
      setStatusModel(eq.statusModel);
      setStatusAge(eq.statusAge);
      const inst = await getInstitution(eq.institutionId);
      setInstitutionName(inst?.name ?? '');
    }
    const c = await listClaimsForEquipment(id);
    setClaims(c.sort((a, b) => (a.observedAt < b.observedAt ? 1 : -1)));
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    if (!equipment) return;
    setSaving(true);
    try {
      const yearNum = installYear.trim() ? parseInt(installYear, 10) : null;
      await saveEquipmentEdit({
        equipmentId: equipment.id,
        patch: {
          manufacturer: manufacturer.trim() || null,
          model: model.trim() || null,
          serial: serial.trim() || null,
          count: count.trim() ? parseInt(count, 10) || null : null,
          installYearLo: yearNum,
          installYearHi: yearNum,
        },
        observerId: observer.name,
      });
      await load();
      Alert.alert('Guardado', 'Los cambios se guardaron como una corrección confirmada.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-neutral-950 items-center justify-center">
        <ActivityIndicator color="#fff" />
      </SafeAreaView>
    );
  }

  if (!equipment) {
    return (
      <SafeAreaView className="flex-1 bg-neutral-950 items-center justify-center">
        <Text className="text-neutral-400">Equipo no encontrado.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-neutral-950">
      <ScrollView contentContainerClassName="p-4 pb-12">
        <Text className="text-neutral-500 text-xs uppercase mb-1">{institutionName}</Text>
        <Text className="text-white text-2xl font-bold mb-1">{equipment.modality}</Text>
        <Text className="text-neutral-500 text-xs mb-5">
          Última verificación: {fmtDate(equipment.lastVerifiedAt)}
        </Text>

        <View className="bg-neutral-900 rounded-xl p-4 mb-5">
          <View className="flex-row items-center gap-2 mb-3">
            <TextInput
              value={manufacturer}
              onChangeText={setManufacturer}
              placeholder="Fabricante"
              placeholderTextColor="#71717a"
              className="bg-neutral-800 text-white rounded-lg px-3 py-2 flex-1"
            />
            <StatusChip status={statusManufacturer} onPress={() => setStatusManufacturer(cycleStatus(statusManufacturer))} />
          </View>

          <View className="flex-row items-center gap-2 mb-3">
            <TextInput
              value={model}
              onChangeText={setModel}
              placeholder="Modelo"
              placeholderTextColor="#71717a"
              className="bg-neutral-800 text-white rounded-lg px-3 py-2 flex-1"
            />
            <StatusChip status={statusModel} onPress={() => setStatusModel(cycleStatus(statusModel))} />
          </View>

          <TextInput
            value={serial}
            onChangeText={setSerial}
            placeholder="Número de serie"
            placeholderTextColor="#71717a"
            className="bg-neutral-800 text-white rounded-lg px-3 py-2 mb-3"
          />

          <View className="flex-row gap-2 mb-3">
            <View className="flex-1">
              <Text className="text-neutral-500 text-xs mb-1">Cantidad</Text>
              <TextInput
                value={count}
                onChangeText={setCount}
                keyboardType="number-pad"
                placeholder="—"
                placeholderTextColor="#71717a"
                className="bg-neutral-800 text-white rounded-lg px-3 py-2"
              />
            </View>
            <View className="flex-1">
              <Text className="text-neutral-500 text-xs mb-1">Año de instalación</Text>
              <TextInput
                value={installYear}
                onChangeText={setInstallYear}
                keyboardType="number-pad"
                placeholder="—"
                placeholderTextColor="#71717a"
                className="bg-neutral-800 text-white rounded-lg px-3 py-2"
              />
            </View>
          </View>
          <View className="flex-row justify-end">
            <StatusChip status={statusAge} onPress={() => setStatusAge(cycleStatus(statusAge))} />
          </View>
        </View>

        <Pressable onPress={handleSave} disabled={saving} className="bg-emerald-600 rounded-xl py-3 items-center mb-8">
          {saving ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold">Guardar cambios</Text>}
        </Pressable>

        <Text className="text-neutral-500 text-xs uppercase mb-2">
          Historial de observaciones ({claims.length})
        </Text>
        {claims.length === 0 && <Text className="text-neutral-600">Sin observaciones registradas.</Text>}
        {claims.map((c) => (
          <View key={c.id} className="bg-neutral-900 rounded-lg p-3 mb-2">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-white text-sm font-medium">{FIELD_LABEL[c.field] ?? c.field}</Text>
              <StatusChip status={c.status} />
            </View>
            {c.value && <Text className="text-neutral-300 text-sm mb-1">{c.value}</Text>}
            {c.evidence && <Text className="text-neutral-500 text-xs italic mb-1">"{c.evidence}"</Text>}
            <Text className="text-neutral-600 text-xs">
              {fmtDate(c.observedAt)} · {c.observerId} · {SOURCE_LABEL[c.source] ?? c.source}
            </Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
