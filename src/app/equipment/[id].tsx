import { StatusChip, cycleStatus } from '@/components/StatusChip';
import { getEquipmentById, type EquipmentRow } from '@/db/repos/equipment';
import { listClaimsForEquipment, type ClaimRow } from '@/db/repos/claims';
import { getInstitution } from '@/db/repos/institutions';
import { saveEquipmentEdit } from '@/db/editEquipment';
import { useObserverName } from '@/hooks/use-observer-name';
import type { FieldStatus } from '@/core/schema/observation';
import { scanPlate, type PlateScanResult } from '@/ai/plateOcr';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/kit/Screen';
import { EmptyState } from '@/components/kit/EmptyState';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useToast } from '@/components/ui/toast';
import { useAppStyles } from '@/theme/useAppStyles';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput } from 'react-native';

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
  voice: 'Voz',
  text: 'Texto',
  photo: 'Foto',
};

function groupClaimsByObservation(claims: ClaimRow[]): ClaimRow[][] {
  const order: string[] = [];
  const byObservation = new Map<string, ClaimRow[]>();
  for (const claim of claims) {
    if (!byObservation.has(claim.observationId)) {
      order.push(claim.observationId);
      byObservation.set(claim.observationId, []);
    }
    byObservation.get(claim.observationId)!.push(claim);
  }
  return order.map((id) => byObservation.get(id)!);
}

function sharedEvidence(group: ClaimRow[]): string | null {
  const quotes = group.map((c) => c.evidence).filter((v): v is string => Boolean(v));
  if (quotes.length === 0) return null;
  const first = quotes[0];
  return quotes.every((q) => q === first) ? first : null;
}

export default function EquipmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const { styles, muted, primary } = useAppStyles();
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
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<number | null>(null);
  const [scanResult, setScanResult] = useState<PlateScanResult | null>(null);

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

  const observationGroups = useMemo(() => groupClaimsByObservation(claims), [claims]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleScanPlate() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permiso denegado', 'Se necesita acceso a la cámara para leer la placa.');
      return;
    }
    const picked = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false });
    if (picked.canceled || !picked.assets?.[0]) return;

    setScanning(true);
    setScanProgress(null);
    setScanResult(null);
    try {
      const result = await scanPlate(picked.assets[0].uri, equipment?.modality, (p) => setScanProgress(p));
      if (!result.serial && !result.manufacturer && !result.model && !result.installYear) {
        Alert.alert('Sin datos legibles', 'No se reconoció texto útil en la foto. Probá con más luz o de más cerca.');
      } else {
        setScanResult(result);
      }
    } catch (e: any) {
      Alert.alert('Error de OCR', e?.message ?? String(e));
    } finally {
      setScanning(false);
      setScanProgress(null);
    }
  }

  async function handleApplyScan() {
    if (!equipment || !scanResult) return;
    setSaving(true);
    try {
      const patch: Parameters<typeof saveEquipmentEdit>[0]['patch'] = {};
      if (scanResult.manufacturer) patch.manufacturer = scanResult.manufacturer;
      if (scanResult.model) patch.model = scanResult.model;
      if (scanResult.serial) patch.serial = scanResult.serial;
      if (scanResult.installYear) {
        patch.installYearLo = scanResult.installYear;
        patch.installYearHi = scanResult.installYear;
      }
      await saveEquipmentEdit({
        equipmentId: equipment.id,
        patch,
        observerId: observer.name,
        source: 'photo',
        rawText: '[Foto de placa]',
        evidenceLabel: `Leído de placa (OCR): "${scanResult.rawLines.join(' / ')}"`,
      });
      setScanResult(null);
      await load();
      toast.success('Aplicado', 'Los datos de la placa se guardaron como confirmados.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

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
      toast.success('Guardado', 'Los cambios se guardaron como una corrección confirmada.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Screen centered>
        <Spinner size="lg" />
      </Screen>
    );
  }

  if (!equipment) {
    return (
      <Screen centered>
        <Text variant="caption">Equipo no encontrado.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.pad, styles.padBottom]}>
        <Text variant="caption">{institutionName}</Text>
        <Text variant="title" style={{ marginBottom: 4 }}>{equipment.modality}</Text>
        <Text variant="caption" style={{ marginBottom: 20 }}>
          Última verificación: {fmtDate(equipment.lastVerifiedAt)}
        </Text>

        <Button variant="outline" onPress={handleScanPlate} disabled={scanning} loading={scanning} style={{ marginBottom: 16 }}>
          {scanning
            ? (scanProgress != null ? `Analizando placa… ${scanProgress}%` : 'Reconociendo texto…')
            : 'Escanear placa'}
        </Button>

        {scanResult && (
          <Card style={{ marginBottom: 20 }}>
            <Text variant="caption" style={{ marginBottom: 12 }}>Datos reconocidos</Text>
            {scanResult.manufacturer && <Text variant="body" style={{ marginBottom: 6 }}>Fabricante: {scanResult.manufacturer}</Text>}
            {scanResult.model && <Text variant="body" style={{ marginBottom: 6 }}>Modelo: {scanResult.model}</Text>}
            {scanResult.serial && <Text variant="body" style={{ marginBottom: 6 }}>Serial: {scanResult.serial}</Text>}
            {scanResult.installYear && <Text variant="body" style={{ marginBottom: 12 }}>Año: {scanResult.installYear}</Text>}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Button onPress={handleApplyScan} disabled={saving} loading={saving}>Confirmar</Button>
              </View>
              <View style={{ flex: 1 }}>
                <Button variant="outline" onPress={() => setScanResult(null)} disabled={saving}>Descartar</Button>
              </View>
            </View>
          </Card>
        )}

        <Card style={{ marginBottom: 20 }}>
          <Text variant="caption" style={{ marginBottom: 8 }}>Fabricante</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <TextInput value={manufacturer} onChangeText={setManufacturer} placeholder="Ej: Siemens" placeholderTextColor={muted} style={[styles.input, { flex: 1 }]} />
            <StatusChip status={statusManufacturer} onPress={() => setStatusManufacturer(cycleStatus(statusManufacturer))} />
          </View>
          <Text variant="caption" style={{ marginBottom: 8 }}>Modelo</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <TextInput value={model} onChangeText={setModel} placeholder="Ej: Magnetom" placeholderTextColor={muted} style={[styles.input, { flex: 1 }]} />
            <StatusChip status={statusModel} onPress={() => setStatusModel(cycleStatus(statusModel))} />
          </View>
          <Text variant="caption" style={{ marginBottom: 8 }}>Número de serie</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <TextInput value={serial} onChangeText={setSerial} placeholder="Ej: SN123456" placeholderTextColor={muted} style={[styles.input, { flex: 1 }]} />
            <Pressable onPress={handleScanPlate} disabled={scanning} accessibilityLabel="Escanear placa" style={[styles.ghostChip, { width: 44, height: 44, justifyContent: 'center' }]}>
              {scanning ? <Spinner size="sm" /> : <Icon name="camera" size="sm" color={primary} />}
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
            <View style={{ flex: 1 }}>
              <Text variant="caption" style={{ marginBottom: 8 }}>Cantidad</Text>
              <TextInput value={count} onChangeText={setCount} keyboardType="number-pad" placeholder="—" placeholderTextColor={muted} style={styles.input} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="caption" style={{ marginBottom: 8 }}>Año de instalación</Text>
              <TextInput value={installYear} onChangeText={setInstallYear} keyboardType="number-pad" placeholder="—" placeholderTextColor={muted} style={styles.input} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
            <StatusChip status={statusAge} onPress={() => setStatusAge(cycleStatus(statusAge))} />
          </View>
        </Card>

        <Button onPress={handleSave} disabled={saving} loading={saving} style={{ marginBottom: 24 }}>
          Guardar cambios
        </Button>

        <Text variant="caption" style={{ marginBottom: 12 }}>
          Historial de observaciones ({observationGroups.length})
        </Text>
        {observationGroups.length === 0 && <EmptyState>Sin observaciones registradas.</EmptyState>}
        {observationGroups.map((group) => {
          const head = group[0];
          const quote = sharedEvidence(group);
          return (
            <Card key={head.observationId} style={{ marginBottom: 8 }}>
              <Text variant="caption" style={{ marginBottom: 10 }}>
                {fmtDate(head.observedAt)} · {head.observerId} · {SOURCE_LABEL[head.source] ?? head.source}
              </Text>
              {quote ? (
                <Text variant="caption" style={{ fontStyle: 'italic', marginBottom: 12 }}>
                  "{quote}"
                </Text>
              ) : null}
              {group.map((c, index) => (
                <View
                  key={c.id}
                  style={{
                    marginBottom: index < group.length - 1 ? 10 : 0,
                    paddingBottom: index < group.length - 1 ? 10 : 0,
                    borderBottomWidth: index < group.length - 1 ? 1 : 0,
                    borderBottomColor: styles.card.borderColor,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text variant="subtitle">{FIELD_LABEL[c.field] ?? c.field}</Text>
                    <StatusChip status={c.status} />
                  </View>
                  {c.value ? <Text variant="body">{c.value}</Text> : null}
                  {!quote && c.evidence ? (
                    <Text variant="caption" style={{ fontStyle: 'italic', marginTop: 4 }}>
                      "{c.evidence}"
                    </Text>
                  ) : null}
                </View>
              ))}
            </Card>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
