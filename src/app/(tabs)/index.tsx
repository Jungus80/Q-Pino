import { normalizeObservation } from '@/core/normalize/pipeline';
import { computeNextQuestion } from '@/core/followup/nextQuestion';
import type { ExtractedObservation, Modality, NormalizedEquipment, NormalizedInstitution } from '@/core/schema/observation';
import { MODALITIES } from '@/core/schema/observation';
import { saveObservation } from '@/db/saveObservation';
import { matchInstitution } from '@/db/repos/institutions';
import { extractObservation } from '@/ai/extract';
import { useVoiceCapture } from '@/ai/asr';
import { scanPlate } from '@/ai/plateOcr';
import { useLlmPreload } from '@/hooks/use-llm-preload';
import { useObserverName } from '@/hooks/use-observer-name';
import { StatusChip, cycleStatus } from '@/components/StatusChip';
import { RecordingButton } from '@/components/RecordingButton';
import { Icon } from '@/components/Icon';
import { Modal } from '@/components/Modal';
import { ProfessionalButton } from '@/components/ProfessionalButton';
import { StickyFooterTabBarInset, TabScreenSafeAreaEdges } from '@/constants/theme';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Floating-card shadow for sticky footers — kept as a plain style object since
 * NativeWind's `shadow-*` classes don't reliably map to Android's `elevation`. */
const floatingFooterShadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.12,
  shadowRadius: 12,
  elevation: 6,
};

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
  const { llmPreloading, llmPreloadProgress } = useLlmPreload();
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
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  // Measured keyboard height (Android only — see note by KeyboardAvoidingView below).
  const [androidKeyboardHeight, setAndroidKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardVisible(true);
      setAndroidKeyboardHeight(e?.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
      setAndroidKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

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
      // ZodError (unexpected shape) or SyntaxError (empty/truncated JSON — extractObservation
      // already retries once, so a second failure here is a persistent decoding issue, not a
      // fluke) shouldn't dump raw internals on screen — a friendly retry prompt is more useful.
      const friendly =
        e?.name === 'ZodError' || e instanceof SyntaxError
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
  const canProceed = Boolean(text.trim()) && !voice.isRecording && !voice.isStarting && !voice.isTranscribing && !voice.isLoadingModel;

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
    <SafeAreaView className="flex-1 bg-white" edges={TabScreenSafeAreaEdges}>
      <KeyboardAvoidingView
        className="flex-1"
        // Android: KeyboardAvoidingView's native resize ('height'/'padding') has no
        // effect here — this screen is hosted inside a NativeTabs/react-native-screens
        // Fragment whose layout doesn't shrink from RN's animated height style (and
        // windowSoftInputMode="adjustResize" no longer resizes the window under
        // edge-to-edge either). So on Android we skip the built-in behavior and instead
        // apply the measured keyboard height as padding ourselves, below.
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        // NativeTabs bar sits below this screen — offset so the footer clears it.
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        style={{ paddingBottom: androidKeyboardHeight }}>
        <ScrollView
          contentContainerClassName="p-4 pb-12"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
        <View className="flex-row items-center justify-between mb-2 gap-2">
          <View className="flex-1 shrink">
            <Text className="text-gray-900 text-2xl font-bold">Nueva Observación</Text>
            <Text className="text-gray-500 text-sm mt-1">Registra los detalles de la visita</Text>
          </View>
          <Pressable onPress={observer.promptForName} className="flex-row items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 shrink-0 max-w-[45%]">
            <Icon name="user" size="sm" color="#374151" />
            <Text className="text-gray-700 text-sm font-medium" numberOfLines={1}>{observer.name}</Text>
          </Pressable>
        </View>
        <View className="flex-row gap-2 mb-4">
          <View className="flex-1 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex-row items-center gap-2">
            <Icon name="phone" size="sm" color="#0066CC" />
            <Text className="text-blue-700 text-xs font-medium">Modo sin conexión</Text>
          </View>
          {llmPreloading && (
            <View className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 flex-row items-center gap-2">
              <ActivityIndicator color="#0066CC" size="small" />
              <Text className="text-gray-600 text-xs font-medium">
                Preparando IA{llmPreloadProgress != null ? ` ${Math.round(llmPreloadProgress)}%` : ''}
              </Text>
            </View>
          )}
        </View>

        {screen === 'input' && (
          <>
            {voice.isRecording ? (
              <View className="bg-red-50 border-2 border-red-300 rounded-xl p-4 min-h-32 justify-center">
                <View className="flex-row items-center mb-3">
                  <View className="w-3 h-3 rounded-full bg-red-500 mr-2 animate-pulse" />
                  <Text className="text-red-600 text-sm font-semibold">Grabando audio</Text>
                </View>
                <Waveform level={voice.audioLevel} />
              </View>
            ) : voice.isLoadingModel || voice.isTranscribing ? (
              <View className="bg-blue-50 border border-blue-200 rounded-xl p-4 min-h-32 items-center justify-center">
                <ActivityIndicator color="#0066CC" size="large" />
                <Text className="text-blue-700 mt-3 text-sm font-medium">
                  {voice.isLoadingModel ? 'Preparando reconocimiento de voz' : 'Convirtiendo audio a texto'}
                </Text>
              </View>
            ) : (
              <View className="bg-white border-2 border-gray-200 rounded-xl p-4">
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
                  className="bg-gray-50 text-gray-900 rounded-xl p-4 min-h-32 text-base border border-gray-200 focus:border-blue-500"
                  style={{ textAlignVertical: 'top' }}
                />
                <Text className="text-gray-500 text-xs mt-2">Proporciona detalles técnicos y observaciones relevantes</Text>

                <View className="flex-row items-center my-5">
                  <View className="flex-1 h-px bg-gray-200" />
                  <Text className="mx-3 text-gray-400 text-xs font-medium uppercase tracking-wide">o graba con voz</Text>
                  <View className="flex-1 h-px bg-gray-200" />
                </View>

                {!voice.isRecording && (
                  <Pressable
                    onPress={handleToggleVoice}
                    disabled={voice.isStarting || voice.isLoadingModel || voice.isTranscribing}
                    className="flex-row items-center justify-center gap-3 py-3 px-4 rounded-xl border-2 border-blue-200 bg-blue-50 active:bg-blue-100">
                    <View className="w-10 h-10 rounded-full bg-blue-600 items-center justify-center">
                      {voice.isStarting ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Icon name="mic" size="sm" color="#FFFFFF" />
                      )}
                    </View>
                    <Text className="text-blue-700 font-semibold text-sm">
                      {voice.isStarting ? 'Iniciando grabación…' : 'Presiona para grabar'}
                    </Text>
                  </Pressable>
                )}
              </View>
            )}

            {screen === 'input' && !voice.isRecording && !voice.isLoadingModel && !voice.isTranscribing && (
              <View className="mt-4 bg-gray-50 border border-gray-200 rounded-xl p-4">
                <Text className="text-gray-700 text-xs font-bold uppercase mb-2">Para una mejor lectura</Text>
                {[
                  'Nombrá el cliente, la ciudad y el país.',
                  'Indicá cuántos equipos hay, su modalidad y antigüedad aproximada.',
                  'Mencioná el fabricante o modelo si lo ves en la placa.',
                ].map((tip) => (
                  <View key={tip} className="flex-row items-start gap-2 mb-1.5 last:mb-0">
                    <Icon name="check" size="xs" color="#10B981" />
                    <Text className="text-gray-600 text-xs flex-1">{tip}</Text>
                  </View>
                ))}
              </View>
            )}

            {voice.isRecording && (
              <RecordingButton
                isRecording={voice.isRecording}
                isLoading={voice.isLoadingModel}
                isTranscribing={voice.isTranscribing}
                onPress={handleToggleVoice}
              />
            )}

            {(error || voice.error) && (
              <View className="bg-red-50 border border-red-200 rounded-lg p-3 mt-4 flex-row items-start gap-2">
                <Icon name="error" size="sm" color="#DC2626" />
                <Text className="text-red-700 text-sm font-medium flex-1">{error ?? voice.error}</Text>
              </View>
            )}

            {/* Spacer so scroll content clears the floating sticky CTA below. */}
            <View style={{ height: 100 }} />
          </>
        )}

        {screen === 'extracting' && (
          <View className="items-center py-16">
            <ActivityIndicator color="#0066CC" size="large" />
            <Text className="text-gray-900 mt-4 text-base font-semibold">
              Analizando información
            </Text>
            <Text className="text-gray-600 mt-2 text-sm">
              Extrayendo datos relevantes
            </Text>
            {progress != null && (
              <View className="mt-4 w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <View
                  className="bg-blue-600 h-full rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </View>
            )}
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
              <View className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex-row items-start gap-3">
                <Icon name="info" size="md" color="#D97706" />
                <View className="flex-1">
                  <Text className="text-amber-700 text-xs font-bold uppercase mb-1">Información Importante</Text>
                  <Text className="text-gray-900 text-sm font-medium">{followUp.question}</Text>
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
                        {scanProgress !== null ? `Preparando análisis… ${scanProgress}%` : 'Reconociendo texto…'}
                      </Text>
                    </>
                  ) : (
                    <View className="flex-row items-center gap-2">
                      <Icon name="camera" size="sm" color="#0066CC" />
                      <Text className="text-blue-700 text-sm font-medium">Escanear placa para confirmar</Text>
                    </View>
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
              <View className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex-row items-start gap-2">
                <Icon name="error" size="sm" color="#DC2626" />
                <Text className="text-red-700 text-sm font-medium flex-1">{error}</Text>
              </View>
            )}

            {/* Spacer so scroll content clears the sticky review footer. */}
            <View style={{ height: 100 }} />
          </View>
        )}
        </ScrollView>

        {/* Floating sticky footer for review — save must stay visible above the tab bar. */}
        {(screen === 'review' || screen === 'saving') && institution && (
          <View style={{ paddingBottom: keyboardVisible ? 8 : StickyFooterTabBarInset + 16 }}>
            <View
              className="mx-4 p-3 bg-white rounded-2xl flex-row gap-3"
              style={floatingFooterShadow}>
              <Pressable
                onPress={() => setScreen('input')}
                disabled={screen === 'saving'}
                className="flex-1 rounded-xl py-4 items-center justify-center border border-gray-300 bg-gray-50 active:bg-gray-100">
                <Text className="text-blue-600 font-semibold text-sm">Volver a Editar</Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                disabled={screen === 'saving'}
                className="flex-1 rounded-xl py-4 flex-row items-center justify-center gap-2 bg-green-600 active:bg-green-700">
                {screen === 'saving' ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Icon name="save" size="sm" color="#FFFFFF" />
                    <Text className="text-white font-semibold text-sm">Guardar</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        )}

        {/* Single floating sticky CTA — stays above the tab bar or the keyboard, never duplicated in scroll. */}
        {screen === 'input' && (
          <View style={{ paddingBottom: keyboardVisible ? 8 : StickyFooterTabBarInset + 16 }}>
            <View className="mx-4 p-3 bg-white rounded-2xl" style={floatingFooterShadow}>
              {!canProceed && (
                <Text className="text-gray-400 text-xs text-center mb-2">Escribe tu observación para continuar</Text>
              )}
              <Pressable
                onPress={handleExtract}
                disabled={!canProceed}
                className={`rounded-xl py-4 flex-row items-center justify-center gap-2 ${
                  canProceed ? 'bg-blue-600 active:bg-blue-700' : 'bg-gray-200 border border-gray-300'
                }`}>
                <Text className={`font-semibold text-base ${canProceed ? 'text-white' : 'text-gray-500'}`}>
                  Continuar
                </Text>
                <Icon name="chevron-right" size="sm" color={canProceed ? '#FFFFFF' : '#9CA3AF'} />
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      <Modal
        visible={observer.androidPrompt.visible}
        title="Tu nombre"
        onClose={observer.androidPrompt.cancel}
        actions={
          <ProfessionalButton
            label="Guardar"
            onPress={observer.androidPrompt.confirm}
            disabled={!observer.androidPrompt.draft.trim()}
            fullWidth
          />
        }>
        <Text className="text-gray-500 text-sm mb-3">Aparecerá como el autor de tus observaciones.</Text>
        <TextInput
          value={observer.androidPrompt.draft}
          onChangeText={observer.androidPrompt.setDraft}
          placeholder="Ej: Juan Pérez"
          autoFocus
          className="border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
        />
      </Modal>
    </SafeAreaView>
  );
}
