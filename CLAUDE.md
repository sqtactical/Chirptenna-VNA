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
9. Verificar la interfaz en el navegador (panel de vista previa o Edge) tras cambios visibles; los tests no ven el DOM.
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
