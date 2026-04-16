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

## Activar playlists con IA

Antes de iniciar la app, define `OPENAI_API_KEY` en la terminal:

```powershell
$env:OPENAI_API_KEY="tu_api_key"
npm.cmd run start
```

Tambien puedes cambiar el modelo con `OPENAI_MODEL` o `OPENAI_PLAYLIST_MODEL`.

## Estructura general

- `main.ts`, `preload.ts` y `menu.ts`: proceso principal de Electron
- `UI/`: interfaz de usuario
- `scripts/`: scripts auxiliares de compilacion
- `dist/`: salida compilada
- `release/`: instaladores o ejecutables generados

## Nota

El `README` ya no depende de rutas personales del equipo donde fue creado. Para ejecutar el proyecto, solo necesitas abrir la terminal dentro de la carpeta `Reproductor-de-Musica` y correr los comandos anteriores.
