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

- [ ] 🟢🕸️ **Perfil «Mi nodo Meshtastic»**: eliges región (EU_868, EU_433, US, y luego ANZ, IN…) y preset (LongFast…) y la
      app calcula la **frecuencia real del canal** con la misma fórmula que el firmware (frecuencia del slot por defecto o el
      que pongas), mide alrededor y da el veredicto **en esa frecuencia**, no solo en la banda. Útil porque la región EU_868 de
      Meshtastic es solo **869,4–869,65 MHz** (250 kHz, 10 % de ciclo; verificado en sus docs el 18-11) y una antena centrada
      en 868 MHz puede ir justa. Las ITU 2 m / 70 cm / 1,25 m solo se eligen en modo con licencia de radioaficionado. **M**
- [ ] 🟢🕸️ **Comparar antenas («shootout»)**: guardar varias medidas con nombre (la de serie del T-Beam/Heltec/RAK, la
      comprada, la casera) y ver una tabla ordenada por ROE en el canal y ancho de banda, con las curvas superpuestas. **M**
- [ ] 🟢 **Antes / después**: al medir tras cortar, se superpone la medida anterior y dice «has movido la resonancia de 892
      a 871 MHz; te falta un 0,5 %». **S**
- [ ] 🟢 **Calculadora de corte en mm**: introduces el largo actual del radiador (o del brazo del dipolo) y te dice cuántos
      mm cortar o añadir, no solo el %. Con aviso de cortar en pasos (cortar es irreversible). **S**
- [ ] 🟢 **Explicaciones en lenguaje llano**: «?» junto a ROE, pérdida de retorno, ancho de banda, Smith; semáforo
      verde/ámbar/rojo con lo que significa para el alcance (p. ej. «ROE 2: pierdes ~11 % de la potencia»). **S**
- [ ] 🟢 **Avisos de medida mal hecha**: detectar curvas típicas de cable suelto, antena sin conectar (todo ≈ 0 dB), mano
      cerca (la medida cambia mucho entre dos barridos seguidos), medir a través de un latiguillo largo sin calibrar en su
      extremo. **M**
- [ ] 🟢🕸️ **Ilustraciones del montaje**: dónde poner el OPEN/SHORT/LOAD (en el extremo del cable, no en el equipo),
      adaptadores SMA/RP-SMA/u.FL, por qué no medir con la antena encima de la mesa. **S**
- [ ] 🟢 **Idiomas**: **inglés primero** (la mayoría de Meshtastic de EE. UU.), luego los mismos que Chirptenna (fr, de);
      catálogos JSON con el castellano como clave, como en Chirptenna. **M**
- [ ] 🟢 **Informe para compartir**: PDF actual + imagen PNG del veredicto lista para foros/Discord, y enlace con los datos
      dentro de la URL (sin servidor) para que otro abra la misma medida. **S**
- [ ] 🟢 **Web instalable (PWA) y sin conexión**: para medir en el monte sin cobertura. **S**

## Fase 2 — Radioaficionados (📡, 🟡)

- [ ] 📡 **Plan de banda por región y modo**: segmentos CW/SSB/digital/FM de cada banda (IARU R1/R2/R3) en la gráfica; elegir
      «quiero la antena centrada en la parte de SSB de 20 m» en lugar de la banda entera. **M**
- [ ] 📡 **Antenas multibanda**: objetivo con varias bandas a la vez (dipolo en abanico, EFHW con 49:1, G5RV, verticales con
      trampas) y veredicto por banda; aviso cuando ajustar una mueve otra. **M**
- [ ] 📡🟡 **Medidas de coaxial**: factor de velocidad, longitud eléctrica, pérdida a una frecuencia y **stubs** (λ/4, λ/2,
      con el extremo abierto o en corto): cortar un stub midiendo. Equivalente a `vna/medir_latiguillo.py`. **M**
- [ ] 📡🟡 **Medir la antena a través del coaxial**: «desincrustar» el cable (port extension / electrical delay, o calibrar en
      el extremo) y avisar de que la ROE leída en la estación siempre parece mejor que en la antena por la pérdida del cable. **M**
- [ ] 📡 **Trampas y circuitos resonantes**: resonancia y Q de una trampa LC, de un bobinado o de un condensador con la
      técnica de acoplo débil. **M**
- [ ] 📡🟡 **Calculadora de adaptación**: con la Z medida, red en L / π / stub con valores reales (E12/E24) y la curva prevista;
      exportar a la lista de componentes. Reutiliza la lógica de `antenas/ajuste.py` de Chirptenna. **M**
- [ ] 📡 **Sintonizador (ATU)**: modo «ver en vivo» con barrido rápido continuo y la ROE en grande, para ajustar a mano un
      acoplador o un gamma match mirando la pantalla. **M**
- [ ] 📡🟡 **Bobinas de choque y baluns** (requiere S21, Fase 3): atenuación en modo común y relación de transformación. **M**
- [ ] 📡 **HF por debajo de 1,8 MHz**: comprobar el comportamiento del equipo en 136 kHz / 475 kHz (los NanoVNA pierden
      precisión abajo) y avisar. **S**

## Fase 3 — Expertos en RF (🔴)

- [ ] 🔴 **Más equipos**: NanoVNA V2 / V2 Plus4 (protocolo binario), NanoVNA-F V3, LiteVNA (hasta 6 GHz); detección
      automática del modelo y del firmware (DiSlord, Hugen). Las bandas hasta 6 GHz ya están en `bandas.json`. **L**
- [ ] 🔴 **Modelo de patrones de calibración**: retardo y pérdida del offset, C0–C3 del OPEN, L0–L3 del SHORT, carga no ideal;
      kits predefinidos y editor. Mejora la precisión por encima de ~1 GHz. **M**
- [ ] 🔴 **Dos puertos (S21)**: calibración respuesta + aislamiento y luego SOLT/enhanced response; filtros, amplificadores,
      atenuadores, ganancia relativa entre dos antenas (medida de **ganancia comparativa** en campo), aislamiento entre
      antenas de un mismo nodo. **L**
- [ ] 🔴 **Dominio del tiempo (TDR)**: transformada inversa con ventanas, paso y respuesta al impulso, localización de
      discontinuidades en un coaxial o en una pista de PCB, **time gating** para quitar reflexiones del entorno. **L**
- [ ] 🔴 **Promediado y estadística**: N barridos, desviación por punto, ruido del sistema estimado y usado como umbral
      de prominencia (hoy fijo en 3 dB). **S**
- [ ] 🔴 **Importar y comparar Touchstone**: superponer `.s1p`/`.s2p` de otras herramientas, de simulación (openEMS, NEC,
      CST) o del fabricante; diferencia punto a punto. **S**
- [ ] 🔴 **Ajuste de modelos**: RLC serie/paralelo equivalente alrededor de la resonancia, Q cargada/descargada, eficiencia
      estimada con el método de Wheeler (cap) midiendo con y sin campana. **M**
- [ ] 🔴 **Incertidumbre**: barras de error a partir de la calidad de la calibración (directividad y adaptación de fuente
      residuales tras verificar con la carga). **M**
- [ ] 🔴 **Scripting / API**: consola JS o URL con parámetros para automatizar barridos y exportar JSON; registro de los
      comandos enviados al equipo (depuración). **S**

## Fase 4 — Ecosistema

- [ ] **Puente con Chirptenna**: abrir el `diseno.json` y el `resultado.json` de una antena de Chirptenna y superponer
      simulado frente a medido (lo que hace `herramientas/comparar_medida.py`), con la εr del FR4 deducida del desplazamiento. **M**
- [ ] **Versión de escritorio** (Python/NiceGUI): para quien no use Chrome, con la misma lógica; reutiliza `vna/*.py`. **L**
- [ ] **Base de datos comunitaria de antenas** (opcional y anónima): curvas de antenas comerciales de Meshtastic/LoRa medidas
      por usuarios, para comparar la tuya con la media. Necesita servidor y moderación: decidir antes si merece la pena. **L**
- [ ] **Móvil**: investigar Web Serial / WebUSB en Chrome para Android con OTG (soporte y permisos a verificar). **M**
- [ ] **Accesibilidad**: lectura del veredicto por voz (útil con las manos ocupadas en la antena), contraste, teclado. **S**

---

## Orden sugerido

1. Fase 0 completa (sin ella todo es teoría).
2. De la Fase 1: **perfil Meshtastic**, **inglés**, **calculadora en mm**, **antes/después** y **comparar antenas** — son lo que
   más gente nota con menos esfuerzo.
3. Lo de HAM más pedido: **plan de banda por modo**, **multibanda**, **coaxial y stubs**, **modo en vivo**.
4. Para expertos, primero **modelo de patrones** y **promediado** (mejoran todo lo demás), luego S21 y TDR.
