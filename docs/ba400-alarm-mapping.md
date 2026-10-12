# Mapeo de alarmas BA400 a componentes del GLB

Fuente: BA400 / BA200 ERROR CODES v2.20, página 1. Los códigos son compartidos; la geometría y estas asociaciones son exclusivamente BA400. Catálogo completo de esta versión, no de futuros firmwares.

Los códigos 20 y 21 son consecuencias visibles a nivel del analizador y nunca crean marcadores. No se infiere causalidad temporal entre filas. Los destinos son referencias de conjunto, no diagnósticos. `unlocated` identifica una diana técnica sin geometría inequívoca. JE1-B1 no es SF1-B1.

Correspondencias aportadas por el usuario: ISE se representa con las tres bombas frontales (pivotes p_ise_01–03; part_id seleccionables ise_01–03). Las placas DR1/DR2/DM1 se ubican dentro de brazo_r1/brazo_r2/brazo_s. Las referencias propuestas para 541 (cabezal_lav), 640 (bascula_2) y 650 (bascula_1) son orientativas. El timeout ISE marca las tres bombas sin atribuirlo a una individual.

Se agregó el código 613, ausente del catálogo local. Los códigos desconocidos se conservan sin marcador.

| Código | Descripción del fabricante | Alcance | Diana | part_id GLB |
|---|---|---|---|---|
| 0 | Without Errors | status | Analizador | — |
| 1 | CPU Firmware Mismatch. Update from repository must be done | equipment | Analizador completo | — |
| 2 | Distributed Firmware Mismatch. Update from repository must be done | equipment | Analizador completo | — |
| 3 | FW Repository Error | equipment | Analizador completo | — |
| 4 | A400 FW Error (Checksums) | equipment | Analizador completo | — |
| 5 | A400 FW Execution Error | equipment | Analizador completo | — |
| 6 | Maneuvers/Adjustments Mismatch. Update from repository must be done | equipment | Analizador completo | — |
| 10 | CAN Bus Error | equipment | Analizador completo | — |
| 20 | Instruction Rejected by a previous Error (Permanent or Self-recover like covers) (Stand by-Running) | consequence | Analizador completo | — |
| 21 | Instruction Aborted by an Error (Stand by-Running) | consequence | Analizador completo | — |
| 22 | Recover Failed. | equipment | Analizador completo | — |
| 28 | Impossible to perform TEST/PTEST/WRUN; Wait to next Cycle | equipment | Analizador completo | — |
| 34 | Impossible to perform TEST/PTEST/WRUN; Already received one in the same cycle | equipment | Analizador completo | — |
| 35 | Error in Scheduller Table | equipment | Analizador completo | — |
| 40 | Instruction unknown or with wrong parameter | equipment | Analizador completo | — |
| 41 | Instruction Not Allowed on This State | equipment | Analizador completo | — |
| 42 | Instruction Not Allowed on This Instruction | equipment | Analizador completo | — |
| 43 | COMMAND script wrong | equipment | Analizador completo | — |
| 45 | LOADADJ Wrong | equipment | Analizador completo | — |
| 61 | ISE Time Out | component | Módulo ISE | ise_01, ise_02, ise_03 |
| 70 | Main Cover opened while instrument working | component | Tapa superior | tapa_sup |
| 99 | Multiple Errors | equipment | Analizador completo | — |
| 100 | BR1 Vertical Home Error | component | Brazo R1 | brazo_r1 |
| 101 | BR1 Horizontal Home Error | component | Brazo R1 | brazo_r1 |
| 102 | BR1 Vertical step loss detected | component | Brazo R1 | brazo_r1 |
| 103 | BR1 Error de HOME al intentar recuperarse | component | Brazo R1 | brazo_r1 |
| 108 | BR1 Board doesn't answer | component | Tarjeta brazo R1 | pcb_r1 |
| 109 | BR1 Reset | component | Tarjeta brazo R1 | pcb_r1 |
| 110 | BR2 Vertical Home Error | component | Brazo R2 | brazo_r2 |
| 111 | BR2 Horizontal Home Error | component | Brazo R2 | brazo_r2 |
| 112 | BR2 Vertical step loss detected | component | Brazo R2 | brazo_r2 |
| 113 | BR2 Error de HOME al intentar recuperarse | component | Brazo R2 | brazo_r2 |
| 118 | BR2 Board doesn't answer | component | Tarjeta brazo R2 | pcb_r2 |
| 119 | BR2 Reset | component | Tarjeta brazo R2 | pcb_r2 |
| 120 | BM1 Vertical Home Error | component | Brazo S | brazo_s |
| 121 | BM1 Horizontal Home Error | component | Brazo S | brazo_s |
| 122 | BM1 Vertical step loss detected | component | Brazo S | brazo_s |
| 123 | BM1 Error de HOME al intentar recuperarse | component | Brazo S | brazo_s |
| 128 | BM1 Board doesn't answer | component | Tarjeta brazo S | pcb_s |
| 129 | BM1 Reset | component | Tarjeta brazo S | pcb_s |
| 130 | AG1 Vertical Home Error | component | Brazo A1 | brazo_a1 |
| 131 | AG1 Horizontal Home Error | component | Brazo A1 | brazo_a1 |
| 132 | AG1 Vertical step loss detected | component | Brazo A1 | brazo_a1 |
| 133 | AG1 Error de HOME al intentar recuperarse | component | Brazo A1 | brazo_a1 |
| 138 | AG1 Board doesn't answer | component | Tarjeta brazo A1 | pcb_a1 |
| 139 | AG1 Reset | component | Tarjeta brazo A1 | pcb_a1 |
| 140 | AG2 Vertical Home Error | component | Brazo A2 | brazo_a2 |
| 141 | AG2 Horizontal Home Error | component | Brazo A2 | brazo_a2 |
| 142 | AG2 Vertical step loss detected | component | Brazo A2 | brazo_a2 |
| 143 | AG2 Error de HOME al intentar recuperarse | component | Brazo A2 | brazo_a2 |
| 148 | AG2 Board doesn't answer | component | Tarjeta brazo A2 | pcb_a2 |
| 149 | AG2 Reset | component | Tarjeta brazo A2 | pcb_a2 |
| 200 | DR1 Freq Detection system Error (Frequency Wrong) | component | Brazo R1 | brazo_r1 |
| 201 | DR1 Probe Thermistor Error | component | Brazo R1 | brazo_r1 |
| 202 | DR1 Probe Heater Error | component | Brazo R1 | brazo_r1 |
| 203 | DR1 Collision Detected | component | Brazo R1 | brazo_r1 |
| 208 | DR1 Board doesn't answer | component | Placa de detección DR1 · interior del brazo R1 | brazo_r1 |
| 209 | DR1 Reset | component | Placa de detección DR1 · interior del brazo R1 | brazo_r1 |
| 210 | DR2 Freq Detection system Error (Frequency Wrong) | component | Brazo R2 | brazo_r2 |
| 211 | DR2 Probe Thermistor Error | component | Brazo R2 | brazo_r2 |
| 212 | DR2 Probe Heater Error | component | Brazo R2 | brazo_r2 |
| 213 | DR2 Collision Detected | component | Brazo R2 | brazo_r2 |
| 218 | DR2 Board doesn't answer | component | Placa de detección DR2 · interior del brazo R2 | brazo_r2 |
| 219 | DR2 Reset | component | Placa de detección DR2 · interior del brazo R2 | brazo_r2 |
| 220 | DM1 Freq Detection system Error (Frequency Wrong) | component | Brazo S | brazo_s |
| 223 | DM1 Collision Detected | component | Brazo S | brazo_s |
| 228 | DM1 Board doesn't answer | component | Placa de detección DM1 · interior del brazo S | brazo_s |
| 229 | DM1 Reset | component | Placa de detección DM1 · interior del brazo S | brazo_s |
| 300 | RR1 Home Error | component | Rotor de reactivos | rotor_rea |
| 301 | RR1 Fridge Temperature Alarm | component | Refrigeración rotor rea | frio_rea |
| 302 | RR1 Fridge Peltiers Error | component | Refrigeración rotor rea | frio_rea |
| 303 | RR1 Fridge Fans Error | component | Refrigeración rotor rea | frio_rea |
| 305 | RR1 Cover Opened | component | Tapa de reactivos | tapa_rea |
| 310 | RR1 Code Bar Reader Error | component | Lector códigos rea | lector_rea |
| 311 | RR1 Code Bar Reader Time Out Error | component | Lector códigos rea | lector_rea |
| 348 | RR1 Board doesn't answer | component | Tarjeta rea | pcb_rea |
| 349 | RR1 Reset | component | Tarjeta rea | pcb_rea |
| 350 | RM1 Home Error | component | Rotor de muestras | rotor_mue |
| 355 | RM1 Cover Opened | component | Tapa de muestras | tapa_mue |
| 360 | RM1 Code Bar Reader Error | component | Lector códigos mue | lector_mue |
| 361 | RM1 Code Bar Reader Time Out Error | component | Lector códigos mue | lector_mue |
| 398 | RM1 Board doesn't answer | component | Tarjeta mue | pcb_mue |
| 399 | RM1 Reset | component | Tarjeta mue | pcb_mue |
| 500 | Rotor Home Error | component | Centrador y eje del rotor | rotor_rxn |
| 501 | Rotor Encoder Error | component | Centrador y eje del rotor | rotor_rxn |
| 502 | Rotor Safety Stop: Washing Station Down | component | Cabezal de lavado | cabezal_lav |
| 503 | Photometrics Cover Opened | component | Tapa del rotor de reacciones | tapa_rxn |
| 504 | Washing Station Collision | component | Cabezal de lavado | cabezal_lav |
| 510 | Photometrics Temperature Alarm | component | Canal térmico de reacciones · 37 °C | cuba_rxn |
| 511 | Photometrics Peltiers Error | component | Canal térmico de reacciones · 37 °C | cuba_rxn |
| 512 | Photometrics Fans Error | component | Canal térmico de reacciones · 37 °C | cuba_rxn |
| 520 | Washing Station Home Error | component | Cabezal de lavado | cabezal_lav |
| 530 | Photometric Board not detected | component | Tarjeta de fotometría | pcb_foto |
| 540 | Photometric Overflow Board not Detected | unlocated | Placa de detección de desbordamiento | — |
| 541 | Photometric Rotor Overflow Detected | component | Cabezal de lavado · referencia de desbordamiento | cabezal_lav |
| 550 | Metacrilate Rotor Missing | component | Rotor desechable de metacrilato · 120 pocillos | rotor_pm |
| 551 | Metacrilate Rotor Full after FLIGHT | component | Rotor desechable de metacrilato · 120 pocillos | rotor_pm |
| 552 | Metacrilate Rotor Full after RUNNING | component | Rotor desechable de metacrilato · 120 pocillos | rotor_pm |
| 553 | Photometic Self-centered error | component | Centrador y eje del rotor | rotor_rxn |
| 560 | Error TimeOut During FLIGHT | component | Banco óptico sin filtros | banco_opt |
| 598 | GLF Board doesn't answer | component | Tarjeta control del rotor | pcb_rxn |
| 599 | Reset Placa | component | Tarjeta control del rotor | pcb_rxn |
| 600 | Washing Station Pump Home Error | component | Bomba de lavado V2 | bomba_lav |
| 610 | Washing Station Heater Temperature Alarm | component | Calentador de lavado | calentador |
| 611 | Washing Station Heater Error | component | Calentador de lavado | calentador |
| 612 | Error del driver de motor | unlocated | Driver de motor SFX | — |
| 613 | Error del Ventilador (error de diagnóstico 3er hilo) | unlocated | Ventilador SFX | — |
| 620 | Waste Tank Sensor Impossible Value | component | Sensor de nivel res | nivel_res |
| 621 | Too much time to empty Waste Tank | component | Depósito trasero residuos baja contaminación | dep_res |
| 622 | Waste Tank Sensor not detected | component | Sensor de nivel res | nivel_res |
| 630 | Water Tank Sensor Impossible Value | component | Sensor de nivel agua | nivel_agua |
| 631 | Too much time to fill Water Tank | component | Depósito trasero agua destilada | dep_agua |
| 632 | Water Tank Sensor not detected | component | Sensor de nivel agua | nivel_agua |
| 640 | High Contamination Waste Gauge electronics error | component | Báscula 2 · residuos de alta contaminación | bascula_2 |
| 650 | Washing Solution Gauge electronics error | component | Báscula 1 · solución de lavado | bascula_1 |
| 660 | Error detected in B1 | component | Bomba SF1-B1 | SF1-B1 |
| 661 | Error detected in B2 | component | Bomba SF1-B2 | SF1-B2 |
| 662 | Error detected in B3 | component | Bomba SF1-B3 | SF1-B3 |
| 663 | Error detected in B4 | component | Bomba SF1-B4 | SF1-B4 |
| 664 | Error detected in B5 | component | Bomba SF1-B5 | SF1-B5 |
| 665 | Error detected in B6 | component | Bomba SF1-B6 | SF1-B6 |
| 666 | Error detected in B7 | component | Bomba SF1-B7 | SF1-B7 |
| 667 | Error detected in B8 | component | Bomba SF1-B8 | SF1-B8 |
| 668 | Error detected in B9 | component | Bomba SF1-B9 | SF1-B9 |
| 669 | Error detected in B10 | component | Bomba SF1-B10 | SF1-B10 |
| 670 | Error detected in GE1 | unlocated | GE1 de SF1 | — |
| 671 | Error detected in EV1 | component | Electroválvula SF1-EV1 | SF1-EV1 |
| 672 | Error detected in EV2 | component | Electroválvula SF1-EV2 | SF1-EV2 |
| 673 | Error detected in EV3 | unlocated | SF1-EV3 | — |
| 698 | SF1 Board doesn't answer | component | Tarjeta de fluidos SF1 | pcb_sf1 |
| 699 | Reset Placa | component | Tarjeta de fluidos SF1 | pcb_sf1 |
| 700 | Sample Pump Home Error | component | Bomba cerámica S | jeringa_s |
| 701 | Reagent 1 Pump Home Error | component | Bomba cerámica R1 | jeringa_r1 |
| 702 | Reagent 2 Pump Home Error | component | Bomba cerámica R2 | jeringa_r2 |
| 710 | Clot Detector Hardware Error | unlocated | Detector de coágulos | — |
| 711 | Sample Fluidics Obstructed | unlocated | Circuito de fluidos de muestra | — |
| 720 | Error detected in B1 | unlocated | JE1-B1 | — |
| 721 | Error detected in B2 | unlocated | JE1-B2 | — |
| 722 | Error detected in B3 | unlocated | JE1-B3 | — |
| 723 | Error detected in B4 | unlocated | JE1-B4 | — |
| 724 | Error detected in EV1 | unlocated | JE1-EV1 | — |
| 725 | Error detected in EV2 | unlocated | JE1-EV2 | — |
| 726 | Error detected in EV3 | unlocated | JE1-EV3 | — |
| 727 | Error detected in EV4 | unlocated | JE1-EV4 | — |
| 728 | Error detected in EV5 | unlocated | JE1-EV5 | — |
| 729 | Error detected in EV6 | unlocated | JE1-EV6 | — |
| 730 | Error detected in EV7 | unlocated | JE1-EV7 | — |
| 731 | Error detected in EV8 | unlocated | JE1-EV8 | — |
| 798 | JE1 Board doesn't answer | component | Tarjeta de jeringas JE1 | pcb_je1 |
| 799 | Reset Placa | component | Tarjeta de jeringas JE1 | pcb_je1 |
