# Chirptenna VNA

Asistente web (Web Serial) para medir antenas con un NanoVNA. Independiente de Chirptenna (el generador de antenas,
repo `sqtactical/chirptenna`) para servir con cualquier antena; comparte estilo y alguna convención. Sin servidor ni
compilación: HTML + JS (módulos ES) + CSS. Detalle de uso y estructura en `README.md`.

## Ejecutar y probar
- Servir: `python -m http.server 8765` desde la raíz → <http://localhost:8765> (modo simulado sin equipo).
- Pruebas: `node --test pruebas/` (Node ≥ 20; ~5 s). Hay que pasarlas antes de cada commit.
- Todo en español (nombres, comentarios, mensajes). Archivos en UTF-8 sin BOM, LF.

## Reglas con el NanoVNA (obligatorias; vienen del proyecto Chirptenna)
- NanoVNA-H, firmware DiSlord 1.2.42. **Nunca enviar `save`**: no se pisan los slots de calibración del equipo.
- Tras una medida en bruto hay que restaurar siempre `cal on` (si estaba activa) y el barrido (`sweep`), en `finally`.
- **Nada que toque el equipo real sin el usuario delante** (hay que cambiar patrones a mano). El driver sigue sin probar con
  hardware: `cal`, `cal off`, `sweep`, tiempos y el límite de 101 puntos por `scan` están verificados solo con el emulador.

## Lecciones
1. La corrección SOL en JS coincide con `vna/calibracion.py` de Chirptenna a 1e-16 con el OSL real del equipo (test con
   datos reales en `pruebas/datos/`, que son una muestra reducida).
2. Calibrando por tramos, por encima de ~1,6 GHz la carga buena refleja el 31–36 % del OPEN **en bruto** (en todo el rango,
   19 %): el umbral de «carga mal puesta» de `vna/calibrar.py` (0,3) daría falsos fallos; aquí es 0,5. Un OPEN o SHORT
   puesto como carga da ~100 %.
3. La prominencia de una resonancia se mide hasta el siguiente punto más alto, no contra el valle más bajo de los dos lados:
   el ruido en la falda de una resonancia grande daba «resonancias» falsas. Los máximos poco prominentes salen aparte como
   «posiblemente falsa» (`resonanciasDudosas`) y no entran en la recomendación, el veredicto ni el afinado.
4. Medir bien una banda estrecha con barrido logarítmico: se encadenan barridos lineales de ≤101 puntos y se **afina**
   (ventanas de ±3 % con 201 puntos alrededor de los 4 mejores picos) fusionando con `fusionar`.
5. Los fallos del equipo (cable fuera, puerto ocupado, equipo mudo) son `ErrorEquipo` con `codigo`; el cable cortado se detecta por el fin de lectura o el evento `disconnect` y rechaza la orden pendiente al instante. La interfaz lo trata en `perderConexion`.
6. **Modo Simple = ROE; Avanzado = pérdida de retorno y VSWR.** El criterio de «bien adaptada» también cambia: Simple usa ROE 2
   (9,54 dB, `UMBRAL_SIMPLE_DB` en `app.js`; se refleja el 11 % de la potencia) y se explica en pantalla y en el PDF; Avanzado usa el
   campo en dB (10 por defecto = ROE 1,92). Cada modo fija `ultimo.umbral` al cambiar de modo. Los textos reciben `unidad` ('roe'|'rl')
   (`textoAdaptacion`, `textoUmbral`, `explicacionROE` en `analisis.js`); en Simple no debe aparecer ningún «dB» (hay un test).
   Niveles de ROE del modo Simple (`NIVELES_ROE`, también zonas de color del gráfico y leyenda): 1–1,5 muy bien acoplada, 1,5–2
   aceptable, 2–3 mejorable («transmitir poco y a potencia reducida»), más de 3 mal acoplada («no transmitir salvo emergencias»);
   el límite de «aceptable» es el criterio (ROE 2) y no hay línea de umbral en el gráfico. Cada nivel tiene su `consejo`, que sale en
   el veredicto y la recomendación. Si se cambian, tocar también la leyenda de `index.html` y el texto del PDF. La banda medida se
   marca con borde sólido, ▼ y su nombre en el margen superior (`MARGEN.t` = 30; el nombre solo si hay ≤ 3 bandas).
7. **Curvas complejas en Simple (fractales, multibanda, rizado)**: el nivel y el consejo de uso salen del PEOR punto de ROE dentro de la
   banda objetivo (`estadisticaBanda`, `lineasBanda`), nunca de la mejor resonancia del rango (que puede estar en otra banda). Si hay ≥ 2
   mínimos a ambos lados del objetivo o la ROE oscila dentro de la banda (`curvaIrregular`; los mínimos solo cuentan si entre ellos la ROE
   sube un 10 %, para que el ruido no cuente) no se da «alarga/acorta un X %» (acción `irregular`). Probado con curvas sintéticas.
8. **Mínimo de ROE ≠ resonancia eléctrica.** El mínimo de ROE (lo que la app llama «resonancia») es donde mejor se adapta a 50 Ω; la
   resonancia eléctrica es donde X cruza por cero (`reactanciaCero`). En antenas cargadas, fractales, con adaptador o medidas a través de
   un cable no coinciden. Si se separan más de un 2,5 % (`DESV_REACTANCIA`) y la banda no está ya bien cubierta, la recomendación (Simple
   y Avanzado) avisa de que el porcentaje de longitud puede no ser fiable; la tabla de Avanzado y el PDF muestran X = 0 al lado de cada mínimo.
   En Simple hay un interruptor «Mostrar la resonancia eléctrica (X = 0)» (apagado por defecto, se recuerda en `localStorage` como
   `ver-x`): dibuja una línea violeta discontinua con su frecuencia en el gráfico de ROE (`marcasReactancia`, `opts.marcasX` de
   `dibujarSerie`) y también en el PDF.
9. **Antenas simuladas** (`ANTENAS_SIMULADAS` en `drivers/simulado.js`, selector «Antena simulada» con el modo simulado): `predeterminada`
   (868 MHz y 2,44 GHz) y `trampas` (HF: dipolo de 2 brazos con trampa LC y bobina de carga, modelo de líneas de transmisión; mínimos de
   ROE a ~6,95 / ~14,33 / ~18,5 MHz y máximos entre medias; por encima de 40 MHz queda descuadrada a propósito). Sirve para ver cómo
   trata la app una antena multibanda cargada: 40 m sale «acorta», 20 m «alarga», y ninguna banda queda entera en ROE 2.
   **Consejo por tramo en multibanda** (`infoMultibanda`, opción «Mi antena es multibanda» o detección automática: otra resonancia con
   ROE ≲ 3 a ≥ 40 % por encima o por debajo del objetivo, dentro de lo medido): en vez de «multiplica todas las dimensiones» da
   «acorta/alarga un X % el tramo que gobierna esta banda» (banda baja = tramo exterior y bobinas, % sobre el brazo entero; banda alta o
   intermedia = tramo interior o entre trampas, % sobre su propia longitud) y pide ajustar una banda cada vez. En banda única con margen
   del 10 % no se ven otras resonancias: hay que marcar la opción o subir el margen lateral. Es un texto general: la app no sabe qué
   tramo físico es cada uno.
10. **Asistente de ajuste por segmento en HF** (`segmentos_hf.json`, `segmentosDeBanda`, `coberturaSegmentos`): en las bandas de HF el Simple pregunta para qué parte de la banda se ajusta (toda, CW, fonía, digitales, FT8/FT4/WSPR). Con un segmento elegido se MIDE la banda entera (+ margen; `obj.rango`) y se JUZGA el segmento (`obj.fMin/fMax`), así que cambiar de segmento no obliga a medir otra vez. Segmentos por región (`R1` para «Europa», `US` para «EE. UU.»); FT8/FT4/WSPR son segmentos «puntuales» de 3 kHz sobre el dial de WSJT-X (verificados en su código); los segmentos IARU R1 son de memoria y están SIN contrastar (`_verificado` lo dice). Objetivos puntuales (< 0,1 % de la frecuencia) se juzgan por un valor, no por un rango. La banda ancha (> 4 % de su frecuencia, típico de HF) avisa de que una antena resonante sencilla rara vez la cubre entera. **60 m, 4 m y 8 m (18-11):** 60 m = banda secundaria de 5351,5–5366,5 kHz (R1 con el reparto provisional de la IARU, EE. UU. con sus canales de 100 W ERP como segmentos `fuera_de_banda`); 4 m = solo en algunos países (llamada SSB 70,200, AM/FM 70,260 y FT8/WSPR/MSK144 de WSJT-X); 8 m = 40 MHz, solo con autorización experimental o temporal (sin segmentos). Los `digitales` pueden ser un número (dial de WSJT-X) o `{ dial, nota }` cuando no vienen de WSJT-X (FT8 de 60 m). Cada medida del mismo objetivo y rango guarda la anterior (`ultimo.previo`): línea gris en el gráfico de ROE y frase «respecto a la medida anterior».
11. **Logo** (`img/`): el grillo de Chirptenna se usa en local (`img/grillo.svg` y `.png`, copiados de `docs/logo/` de Chirptenna; no cargar el logo de la web de Chirptenna). Las 23 variantes (`img/variantes/*.svg`, `img/galeria.html`) y `img/grillo-cable.svg` se regeneran con `node img/generar_variantes.mjs` (cada variante es una entrada de `VARIANTES`); el PNG de `grillo-cable` se saca abriendo el SVG a 800 × 800 px (p. ej. con Edge sin ventana). Detalle en `img/LEEME.md`. `pages.yml` copia `img/`, `segmentos_hf.json` y `diagnostico.html`: si se añade un archivo que cargue la web, hay que añadirlo ahí.
12. **Cricky, el grillo asistente** (`js/grillo.js`, burbuja `#grillo` abajo a la derecha): comenta eventos (inicio, conectado, cuenta atrás, midiendo, pérdida de conexión, falta calibrar y resultado) con una ilustración de `img/variantes/`. Solo en modo Simple (CSS por `body[data-modo]`), sin intervalos, se cierra con «Vale», se silencia con «No volver a mostrar» o el interruptor del pie (`localStorage.grillo`), respeta `prefers-reduced-motion`. Los textos salen de `elegirMensaje`/`mensajeResultado` (funciones puras con pruebas): el resultado comenta el PEOR punto de la banda con su consejo, con prioridad sin resonancia > irregular > multibanda > nivel de ROE. El nombre está en `NOMBRE` (un solo sitio) y cada evento nuevo necesita una ilustración que exista en `img/variantes/` (hay una prueba).
13. Verificar la interfaz en el navegador (panel de vista previa o Edge) tras cambios visibles; los tests no ven el DOM.
   Tras cambiar JS/CSS puede hacer falta recarga forzada (caché).

## Pendiente
**El plan completo está en `ROADMAP.md`** (fases con casillas; márcalas al terminar). La Fase 0 (probar con el equipo real)
va antes que todo lo demás. Resumen:
- Probar el driver con el NanoVNA conectado: **`diagnostico.html`** (`js/diagnostico.js`, con pruebas contra el emulador) ya hace toda la batería y da un informe; falta ejecutarlo con el equipo y corregir lo que salga (Fase 0 del ROADMAP).
- Modelo de patrones con retardo/capacidad del OPEN (precisión > 1 GHz); drivers de V2/V2Plus4/F V3/LiteVNA.
- Terminar de verificar `bandas.json` (en `_verificado` está lo contrastado y lo que no; falta la CNAF de España); selector
  de idioma; versión de escritorio (reutilizar la lógica de Python del proyecto Chirptenna) y posible enlace desde su
  pestaña «Medir».
- Repo privado en GitHub: `sqtactical/Chirptenna-VNA` (publicar la web con `.github/workflows/pages.yml` si el plan lo permite).
