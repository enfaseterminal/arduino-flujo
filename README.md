# Arduino Flowchart

Editor web educativo para analizar sketches de Arduino, generar diagramas de flujo SVG y explorar su ejecución con un simulador paso a paso.

- **Aplicación:** <https://enfaseterminal.github.io/arduino-flujo/>
- **Repositorio:** <https://github.com/enfaseterminal/arduino-flujo>
- **Licencia:** GNU GPLv3, ver [LICENSE](LICENSE).

La aplicación se ejecuta en el navegador y no necesita backend. El código del sketch, el tema, las etiquetas visuales y el montaje del laboratorio se guardan localmente en el navegador.

## Funciones

- Editor C++ con apertura de archivos `.ino`, `.cpp` y `.h`, ejemplos y diagnósticos.
- Análisis sintáctico educativo con navegación entre funciones y diagramas separados por función.
- Diagramas SVG interactivos para secuencias, decisiones, bucles, `switch`, llamadas y comentarios.
- Selección sincronizada entre código y diagrama, con etiquetas visuales personalizables.
- Exportación de diagramas como SVG, PNG o PDF multipágina.
- Simulador reversible con variables, entradas simuladas, consola serie y monitor de pines.
- Laboratorio visual con Arduino, LED, resistencias, pulsadores y potenciómetro.
- Tema claro/oscuro y almacenamiento local, sin cuenta ni servicio remoto.

## Requisitos

- Node.js 20.19+ o 22.12+.
- npm.

## Desarrollo local

```bash
npm ci
npm run dev
```

Para comprobar la aplicación y preparar una compilación:

```bash
npm test
npm run build
npm run preview
```

## Uso básico

1. Escribe, pega o abre un sketch Arduino y pulsa **Generar diagrama**.
2. Selecciona una función para inspeccionar su flujo; usa zoom y desplazamiento para navegar por diagramas grandes.
3. Selecciona bloques para consultar su código de origen y personalizar etiquetas sin alterar el sketch.
4. Usa **Exportar** para obtener SVG, PNG o PDF.
5. Abre **Simulador paso a paso** para avanzar, retroceder o ejecutar una sesión con valores de entrada simulados.
6. Abre **Laboratorio** para montar circuitos virtuales y observar su interacción lógica con el simulador.

## Arquitectura

- `src/parser/`: lexer, parser y AST de C/C++ educativo.
- `src/analyzer/`: análisis y diagnósticos.
- `src/flowchart/`: generación, distribución y representación SVG de diagramas.
- `src/editor/` y `src/ui/`: editor, controles, selección y paneles.
- `src/simulator/`: evaluación acotada y simulación reversible.
- `src/lab/`: catálogo, modelo de circuito y laboratorio visual.
- `src/export/`: exportación SVG, PNG y PDF.
- `src/styles/`: estilos de la aplicación.
- `tests/`: pruebas unitarias y de integración con Vitest.

## Alcance y limitaciones

El analizador y el simulador implementan un subconjunto educativo de C/C++; no son un compilador, no ejecutan código arbitrario ni se conectan a una placa física. Las lecturas de sensores son entradas manuales o virtuales. El laboratorio comprueba rutas lógicas compatibles con sus componentes, pero no calcula magnitudes eléctricas reales.

## Publicación

El workflow de GitHub Actions ejecuta los tests, compila la aplicación y la publica en GitHub Pages al actualizar `main`. La ruta publicada es <https://enfaseterminal.github.io/arduino-flujo/>.
