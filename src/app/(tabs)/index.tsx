import { normalizeObservation } from '@/core/normalize/pipeline';
import { computeNextQuestion } from '@/core/followup/nextQuestion';
import type { ExtractedObservation, Modality, NormalizedEquipment, NormalizedInstitution } from '@/core/schema/observation';
import { MODALITIES } from '@/core/schema/observation';
import { saveObservation } from '@/db/saveObservation';
import { matchInstitution } from '@/db/repos/institutions';
import { extractObservation } from '@/ai/extract';
import { useVoiceCapture } from '@/ai/asr';
import { scanPlate } from '@/ai/plateOcr';
import { useObserverName } from '@/hooks/use-observer-name';
import { StatusChip, cycleStatus } from '@/components/StatusChip';
import { RecordingButton } from '@/components/RecordingButton';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Promisified 3-way Alert — used for the institution merge confirmation, where the
 * caller needs to actually await the user's choice before deciding how to save. */
function confirmAsync(title: string, message: string, confirmLabel: string, cancelLabel: string): Promise<boolean | null> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(null) },
      { text: cancelLabel, onPress: () => resolve(false) },
      { text: confirmLabel, onPress: () => resolve(true) },
    ]);
  });
}

type Screen = 'input' | 'extracting' | 'review' | 'saving';

const WAVEFORM_BARS = 20;

/**
 * Live mic-level waveform, driven directly from raw audio (not the ASR's transcript
 * output) so it stays visibly responsive during the 1-3s gaps between Parakeet's partial
 * transcript updates — closes the "is this frozen?" perception gap that comes from
 * on-device streaming ASR's inherent chunking latency.
 */
function Waveform({ level }: { level: number }) {
  const historyRef = useRef<number[]>(new Array(WAVEFORM_BARS).fill(0));
  const [, forceRender] = useState(0);

  useEffect(() => {
    historyRef.current = [...historyRef.current.slice(1), level];
    forceRender((n) => n + 1);
  }, [level]);

  return (
    <View className="flex-row items-center gap-1 h-12 bg-red-100 rounded-lg p-2">
      {historyRef.current.map((v, i) => (
        <View
          key={i}
          className="flex-1 bg-gradient-to-b from-red-500 to-red-400 rounded-full"
          style={{ height: Math.max(4, v * 40), opacity: 0.3 + v * 0.7 }}
        />
      ))}
    </View>
  );
}

export default function CaptureScreen() {
  const router = useRouter();
  const voice = useVoiceCapture();
  const observer = useObserverName();
  const [screen, setScreen] = useState<Screen>('input');
  const [text, setText] = useState('');
  const [source, setSource] = useState<'text' | 'voice'>('text');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<ExtractedObservation | null>(null);
  const [institution, setInstitution] = useState<NormalizedInstitution | null>(null);
  const [equipment, setEquipment] = useState<NormalizedEquipment[]>([]);
  const [scanningIndex, setScanningIndex] = useState<number | null>(null);
  const [scanProgress, setScanProgress] = useState<number | null>(null);

  useEffect(() => {
    if (!observer.loading && !observer.isSet) observer.promptForName();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observer.loading, observer.isSet]);

  async function handleToggleVoice() {
    if (voice.isRecording) {
      const transcript = await voice.stop();
      if (transcript.trim()) {
        setText(transcript.trim());
        setSource('voice');
      }
    } else {
      setSource('voice');
      await voice.start();
    }
  }

  async function handleExtract() {
    if (!text.trim()) return;
    setError(null);
    setScreen('extracting');
    setProgress(null);
    try {
      const result = await extractObservation(text.trim(), (pct) => setProgress(pct));
      const normalized = normalizeObservation(result.extraction, text.trim());
      setExtraction(result.extraction);
      setInstitution(normalized.institution);
      setEquipment(normalized.equipment);
      setScreen('review');
    } catch (e: any) {
      console.error('[extract] failed:', e);
      // ZodError (or anything else structurally unexpected) shouldn't dump raw internals
      // on screen — a friendly retry prompt is more useful than a JSON issue array.
      const friendly =
        e?.name === 'ZodError'
          ? 'No se pudo interpretar la respuesta del modelo. Intenta de nuevo o reformula el texto.'
          : (e?.message ?? String(e));
      setError(friendly);
      setScreen('input');
    }
  }

  function updateEquipment(index: number, patch: Partial<NormalizedEquipment>) {
    setEquipment((prev) => prev.map((eq, i) => (i === index ? { ...eq, ...patch } : eq)));
  }

  // Lets a device just extracted from text/voice be confirmed (or corrected) from its
  // nameplate photo right here in the review card, so it's a single save instead of
  // saving first and then separately opening the equipment's detail screen to scan.
  // Unlike the equipment-detail screen's scan (which writes an immediate DB claim on an
  // already-persisted row), this only patches the in-memory review state — the scanned
  // fields go out with the same saveObservation() call as everything else on this card.
  async function handleScanForEquipment(index: number) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permiso denegado', 'Se necesita acceso a la cámara para leer la placa.');
      return;
    }
    const picked = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false });
    if (picked.canceled || !picked.assets?.[0]) return;

    setScanningIndex(index);
    setScanProgress(null);
    try {
      const target = equipment[index];
      const result = await scanPlate(picked.assets[0].uri, target?.modality, (p) => setScanProgress(p));
      if (!result.serial && !result.manufacturer && !result.model && !result.installYear) {
        Alert.alert('Sin datos legibles', 'No se reconoció texto útil en la foto. Probá con más luz o de más cerca.');
        return;
      }
      const patch: Partial<NormalizedEquipment> = { fieldStatus: { ...target.fieldStatus } };
      if (result.manufacturer) {
        patch.manufacturer = result.manufacturer;
        patch.fieldStatus!.manufacturer = 'Confirmado';
      }
      if (result.model) {
        patch.model = result.model;
        patch.fieldStatus!.model = 'Confirmado';
      }
      if (result.serial) patch.serial = result.serial;
      if (result.installYear) {
        patch.installYearLo = result.installYear;
        patch.installYearHi = result.installYear;
        patch.fieldStatus!.age = 'Confirmado';
      }
      if (result.catalogModelId) patch.catalogModelId = result.catalogModelId;
      updateEquipment(index, patch);
    } catch (e: any) {
      Alert.alert('Error de OCR', e?.message ?? String(e));
    } finally {
      setScanningIndex(null);
      setScanProgress(null);
    }
  }

  const followUp = useMemo(() => computeNextQuestion(equipment), [equipment]);

  async function handleSave() {
    if (!extraction || !institution) return;
    setScreen('saving');
    try {
      // The 'ask' band (0.75-0.92 name similarity) is plausible-but-not-certain — rather
      // than silently create a duplicate client or silently merge into the wrong one,
      // confirm with the user before saving.
      let forceInstitutionId: string | undefined;
      if (institution.name) {
        const match = await matchInstitution({ name: institution.name, city: institution.city, countryIso: institution.countryIso });
        if (match.kind === 'ask') {
          const choice = await confirmAsync(
            '¿Es el mismo cliente?',
            `"${institution.name}" se parece a "${match.institution.name}"${match.institution.city ? ` (${match.institution.city})` : ''} — ¿son el mismo cliente?`,
            'Sí, es el mismo',
            'No, es nuevo'
          );
          if (choice == null) {
            setScreen('review');
            return; // cancelled — let the user re-check the name before deciding
          }
          if (choice) forceInstitutionId = match.institution.id;
        }
      }

      const result = await saveObservation({
        rawText: text.trim(),
        transcript: text.trim(),
        comments: extraction.comments,
        source,
        extraction,
        institution,
        equipment,
        observerId: observer.name,
        forceInstitutionId,
      });
      setText('');
      setSource('text');
      setExtraction(null);
      setInstitution(null);
      setEquipment([]);
      setScreen('input');
      router.push(`/clients/${result.institutionId}`);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setScreen('review');
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerClassName="p-4 pb-12" keyboardShouldPersistTaps="handled">
        <View className="flex-row items-center justify-between mb-2">
          <View>
            <Text className="text-gray-900 text-2xl font-bold">Nueva Observación</Text>
            <Text className="text-gray-500 text-sm mt-1">Describe lo que viste en la visita</Text>
          </View>
          <Pressable onPress={observer.promptForName} className="flex-row items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
            <Text className="text-gray-700 text-sm font-medium">👤 {observer.name}</Text>
          </Pressable>
        </View>
        <View className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-4">
          <Text className="text-blue-700 text-xs font-medium">📱 Modo Offline</Text>
        </View>

        {screen === 'input' && (
          <>
            {voice.isRecording ? (
              <View className="bg-red-50 border-2 border-red-300 rounded-xl p-4 min-h-32 justify-center">
                <View className="flex-row items-center mb-3">
                  <View className="w-3 h-3 rounded-full bg-red-500 mr-2 animate-pulse" />
                  <Text className="text-red-600 text-sm font-semibold">Grabando… habla ahora</Text>
                </View>
                <Waveform level={voice.audioLevel} />
              </View>
            ) : voice.isLoadingModel || voice.isTranscribing ? (
              <View className="bg-blue-50 border border-blue-200 rounded-xl p-4 min-h-32 items-center justify-center">
                <ActivityIndicator color="#0066CC" size="large" />
                <Text className="text-blue-700 mt-3 text-sm font-medium">
                  {voice.isLoadingModel ? 'Cargando modelo de voz…' : 'Transcribiendo…'}
                </Text>
              </View>
            ) : (
              <View>
                <Text className="text-gray-700 text-sm font-semibold mb-2">Descripción de la visita</Text>
                <TextInput
                  value={text}
                  onChangeText={(v) => {
                    setText(v);
                    setSource('text');
                  }}
                  multiline
                  placeholder='Ej: "Estoy en Hospital DemoCare Pacific, en Panamá. Vi dos resonadores, uno parece de unos ocho años."'
                  placeholderTextColor="#9CA3AF"
                  className="bg-white text-gray-900 rounded-xl p-4 min-h-32 text-base border-2 border-gray-200 focus:border-blue-500"
                  style={{ textAlignVertical: 'top' }}
                />
                <Text className="text-gray-500 text-xs mt-2">Cuéntalo como si hablaras con un colega</Text>
              </View>
            )}

            <RecordingButton
              isRecording={voice.isRecording}
              isLoading={voice.isLoadingModel}
              isTranscribing={voice.isTranscribing}
              onPress={handleToggleVoice}
              disabled={voice.isLoadingModel || voice.isTranscribing}
            />

            {(error || voice.error) && (
              <View className="bg-red-50 border border-red-200 rounded-lg p-3 mt-4">
                <Text className="text-red-700 text-sm font-medium">{error ?? voice.error}</Text>
              </View>
            )}
            <Pressable
              onPress={handleExtract}
              disabled={!text.trim() || voice.isRecording || voice.isTranscribing}
              className={`mt-6 rounded-xl py-4 items-center ${
                text.trim() && !voice.isRecording && !voice.isTranscribing
                  ? 'bg-blue-600'
                  : 'bg-gray-300'
              }`}>
              <Text className={`font-semibold text-base ${text.trim() && !voice.isRecording && !voice.isTranscribing ? 'text-white' : 'text-gray-500'}`}>
                ✓ Extraer información
              </Text>
            </Pressable>
          </>
        )}

        {screen === 'extracting' && (
          <View className="items-center py-16">
            <ActivityIndicator color="#0066CC" size="large" />
            <Text className="text-gray-700 mt-4 text-base font-medium">
              {progress != null ? `Procesando… ${progress}%` : 'Procesando…'}
            </Text>
          </View>
        )}

        {(screen === 'review' || screen === 'saving') && institution && (
          <View>
            <View className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
              <Text className="text-blue-700 text-xs font-bold uppercase mb-3">Cliente Identificado</Text>
              <TextInput
                value={institution.name ?? ''}
                onChangeText={(v) => setInstitution({ ...institution, name: v || null })}
                placeholder="Nombre del cliente"
                placeholderTextColor="#9CA3AF"
                className="bg-white text-gray-900 rounded-lg px-3 py-2 mb-3 border border-gray-200 text-base font-semibold"
              />
              <View className="flex-row gap-2">
                <TextInput
                  value={institution.city ?? ''}
                  onChangeText={(v) => setInstitution({ ...institution, city: v || null })}
                  placeholder="Ciudad"
                  placeholderTextColor="#9CA3AF"
                  className="bg-white text-gray-900 rounded-lg px-3 py-2 flex-1 border border-gray-200"
                />
                <TextInput
                  value={institution.countryIso ?? ''}
                  onChangeText={(v) => setInstitution({ ...institution, countryIso: v.toUpperCase() || null })}
                  placeholder="País"
                  placeholderTextColor="#9CA3AF"
                  className="bg-white text-gray-900 rounded-lg px-3 py-2 w-20 border border-gray-200"
                />
              </View>
            </View>

            {followUp && (
              <View className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                <View className="flex-row items-start gap-3">
                  <Text className="text-2xl">💡</Text>
                  <View className="flex-1">
                    <Text className="text-amber-700 text-xs font-bold uppercase mb-1">Dato Crítico</Text>
                    <Text className="text-gray-900 text-sm font-medium">{followUp.question}</Text>
                  </View>
                </View>
              </View>
            )}

            <Text className="text-gray-700 text-sm font-bold uppercase mb-3">
              Equipos Detectados ({equipment.length})
            </Text>
            {equipment.length === 0 && (
              <View className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4">
                <Text className="text-gray-600 text-sm">No se detectó ningún equipo en el texto.</Text>
              </View>
            )}
            {equipment.map((eq, i) => (
              <View key={i} className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
                <View className="flex-row items-center justify-between mb-4">
                  <Text className="text-gray-900 font-bold text-base">{eq.modality}</Text>
                  <StatusChip status={eq.fieldStatus.count} onPress={() => updateEquipment(i, { fieldStatus: { ...eq.fieldStatus, count: cycleStatus(eq.fieldStatus.count) } })} />
                </View>

                <Pressable
                  onPress={() => handleScanForEquipment(i)}
                  disabled={scanningIndex !== null}
                  className="bg-blue-50 border border-blue-200 rounded-lg py-2.5 items-center mb-4 flex-row justify-center gap-2">
                  {scanningIndex === i ? (
                    <>
                      <ActivityIndicator color="#0066CC" />
                      <Text className="text-blue-700 text-sm font-medium">
                        {scanProgress !== null ? `Cargando modelo… ${scanProgress}%` : 'Leyendo placa…'}
                      </Text>
                    </>
                  ) : (
                    <Text className="text-blue-700 text-sm font-medium">📷 Escanear placa para confirmar</Text>
                  )}
                </Pressable>

                <View className="mb-3">
                  <Text className="text-gray-600 text-xs font-semibold mb-2">Cantidad</Text>
                  <View className="flex-row items-center gap-2">
                    <TextInput
                      value={eq.count != null ? String(eq.count) : ''}
                      onChangeText={(v) => updateEquipment(i, { count: v ? parseInt(v, 10) || null : null })}
                      placeholder="0"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="number-pad"
                      className="bg-gray-50 text-gray-900 rounded-lg px-3 py-2 w-20 border border-gray-200"
                    />
                    <Text className="text-gray-600 text-xs">unidades</Text>
                  </View>
                </View>

                <View className="mb-3">
                  <Text className="text-gray-600 text-xs font-semibold mb-2">Fabricante</Text>
                  <View className="flex-row items-center gap-2">
                    <TextInput
                      value={eq.manufacturer ?? ''}
                      onChangeText={(v) => updateEquipment(i, { manufacturer: v || null })}
                      placeholder="Ej: Siemens"
                      placeholderTextColor="#9CA3AF"
                      className="bg-gray-50 text-gray-900 rounded-lg px-3 py-2 flex-1 border border-gray-200"
                    />
                    <StatusChip status={eq.fieldStatus.manufacturer} onPress={() => updateEquipment(i, { fieldStatus: { ...eq.fieldStatus, manufacturer: cycleStatus(eq.fieldStatus.manufacturer) } })} />
                  </View>
                </View>

                <View className="mb-3">
                  <Text className="text-gray-600 text-xs font-semibold mb-2">Modelo</Text>
                  <View className="flex-row items-center gap-2">
                    <TextInput
                      value={eq.model ?? ''}
                      onChangeText={(v) => updateEquipment(i, { model: v || null })}
                      placeholder="Ej: Magnetom"
                      placeholderTextColor="#9CA3AF"
                      className="bg-gray-50 text-gray-900 rounded-lg px-3 py-2 flex-1 border border-gray-200"
                    />
                    <StatusChip status={eq.fieldStatus.model} onPress={() => updateEquipment(i, { fieldStatus: { ...eq.fieldStatus, model: cycleStatus(eq.fieldStatus.model) } })} />
                  </View>
                </View>

                <View>
                  <Text className="text-gray-600 text-xs font-semibold mb-2">Año de Instalación</Text>
                  <View className="flex-row items-center gap-2">
                    <TextInput
                      value={eq.installYearLo != null ? String(eq.installYearLo) : ''}
                      onChangeText={(v) => {
                        const year = v ? parseInt(v, 10) || null : null;
                        updateEquipment(i, { installYearLo: year, installYearHi: year });
                      }}
                      placeholder="Ej: 2015"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="number-pad"
                      className="bg-gray-50 text-gray-900 rounded-lg px-3 py-2 flex-1 border border-gray-200"
                    />
                    <StatusChip status={eq.fieldStatus.age} onPress={() => updateEquipment(i, { fieldStatus: { ...eq.fieldStatus, age: cycleStatus(eq.fieldStatus.age) } })} />
                  </View>
                  {eq.installYearLo != null && eq.installYearHi != null && eq.installYearLo !== eq.installYearHi && (
                    <Text className="text-gray-500 text-xs mt-2">Rango estimado: {eq.installYearLo}–{eq.installYearHi}</Text>
                  )}
                </View>
              </View>
            ))}

            {error && (
              <View className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <Text className="text-red-700 text-sm font-medium">{error}</Text>
              </View>
            )}

            <View className="flex-row gap-3 mt-6">
              <Pressable
                onPress={() => setScreen('input')}
                className="flex-1 rounded-xl py-3 items-center border-2 border-blue-600">
                <Text className="text-blue-600 font-semibold">Editar texto</Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                disabled={screen === 'saving'}
                className="flex-1 rounded-xl py-3 items-center bg-green-600">
                {screen === 'saving' ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-semibold">💾 Guardar</Text>
                )}
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
