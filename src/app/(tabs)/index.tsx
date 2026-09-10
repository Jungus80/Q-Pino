import { normalizeObservation } from '@/core/normalize/pipeline';
import type { ExtractedObservation, Modality, NormalizedEquipment, NormalizedInstitution } from '@/core/schema/observation';
import { MODALITIES } from '@/core/schema/observation';
import { saveObservation } from '@/db/saveObservation';
import { extractObservation } from '@/ai/extract';
import { useVoiceCapture } from '@/ai/asr';
import { StatusChip, cycleStatus } from '@/components/StatusChip';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
    <View className="flex-row items-center gap-1 h-8">
      {historyRef.current.map((v, i) => (
        <View
          key={i}
          className="flex-1 bg-red-400 rounded-full"
          style={{ height: Math.max(3, v * 32), opacity: 0.4 + v * 0.6 }}
        />
      ))}
    </View>
  );
}

export default function CaptureScreen() {
  const router = useRouter();
  const voice = useVoiceCapture();
  const [screen, setScreen] = useState<Screen>('input');
  const [text, setText] = useState('');
  const [source, setSource] = useState<'text' | 'voice'>('text');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<ExtractedObservation | null>(null);
  const [institution, setInstitution] = useState<NormalizedInstitution | null>(null);
  const [equipment, setEquipment] = useState<NormalizedEquipment[]>([]);

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
      setError(e?.message ?? String(e));
      setScreen('input');
    }
  }

  function updateEquipment(index: number, patch: Partial<NormalizedEquipment>) {
    setEquipment((prev) => prev.map((eq, i) => (i === index ? { ...eq, ...patch } : eq)));
  }

  async function handleSave() {
    if (!extraction || !institution) return;
    setScreen('saving');
    try {
      const result = await saveObservation({
        rawText: text.trim(),
        transcript: text.trim(),
        comments: extraction.comments,
        source,
        extraction,
        institution,
        equipment,
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
    <SafeAreaView className="flex-1 bg-neutral-950">
      <ScrollView contentContainerClassName="p-4 pb-12" keyboardShouldPersistTaps="handled">
        <Text className="text-white text-2xl font-bold mb-1">Capturar observación</Text>
        <Text className="text-neutral-400 mb-4">
          Escribe lo que viste en la visita, como si se lo contaras a un colega.
        </Text>

        {screen === 'input' && (
          <>
            {voice.isRecording ? (
              <View className="bg-neutral-900 rounded-xl p-4 min-h-32 justify-center">
                <View className="flex-row items-center mb-3">
                  <View className="w-2 h-2 rounded-full bg-red-500 mr-2" />
                  <Text className="text-red-400 text-xs font-medium">Grabando… habla ahora</Text>
                </View>
                <Waveform level={voice.audioLevel} />
              </View>
            ) : voice.isLoadingModel || voice.isTranscribing ? (
              <View className="bg-neutral-900 rounded-xl p-4 min-h-32 items-center justify-center">
                <ActivityIndicator color="#fff" />
                <Text className="text-neutral-400 mt-3 text-sm">
                  {voice.isLoadingModel ? 'Cargando modelo de voz…' : 'Transcribiendo…'}
                </Text>
              </View>
            ) : (
              <TextInput
                value={text}
                onChangeText={(v) => {
                  setText(v);
                  setSource('text');
                }}
                multiline
                placeholder='Ej: "Estoy en Hospital DemoCare Pacific, en Panamá. Vi dos resonadores, uno parece de unos ocho años."'
                placeholderTextColor="#71717a"
                className="bg-neutral-900 text-white rounded-xl p-4 min-h-32 text-base"
                style={{ textAlignVertical: 'top' }}
              />
            )}

            <Pressable
              onPress={handleToggleVoice}
              disabled={voice.isLoadingModel || voice.isTranscribing}
              className={`mt-3 rounded-xl py-3 items-center flex-row justify-center gap-2 ${
                voice.isRecording ? 'bg-red-600' : 'bg-neutral-800'
              }`}>
              <Text className="text-white font-semibold">
                {voice.isRecording ? '⏹  Detener y transcribir' : '🎙️  Dictar observación'}
              </Text>
            </Pressable>

            {(error || voice.error) && <Text className="text-red-400 mt-3">{error ?? voice.error}</Text>}
            <Pressable
              onPress={handleExtract}
              disabled={!text.trim() || voice.isRecording || voice.isTranscribing}
              className={`mt-3 rounded-xl py-3 items-center ${
                text.trim() && !voice.isRecording && !voice.isTranscribing ? 'bg-blue-600' : 'bg-neutral-800'
              }`}>
              <Text className="text-white font-semibold">Extraer información</Text>
            </Pressable>
          </>
        )}

        {screen === 'extracting' && (
          <View className="items-center py-16">
            <ActivityIndicator color="#fff" />
            <Text className="text-neutral-400 mt-3">
              {progress != null ? `Procesando… ${progress}%` : 'Procesando…'}
            </Text>
          </View>
        )}

        {(screen === 'review' || screen === 'saving') && institution && (
          <View>
            <Text className="text-neutral-500 text-xs uppercase mb-1">Cliente</Text>
            <TextInput
              value={institution.name ?? ''}
              onChangeText={(v) => setInstitution({ ...institution, name: v || null })}
              placeholder="Nombre del cliente"
              placeholderTextColor="#71717a"
              className="bg-neutral-900 text-white rounded-lg px-3 py-2 mb-2"
            />
            <View className="flex-row gap-2 mb-4">
              <TextInput
                value={institution.city ?? ''}
                onChangeText={(v) => setInstitution({ ...institution, city: v || null })}
                placeholder="Ciudad"
                placeholderTextColor="#71717a"
                className="bg-neutral-900 text-white rounded-lg px-3 py-2 flex-1"
              />
              <TextInput
                value={institution.countryIso ?? ''}
                onChangeText={(v) => setInstitution({ ...institution, countryIso: v.toUpperCase() || null })}
                placeholder="País (ISO)"
                placeholderTextColor="#71717a"
                className="bg-neutral-900 text-white rounded-lg px-3 py-2 w-24"
              />
            </View>

            <Text className="text-neutral-500 text-xs uppercase mb-2">
              Equipos ({equipment.length})
            </Text>
            {equipment.length === 0 && (
              <Text className="text-neutral-500 mb-4">No se detectó ningún equipo en el texto.</Text>
            )}
            {equipment.map((eq, i) => (
              <View key={i} className="bg-neutral-900 rounded-xl p-3 mb-3">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-white font-semibold">{eq.modality}</Text>
                  <StatusChip status={eq.fieldStatus.count} onPress={() => updateEquipment(i, { fieldStatus: { ...eq.fieldStatus, count: cycleStatus(eq.fieldStatus.count) } })} />
                </View>

                <View className="flex-row items-center gap-2 mb-2">
                  <TextInput
                    value={eq.count != null ? String(eq.count) : ''}
                    onChangeText={(v) => updateEquipment(i, { count: v ? parseInt(v, 10) || null : null })}
                    placeholder="Cantidad"
                    placeholderTextColor="#71717a"
                    keyboardType="number-pad"
                    className="bg-neutral-800 text-white rounded-lg px-3 py-2 w-20"
                  />
                  <Text className="text-neutral-500 text-xs">unidades</Text>
                </View>

                <View className="flex-row items-center gap-2 mb-2">
                  <TextInput
                    value={eq.manufacturer ?? ''}
                    onChangeText={(v) => updateEquipment(i, { manufacturer: v || null })}
                    placeholder="Fabricante"
                    placeholderTextColor="#71717a"
                    className="bg-neutral-800 text-white rounded-lg px-3 py-2 flex-1"
                  />
                  <StatusChip status={eq.fieldStatus.manufacturer} onPress={() => updateEquipment(i, { fieldStatus: { ...eq.fieldStatus, manufacturer: cycleStatus(eq.fieldStatus.manufacturer) } })} />
                </View>

                <View className="flex-row items-center gap-2 mb-2">
                  <TextInput
                    value={eq.model ?? ''}
                    onChangeText={(v) => updateEquipment(i, { model: v || null })}
                    placeholder="Modelo"
                    placeholderTextColor="#71717a"
                    className="bg-neutral-800 text-white rounded-lg px-3 py-2 flex-1"
                  />
                  <StatusChip status={eq.fieldStatus.model} onPress={() => updateEquipment(i, { fieldStatus: { ...eq.fieldStatus, model: cycleStatus(eq.fieldStatus.model) } })} />
                </View>

                <View className="flex-row items-center gap-2">
                  <Text className="text-neutral-400 flex-1">
                    {eq.installYearLo != null
                      ? eq.installYearLo === eq.installYearHi
                        ? `Instalado en ${eq.installYearLo}`
                        : `Instalado entre ${eq.installYearLo}–${eq.installYearHi}`
                      : 'Antigüedad desconocida'}
                  </Text>
                  <StatusChip status={eq.fieldStatus.age} onPress={() => updateEquipment(i, { fieldStatus: { ...eq.fieldStatus, age: cycleStatus(eq.fieldStatus.age) } })} />
                </View>
              </View>
            ))}

            {error && <Text className="text-red-400 mb-3">{error}</Text>}

            <View className="flex-row gap-3 mt-2">
              <Pressable
                onPress={() => setScreen('input')}
                className="flex-1 rounded-xl py-3 items-center bg-neutral-800">
                <Text className="text-white font-semibold">Editar texto</Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                disabled={screen === 'saving'}
                className="flex-1 rounded-xl py-3 items-center bg-emerald-600">
                {screen === 'saving' ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-semibold">Guardar</Text>
                )}
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
