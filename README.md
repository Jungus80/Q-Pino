# QVAC — Vigilancia del parque instalado (on-device)

App móvil (iOS / Android) para capturar observaciones de equipos médicos en campo, resolverlas a clientes y equipos, y consultar el parque en lenguaje natural. **Toda la inferencia corre en el dispositivo con [QVAC](https://qvac.tether.io) (`@qvac/sdk`)**: extracción, consultas, Whisper y OCR de placa. No hay API de inferencia en la nube.

## Requisito técnico (art. 10)

| Capacidad | Motor QVAC | Dónde corre |
|-----------|------------|-------------|
| Extraer observación / Consultas | Qwen (llama.cpp) | On-device (GPU iOS / CPU Android) |
| Voz → texto | Whisper | On-device |
| Lectura de placa | OCR ggml | On-device |

La primera vez se **descargan los pesos** al teléfono (no es inferencia remota). Después la app funciona sin red.

## Base preexistente (art. 11)

Producto sustancial construido en la ventana del hackathon. Se reutilizan plantillas y librerías de terceros, declaradas aquí:

| Origen | Uso |
|--------|-----|
| [Expo](https://expo.dev) / `create-expo-app` | Plantilla React Native, routing (`expo-router`), splash, build nativo |
| [@qvac/sdk](https://qvac.tether.io) (Tether) | Inferencia local (LLM, Whisper, OCR) — requisito del evento |
| [BNA UI](https://ui.ahmedbna.com) (componentes copiados al repo) | Kit de UI (botones, cards, toast, etc.) |
| [@siteed/audio-studio](https://github.com/deeeed/expo-audio-stream) | Grabación de voz (no se usa el recorder de Expo Audio) |
| Google Fonts (Newsreader, IBM Plex Sans/Mono) vía `@expo-google-fonts` | Tipografía |
| NativeWind / Tailwind (resto de la plantilla) | Dependencia residual; las pantallas de producto no usan `className` |
| Zod, op-sqlite, lucide-react-native, react-native-reanimated, d3-geo | Utilidades, SQLite, iconos, motion, mapa |

Asistentes de IA de programación: usados durante el desarrollo (art. 11.d).

## Cómo correr

```bash
npm install
npx expo run:ios
# o
npx expo run:android
```

La primera ejecución descarga los modelos (hace falta internet). Build compartible Android: `cd android && ./gradlew assembleRelease`.
