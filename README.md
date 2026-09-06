# Huella alimentaria · Argentina

Dashboard para explorar distancias, cargas y emisiones estimadas del transporte de alimentos en Argentina.

## Ejecutar en macOS con doble clic

1. Abrí la carpeta `HuertaIa/dashboard-huella`.
2. Hacé doble clic en `Iniciar dashboard.command`.
3. Esperá a que se abra `http://localhost:4173` en el navegador.

La ventana de Terminal debe permanecer abierta mientras usás la aplicación. Para detenerla, volvé a Terminal y presioná `Control + C`.

## Ejecutar desde Terminal

Requiere Node.js 22.13 o posterior.

```bash
cd /Users/luis.stroppi/Documents/ChatGPT/HuertaIa/dashboard-huella
npm install
npm run dev:local
```

Después abrí [http://localhost:4173](http://localhost:4173).

`npm install` sólo es necesario la primera vez o cuando cambien las dependencias.

## Generar y probar la versión de producción

```bash
npm run build
npm start
```
