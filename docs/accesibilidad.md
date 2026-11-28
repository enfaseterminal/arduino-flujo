# Guía de accesibilidad

Arduino Flowchart busca que las vistas principales puedan recorrerse con teclado y tecnologías de asistencia. Esta guía describe los controles actuales y una forma breve de comprobarlos; no es una declaración de conformidad formal con WCAG.

## Teclado

- Usa `Tab` y `Mayús+Tab` para recorrer botones, selectores, enlaces y controles. Los botones conservan activación con `Enter` o `Espacio`.
- En el diagrama, enfoca el área SVG y usa `+`/`-` para acercar o alejar, `F` para ajustar y `0` para centrar. También hay botones equivalentes. El desplazamiento con ratón/táctil es una alternativa, no el único acceso a zoom.
- En el laboratorio, los terminales y conexiones seleccionables reciben foco; `Enter` o `Espacio` selecciona. El formulario «Desde / Hasta / Conectar» permite crear conexiones sin arrastrar.
- En pantallas estrechas, las pestañas Editor Arduino, Diagrama y Laboratorio son botones; actívalos para cambiar de vista. Los controles y paneles se pueden recorrer con el orden normal del documento.
- El editor de código puede cargarse de forma diferida. Si no está disponible, el editor de texto alternativo conserva el acceso al sketch y las acciones principales.

## Lector de pantalla

- Los campos tienen etiquetas, los paneles títulos asociados y las pestañas describen qué panel controlan. Los estados de simulación, zoom, diagnóstico y montaje se anuncian mediante regiones de estado cuando cambia su contenido.
- El diagrama y el pinout incluyen título y descripción. Los pines anuncian funciones como RX/TX, PWM o «solo entrada analógica» cuando corresponda.
- En el selector de placa, las notas describen modelo, tensión y limitaciones; el Nano disponible es el Nano clásico ATmega328P. D0/RX y D1/TX comparten la serie hardware.
- Para revisar una actividad, navega por paneles y controles y confirma que las instrucciones y advertencias se entienden sin depender solo del color o del dibujo.

## Zoom y vista móvil

- El navegador puede ampliar la página; no bloqueamos el zoom. Para diagramas amplios usa sus botones o atajos de zoom y desplázate dentro del área.
- En móvil, la barra de pestañas alterna vistas para evitar columnas demasiado estrechas. Los lienzos de circuito pueden desplazarse horizontalmente; el formulario de conexiones ofrece una alternativa a gestos de precisión.
- El tamaño de texto y el reflujo dependen también del navegador y del sistema operativo. Si algo queda fuera de pantalla, amplía la página y recorre el contenido desplazable.

## Alcance educativo

El parser, los diagramas y el simulador cubren un subconjunto educativo de Arduino/C++; no compilan ni ejecutan C++ arbitrario, no se conectan a hardware real y no calculan magnitudes eléctricas. Las lecturas del laboratorio son virtuales. Comprueba siempre un montaje real por separado y con supervisión adecuada.

## Comprobación manual rápida

1. Recorre el encabezado, las vistas y las acciones principales solo con teclado; verifica que el foco se vea.
2. Cambia de pestaña y placa, y conecta terminales usando controles de formulario.
3. Enfoca el diagrama, prueba los atajos y los botones de zoom.
4. Prueba un lector de pantalla y zoom del navegador en escritorio y móvil; revisa que los mensajes de error y estado se anuncien y sigan siendo legibles.
