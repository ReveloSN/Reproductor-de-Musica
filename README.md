# Reproductor de Musica Web

Aplicacion web para reproducir archivos de audio locales desde el navegador, buscar videos de YouTube, consultar letras y generar playlists con IA.

La interfaz reutiliza la base visual del proyecto original, pero ahora corre como una app web lista para desplegarse en Railway.

## Requisitos

- Node.js 20 o superior
- npm disponible en la terminal

## Ejecutar localmente

1. Entra a la carpeta del proyecto:

   ```powershell
   cd Reproductor-de-Musica
   ```

2. Instala dependencias:

   ```powershell
   npm install
   ```

3. Compila la app web:

   ```powershell
   npm run build
   ```

4. Inicia el servidor web:

   ```powershell
   npm run start
   ```

5. Abre en el navegador:

   ```text
   http://localhost:3000
   ```

Tambien puedes usar un solo comando para desarrollo local:

```powershell
npm run start:web
```

## Como funciona la version web

- Los archivos MP3, WAV, OGG y M4A se cargan desde el navegador con el selector de archivos o carpeta.
- La reproduccion local usa URLs `blob:` del navegador, asi que no necesitas subir tus canciones al servidor para escucharlas.
- La metadata de audio se procesa en el backend para conservar titulo, artista, album, genero, portada y duracion cuando existan.
- YouTube, letras e IA se resuelven desde el backend usando variables de entorno del servidor.

## Variables de entorno

Crea un archivo `.env` en la raiz del proyecto para desarrollo local:

```env
YOUTUBE_API_KEY=tu_api_key_de_youtube
OPENAI_API_KEY=tu_api_key_de_openai
OPENAI_PLAYLIST_MODEL=gpt-4.1-mini
```

Tambien puedes usar:

- `YOUTUBE_DATA_API_KEY`
- `GOOGLE_API_KEY`
- `OPENAI_MODEL`

Si no configuras estas claves:

- La reproduccion local de audio seguira funcionando.
- Las letras remotas seguiran disponibles si el servicio externo responde.
- YouTube oficial y playlists con IA quedaran deshabilitados o con mensaje de configuracion.

## Scripts utiles

```powershell
npm run build
npm run start
npm run start:web
npm run typecheck
```

Scripts opcionales del proyecto original de escritorio:

```powershell
npm run start:desktop
npm run pack:win
npm run dist:win
npm run dist:portable
```

## Despliegue en Railway

1. Sube este repo a GitHub.
2. En Railway crea un proyecto nuevo desde GitHub.
3. Selecciona este repositorio.
4. Agrega estas variables en el servicio:

   ```text
   YOUTUBE_API_KEY
   OPENAI_API_KEY
   OPENAI_PLAYLIST_MODEL
   ```

5. Railway detectara el proyecto Node.js, compilara con `npm run build` y levantara el servicio con `npm run start`.
6. Genera un dominio publico desde Railway cuando el deploy termine.

## Estructura general

- `web-server.ts`: servidor web y API para Railway
- `UI/`: interfaz del cliente web
- `UI/web-bridge.ts`: puente del navegador para carga local de archivos y llamadas al backend
- `scripts/`: scripts auxiliares de compilacion
- `dist/`: salida compilada

## Nota

La app web reproduce los archivos que cada usuario seleccione desde su propio navegador. Esos archivos no quedan persistidos en Railway; solo se usan en la sesion actual del cliente.
