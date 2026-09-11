/**
 * Small synthetic demo seed for the Clientes tab. Regional ASR vocabulary for Whisper
 * lives in whisperVocabulary.json — not here.
 */

export type SeedEquipment = {
  modality: string;
  manufacturer: string | null;
  model: string | null;
  catalogModelId: string | null;
  count: number | null;
  installYearLo: number | null;
  installYearHi: number | null;
  statusAge: 'Confirmado' | 'Reportado' | 'Estimado' | 'Desconocido';
  statusManufacturer: 'Confirmado' | 'Reportado' | 'Estimado' | 'Desconocido';
  ageMonthsAgo: number;
};

export type SeedInstitution = {
  name: string;
  site: string | null;
  city: string;
  countryIso: 'PA' | 'CO';
  region: string;
  equipment: SeedEquipment[];
};

const E = (
  modality: string,
  manufacturer: string | null,
  model: string | null,
  catalogModelId: string | null,
  count: number,
  year: number | null,
  statusAge: SeedEquipment['statusAge'],
  statusManufacturer: SeedEquipment['statusManufacturer'],
  ageMonthsAgo: number
): SeedEquipment => ({
  modality,
  manufacturer,
  model,
  catalogModelId,
  count,
  installYearLo: year,
  installYearHi: year,
  statusAge,
  statusManufacturer,
  ageMonthsAgo,
});

/** Six demo clients — enough for Clientes/dashboard without bloating the app. */
export const SEED_INSTITUTIONS: SeedInstitution[] = [
  {
    name: 'Hospital DemoCare Pacific',
    site: null,
    city: 'Ciudad de Panamá',
    countryIso: 'PA',
    region: 'LATAM',
    equipment: [
      E('MR', 'Meridian Diagnostics', 'Meridian Pulse', 'meridian-pulse', 1, 2012, 'Confirmado', 'Confirmado', 20),
      E('US', 'Meridian Diagnostics', 'Meridian Wave Pro', 'meridian-wave-pro', 2, 2021, 'Reportado', 'Reportado', 3),
    ],
  },
  {
    name: 'Clínica Istmo Norte',
    site: 'Piso 2',
    city: 'Colón',
    countryIso: 'PA',
    region: 'LATAM',
    equipment: [
      E('CT', 'Solara Health', 'Solara Spectra 64', 'solara-spectra-64', 1, 2014, 'Reportado', 'Confirmado', 8),
      E('US', 'Verdant Imaging', 'Verdant EchoLine', 'verdant-echoline', 3, 2018, 'Estimado', 'Estimado', 5),
    ],
  },
  {
    name: 'Hospital Chiriquí Central',
    site: null,
    city: 'David',
    countryIso: 'PA',
    region: 'LATAM',
    equipment: [
      E('CT', 'Northfield Medical', 'Northfield Vantage 128', 'northfield-vantage-128', 1, 2020, 'Confirmado', 'Confirmado', 6),
      {
        modality: 'XR',
        manufacturer: null,
        model: null,
        catalogModelId: null,
        count: 2,
        installYearLo: null,
        installYearHi: null,
        statusAge: 'Desconocido',
        statusManufacturer: 'Desconocido',
        ageMonthsAgo: 12,
      },
    ],
  },
  {
    name: 'Hospital Andino Sur',
    site: null,
    city: 'Bogotá',
    countryIso: 'CO',
    region: 'LATAM',
    equipment: [
      E('MR', 'Solara Health', 'Solara Magna 1.5T', 'solara-magna-1.5t', 2, 2015, 'Reportado', 'Confirmado', 2),
      E('CT', 'Northfield Medical', 'Northfield Vantage 32', 'northfield-vantage-32', 1, 2011, 'Confirmado', 'Confirmado', 14),
    ],
  },
  {
    name: 'Clínica Cordillera',
    site: 'Torre Médica',
    city: 'Medellín',
    countryIso: 'CO',
    region: 'LATAM',
    equipment: [
      E('US', 'Meridian Diagnostics', 'Meridian Wave Pro', 'meridian-wave-pro', 4, 2021, 'Reportado', 'Reportado', 1),
      E('MG', 'Verdant Imaging', 'Verdant Clarity', 'verdant-clarity', 1, 2018, 'Estimado', 'Estimado', 9),
    ],
  },
  {
    name: 'Centro Médico del Valle',
    site: null,
    city: 'Cali',
    countryIso: 'CO',
    region: 'LATAM',
    equipment: [
      E('PET_CT', 'Halcyon Medical', 'Halcyon Fusion', 'halcyon-fusion', 1, 2016, 'Reportado', 'Confirmado', 4),
      E('MONITORING', 'Kestrel Health Systems', 'Kestrel VitalWatch', 'kestrel-vitalwatch', 8, 2019, 'Reportado', 'Reportado', 7),
    ],
  },
];
