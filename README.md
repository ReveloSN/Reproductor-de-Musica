# Reproductor de Musica

Aplicacion de escritorio hecha con Electron para reproducir archivos de audio locales.

## Requisitos

- Node.js instalado
- npm disponible en la terminal

## Como ejecutar la app

1. Entra a la carpeta del proyecto si aun no estas dentro:

   ```powershell
   cd Reproductor-de-Musica
   ```

2. Instala las dependencias la primera vez:

   ```powershell
   npm install
   ```

3. Inicia la aplicacion:

   ```powershell
   npm run start
   ```

Si estas usando PowerShell y `npm` da problemas, usa `npm.cmd` en los mismos comandos. Ejemplo:

```powershell
npm.cmd install
npm.cmd run start
```

## Configuracion de claves API

El repo no debe incluir claves reales. Si quieres habilitar YouTube y playlists con IA, crea un archivo `.env` en la raiz del proyecto con este formato:

```env
YOUTUBE_API_KEY=tu_api_key_de_youtube
OPENAI_API_KEY=tu_api_key_de_openai
OPENAI_PLAYLIST_MODEL=gpt-4.1-mini
```

Tambien puedes usar `YOUTUBE_DATA_API_KEY` o `GOOGLE_API_KEY` como alias para YouTube.

Si no configuras estas claves, la app sigue abriendo y reproduciendo archivos locales, pero las funciones de YouTube e IA quedan deshabilitadas con un mensaje claro en pantalla.

Tambien puedes abrir la app, ir al modulo de YouTube y guardar la API key localmente desde la interfaz. Esa clave queda guardada solo en ese equipo y no se sube al repo.

## Que hace `npm run start`

Ese comando:

1. Limpia la carpeta `dist/`
2. Compila el codigo TypeScript
3. Copia los archivos estaticos de `UI/` a `dist/UI`
4. Abre Electron con `dist/main.js`

## Scripts utiles

```powershell
npm run start
npm run build:ts
npm run typecheck
npm run pack:win
npm run dist:win
npm run dist:portable
```

## Empaquetado para Windows

- `npm run pack:win`: genera una carpeta ejecutable para pruebas
- `npm run dist:win`: genera un instalador de Windows en `release/`
- `npm run dist:portable`: genera una version portable en `release/`

## Usar claves en la app empaquetada

Si generas la version portable, puedes poner un archivo `.env` al lado del `.exe` y la app lo leera automaticamente al iniciar. Tambien intentara leer un `.env` dentro de la carpeta de datos del usuario.

Esto sirve para compartir la app sin subir secretos al repo. El repo puede ir limpio y la demo completa puede usar un `.env` local aparte.

## Activar playlists con IA

Antes de iniciar la app, puedes definir `OPENAI_API_KEY` en la terminal:

```powershell
$env:OPENAI_API_KEY="tu_api_key"
npm.cmd run start
```

Tambien puedes cambiar el modelo con `OPENAI_MODEL` o `OPENAI_PLAYLIST_MODEL`.

## Que enviar al profesor

Lo recomendable es compartir:

1. El link del repo sin claves reales.
2. Una release portable o el instalador generado en `release/`.
3. Una nota corta indicando que los modulos de YouTube e IA usan un `.env` local por seguridad.

Si el profesor solo necesita revisar el codigo y abrir la app, la parte local del reproductor funciona aun sin esas claves.

## Estructura general

- `main.ts`, `preload.ts` y `menu.ts`: proceso principal de Electron
- `UI/`: interfaz de usuario
- `scripts/`: scripts auxiliares de compilacion
- `dist/`: salida compilada
- `release/`: instaladores o ejecutables generados

## Nota

El `README` ya no depende de rutas personales del equipo donde fue creado. Para ejecutar el proyecto, solo necesitas abrir la terminal dentro de la carpeta `Reproductor-de-Musica` y correr los comandos anteriores.
