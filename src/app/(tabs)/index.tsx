import { normalizeObservation } from '@/core/normalize/pipeline';
import { computeNextQuestion } from '@/core/followup/nextQuestion';
import type { ExtractedObservation, NormalizedEquipment, NormalizedInstitution } from '@/core/schema/observation';
import { saveObservation } from '@/db/saveObservation';
import { matchInstitution } from '@/db/repos/institutions';
import { extractObservation } from '@/ai/extract';
import { useVoiceCapture } from '@/ai/asr';
import { scanPlate } from '@/ai/plateOcr';
import { useLlmPreload } from '@/hooks/use-llm-preload';
import { useObserverName } from '@/hooks/use-observer-name';
import { StatusChip, cycleStatus } from '@/components/StatusChip';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/kit/Screen';
import { ScreenHeader } from '@/components/kit/ScreenHeader';
import { StickyActionBar } from '@/components/kit/StickyActionBar';
import { VoiceCapture } from '@/components/kit/VoiceCapture';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { Badge } from '@/components/ui/badge';
import { ModeToggle } from '@/components/ui/mode-toggle';
import { Modal } from '@/components/Modal';
import { StickyFooterTabBarInset } from '@/constants/theme';
import { useAppStyles } from '@/theme/useAppStyles';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput } from 'react-native';

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

type CapturePhase = 'input' | 'extracting' | 'review' | 'saving';

export default function CaptureScreen() {
  const router = useRouter();
  const { styles, muted, green, red, orange } = useAppStyles();
  const voice = useVoiceCapture();
  const observer = useObserverName();
  const { llmPreloading, llmPreloadProgress } = useLlmPreload();
  const [screen, setScreen] = useState<CapturePhase>('input');
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
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        style={{ flex: 1, paddingBottom: androidKeyboardHeight }}>
        <ScrollView
          contentContainerStyle={[styles.pad, { paddingBottom: 48 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
        <ScreenHeader
          title="Nueva observación"
          subtitle="Registra los detalles de la visita"
          right={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ModeToggle />
              <Pressable onPress={observer.promptForName} style={styles.ghostChip}>
                <Icon name="user" size="sm" color={muted} />
                <Text style={styles.ghostChipText} numberOfLines={1}>
                  {observer.name}
                </Text>
              </Pressable>
            </View>
          }
        />
        <View style={[styles.wrap, { marginBottom: 16 }]}>
          <Badge variant="secondary">Modo sin conexión</Badge>
          {llmPreloading && (
            <Badge variant="outline">
              {`Preparando IA${llmPreloadProgress != null ? ` ${Math.round(llmPreloadProgress)}%` : ''}`}
            </Badge>
          )}
        </View>

        {screen === 'input' && (
          <>
            {voice.isRecording || voice.isLoadingModel || voice.isTranscribing || voice.isStarting ? (
              <VoiceCapture
                isRecording={voice.isRecording}
                isStarting={voice.isStarting}
                isLoadingModel={voice.isLoadingModel}
                isTranscribing={voice.isTranscribing}
                audioLevel={voice.audioLevel}
                onToggle={handleToggleVoice}
              />
            ) : (
              <Card>
                <Input
                  label="Descripción de la visita"
                  type="textarea"
                  rows={5}
                  value={text}
                  onChangeText={(v) => {
                    setText(v);
                    setSource('text');
                  }}
                  placeholder='Ej: "Estoy en Hospital DemoCare Pacific, en Panamá. Vi dos resonadores, uno parece de unos ocho años."'
                />
                <Text variant="caption" style={{ marginTop: 8 }}>Proporciona detalles técnicos y observaciones relevantes</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 16, gap: 12 }}>
                  <View style={{ flex: 1 }}><Separator /></View>
                  <Text variant="caption">o graba con voz</Text>
                  <View style={{ flex: 1 }}><Separator /></View>
                </View>
                <VoiceCapture
                  embedded
                  isRecording={false}
                  isStarting={voice.isStarting}
                  isLoadingModel={voice.isLoadingModel}
                  isTranscribing={voice.isTranscribing}
                  audioLevel={0}
                  onToggle={handleToggleVoice}
                />
              </Card>
            )}

            {!voice.isRecording && !voice.isLoadingModel && !voice.isTranscribing && (
              <View style={{ marginTop: 16 }}>
                <Text variant="caption" style={{ marginBottom: 8 }}>Para una mejor lectura</Text>
                {[
                  'Nombrá el cliente, la ciudad y el país.',
                  'Indicá cuántos equipos hay, su modalidad y antigüedad aproximada.',
                  'Mencioná el fabricante o modelo si lo ves en la placa.',
                ].map((tip) => (
                  <View key={tip} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                    <Icon name="check" size="xs" color={green} />
                    <Text variant="caption" style={{ flex: 1 }}>{tip}</Text>
                  </View>
                ))}
              </View>
            )}

            {(error || voice.error) && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                <Icon name="error" size="sm" color={red} />
                <Text style={[styles.bodySm, { color: red, flex: 1 }]}>{error ?? voice.error}</Text>
              </View>
            )}

            <View style={{ height: 100 }} />
          </>
        )}

        {screen === 'extracting' && (
          <View style={{ alignItems: 'center', paddingVertical: 48 }}>
            <Spinner size="lg" />
            <Text variant="subtitle" style={{ marginTop: 16 }}>Analizando información</Text>
            <Text variant="caption" style={{ marginTop: 8 }}>Extrayendo datos relevantes</Text>
            {progress != null && (
              <View style={{ width: '100%', marginTop: 16 }}>
                <Progress value={progress} />
              </View>
            )}
          </View>
        )}

        {(screen === 'review' || screen === 'saving') && institution && (
          <View>
            <Card style={{ marginBottom: 20 }}>
              <Text variant="caption" style={{ marginBottom: 12 }}>Cliente identificado</Text>
              <TextInput
                value={institution.name ?? ''}
                onChangeText={(v) => setInstitution({ ...institution, name: v || null })}
                placeholder="Nombre del cliente"
                placeholderTextColor={muted}
                style={[styles.input, styles.bodySemi, { marginBottom: 10 }]}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  value={institution.city ?? ''}
                  onChangeText={(v) => setInstitution({ ...institution, city: v || null })}
                  placeholder="Ciudad"
                  placeholderTextColor={muted}
                  style={[styles.input, { flex: 1 }]}
                />
                <TextInput
                  value={institution.countryIso ?? ''}
                  onChangeText={(v) => setInstitution({ ...institution, countryIso: v.toUpperCase() || null })}
                  placeholder="País"
                  placeholderTextColor={muted}
                  autoCapitalize="characters"
                  style={[styles.input, { width: 80 }]}
                />
              </View>
            </Card>

            {followUp && (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 20 }}>
                <Icon name="info" size="md" color={orange} />
                <View style={{ flex: 1 }}>
                  <Text variant="caption">Información importante</Text>
                  <Text variant="subtitle">{followUp.question}</Text>
                </View>
              </View>
            )}

            <Text variant="caption" style={{ marginBottom: 12 }}>
              Equipos detectados ({equipment.length})
            </Text>
            {equipment.length === 0 && (
              <Text variant="caption" style={{ marginBottom: 16 }}>No se detectó ningún equipo en el texto.</Text>
            )}
            {equipment.map((eq, i) => (
              <Card key={i} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <Text variant="subtitle">{eq.modality}</Text>
                  <StatusChip status={eq.fieldStatus.count} onPress={() => updateEquipment(i, { fieldStatus: { ...eq.fieldStatus, count: cycleStatus(eq.fieldStatus.count) } })} />
                </View>

                <Button
                  variant="outline"
                  onPress={() => handleScanForEquipment(i)}
                  disabled={scanningIndex !== null}
                  loading={scanningIndex === i}
                  style={{ marginBottom: 14 }}
                >
                  {scanningIndex === i
                    ? (scanProgress !== null ? `Preparando análisis… ${scanProgress}%` : 'Reconociendo texto…')
                    : 'Escanear placa para confirmar'}
                </Button>

                <Text variant="caption" style={{ marginBottom: 6 }}>Cantidad</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <TextInput
                    value={eq.count != null ? String(eq.count) : ''}
                    onChangeText={(v) => updateEquipment(i, { count: v ? parseInt(v, 10) || null : null })}
                    placeholder="0"
                    placeholderTextColor={muted}
                    keyboardType="number-pad"
                    style={[styles.input, { width: 80 }]}
                  />
                  <Text variant="caption">unidades</Text>
                </View>

                <Text variant="caption" style={{ marginBottom: 6 }}>Fabricante</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <TextInput
                    value={eq.manufacturer ?? ''}
                    onChangeText={(v) => updateEquipment(i, { manufacturer: v || null })}
                    placeholder="Ej: Siemens"
                    placeholderTextColor={muted}
                    style={[styles.input, { flex: 1 }]}
                  />
                  <StatusChip status={eq.fieldStatus.manufacturer} onPress={() => updateEquipment(i, { fieldStatus: { ...eq.fieldStatus, manufacturer: cycleStatus(eq.fieldStatus.manufacturer) } })} />
                </View>

                <Text variant="caption" style={{ marginBottom: 6 }}>Modelo</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <TextInput
                    value={eq.model ?? ''}
                    onChangeText={(v) => updateEquipment(i, { model: v || null })}
                    placeholder="Ej: Magnetom"
                    placeholderTextColor={muted}
                    style={[styles.input, { flex: 1 }]}
                  />
                  <StatusChip status={eq.fieldStatus.model} onPress={() => updateEquipment(i, { fieldStatus: { ...eq.fieldStatus, model: cycleStatus(eq.fieldStatus.model) } })} />
                </View>

                <Text variant="caption" style={{ marginBottom: 6 }}>Año de instalación</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput
                    value={eq.installYearLo != null ? String(eq.installYearLo) : ''}
                    onChangeText={(v) => {
                      const year = v ? parseInt(v, 10) || null : null;
                      updateEquipment(i, { installYearLo: year, installYearHi: year });
                    }}
                    placeholder="Ej: 2015"
                    placeholderTextColor={muted}
                    keyboardType="number-pad"
                    style={[styles.input, { flex: 1 }]}
                  />
                  <StatusChip status={eq.fieldStatus.age} onPress={() => updateEquipment(i, { fieldStatus: { ...eq.fieldStatus, age: cycleStatus(eq.fieldStatus.age) } })} />
                </View>
                {eq.installYearLo != null && eq.installYearHi != null && eq.installYearLo !== eq.installYearHi && (
                  <Text variant="caption" style={{ marginTop: 8 }}>Rango estimado: {eq.installYearLo}–{eq.installYearHi}</Text>
                )}
              </Card>
            ))}

            {error && (
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                <Icon name="error" size="sm" color={red} />
                <Text style={[styles.bodySm, { color: red, flex: 1 }]}>{error}</Text>
              </View>
            )}
            <View style={{ height: 100 }} />
          </View>
        )}
        </ScrollView>

        {(screen === 'review' || screen === 'saving') && institution && (
          <View style={{ paddingBottom: keyboardVisible ? 8 : StickyFooterTabBarInset + 16 }}>
            <StickyActionBar>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Button variant="outline" onPress={() => setScreen('input')} disabled={screen === 'saving'}>
                    Volver a editar
                  </Button>
                </View>
                <View style={{ flex: 1 }}>
                  <Button onPress={handleSave} disabled={screen === 'saving'} loading={screen === 'saving'}>
                    Guardar
                  </Button>
                </View>
              </View>
            </StickyActionBar>
          </View>
        )}

        {screen === 'input' && (
          <View style={{ paddingBottom: keyboardVisible ? 8 : StickyFooterTabBarInset + 16 }}>
            <StickyActionBar>
              {!canProceed && (
                <Text variant="caption" style={{ textAlign: 'center', marginBottom: 8 }}>
                  Escribe tu observación para continuar
                </Text>
              )}
              <Button onPress={handleExtract} disabled={!canProceed}>
                Continuar
              </Button>
            </StickyActionBar>
          </View>
        )}
      </KeyboardAvoidingView>

      <Modal
        visible={observer.androidPrompt.visible}
        title="Tu nombre"
        onClose={observer.androidPrompt.cancel}
        actions={
          <Button onPress={observer.androidPrompt.confirm} disabled={!observer.androidPrompt.draft.trim()}>
            Guardar
          </Button>
        }>
        <Text variant="caption" style={{ marginBottom: 12 }}>Aparecerá como el autor de tus observaciones.</Text>
        <TextInput
          value={observer.androidPrompt.draft}
          onChangeText={observer.androidPrompt.setDraft}
          placeholder="Ej: Juan Pérez"
          placeholderTextColor={muted}
          autoFocus
          style={styles.input}
        />
      </Modal>
    </Screen>
  );
}
