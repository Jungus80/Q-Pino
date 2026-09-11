import { modalityLabel } from '@/core/labels';
import { computeConfidence } from '@/core/score/confidence';
import { getInstitution, type InstitutionRow } from '@/db/repos/institutions';
import { listEquipmentForInstitution, type EquipmentRow } from '@/db/repos/equipment';
import { listObservationsForInstitution, type ObservationRow } from '@/db/repos/observations';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/kit/Screen';
import { EmptyState } from '@/components/kit/EmptyState';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useColor } from '@/hooks/useColor';
import { FontFamily } from '@/theme/fonts';
import { CORNERS } from '@/theme/globals';
import { useAppStyles } from '@/theme/useAppStyles';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView } from 'react-native';

const BAND_KEY: Record<'Alta' | 'Media' | 'Baja', 'green' | 'orange' | 'red'> = {
  Alta: 'green',
  Media: 'orange',
  Baja: 'red',
};

const SOURCE_LABEL: Record<string, string> = {
  voice: 'Voz',
  text: 'Texto',
  photo: 'Foto',
};

type ModalityGroup = {
  modality: string;
  count: number;
  ageLo: number | null;
  ageHi: number | null;
  ageLabel: string;
  band: 'Alta' | 'Media' | 'Baja';
  score: number;
  items: EquipmentRow[];
};

function ageRangeYears(rows: EquipmentRow[], now: Date): { lo: number | null; hi: number | null; label: string } {
  const withAge = rows.filter((r) => r.installYearLo != null);
  if (withAge.length === 0) return { lo: null, hi: null, label: 'Desconocida' };

  const currentYear = now.getFullYear();
  const ages = withAge.flatMap((r) => [currentYear - r.installYearHi!, currentYear - r.installYearLo!]);
  const lo = Math.min(...ages);
  const hi = Math.max(...ages);
  if (withAge.length < rows.length) return { lo, hi, label: 'Mixta' };
  return { lo, hi, label: lo === hi ? `${lo} años` : `${lo}–${hi} años` };
}

function groupByModality(rows: EquipmentRow[], now: Date): ModalityGroup[] {
  const byModality = new Map<string, EquipmentRow[]>();
  for (const row of rows) {
    const list = byModality.get(row.modality) ?? [];
    list.push(row);
    byModality.set(row.modality, list);
  }

  return Array.from(byModality.entries()).map(([modality, items]) => {
    const count = items.reduce((sum, r) => sum + (r.count ?? 1), 0);
    const age = ageRangeYears(items, now);
    const scores = items.map((r) =>
      computeConfidence(
        {
          fieldStatus: {
            manufacturer: r.statusManufacturer,
            model: r.statusModel,
            age: r.statusAge,
            count: r.statusCount,
          },
          lastVerifiedAt: r.lastVerifiedAt,
        },
        now
      )
    );
    const avgScore = Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length);
    const band: ModalityGroup['band'] = avgScore >= 70 ? 'Alta' : avgScore >= 40 ? 'Media' : 'Baja';

    return { modality, count, ageLo: age.lo, ageHi: age.hi, ageLabel: age.label, band, score: avgScore, items };
  });
}

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { styles, primary } = useAppStyles();
  const green = useColor('green');
  const orange = useColor('orange');
  const red = useColor('red');
  const bandColor = { green, orange, red };
  const [loading, setLoading] = useState(true);
  const [institution, setInstitution] = useState<InstitutionRow | null>(null);
  const [groups, setGroups] = useState<ModalityGroup[]>([]);
  const [comments, setComments] = useState<ObservationRow[]>([]);

  useEffect(() => {
    (async () => {
      if (!id) return;
      const [inst, equipment, observations] = await Promise.all([
        getInstitution(id),
        listEquipmentForInstitution(id),
        listObservationsForInstitution(id),
      ]);
      setInstitution(inst);
      setGroups(groupByModality(equipment, new Date()));
      setComments(observations.filter((o) => o.comments));
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <Screen centered>
        <Spinner size="lg" />
      </Screen>
    );
  }

  if (!institution) {
    return (
      <Screen centered>
        <Text variant="caption">Cliente no encontrado.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.pad, styles.padBottom]}>
        <Text variant="title">{institution.name}</Text>
        <Text variant="caption" style={{ marginTop: 6 }}>
          {[institution.site, institution.city, institution.countryIso].filter(Boolean).join(' · ') || 'Ubicación desconocida'}
        </Text>
        <Text variant="caption" style={{ marginBottom: 20 }}>
          Cliente desde {new Date(institution.createdAt).toLocaleDateString('es')}
        </Text>

        {groups.length === 0 && <EmptyState>Todavía no hay equipos registrados para este cliente.</EmptyState>}

        {groups.map((g) => (
          <Card key={g.modality} style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text variant="subtitle">{modalityLabel(g.modality)}</Text>
              <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: CORNERS, backgroundColor: bandColor[BAND_KEY[g.band]] }}>
                <Text style={{ color: '#FFFCF6', fontFamily: FontFamily.sansSemi, fontSize: 12 }}>
                  {g.band} ({g.score})
                </Text>
              </View>
            </View>
            <Text variant="caption" style={{ marginBottom: 14 }}>
              {g.count} {g.count === 1 ? 'unidad' : 'unidades'} · {g.items.length}{' '}
              {g.items.length === 1 ? 'registro' : 'registros'}
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: styles.card.borderColor }}>
              <View>
                <Text variant="caption">Cantidad</Text>
                <Text style={styles.monoLg}>{g.count}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="caption">Antigüedad aprox.</Text>
                <Text variant="title">{g.ageLabel}</Text>
              </View>
            </View>
            <Text variant="caption" style={{ marginBottom: 8 }}>Equipos registrados</Text>
            {g.items.map((item, index) => {
              const title = [item.manufacturer, item.model].filter(Boolean).join(' ') || 'Fabricante/modelo desconocido';
              const units = item.count != null ? `${item.count} ${item.count === 1 ? 'unidad' : 'unidades'}` : null;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => router.push(`/equipment/${item.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`Ver detalle de ${title}`}
                  style={[styles.listRow, index < g.items.length - 1 ? { marginBottom: 8 } : { marginBottom: 0 }]}
                >
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text variant="subtitle">{title}</Text>
                    {units ? <Text variant="caption">{units}</Text> : null}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={[styles.ghostChipText, { color: primary }]}>Ver detalle</Text>
                    <Icon name="chevron-right" size="md" color={primary} />
                  </View>
                </Pressable>
              );
            })}
          </Card>
        ))}

        {comments.length > 0 && (
          <>
            <Text variant="caption" style={{ marginBottom: 12, marginTop: 8 }}>
              Observaciones ({comments.length})
            </Text>
            {comments.map((o) => (
              <Card key={o.id} style={{ marginBottom: 8 }}>
                <Text variant="body" style={{ marginBottom: 8 }}>{o.comments}</Text>
                <Text variant="caption">
                  {new Date(o.createdAt).toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' })}
                  {' · '}
                  {o.observerId} · {SOURCE_LABEL[o.source] ?? o.source}
                </Text>
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
