# Reproductor de Musica

Aplicacion de escritorio con Electron para reproducir archivos de audio locales.

La app usa:

- Electron para la ventana de escritorio
- TypeScript para el proceso principal, preload y la UI
- HTML y CSS en `UI/`
- salida compilada en `dist/`

## Estructura actual

```text
Reproductor-de-Musica/
|-- UI/
|   |-- index.html
|   |-- styles.css
|   |-- script.ts
|   |-- playlist-actions.ts
|   |-- playlist-manager.ts
|   |-- playback-controller.ts
|   |-- now-playing-view.ts
|   |-- playlist-view.ts
|   |-- song-factory.ts
|   |-- doubly-linked-playlist.ts
|   |-- lyrics-service.ts
|   |-- translation-service.ts
|   |-- renderer-dom.ts
|   `-- renderer-dom-types.ts
|-- scripts/
|   |-- clean-dist.cjs
|   `-- copy-ui-static.cjs
|-- dist/
|-- main.ts
|-- preload.ts
|-- menu.ts
|-- global.d.ts
|-- package.json
`-- tsconfig.json
```

## Como ejecutar

En Windows PowerShell:

```powershell
cd "C:\Users\nikol\Documents\universidad\semestre 4\app reproductor de musica\Reproductor-de-Musica"
npm.cmd run start
```

El comando hace esto:

1. Limpia `dist/`
2. Compila TypeScript a `dist/`
3. Copia `UI/index.html` y `UI/styles.css` a `dist/UI`
4. Abre Electron usando `dist/main.js`

## Scripts disponibles

```powershell
npm.cmd run start
npm.cmd run build:ts
npm.cmd run typecheck
npm.cmd run pack:win
npm.cmd run dist:win
npm.cmd run dist:portable
```

## Flujo de compilacion

- `main.ts`, `menu.ts`, `preload.ts` y `UI/**/*.ts` se compilan a `dist/`
- los archivos estaticos de `UI/` se copian a `dist/UI`
- los `.js` generados ya no viven mezclados con los `.ts` del codigo fuente

## Notas

- La carpeta `renderer/` fue retirada del flujo principal porque no se usaba en la version final de la app.
- Si PowerShell bloquea `npm`, usa `npm.cmd`.

## Empaquetado para Windows

- `npm.cmd run pack:win`
  Genera una carpeta ejecutable sin instalador para probar el empaquetado.
- `npm.cmd run dist:win`
  Genera un instalador de Windows en `release/`.
- `npm.cmd run dist:portable`
  Genera una version portable `.exe` en `release/`.

## Como actualizar la app despues de cambios

1. Haz tus cambios en el codigo.
2. Sube la version en `package.json` si quieres una release nueva identificable.
3. Ejecuta `npm.cmd run dist:win` o `npm.cmd run dist:portable`.
4. Comparte el nuevo instalador o `.exe` generado en `release/`.
