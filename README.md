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

## Despliegue en Donweb

Cada push a `main` ejecuta `.github/workflows/deploy.yml`. El workflow valida la
compilación, transfiere una versión inmutable por SSH y actualiza únicamente el
contenedor `balanco2-web`, publicado en `127.0.0.1:3000`.

Configurá en GitHub, dentro de `Settings > Secrets and variables > Actions`:

### Variables

- `DONWEB_HOST`: IP o nombre del host.
- `DONWEB_SSH_PORT`: puerto SSH.
- `DONWEB_SSH_USER`: usuario SSH con acceso a Docker.
- `DONWEB_DEPLOY_PATH`: directorio exclusivo para la aplicación. Es opcional;
  el valor predeterminado es `apps/balanco2`, relativo al home del usuario.

### Secrets

- `DONWEB_SSH_PASSWORD`: contraseña SSH.
- `DONWEB_KNOWN_HOSTS`: línea `known_hosts` verificada del servidor. Es
  recomendable; si se omite, el workflow obtiene la clave con `ssh-keyscan`.

Para instalar por primera vez el virtual host de Nginx, ejecutá manualmente el
workflow `Deploy balanceo2.ar to Donweb` con `configure_nginx=true`. El usuario
debe poder ejecutar `sudo -n nginx -t`, recargar Nginx e instalar exclusivamente
el archivo de `balanceo2.ar`. Los despliegues automáticos posteriores no tocan
Nginx.

El despliegue construye y prueba la nueva imagen antes de reemplazar la versión
activa. Si el control de salud falla, restaura el contenedor anterior. Si el
puerto 3000 o los nombres reservados pertenecen a otra aplicación, se detiene
sin modificarlos.
