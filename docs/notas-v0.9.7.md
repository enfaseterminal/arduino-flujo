# Notas de publicación · v0.9.7

Esta versión amplía las actividades de análisis y montaje virtual con herramientas de alcance educativo.

## Novedades

- **Laboratorio:** incorpora pulsador, potenciómetro, sensor de luz y servomotor al catálogo; permite elegir perfiles Arduino Uno (predeterminado) y Nano clásico ATmega328P. El pinout señala PWM, pines analógicos y las funciones serie RX/TX de D0/D1.
- **Análisis y exportación:** el diagnóstico incluye una matriz plegable que distingue reconocimiento, representación en diagrama y simulación. Los informes PDF pueden incluir un resumen configurable de análisis y diagnóstico.
- **Proyectos y ejemplos:** añade ejemplos breves que conectan entradas, condiciones y salidas, además de importar y exportar el sketch, el montaje y las etiquetas visuales en un proyecto JSON versionado.
- **Accesibilidad:** mejora indicaciones para teclado y lector de pantalla, conserva las instrucciones de zoom para tecnologías de asistencia y documenta navegación, zoom y uso móvil en la [guía de accesibilidad](accesibilidad.md).

## Alcance

El parser, el diagrama y el simulador admiten un subconjunto educativo de Arduino/C++. La simulación puede aproximar ciertas llamadas y marcar otras como desconocidas; no compila ni ejecuta C++ arbitrario, no controla hardware físico y no sustituye la comprobación eléctrica de un montaje real. El perfil Nano describe únicamente el modelo clásico ATmega328P; otras variantes pueden diferir.
