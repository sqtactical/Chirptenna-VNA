# Hoja de ruta de Chirptenna VNA

Para quién: **radioaficionados**, **usuarios de Meshtastic** (EU 868/433 MHz y US 915 MHz) y gente desde **«no sé qué es la
ROE»** hasta **ingenieros de RF**. Regla de diseño: el modo **Simple** no crece en opciones; cada función de experto va en
**Avanzado** o en una herramienta aparte, y todo lo nuevo para principiantes tiene que caber en «conecta, pulsa, lee el
veredicto».

Leyenda: 🟢 principiante · 🟡 aficionado con experiencia · 🔴 experto RF · 📡 HAM · 🕸️ Meshtastic/LoRa.
Esfuerzo: **S** (días), **M** (1–2 semanas), **L** (más). Las casillas se marcan al terminar.

> Los datos de frecuencias de este documento (canales de Meshtastic, segmentos de bandas) están escritos de memoria y hay que
> **comprobarlos con la fuente oficial** (firmware de Meshtastic, planes de la IARU/CNAF/FCC) antes de meterlos en el código.

---

## Fase 0 — Validar con el equipo real (bloquea todo lo demás)

Sin esto nada de lo de abajo es fiable: hasta hoy solo hay emulador y datos reales grabados.

- [ ] **Probar el driver con el NanoVNA-H conectado** (con el usuario delante). **Preparado el 18-11**: abre
      `diagnostico.html`, conecta, marca (si quieres) la prueba «ida y vuelta en bruto» y pulsa *Ejecutar*. Comprueba
      identificación, `info`, formato de `cal` y `sweep`, `scan` de 11 puntos, límite real de puntos por `scan`, barrido de
      3000 puntos con tiempos, repetibilidad y la restauración exacta de `cal`/`sweep`; da un informe para pegar. Falta
      **ejecutarlo con el equipo** y corregir lo que salga. **S**
- [x] **Reconexión y errores** (18-11): errores con código (`ErrorEquipo`: cancelado, ocupado, permiso, sin respuesta,
      desconectado, respuesta incompleta, uso simultáneo); cable desenchufado a mitad de barrido se detecta al instante
      (no espera 20 s) y la interfaz vuelve a «sin conectar» con un mensaje claro; el asistente avisa de que el paso no se
      guardó; avisa si el dispositivo no parece un NanoVNA; descarta respuestas tardías. 10 pruebas con el emulador
      (cable cortado, puerto ocupado, equipo mudo…) y comprobado en el navegador. **S**
- [~] **Contraste con `vna/medir_antena_pc.py`** de Chirptenna: hecho **con datos grabados** (corrección SOL idéntica a
      1e-16 con el OSL real; antena de 868 MHz con las mismas cifras). Falta repetirlo en vivo: misma antena, misma
      calibración, mismas cifras. **S**
- [~] **Verificar `bandas.json`** (18-11): contrastado con Meshtastic (docs de región LoRa), ARRL/FCC e IARU R1 (70 cm,
      23 cm, 13 cm). **Corregido**: 9 cm de EE.UU. es 3300–3450 MHz (el acceso a 3450–3500 terminó en abril de 2022). Añadidas
      las regiones de Meshtastic EU_868 (869,4–869,65), EU_433, EU_866 y ANZ. **Sin contrastar** (el PDF del manual IARU R1 es
      una imagen escaneada): 9 y 5 cm de R1, 4 m, 6 m de R1, 60 m por país, 630 m, 2200 m y las sub-bandas WiFi/U-NII. La
      CNAF (España) sigue pendiente. **S**
## Fase 1 — Que cualquiera lo use (🟢, 🕸️) — lo que más gente va a notar

- [~] 🟢🕸️ **Perfil «Mi nodo Meshtastic»** (18-11, primera versión: regiones US, EU_433, EU_868 y ANZ; presets de LongFast a
      ShortTurbo; nombre de canal y slot opcionales; fórmula de `js/meshtastic.js` de memoria, coincide con los canales por
      defecto publicados 906,875 / 433,875 / 869,525 MHz; faltan el resto de regiones y comprobarla con el firmware): eliges región (EU_868, EU_433, US, y luego ANZ, IN…) y preset (LongFast…) y la
      app calcula la **frecuencia real del canal** con la misma fórmula que el firmware (frecuencia del slot por defecto o el
      que pongas), mide alrededor y da el veredicto **en esa frecuencia**, no solo en la banda. Útil porque la región EU_868 de
      Meshtastic es solo **869,4–869,65 MHz** (250 kHz, 10 % de ciclo; verificado en sus docs el 18-11) y una antena centrada
      en 868 MHz puede ir justa. Las ITU 2 m / 70 cm / 1,25 m solo se eligen en modo con licencia de radioaficionado. **M**
- [x] 🟢🕸️ **Comparar antenas («shootout»)** (18-11: tarjeta con nombre, tabla ordenada por el peor punto del objetivo y curvas
      superpuestas; hasta 20 medidas en `localStorage`, 6 en el gráfico; falta exportar/importar la lista): guardar varias medidas con nombre (la de serie del T-Beam/Heltec/RAK, la
      comprada, la casera) y ver una tabla ordenada por ROE en el canal y ancho de banda, con las curvas superpuestas. **M**
- [x] 🟢 **Antes / después** (18-11): al medir tras cortar se superpone la medida anterior (línea gris) y dice «has movido la
      resonancia de X a Y» junto a la ROE antes y después. **S**
- [x] 🟢 **Calculadora de corte en mm** (18-11; el porcentaje de la recomendación pasa a mm con el largo que escribas y
      propone cortar primero el 70 %; no sale en antenas multibanda): introduces el largo actual del radiador (o del brazo del dipolo) y te dice cuántos
      mm cortar o añadir, no solo el %. Con aviso de cortar en pasos (cortar es irreversible). **S**
- [x] 🟢 **Explicaciones en lenguaje llano** (18-11: glosario desplegable en el modo Simple, botón «?» que lo abre desde la
      tarjeta de recomendaciones y semáforo de niveles): «?» junto a ROE, pérdida de retorno, ancho de banda, Smith; semáforo
      verde/ámbar/rojo con lo que significa para el alcance (p. ej. «ROE 2: pierdes ~11 % de la potencia»). **S**
- [x] 🟢 **Avisos de medida mal hecha** (18-11: `avisosMedida` avisa de antena o cable sin conectar, carga de 50 Ω en vez de
      antena y curva con mucho ruido, con umbrales calibrados con la antena real; `avisoInestable` avisa si entre dos
      medidas seguidas la resonancia no se mueve pero la ROE cambia más de un 25 % (mano, cuerpo, cable). Falta, y necesita el
      equipo real, detectar el latiguillo largo sin calibrar): detectar curvas típicas de cable suelto, antena sin conectar (todo ≈ 0 dB), mano
      cerca (la medida cambia mucho entre dos barridos seguidos), medir a través de un latiguillo largo sin calibrar en su
      extremo. **M**
- [x] 🟢🕸️ **Ilustraciones del montaje** (18-11: cinco dibujos SVG en `img/montaje/` en un desplegable del modo Simple y uno por
      paso en el asistente de calibración; los adaptadores van en texto, sin dibujo): dónde poner el OPEN/SHORT/LOAD (en el extremo del cable, no en el equipo),
      adaptadores SMA/RP-SMA/u.FL, por qué no medir con la antena encima de la mesa. **S**
- [x] 🟢 **Idiomas**: inglés, francés y alemán (traducidos por Claude, a revisar por hablantes nativos); catálogos JSON
      con el castellano como clave, como en Chirptenna. Falta: formato de números por idioma (hoy siempre con punto) y
      un idioma más (it, pt). **M**
- [x] 🟢 **Informe para compartir** (18-11: botones «Imagen PNG» (veredicto + gráfico) y «Copiar enlace»; el enlace lleva la
      curva de ROE comprimida en la URL tras `#m=` (~1,7 kB, sin servidor, `js/compartir.js`) y quien lo abre ve el veredicto en
      solo lectura; el contenido del enlace se valida y se limpia): PDF actual + imagen PNG del veredicto lista para foros/Discord, y enlace con los datos
      dentro de la URL (sin servidor) para que otro abra la misma medida. **S**
- [~] 🟢 **Web instalable (PWA) y sin conexión** (18-11: `manifest.webmanifest` y `sw.js`, red primero y copia local si
      falla; **sin probar en un navegador real**: el panel de la app no deja registrar service workers; comprobar en Chrome
      desde https o localhost). **S**

## Fase 2 — Radioaficionados (📡, 🟡)

- [x] 📡 **Plan de banda por región y modo** (18-11, primera versión): en las bandas de HF (160–10 m) el modo Simple pregunta «¿para qué parte de la banda quieres ajustar la antena?» (toda la banda, CW, fonía, digitales de banda estrecha, FT8, FT4, WSPR) con los segmentos de la IARU R1 y la ARRL (`segmentos_hf.json`); se mide la banda entera y se juzga el segmento elegido. Tabla «cómo va la antena en cada parte de la banda» con el nivel de ROE y qué hacer en cada modo, y comparación con la medida anterior (línea gris) para ir ajustando. Segmentos orientativos: los de R1 son de memoria (falta contrastarlos con el PDF oficial) y falta la CNAF; las frecuencias de FT8, FT4 y WSPR salen de WSJT-X. Añadidos el mismo día 60 m (segmentos de la IARU R1 y canales de EE. UU.), 4 m (llamada SSB, AM/FM, FT8, WSPR, MSK144) y 8 m (40 MHz) como autorización experimental o temporal. Falta: 6 m y VHF/UHF por modos, JS8, la CNAF de España y las normas por licencia. **M**
- [x] 📡 **Antenas multibanda** (19-11, «Qué estudiar → Varias bandas»: marcas las bandas, un barrido de la más baja a la más alta, veredicto por banda con su acortar/alargar y aviso rrastre si entre dos medidas se mueven varias resonancias o una mejora a costa de otra; js/multibanda.js; probado con la antena de trampas simulada, no con una real): objetivo con varias bandas a la vez (dipolo en abanico, EFHW con 49:1, G5RV, verticales con
      trampas) y veredicto por banda; aviso cuando ajustar una mueve otra. **M**
- [x] 📡🟡 **Medidas de coaxial** (19-11, modo Avanzado, js/coaxial.js: retardo, longitud eléctrica, factor de velocidad con el largo que escribas, pérdida de ida y largo de stubs λ/4 y λ/2; probado con líneas sintéticas, sin cable real todavía): factor de velocidad, longitud eléctrica, pérdida a una frecuencia y **stubs** (λ/4, λ/2,
      con el extremo abierto o en corto): cortar un stub midiendo. Equivalente a `vna/medir_latiguillo.py`. **M**
- [x] 📡🟡 **Medir la antena a través del coaxial** (19-11, js/cable.js, modo Avanzado: largo, factor de velocidad y pérdida del cable; probado con datos sintéticos, no con un cable real; no hay calibración en el extremo): «desincrustar» el cable (port extension / electrical delay, o calibrar en
      el extremo) y avisar de que la ROE leída en la estación siempre parece mejor que en la antena por la pérdida del cable. **M**
- [x] 📡 **Trampas y circuitos resonantes** (19-11, js/resonador.js: frecuencia, ancho a media potencia, Q cargada y propia del pozo de la última medida; sin probar con una trampa real): resonancia y Q de una trampa LC, de un bobinado o de un condensador con la
      técnica de acoplo débil. **M**
- [x] 📡🟡 **Calculadora de adaptación** (19-11, js/adaptacion.js: redes en L en las dos topologías con valores E24, pérdida de retorno prevista; falta stub, red en π y exportar la lista de componentes): con la Z medida, red en L / π / stub con valores reales (E12/E24) y la curva prevista;
      exportar a la lista de componentes. Reutiliza la lógica de `antenas/ajuste.py` de Chirptenna. **M**
- [x] 📡 **Sintonizador (ATU)** (19-11, botón «En vivo» del modo Avanzado: 101 puntos sin parar, ROE mínima y del centro en grande; sin probar con el equipo real): modo «ver en vivo» con barrido rápido continuo y la ROE en grande, para ajustar a mano un
      acoplador o un gamma match mirando la pantalla. **M**
- [ ] 📡🟡 **Bobinas de choque y baluns** (requiere S21, Fase 3): atenuación en modo común y relación de transformación. **M**
- [~] 📡 **HF por debajo de 1,8 MHz** (19-11: aviso automático de precisión si el barrido empieza por debajo de 1,8 MHz; falta comprobar el comportamiento real del equipo en 136 kHz / 475 kHz): los NanoVNA pierden
      precisión abajo. **S**

## Fase 3 — Expertos en RF (🔴)

- [ ] 🔴 **Más equipos**: NanoVNA V2 / V2 Plus4 (protocolo binario), NanoVNA-F V3, LiteVNA (hasta 6 GHz); detección
      automática del modelo y del firmware (DiSlord, Hugen). Las bandas hasta 6 GHz ya están en `bandas.json`. **L**
- [~] 🔴 **Modelo de patrones de calibración** (21-11: `js/patrones.js`, formulario «Modelo de los patrones del kit» en Avanzado, resuelve Ed/Es/Er con los Γ reales; falta una biblioteca de kits comunes con valores medidos y aplicar el modelo a calibraciones ya hechas): retardo y pérdida del offset, C0–C3 del OPEN, L0–L3 del SHORT, carga no ideal;
      kits predefinidos y editor. Mejora la precisión por encima de ~1 GHz. **M**
- [ ] 🔴 **Dos puertos (S21)**: calibración respuesta + aislamiento y luego SOLT/enhanced response; filtros, amplificadores,
      atenuadores, ganancia relativa entre dos antenas (medida de **ganancia comparativa** en campo), aislamiento entre
      antenas de un mismo nodo. **L**
- [ ] 🔴 **Dominio del tiempo (TDR)**: transformada inversa con ventanas, paso y respuesta al impulso, localización de
      discontinuidades en un coaxial o en una pista de PCB, **time gating** para quitar reflexiones del entorno. **L**
- [x] 🔴 **Promediado y estadística** (20-11: casilla «Promediar barridos» 1–20, ruido típico en |S11|; el ruido sube el umbral de prominencia sobre los 3 dB): N barridos, desviación por punto, ruido del sistema estimado y usado como umbral
      de prominencia (hoy fijo en 3 dB). **S**
- [x] 🔴 **Importar y comparar Touchstone** (20-11: `.s1p`/`.s2p` en RI/MA/DB, superpuesto en gris con diferencia y desplazamiento de la resonancia; el S21 de un `.s2p` se lee pero aún no se dibuja): superponer `.s1p`/`.s2p` de otras herramientas, de simulación (openEMS, NEC,
      CST) o del fabricante; diferencia punto a punto. **S**
- [ ] 🔴 **Ajuste de modelos**: RLC serie/paralelo equivalente alrededor de la resonancia, Q cargada/descargada, eficiencia
      estimada con el método de Wheeler (cap) midiendo con y sin campana. **M**
- [ ] 🔴 **Incertidumbre**: barras de error a partir de la calidad de la calibración (directividad y adaptación de fuente
      residuales tras verificar con la carga). **M**
- [~] 🔴 **Scripting / API** (20-11: `window.chirptenna.medir()/resultado()/referencia()` en la consola; falta URL con parámetros y registro de comandos): consola JS o URL con parámetros para automatizar barridos y exportar JSON; registro de los
      comandos enviados al equipo (depuración). **S**

## Fase 4 — Ecosistema

- [~] **Puente con Chirptenna** (20-11: carga el `resultado.json`, compara la resonancia y estima la εr; 20-11: Chirptenna guarda `s11_simulado.s1p`, que se carga como referencia, y abre la web con `?f=&banda=&nombre=` (`leerObjetivoUrl`); falta abrir el `diseno.json` y una εr con la pendiente simulada de cada placa en vez de (εr+1)/2): abrir el `diseno.json` y el `resultado.json` de una antena de Chirptenna y superponer
      simulado frente a medido (lo que hace `herramientas/comparar_medida.py`), con la εr del FR4 deducida del desplazamiento. **M**
- [ ] **Versión de escritorio** (Python/NiceGUI): para quien no use Chrome, con la misma lógica; reutiliza `vna/*.py`. **L**
- [ ] **Base de datos comunitaria de antenas** (opcional y anónima): curvas de antenas comerciales de Meshtastic/LoRa medidas
      por usuarios, para comparar la tuya con la media. Necesita servidor y moderación: decidir antes si merece la pena. **L**
- [ ] **Móvil**: investigar Web Serial / WebUSB en Chrome para Android con OTG (soporte y permisos a verificar). **M**
- [~] **Accesibilidad** (20-11: botón «Leer en voz alta» del veredicto; falta revisar contraste y teclado): lectura del veredicto por voz (útil con las manos ocupadas en la antena), contraste, teclado. **S**

---

## Orden sugerido

1. Fase 0 completa (sin ella todo es teoría).
2. De la Fase 1: **perfil Meshtastic**, **inglés**, **calculadora en mm**, **antes/después** y **comparar antenas** — son lo que
   más gente nota con menos esfuerzo.
3. Lo de HAM más pedido: **plan de banda por modo**, **multibanda**, **coaxial y stubs**, **modo en vivo**.
4. Para expertos, primero **modelo de patrones** y **promediado** (mejoran todo lo demás), luego S21 y TDR.
