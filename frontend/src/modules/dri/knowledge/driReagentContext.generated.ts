// Generated from einfo_bio_repository/generate_dri_reagent_context.py
export const DRI_REAGENT_CONTEXT = {
  "ACE": {
    "displayCode": "ACE",
    "displayName": "Enzima convertidora de angiotensina",
    "canonicalNames": [
      "ACE",
      "ANGIOTENSIN CONVERTING ENZYME ACE",
      "ANGIOTENSIN CONVERTING ENZYME"
    ],
    "productEntries": [
      {
        "productCode": "21796",
        "platformFamily": "bax00",
        "itemName": "ANGIOTENSIN CONVERTING ENZYME (ACE)",
        "description": "ANGIOTENSIN CONVERTING ENZYME (ACE)",
        "format": "2 x 60 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "21796"
      ],
      "BA200": [
        "21796"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": true,
      "matchedProductCount": 1
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": null,
      "detectionLimitValue": 3.79,
      "detectionLimitUnit": "U/L",
      "detectionLimitAlternateValue": 0.063,
      "detectionLimitAlternateUnit": "μkat/L",
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 150.0,
      "linearityLimitUnit": "U/L",
      "linearityLimitAlternateValue": 2.5,
      "linearityLimitAlternateUnit": "μkat/L",
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 20.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La bilirrubina (hasta 20 mg/dL), la hemólisis (hemoglobina hasta 300 mg/dL) y lipemia (triglicéridos hasta 400 mg/dL) no interfieren"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 300.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La bilirrubina (hasta 20 mg/dL), la hemólisis (hemoglobina hasta 300 mg/dL) y lipemia (triglicéridos hasta 400 mg/dL) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 400.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La bilirrubina (hasta 20 mg/dL), la hemólisis (hemoglobina hasta 300 mg/dL) y lipemia (triglicéridos hasta 400 mg/dL) no interfieren"
        }
      ],
      "procedureLimitations": [
        "La bilirrubina (hasta 20 mg/dL), la hemólisis (hemoglobina hasta 300 mg/dL) y lipemia (triglicéridos hasta 400 mg/dL) no interfieren"
      ],
      "notes": [
        "CONSERVACIÓN Y ESTABILIDAD Conservar a 2-8ºC. Los componentes son estables hasta la fecha de caducidad indicada en la etiqueta del kit, siempre que se conserven bien cerrados y se evite la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 2 meses. Indicaciones de deterioro: Absorbancia del blanco inferior al límite indicado en “Parámetros de la prueba”.",
        "CARACTERÍSTICAS METROLÓGICAS Las prestaciones metrológicas que se describen a continuación, han sido obtenidas utilizando un analizador BA400 y siguiendo las guías del Clinical & Laboratory Standards Institute (CLSI).  Límite de detección: 3,79 U/L = 0,063 μkat/L.",
        " Límite de linealidad: 150 U/L = 2,50 μkat/L.",
        "LIMITACIONES DEL PROCEDIMIENTO  Interferencias: La bilirrubina (hasta 20 mg/dL), la hemólisis (hemoglobina hasta 300 mg/dL) y lipemia (triglicéridos hasta 400 mg/dL) no interfieren. Otros medicamentos y sustancias pueden interferir5."
      ]
    },
    "qcReferences": [
      {
        "id": "ACE::18005::0004::I::U/L::FAPGG",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "ACE",
        "methodName": "FAPGG",
        "targetValue": null,
        "sd1": null,
        "sd1Low": null,
        "sd1High": null,
        "sd2Low": null,
        "sd2High": null,
        "rejectLow": null,
        "rejectHigh": null,
        "unit": "U/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "ACE::18005::0004::I::μkat/L::FAPGG",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "ACE",
        "methodName": "FAPGG",
        "targetValue": null,
        "sd1": null,
        "sd1Low": null,
        "sd1High": null,
        "sd2Low": null,
        "sd2High": null,
        "rejectLow": null,
        "rejectHigh": null,
        "unit": "μkat/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "ACE::18009::0001739::I::U/L::FAPGG",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "ACE",
        "methodName": "FAPGG",
        "targetValue": null,
        "sd1": null,
        "sd1Low": null,
        "sd1High": null,
        "sd2Low": null,
        "sd2High": null,
        "rejectLow": null,
        "rejectHigh": null,
        "unit": "U/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "ACE::18009::0001739::I::μkat/L::FAPGG",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "ACE",
        "methodName": "FAPGG",
        "targetValue": null,
        "sd1": null,
        "sd1Low": null,
        "sd1High": null,
        "sd2Low": null,
        "sd2High": null,
        "rejectLow": null,
        "rejectHigh": null,
        "unit": "μkat/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "ACE::18010::0001747::II::U/L::FAPGG",
        "productCode": "18010",
        "lot": "0001747",
        "controlLevel": "level_2",
        "analyteName": "ACE",
        "methodName": "FAPGG",
        "targetValue": null,
        "sd1": null,
        "sd1Low": null,
        "sd1High": null,
        "sd2Low": null,
        "sd2High": null,
        "rejectLow": null,
        "rejectHigh": null,
        "unit": "U/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18010 lote 0001747"
      },
      {
        "id": "ACE::18042::59322::I::U/L::FAPGG",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "ACE",
        "methodName": "FAPGG",
        "targetValue": 25.3,
        "sd1": 3.4,
        "sd1Low": 21.9,
        "sd1High": 28.7,
        "sd2Low": 18.5,
        "sd2High": 32.1,
        "rejectLow": 15.2,
        "rejectHigh": 35.4,
        "unit": "U/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "ACE::18042::59322::I::μkat/L::FAPGG",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "ACE",
        "methodName": "FAPGG",
        "targetValue": 0.42,
        "sd1": 0.056,
        "sd1Low": 0.364,
        "sd1High": 0.476,
        "sd2Low": 0.308,
        "sd2High": 0.532,
        "rejectLow": 0.252,
        "rejectHigh": 0.588,
        "unit": "μkat/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "ACE::18043::58987::II::U/L::FAPGG",
        "productCode": "18043",
        "lot": "58987",
        "controlLevel": "level_2",
        "analyteName": "ACE",
        "methodName": "FAPGG",
        "targetValue": 36.5,
        "sd1": 4.3,
        "sd1Low": 32.2,
        "sd1High": 40.8,
        "sd2Low": 27.9,
        "sd2High": 45.1,
        "rejectLow": 23.7,
        "rejectHigh": 49.3,
        "unit": "U/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18043 lote 58987"
      }
    ],
    "missingFields": [
      "Sin estabilidad a bordo"
    ]
  },
  "ACIDO_URIC": {
    "displayCode": "ACIDO_URIC",
    "displayName": "ACIDO_URIC",
    "canonicalNames": [
      "ACIDO URIC"
    ],
    "productEntries": [],
    "productCodesByPlatform": {},
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": false,
      "hasValuesheet": false,
      "matchedProductCount": 0
    },
    "facts": {
      "storageTempMinC": null,
      "storageTempMaxC": null,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": null,
      "detectionLimitValue": null,
      "detectionLimitUnit": null,
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": null,
      "linearityLimitUnit": null,
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [],
      "procedureLimitations": [],
      "notes": []
    },
    "qcReferences": [],
    "missingFields": [
      "Sin producto enlazado",
      "Sin IFU descargado",
      "Sin temperatura de conservación",
      "Sin estabilidad a bordo",
      "Sin límite de linealidad",
      "Sin LOD/LOQ estructurado",
      "Sin umbrales de interferencia"
    ]
  },
  "ACP": {
    "displayCode": "ACP",
    "displayName": "Fosfatasa ácida",
    "canonicalNames": [
      "ACID PHOSPHATASE ACP",
      "ACID PHOSPHATASE"
    ],
    "productEntries": [
      {
        "productCode": "11548",
        "platformFamily": "manual",
        "itemName": "ACID PHOSPHATASE (ACP)",
        "description": "ACID PHOSPHATASE (ACP) 40 mL",
        "format": "40 mL",
        "systems": null,
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "manual": [
        "11548"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": true,
      "matchedProductCount": 1
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": "high_blank_absorbance",
      "detectionLimitValue": 0.8,
      "detectionLimitUnit": "U/L",
      "detectionLimitAlternateValue": 13.0,
      "detectionLimitAlternateUnit": "nkat/L",
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 150.0,
      "linearityLimitUnit": "U/L",
      "linearityLimitAlternateValue": 2500.0,
      "linearityLimitAlternateUnit": "nkat/L",
      "interferenceThresholds": [
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 5.0,
          "unit": "g/L",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "lipemia (triglicéridos < 5 g/L) no interfiere"
        }
      ],
      "procedureLimitations": [
        "La lipemia (triglicéridos < 5 g/L) no interfiere. La bilirrubina ( 2,5 mg/dL) Reactivo de Trabajo: Añadir al Reactivo B1 10 mL de Reactivo AT (FAC total) o de Reactivo AI (FAC no prostática) y agitar hasta disolución completa. A continuación trasvasar esta disolución al frasco de Reactivo B2 y agitar hasta disolución completa. Estable 10 días a 2-8ºC. interfiere"
      ],
      "notes": [
        "CONSERVAR A 2-8ºC",
        " Reactivos: Presencia de partículas, turbidez, absorbancia del blanco superior a 0,450 a 405 nm",
        " Límite de detección: 0,8 U/L = 13 nkat/L",
        " Límite de linealidad: 150 U/L = 2500 nkat/L. Cuando se obtengan valores superiores, diluir la",
        " Interferencias: La lipemia (triglicéridos < 5 g/L) no interfiere. La bilirrubina ( 2,5 mg/dL)"
      ]
    },
    "qcReferences": [
      {
        "id": "ACP::18005::0004::I::U/L::Naftil fosfato/pentanodiol",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "FOSFATASA ÁCIDA",
        "methodName": "Naftil fosfato/pentanodiol",
        "targetValue": 7.67,
        "sd1": 1.28,
        "sd1Low": 6.39,
        "sd1High": 8.95,
        "sd2Low": 5.11,
        "sd2High": 10.23,
        "rejectLow": 3.84,
        "rejectHigh": 11.51,
        "unit": "U/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "ACP::18005::0004::I::μkat/L::Naftil fosfato/pentanodiol",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "FOSFATASA ÁCIDA",
        "methodName": "Naftil fosfato/pentanodiol",
        "targetValue": 0.127,
        "sd1": 0.021,
        "sd1Low": 0.106,
        "sd1High": 0.148,
        "sd2Low": 0.085,
        "sd2High": 0.169,
        "rejectLow": 0.064,
        "rejectHigh": 0.191,
        "unit": "μkat/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "ACP::18009::0001739::I::U/L::Naftil fosfato/pentanodiol",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "FOSFATASA ÁCIDA",
        "methodName": "Naftil fosfato/pentanodiol",
        "targetValue": 7.67,
        "sd1": 1.28,
        "sd1Low": 6.39,
        "sd1High": 8.95,
        "sd2Low": 5.11,
        "sd2High": 10.23,
        "rejectLow": 3.84,
        "rejectHigh": 11.51,
        "unit": "U/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "ACP::18009::0001739::I::μkat/L::Naftil fosfato/pentanodiol",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "FOSFATASA ÁCIDA",
        "methodName": "Naftil fosfato/pentanodiol",
        "targetValue": 0.127,
        "sd1": 0.021,
        "sd1Low": 0.106,
        "sd1High": 0.148,
        "sd2Low": 0.085,
        "sd2High": 0.169,
        "rejectLow": 0.064,
        "rejectHigh": 0.191,
        "unit": "μkat/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "ACP::18010::0001747::II::μkat/L::FAPGG",
        "productCode": "18010",
        "lot": "0001747",
        "controlLevel": "level_2",
        "analyteName": "FOSFATASA ÁCIDA",
        "methodName": "FAPGG",
        "targetValue": null,
        "sd1": null,
        "sd1Low": null,
        "sd1High": null,
        "sd2Low": null,
        "sd2High": null,
        "rejectLow": null,
        "rejectHigh": null,
        "unit": "μkat/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18010 lote 0001747"
      },
      {
        "id": "ACP::18010::0001747::II::U/L::Naftil fosfato/pentanodiol",
        "productCode": "18010",
        "lot": "0001747",
        "controlLevel": "level_2",
        "analyteName": "FOSFATASA ÁCIDA",
        "methodName": "Naftil fosfato/pentanodiol",
        "targetValue": 25.4,
        "sd1": 4.2,
        "sd1Low": 21.2,
        "sd1High": 29.6,
        "sd2Low": 17.0,
        "sd2High": 33.8,
        "rejectLow": 12.7,
        "rejectHigh": 38.1,
        "unit": "U/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18010 lote 0001747"
      },
      {
        "id": "ACP::18042::59322::I::U/L::Naftil fosfato/pentanodiol",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "FOSFATASA ÁCIDA",
        "methodName": "Naftil fosfato/pentanodiol",
        "targetValue": 6.6,
        "sd1": 1.1,
        "sd1Low": 5.5,
        "sd1High": 7.7,
        "sd2Low": 4.4,
        "sd2High": 8.8,
        "rejectLow": 3.3,
        "rejectHigh": 9.9,
        "unit": "U/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "ACP::18042::59322::I::μkat/L::Naftil fosfato/pentanodiol",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "FOSFATASA ÁCIDA",
        "methodName": "Naftil fosfato/pentanodiol",
        "targetValue": 0.11,
        "sd1": 0.018,
        "sd1Low": 0.092,
        "sd1High": 0.128,
        "sd2Low": 0.074,
        "sd2High": 0.146,
        "rejectLow": 0.055,
        "rejectHigh": 0.165,
        "unit": "μkat/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "ACP::18043::58987::II::μkat/L::FAPGG",
        "productCode": "18043",
        "lot": "58987",
        "controlLevel": "level_2",
        "analyteName": "FOSFATASA ÁCIDA",
        "methodName": "FAPGG",
        "targetValue": 0.606,
        "sd1": 0.071,
        "sd1Low": 0.535,
        "sd1High": 0.677,
        "sd2Low": 0.464,
        "sd2High": 0.748,
        "rejectLow": 0.394,
        "rejectHigh": 0.818,
        "unit": "μkat/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18043 lote 58987"
      },
      {
        "id": "ACP::18043::58987::II::U/L::Naftil fosfato/pentanodiol",
        "productCode": "18043",
        "lot": "58987",
        "controlLevel": "level_2",
        "analyteName": "FOSFATASA ÁCIDA",
        "methodName": "Naftil fosfato/pentanodiol",
        "targetValue": 21.0,
        "sd1": 3.5,
        "sd1Low": 17.5,
        "sd1High": 24.5,
        "sd2Low": 14.0,
        "sd2High": 28.0,
        "rejectLow": 10.5,
        "rejectHigh": 31.5,
        "unit": "U/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18043 lote 58987"
      }
    ],
    "missingFields": [
      "Sin estabilidad a bordo"
    ]
  },
  "ADA": {
    "displayCode": "ADA",
    "displayName": "Adenosine deaminase",
    "canonicalNames": [
      "ADENOSINE DEAMINASE ADA",
      "ADENOSINE DEAMINASE"
    ],
    "productEntries": [
      {
        "productCode": "12754",
        "platformFamily": "ax5",
        "itemName": "ADENOSINE DEAMINASE (ADA)",
        "description": "ADENOSINE DEAMINASE (ADA) BSA 4x10 mL",
        "format": "4x10 mL",
        "systems": "BSA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "23754",
        "platformFamily": "bax00",
        "itemName": "ADENOSINE DEAMINASE (ADA)",
        "description": "ADENOSINE DEAMINASE (ADA)",
        "format": "2x16mL + 1x10mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "23754"
      ],
      "BA200": [
        "23754"
      ],
      "A15": [
        "12754"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": false,
      "matchedProductCount": 2
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": "high_blank_absorbance",
      "detectionLimitValue": 2.96,
      "detectionLimitUnit": "U/L",
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 150.0,
      "linearityLimitUnit": "U/L",
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 500.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "lipidemia (triglicéridos < 500 mg/dL) y la bilirrubina (< 20 mg/dL) no interfieren"
        },
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 20.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La bilirrubina (< 20 mg/dL) no interfiere."
        }
      ],
      "procedureLimitations": [
        "La hemólisis o la separación prolongada del suero pueden causar resultados más altos por la elevada actividad de ADA en eritrocitos. La lipidemia (triglicéridos < 500 mg/dL) y la bilirrubina (< 20 mg/dL) no interfieren"
      ],
      "notes": [
        "CONSERVACIÓN Y ESTABILIDAD Conservar a 2-8ºC. Los componentes son estables hasta la fecha de caducidad indicada en la etiqueta del kit, siempre que se conserven bien cerrados y se evite la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 21 días. Indicaciones de deterioro: Absorbancia del blanco superior al límite indicado en “Parámetros de la prueba”.",
        "CARACTERÍSTICAS METROLÓGICAS Las prestaciones metrológicas que se describen a continuación, han sido obtenidas utilizando un analizador BA400 y siguiendo las guías del Clinical & Laboratory Standards Institute (CLSI).  Límite de detección: 2,96 U/L = 0,049 kat/L.  Límite de linealidad: 150 U/L = 2,5 kat/L. Para muestras con valores superiores, diluir manualmente o consultar los Parámetros de la prueba para dilución automática (estas muestras se diluirán con el mismo factor de dilución).",
        "Límite de linealidad: 150 U/L",
        "LIMITACIONES DEL PROCEDIMIENTO  Intervenciones: La hemólisis o separación en suero prolongada pueden causar resultados más altos debido a la concentración de adenosina desaminasa elevada en los eritrocitos. La lipidemia (triglicéridos < 500 mg/dL) y bilirrubina (< 20 mg/dL) no interfieren. Pueden intervenir otros fármacos y sustancias5.",
        "CONSERVACIÓN Conservar a 2-8ºC. Los reactivos son estables hasta la fecha de caducidad indicada en la etiqueta, siempre que se conserven bien cerrados y se evite la contaminación durante su uso."
      ]
    },
    "qcReferences": [],
    "missingFields": [
      "Sin estabilidad a bordo"
    ]
  },
  "AGLU": {
    "displayCode": "AGLU",
    "displayName": "Alfa-glucosidasa",
    "canonicalNames": [
      "ALPHA GLUCOSIDASE",
      "ALPHA GLUCOSIDASE AGLU",
      "ALPHA GLUCOSIDASE"
    ],
    "productEntries": [
      {
        "productCode": "21522",
        "platformFamily": "bax00",
        "itemName": "alpha-GLUCOSIDASE",
        "description": "alpha-GLUCOSIDASE",
        "format": "2x20 + 2x5 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "21522"
      ],
      "BA200": [
        "21522"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": false,
      "matchedProductCount": 1
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": 1440.0,
      "onboardStabilityUnit": "months",
      "onboardStabilityRaw": 2.0,
      "blankDeterioration": "high_blank_absorbance",
      "detectionLimitValue": 0.47,
      "detectionLimitUnit": "mIU/mL",
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": 2.19,
      "quantificationLimitUnit": "mIU/mL",
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 80.0,
      "linearityLimitUnit": "mIU/mL",
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [],
      "procedureLimitations": [
        "Evitar el contacto del material reconstituido con el tapón de caucho para impedir una posible contaminación de elementos traza que puedan interferir en la medición de la α-glucosidasa"
      ],
      "notes": [
        "El IFU recuperado no aportó umbrales estructurados de interferencia para plasma seminal; mantener este punto como pendiente de validación manual."
      ]
    },
    "qcReferences": [],
    "missingFields": [
      "Sin umbrales de interferencia"
    ]
  },
  "ALANINA_AM": {
    "displayCode": "ALANINA_AM",
    "displayName": "ALANINA_AM",
    "canonicalNames": [
      "ALANINA AM"
    ],
    "productEntries": [],
    "productCodesByPlatform": {},
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": false,
      "hasValuesheet": false,
      "matchedProductCount": 0
    },
    "facts": {
      "storageTempMinC": null,
      "storageTempMaxC": null,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": null,
      "detectionLimitValue": null,
      "detectionLimitUnit": null,
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": null,
      "linearityLimitUnit": null,
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [],
      "procedureLimitations": [],
      "notes": []
    },
    "qcReferences": [],
    "missingFields": [
      "Sin producto enlazado",
      "Sin IFU descargado",
      "Sin temperatura de conservación",
      "Sin estabilidad a bordo",
      "Sin límite de linealidad",
      "Sin LOD/LOQ estructurado",
      "Sin umbrales de interferencia"
    ]
  },
  "ALANINO_AM": {
    "displayCode": "ALANINO_AM",
    "displayName": "ALANINO_AM",
    "canonicalNames": [
      "ALANINO AM"
    ],
    "productEntries": [],
    "productCodesByPlatform": {},
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": false,
      "hasValuesheet": false,
      "matchedProductCount": 0
    },
    "facts": {
      "storageTempMinC": null,
      "storageTempMaxC": null,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": null,
      "detectionLimitValue": null,
      "detectionLimitUnit": null,
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": null,
      "linearityLimitUnit": null,
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [],
      "procedureLimitations": [],
      "notes": []
    },
    "qcReferences": [],
    "missingFields": [
      "Sin producto enlazado",
      "Sin IFU descargado",
      "Sin temperatura de conservación",
      "Sin estabilidad a bordo",
      "Sin límite de linealidad",
      "Sin LOD/LOQ estructurado",
      "Sin umbrales de interferencia"
    ]
  },
  "ALB": {
    "displayCode": "ALB",
    "displayName": "Albúmina",
    "canonicalNames": [
      "ALBUMIN"
    ],
    "productEntries": [
      {
        "productCode": "11547",
        "platformFamily": "manual",
        "itemName": "ALBUMIN",
        "description": "ALBUMIN 2x250 mL",
        "format": "2x250 mL",
        "systems": null,
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 2
      },
      {
        "productCode": "11573",
        "platformFamily": "manual",
        "itemName": "ALBUMIN",
        "description": "ALBUMIN 250 mL",
        "format": "250 mL",
        "systems": null,
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 2
      },
      {
        "productCode": "12547",
        "platformFamily": "ax5",
        "itemName": "ALBUMIN",
        "description": "ALBUMIN BSA 5x50 mL",
        "format": "5x50 mL",
        "systems": "BSA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 2
      },
      {
        "productCode": "21547",
        "platformFamily": "bax00",
        "itemName": "ALBUMIN",
        "description": "ALBUMIN",
        "format": "10 x 60 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 2
      },
      {
        "productCode": "23547",
        "platformFamily": "bax00",
        "itemName": "ALBUMIN",
        "description": "ALBUMIN",
        "format": "4 x 60 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 2
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "21547",
        "23547"
      ],
      "BA200": [
        "21547",
        "23547"
      ],
      "A15": [
        "12547"
      ],
      "manual": [
        "11547",
        "11573"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": true,
      "matchedProductCount": 5
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": 1440.0,
      "onboardStabilityUnit": "months",
      "onboardStabilityRaw": 2.0,
      "blankDeterioration": "high_blank_absorbance",
      "detectionLimitValue": 1.43,
      "detectionLimitUnit": "g/L",
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": 3.72,
      "quantificationLimitUnit": "g/L",
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 70.0,
      "linearityLimitUnit": "g/L",
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 30.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 400 mg/dL) y lipemia (triglicéridos hasta 655 mg/dL) no interfieren"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 400.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 400 mg/dL) y lipemia (triglicéridos hasta 655 mg/dL) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 655.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 400 mg/dL) y lipemia (triglicéridos hasta 655 mg/dL) no interfieren"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 300.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 300 mg/dL) y lipemia (triglicéridos hasta 325 mg/dL) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 325.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 300 mg/dL) y lipemia (triglicéridos hasta 325 mg/dL) no interfieren"
        }
      ],
      "procedureLimitations": [
        "La bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 400 mg/dL) y lipemia (triglicéridos hasta 655 mg/dL) no interfieren",
        "La bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 300 mg/dL) y lipemia (triglicéridos hasta 325 mg/dL) no interfieren"
      ],
      "notes": [
        "CONSERVACIÓN Y ESTABILIDAD Conservar a 2-8 ºC. Los componentes son estables hasta la fecha de caducidad indicada en la etiqueta del kit, siempre que se conserven bien cerrados y se evite la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 2 meses. Indicaciones de deterioro: Absorbancia del blanco superior al límite indicado en “Parámetros de la prueba”.",
        "− Límite de detección: 1,43 g/L. Límite de cuantificación: 3,72 g/L. − Límite de linealidad: 70 g/L. Intervalo de medición: 3,72 - 70 g/L. Para muestras con valores superiores, diluir manualmente o consultar los Parámetros de la prueba para dilución automática (estas muestras se diluirán con el mismo factor de dilución).",
        "LIMITACIONES DEL PROCEDIMIENTO − Interferencias: La bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 400 mg/dL) y lipemia (triglicéridos hasta 655 mg/dL) no interfieren. Otros medicamentos y sustancias pueden interferir4."
      ]
    },
    "qcReferences": [
      {
        "id": "ALB::18005::0004::I::g/L::Verde de bromocresol",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "ALBÚMINA",
        "methodName": "Verde de bromocresol",
        "targetValue": 27.9,
        "sd1": 1.7,
        "sd1Low": 26.2,
        "sd1High": 29.6,
        "sd2Low": 24.5,
        "sd2High": 31.3,
        "rejectLow": 22.9,
        "rejectHigh": 32.9,
        "unit": "g/L",
        "traceability": "ERM-DA470/IFCC (IRMM)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "ALB::18009::0001739::I::g/L::Verde de bromocresol",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "ALBÚMINA",
        "methodName": "Verde de bromocresol",
        "targetValue": 27.9,
        "sd1": 1.7,
        "sd1Low": 26.2,
        "sd1High": 29.6,
        "sd2Low": 24.5,
        "sd2High": 31.3,
        "rejectLow": 22.9,
        "rejectHigh": 32.9,
        "unit": "g/L",
        "traceability": "ERM-DA470/IFCC (IRMM)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "ALB::18010::0001747::II::μkat/L::Naftil fosfato/pentanodiol",
        "productCode": "18010",
        "lot": "0001747",
        "controlLevel": "level_2",
        "analyteName": "ALBÚMINA",
        "methodName": "Naftil fosfato/pentanodiol",
        "targetValue": 0.421,
        "sd1": 0.07,
        "sd1Low": 0.351,
        "sd1High": 0.491,
        "sd2Low": 0.281,
        "sd2High": 0.561,
        "rejectLow": 0.211,
        "rejectHigh": 0.632,
        "unit": "μkat/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18010 lote 0001747"
      },
      {
        "id": "ALB::18010::0001747::II::g/L::Verde de bromocresol",
        "productCode": "18010",
        "lot": "0001747",
        "controlLevel": "level_2",
        "analyteName": "ALBÚMINA",
        "methodName": "Verde de bromocresol",
        "targetValue": 46.2,
        "sd1": 2.8,
        "sd1Low": 43.4,
        "sd1High": 49.0,
        "sd2Low": 40.6,
        "sd2High": 51.8,
        "rejectLow": 37.9,
        "rejectHigh": 54.5,
        "unit": "g/L",
        "traceability": "ERM-DA470/IFCC (IRMM)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18010 lote 0001747"
      },
      {
        "id": "ALB::18042::59322::I::g/L::Verde de bromocresol",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "ALBÚMINA",
        "methodName": "Verde de bromocresol",
        "targetValue": 40.2,
        "sd1": 2.4,
        "sd1Low": 37.8,
        "sd1High": 42.6,
        "sd2Low": 35.4,
        "sd2High": 45.0,
        "rejectLow": 33.0,
        "rejectHigh": 47.4,
        "unit": "g/L",
        "traceability": "ERM-DA470/IFCC (IRMM)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "ALB::18043::58987::II::μkat/L::Naftil fosfato/pentanodiol",
        "productCode": "18043",
        "lot": "58987",
        "controlLevel": "level_2",
        "analyteName": "ALBÚMINA",
        "methodName": "Naftil fosfato/pentanodiol",
        "targetValue": 0.349,
        "sd1": 0.058,
        "sd1Low": 0.291,
        "sd1High": 0.407,
        "sd2Low": 0.233,
        "sd2High": 0.465,
        "rejectLow": 0.175,
        "rejectHigh": 0.524,
        "unit": "μkat/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18043 lote 58987"
      },
      {
        "id": "ALB::18043::58987::II::g/L::Verde de bromocresol",
        "productCode": "18043",
        "lot": "58987",
        "controlLevel": "level_2",
        "analyteName": "ALBÚMINA",
        "methodName": "Verde de bromocresol",
        "targetValue": 58.9,
        "sd1": 3.5,
        "sd1Low": 55.4,
        "sd1High": 62.4,
        "sd2Low": 51.9,
        "sd2High": 65.9,
        "rejectLow": 48.3,
        "rejectHigh": 69.5,
        "unit": "g/L",
        "traceability": "ERM-DA470/IFCC (IRMM)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18043 lote 58987"
      },
      {
        "id": "ALB::18054::0001036::I::mg/L::NOMETHOD",
        "productCode": "18054",
        "lot": "0001036",
        "controlLevel": "level_1",
        "analyteName": "ALBÚMINA",
        "methodName": null,
        "targetValue": 20.2,
        "sd1": 1.3,
        "sd1Low": 18.9,
        "sd1High": 21.5,
        "sd2Low": 17.6,
        "sd2High": 22.8,
        "rejectLow": 16.2,
        "rejectHigh": 24.2,
        "unit": "mg/L",
        "traceability": null,
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18054 lote 0001036"
      },
      {
        "id": "ALB::18066::0000619::II::mg/L::NOMETHOD",
        "productCode": "18066",
        "lot": "0000619",
        "controlLevel": "level_2",
        "analyteName": "ALBÚMINA",
        "methodName": null,
        "targetValue": 93.6,
        "sd1": 6.2,
        "sd1Low": 87.4,
        "sd1High": 99.8,
        "sd2Low": 81.2,
        "sd2High": 106.0,
        "rejectLow": 74.9,
        "rejectHigh": 112.3,
        "unit": "mg/L",
        "traceability": null,
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18066 lote 0000619"
      },
      {
        "id": "ALB::31075::0002551::None::NOUNIT::0,35",
        "productCode": "31075",
        "lot": "0002551",
        "controlLevel": "level_2",
        "analyteName": "PREALBÚMINA",
        "methodName": "0,35",
        "targetValue": 0.07,
        "sd1": 2.84,
        "sd1Low": -2.77,
        "sd1High": 2.91,
        "sd2Low": -5.61,
        "sd2High": 5.75,
        "rejectLow": 2.13,
        "rejectHigh": 0.1,
        "unit": null,
        "traceability": "ERM DA-470 (IRMM)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 31075 lote 0002551"
      },
      {
        "id": "ALB::31075::0002551::None::NOUNIT::9,6",
        "productCode": "31075",
        "lot": "0002551",
        "controlLevel": "level_2",
        "analyteName": "PREALBÚMINA",
        "methodName": "9,6",
        "targetValue": 3.2,
        "sd1": 76.8,
        "sd1Low": -73.6,
        "sd1High": 80.0,
        "sd2Low": -150.4,
        "sd2High": 156.8,
        "rejectLow": 57.6,
        "rejectHigh": 4.9,
        "unit": null,
        "traceability": "ERM DA-470 (IRMM)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 31075 lote 0002551"
      },
      {
        "id": "ALB::31211::60389::I::g/L::Turbidimetría",
        "productCode": "31211",
        "lot": "60389",
        "controlLevel": "level_1",
        "analyteName": "PREALBÚMINA",
        "methodName": "Turbidimetría",
        "targetValue": 0.715,
        "sd1": 0.083,
        "sd1Low": 0.632,
        "sd1High": 0.798,
        "sd2Low": 0.549,
        "sd2High": 0.881,
        "rejectLow": 0.465,
        "rejectHigh": 0.965,
        "unit": "g/L",
        "traceability": "ERM DA-470 (IRMM)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 31211 lote 60389"
      },
      {
        "id": "ALB::31211::60389::I::mg/dL::Turbidimetría",
        "productCode": "31211",
        "lot": "60389",
        "controlLevel": "level_1",
        "analyteName": "PREALBÚMINA",
        "methodName": "Turbidimetría",
        "targetValue": 20.5,
        "sd1": 1.4,
        "sd1Low": 19.1,
        "sd1High": 21.9,
        "sd2Low": 17.7,
        "sd2High": 23.3,
        "rejectLow": 16.4,
        "rejectHigh": 24.6,
        "unit": "mg/dL",
        "traceability": "ERM DA-470 (IRMM)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 31211 lote 60389"
      },
      {
        "id": "ALB::31212::59181::II::g/L::Turbidimetría",
        "productCode": "31212",
        "lot": "59181",
        "controlLevel": "level_2",
        "analyteName": "PREALBÚMINA",
        "methodName": "Turbidimetría",
        "targetValue": 1.83,
        "sd1": 0.21,
        "sd1Low": 1.62,
        "sd1High": 2.04,
        "sd2Low": 1.41,
        "sd2High": 2.25,
        "rejectLow": 1.19,
        "rejectHigh": 2.47,
        "unit": "g/L",
        "traceability": "ERM DA-470 (IRMM)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 31212 lote 59181"
      },
      {
        "id": "ALB::31212::59181::II::mg/dL::Turbidimetría",
        "productCode": "31212",
        "lot": "59181",
        "controlLevel": "level_2",
        "analyteName": "PREALBÚMINA",
        "methodName": "Turbidimetría",
        "targetValue": 52.1,
        "sd1": 3.5,
        "sd1Low": 48.6,
        "sd1High": 55.6,
        "sd2Low": 45.1,
        "sd2High": 59.1,
        "rejectLow": 41.7,
        "rejectHigh": 62.5,
        "unit": "mg/dL",
        "traceability": "ERM DA-470 (IRMM)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 31212 lote 59181"
      }
    ],
    "missingFields": []
  },
  "ALP_AMP": {
    "displayCode": "ALP-AMP",
    "displayName": "Fosfatasa alcalina ALP-AMP",
    "canonicalNames": [
      "ALP AMP",
      "ALKALINE PHOSPHATASE ALP AMP",
      "ALKALINE PHOSPHATASE AMP"
    ],
    "productEntries": [
      {
        "productCode": "11593",
        "platformFamily": "manual",
        "itemName": "ALKALINE PHOSPHATASE (ALP) - AMP",
        "description": "ALKALINE PHOSPHATASE (ALP) - AMP 200 mL",
        "format": "200 mL",
        "systems": null,
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "21592",
        "platformFamily": "bax00",
        "itemName": "ALKALINE PHOSPHATASE (ALP) - AMP",
        "description": "ALKALINE PHOSPHATASE (ALP) - AMP",
        "format": "4 x 60 + 4 x 15 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 2
      },
      {
        "productCode": "23592",
        "platformFamily": "bax00",
        "itemName": "ALKALINE PHOSPHATASE (ALP)-AMP",
        "description": "ALKALINE PHOSPHATASE (ALP)-AMP BA 60+15",
        "format": "60+15",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 2
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "21592",
        "23592"
      ],
      "BA200": [
        "21592",
        "23592"
      ],
      "manual": [
        "11593"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": true,
      "matchedProductCount": 3
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": 1440.0,
      "onboardStabilityUnit": "months",
      "onboardStabilityRaw": 2.0,
      "blankDeterioration": "high_blank_absorbance",
      "detectionLimitValue": 15.9,
      "detectionLimitUnit": "U/L",
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 1200.0,
      "linearityLimitUnit": "U/L",
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 30.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "la bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 1625 mg/dL) no interfieren"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 500.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "la bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 1625 mg/dL) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 1625.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "la bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 1625 mg/dL) no interfieren"
        },
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 20.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "bilirrubina (< 20 mg/dL) y la lipemia (trigliceridos < 10 g/L) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 10.0,
          "unit": "g/L",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "lipemia (trigliceridos < 10 g/L) no interfieren"
        }
      ],
      "procedureLimitations": [
        "la bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 1625 mg/dL) no interfieren",
        "La bilirrubina (< 20 mg/dL) y la lipemia (trigliceridos < 10 g/L) no interfieren. La hemoglobina (> 2,5 g/L) interfiere"
      ],
      "notes": [
        "CONSERVACIÓN Y ESTABILIDAD Conservar a 2-8 ºC. Los componentes son estables hasta la fecha de caducidad indicada en la etiqueta del kit, siempre que se conserven bien cerrados y se evite la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 2 meses. Indicaciones de deterioro: Absorbancia del blanco superior al límite indicado en “Parámetros de la prueba”.",
        "CARACTERÍSTICAS METROLÓGICAS Las prestaciones metrológicas que se describen a continuación, han sido obtenidas utilizando un analizador BA400 y siguiendo las guías del Clinical & Laboratory Standards Institute (CLSI). − Límite de detección: 15,9 U/L = 0,26 kat/L.",
        "− Límite de linealidad: 1200 U/L = 20 kat/L.",
        "LIMITACIONES DEL PROCEDIMIENTO − Interferencias: la bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 1625 mg/dL) no interfieren. Otros medicamentos y sustancias pueden interferir5."
      ]
    },
    "qcReferences": [
      {
        "id": "ALP_AMP::18005::0004::I::U/L::Tampón 2-amino-2-metil-1-propanol",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "FOSFATASA ALCALINA",
        "methodName": "Tampón 2-amino-2-metil-1-propanol",
        "targetValue": 93.9,
        "sd1": 5.6,
        "sd1Low": 88.3,
        "sd1High": 99.5,
        "sd2Low": 82.7,
        "sd2High": 105.1,
        "rejectLow": 77.0,
        "rejectHigh": 110.8,
        "unit": "U/L",
        "traceability": "C-RSE/IFCC BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "ALP_AMP::18005::0004::I::μkat/L::Tampón 2-amino-2-metil-1-propanol",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "FOSFATASA ALCALINA",
        "methodName": "Tampón 2-amino-2-metil-1-propanol",
        "targetValue": 1.56,
        "sd1": 0.09,
        "sd1Low": 1.47,
        "sd1High": 1.65,
        "sd2Low": 1.38,
        "sd2High": 1.74,
        "rejectLow": 1.28,
        "rejectHigh": 1.84,
        "unit": "μkat/L",
        "traceability": "C-RSE/IFCC BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "ALP_AMP::18009::0001739::I::U/L::Tampón 2-amino-2-metil-1-propanol",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "FOSFATASA ALCALINA",
        "methodName": "Tampón 2-amino-2-metil-1-propanol",
        "targetValue": 93.9,
        "sd1": 5.6,
        "sd1Low": 88.3,
        "sd1High": 99.5,
        "sd2Low": 82.7,
        "sd2High": 105.1,
        "rejectLow": 77.0,
        "rejectHigh": 110.8,
        "unit": "U/L",
        "traceability": "C-RSE/IFCC BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "ALP_AMP::18009::0001739::I::μkat/L::Tampón 2-amino-2-metil-1-propanol",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "FOSFATASA ALCALINA",
        "methodName": "Tampón 2-amino-2-metil-1-propanol",
        "targetValue": 1.56,
        "sd1": 0.09,
        "sd1Low": 1.47,
        "sd1High": 1.65,
        "sd2Low": 1.38,
        "sd2High": 1.74,
        "rejectLow": 1.28,
        "rejectHigh": 1.84,
        "unit": "μkat/L",
        "traceability": "C-RSE/IFCC BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "ALP_AMP::18010::0001747::II::U/L::Tampón 2-amino-2-metil-1-propanol",
        "productCode": "18010",
        "lot": "0001747",
        "controlLevel": "level_2",
        "analyteName": "FOSFATASA ALCALINA",
        "methodName": "Tampón 2-amino-2-metil-1-propanol",
        "targetValue": 239.0,
        "sd1": 14.0,
        "sd1Low": 225.0,
        "sd1High": 253.0,
        "sd2Low": 211.0,
        "sd2High": 267.0,
        "rejectLow": 196.0,
        "rejectHigh": 282.0,
        "unit": "U/L",
        "traceability": "C-RSE/IFCC BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18010 lote 0001747"
      },
      {
        "id": "ALP_AMP::18010::0001747::II::μkat/L::Tampón 2-amino-2-metil-1-propanol",
        "productCode": "18010",
        "lot": "0001747",
        "controlLevel": "level_2",
        "analyteName": "FOSFATASA ALCALINA",
        "methodName": "Tampón 2-amino-2-metil-1-propanol",
        "targetValue": 3.97,
        "sd1": 0.24,
        "sd1Low": 3.73,
        "sd1High": 4.21,
        "sd2Low": 3.49,
        "sd2High": 4.45,
        "rejectLow": 3.26,
        "rejectHigh": 4.68,
        "unit": "μkat/L",
        "traceability": "C-RSE/IFCC BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18010 lote 0001747"
      },
      {
        "id": "ALP_AMP::18042::59322::I::U/L::Tampón 2-amino-2-metil-1-propanol",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "FOSFATASA ALCALINA",
        "methodName": "Tampón 2-amino-2-metil-1-propanol",
        "targetValue": 101.0,
        "sd1": 6.0,
        "sd1Low": 95.0,
        "sd1High": 107.0,
        "sd2Low": 89.0,
        "sd2High": 113.0,
        "rejectLow": 83.0,
        "rejectHigh": 119.0,
        "unit": "U/L",
        "traceability": "C-RSE/IFCC BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "ALP_AMP::18042::59322::I::μkat/L::Tampón 2-amino-2-metil-1-propanol",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "FOSFATASA ALCALINA",
        "methodName": "Tampón 2-amino-2-metil-1-propanol",
        "targetValue": 1.67,
        "sd1": 0.1,
        "sd1Low": 1.57,
        "sd1High": 1.77,
        "sd2Low": 1.47,
        "sd2High": 1.87,
        "rejectLow": 1.37,
        "rejectHigh": 1.97,
        "unit": "μkat/L",
        "traceability": "C-RSE/IFCC BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "ALP_AMP::18043::58987::II::U/L::Tampón 2-amino-2-metil-1-propanol",
        "productCode": "18043",
        "lot": "58987",
        "controlLevel": "level_2",
        "analyteName": "FOSFATASA ALCALINA",
        "methodName": "Tampón 2-amino-2-metil-1-propanol",
        "targetValue": 177.0,
        "sd1": 11.0,
        "sd1Low": 166.0,
        "sd1High": 188.0,
        "sd2Low": 155.0,
        "sd2High": 199.0,
        "rejectLow": 145.0,
        "rejectHigh": 209.0,
        "unit": "U/L",
        "traceability": "C-RSE/IFCC BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18043 lote 58987"
      },
      {
        "id": "ALP_AMP::18043::58987::II::μkat/L::Tampón 2-amino-2-metil-1-propanol",
        "productCode": "18043",
        "lot": "58987",
        "controlLevel": "level_2",
        "analyteName": "FOSFATASA ALCALINA",
        "methodName": "Tampón 2-amino-2-metil-1-propanol",
        "targetValue": 2.94,
        "sd1": 0.18,
        "sd1Low": 2.76,
        "sd1High": 3.12,
        "sd2Low": 2.58,
        "sd2High": 3.3,
        "rejectLow": 2.41,
        "rejectHigh": 3.47,
        "unit": "μkat/L",
        "traceability": "C-RSE/IFCC BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18043 lote 58987"
      }
    ],
    "missingFields": []
  },
  "ALP_DEA": {
    "displayCode": "ALP-DEA",
    "displayName": "Fosfatasa alcalina ALP-DEA",
    "canonicalNames": [
      "ALP DEA",
      "ALKALINE PHOSPHATASE ALP DEA",
      "ALKALINE PHOSPHATASE DEA"
    ],
    "productEntries": [
      {
        "productCode": "21590",
        "platformFamily": "bax00",
        "itemName": "ALKALINE PHOSPHATASE (ALP) - DEA",
        "description": "ALKALINE PHOSPHATASE (ALP) - DEA",
        "format": "4 x 60 + 4 x 15 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "23590",
        "platformFamily": "bax00",
        "itemName": "ALKALINE PHOSPHATASE (ALP) - DEA",
        "description": "ALKALINE PHOSPHATASE (ALP) - DEA",
        "format": "1 x 60 + 1 x 15 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "21590",
        "23590"
      ],
      "BA200": [
        "21590",
        "23590"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": true,
      "matchedProductCount": 2
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": "high_blank_absorbance",
      "detectionLimitValue": 8.7,
      "detectionLimitUnit": "U/L",
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 900.0,
      "linearityLimitUnit": "U/L",
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 20.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "la bilirrubina (hasta 20 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 1000 mg/dL) no interfieren"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 500.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "la bilirrubina (hasta 20 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 1000 mg/dL) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 1000.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "la bilirrubina (hasta 20 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 1000 mg/dL) no interfieren"
        }
      ],
      "procedureLimitations": [
        "la bilirrubina (hasta 20 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 1000 mg/dL) no interfieren"
      ],
      "notes": [
        "CONSERVACIÓN Y ESTABILIDAD Conservar a 2-8ºC. Los componentes son estables hasta la fecha de caducidad indicada en la etiqueta del kit, siempre que se conserven bien cerrados y se evite la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 2 meses. Indicaciones de deterioro: Absorbancia del blanco superior al límite indicado en “Parámetros de la prueba”.",
        " Límite de detección: 8,70 U/L = 0,145 kat/L.",
        " Límite de linealidad: 900 U/L = 15,0 kat/L.",
        "LIMITACIONES DEL PROCEDIMIENTO  Interferencias: la bilirrubina (hasta 20 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 1000 mg/dL) no interfieren. Otros medicamentos y sustancias pueden interferir6."
      ]
    },
    "qcReferences": [
      {
        "id": "ALP_DEA::18005::0004::I::U/L::Tampón dietanolamina",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "FOSFATASA ALCALINA",
        "methodName": "Tampón dietanolamina",
        "targetValue": 120.0,
        "sd1": 7.0,
        "sd1Low": 113.0,
        "sd1High": 127.0,
        "sd2Low": 106.0,
        "sd2High": 134.0,
        "rejectLow": 98.0,
        "rejectHigh": 142.0,
        "unit": "U/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "ALP_DEA::18009::0001739::I::U/L::Tampón dietanolamina",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "FOSFATASA ALCALINA",
        "methodName": "Tampón dietanolamina",
        "targetValue": 120.0,
        "sd1": 7.0,
        "sd1Low": 113.0,
        "sd1High": 127.0,
        "sd2Low": 106.0,
        "sd2High": 134.0,
        "rejectLow": 98.0,
        "rejectHigh": 142.0,
        "unit": "U/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "ALP_DEA::18042::59322::I::U/L::Tampón dietanolamina",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "FOSFATASA ALCALINA",
        "methodName": "Tampón dietanolamina",
        "targetValue": 146.0,
        "sd1": 9.0,
        "sd1Low": 137.0,
        "sd1High": 155.0,
        "sd2Low": 128.0,
        "sd2High": 164.0,
        "rejectLow": 120.0,
        "rejectHigh": 172.0,
        "unit": "U/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      }
    ],
    "missingFields": [
      "Sin estabilidad a bordo"
    ]
  },
  "ALT_GPT": {
    "displayCode": "ALT",
    "displayName": "Alanina aminotransferasa",
    "canonicalNames": [
      "ALT GPT",
      "ALANINE AMINOTRANSFERASE ALT GPT"
    ],
    "productEntries": [
      {
        "productCode": "11533",
        "platformFamily": "manual",
        "itemName": "ALANINE AMINOTRANSFERASE (ALT/GPT)",
        "description": "ALANINE AMINOTRANSFERASE (ALT/GPT) 200mL",
        "format": "200mL",
        "systems": null,
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "12533",
        "platformFamily": "ax5",
        "itemName": "ALANINE AMINOTRANSFERASE (ALT/GPT)",
        "description": "ALANINE AMINOTRANSFERASE (ALT/GPT) 5x50",
        "format": "5x50",
        "systems": null,
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "21533",
        "platformFamily": "bax00",
        "itemName": "ALANINE AMINOTRANSFERASE (ALT/GPT)",
        "description": "ALANINE AMINOTRANSFERASE (ALT/GPT)",
        "format": "8 x 60 + 8 x 15 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "23533",
        "platformFamily": "bax00",
        "itemName": "ALANINE AMINOTRANSFERASE (ALT/GPT)",
        "description": "ALANINE AMINOTRANSFERASE (ALT/GPT)",
        "format": "4 x 60 + 4 x 15 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "21533",
        "23533"
      ],
      "BA200": [
        "21533",
        "23533"
      ],
      "A15": [
        "12533"
      ],
      "manual": [
        "11533"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": true,
      "matchedProductCount": 4
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": 360.0,
      "onboardStabilityUnit": "days",
      "onboardStabilityRaw": 15.0,
      "blankDeterioration": null,
      "detectionLimitValue": 8.5,
      "detectionLimitUnit": "U/L",
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 500.0,
      "linearityLimitUnit": "U/L",
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 20.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La hemólisis (hemoglobina 10 g/L) y la bilirrubina (20 mg/dL) no interfieren. La lipemia (triglicéridos 2 g/L) puede afectar los resultados"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 1000.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "hemólisis (hemoglobina hasta 1000 mg/dL) y lipemia (triglicéridos hasta 200 mg/dL) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 200.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "lipemia (triglicéridos hasta 200 mg/dL) no interfieren"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 10.0,
          "unit": "g/L",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La hemólisis (hemoglobina 10 g/L) y la bilirrubina (20 mg/dL) no interfieren. La lipemia (triglicéridos 2 g/L) puede afectar los resultados"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 2.0,
          "unit": "g/L",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La hemólisis (hemoglobina 10 g/L) y la bilirrubina (20 mg/dL) no interfieren. La lipemia (triglicéridos 2 g/L) puede afectar los resultados"
        }
      ],
      "procedureLimitations": [
        "la bilirrubina (hasta 20 mg/dL), la hemólisis (hemoglobina hasta 1000 mg/dL) y lipemia (triglicéridos hasta 200 mg/dL) no interfieren",
        "La hemólisis (hemoglobina 10 g/L) y la bilirrubina (20 mg/dL) no interfieren. La lipemia (triglicéridos 2 g/L) puede afectar los resultados"
      ],
      "notes": [
        "CONSERVACIÓN Y ESTABILIDAD Conservar a 2-8 ºC. Los componentes son estables hasta la fecha de caducidad indicada en la etiqueta del kit, siempre que se conserven bien cerrados y se evite la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 2 meses.",
        "CARACTERÍSTICAS METROLÓGICAS Las prestaciones metrológicas que se describen a continuación, han sido obtenidas utilizando un analizador BA400 y siguiendo las guías del Clinical & Laboratory Standards Institute (CLSI).  Límite de detección: 8,5 U/L = 0,14 kat/L  Límite de linealidad: 500 U/L = 8,33 kat/L  Precisión:",
        "LIMITACIONES DEL PROCEDIMIENTO  Interferencias: la bilirrubina (hasta 20 mg/dL), la hemólisis (hemoglobina hasta 1000 mg/dL) y lipemia"
      ]
    },
    "qcReferences": [
      {
        "id": "ALT_GPT::18005::0004::I::U/L::IFCC sin Fosfato de piridoxal",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "ALT/GPT",
        "methodName": "IFCC sin Fosfato de piridoxal",
        "targetValue": 39.7,
        "sd1": 2.6,
        "sd1Low": 37.1,
        "sd1High": 42.3,
        "sd2Low": 34.5,
        "sd2High": 44.9,
        "rejectLow": 31.8,
        "rejectHigh": 47.6,
        "unit": "U/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "ALT_GPT::18005::0004::I::μkat/L::IFCC sin Fosfato de piridoxal",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "ALT/GPT",
        "methodName": "IFCC sin Fosfato de piridoxal",
        "targetValue": 0.658,
        "sd1": 0.044,
        "sd1Low": 0.614,
        "sd1High": 0.702,
        "sd2Low": 0.57,
        "sd2High": 0.746,
        "rejectLow": 0.526,
        "rejectHigh": 0.79,
        "unit": "μkat/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "ALT_GPT::18005::0004::I::U/L::IFCC con Fosfato de piridoxal",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "ALT/GPT",
        "methodName": "IFCC con Fosfato de piridoxal",
        "targetValue": 43.2,
        "sd1": 2.9,
        "sd1Low": 40.3,
        "sd1High": 46.1,
        "sd2Low": 37.4,
        "sd2High": 49.0,
        "rejectLow": 34.6,
        "rejectHigh": 51.8,
        "unit": "U/L",
        "traceability": "C-RSE/IFCC ERM-AD454/IFCC (IRMM)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "ALT_GPT::18009::0001739::I::U/L::IFCC sin Fosfato de piridoxal",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "ALT/GPT",
        "methodName": "IFCC sin Fosfato de piridoxal",
        "targetValue": 39.7,
        "sd1": 2.6,
        "sd1Low": 37.1,
        "sd1High": 42.3,
        "sd2Low": 34.5,
        "sd2High": 44.9,
        "rejectLow": 31.8,
        "rejectHigh": 47.6,
        "unit": "U/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "ALT_GPT::18009::0001739::I::μkat/L::IFCC sin Fosfato de piridoxal",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "ALT/GPT",
        "methodName": "IFCC sin Fosfato de piridoxal",
        "targetValue": 0.658,
        "sd1": 0.044,
        "sd1Low": 0.614,
        "sd1High": 0.702,
        "sd2Low": 0.57,
        "sd2High": 0.746,
        "rejectLow": 0.526,
        "rejectHigh": 0.79,
        "unit": "μkat/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "ALT_GPT::18009::0001739::I::U/L::IFCC con Fosfato de piridoxal",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "ALT/GPT",
        "methodName": "IFCC con Fosfato de piridoxal",
        "targetValue": 43.2,
        "sd1": 2.9,
        "sd1Low": 40.3,
        "sd1High": 46.1,
        "sd2Low": 37.4,
        "sd2High": 49.0,
        "rejectLow": 34.6,
        "rejectHigh": 51.8,
        "unit": "U/L",
        "traceability": "C-RSE/IFCC ERM-AD454/IFCC (IRMM)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "ALT_GPT::18010::0001747::II::U/L::IFCC sin Fosfato de piridoxal",
        "productCode": "18010",
        "lot": "0001747",
        "controlLevel": "level_2",
        "analyteName": "ALT/GPT",
        "methodName": "IFCC sin Fosfato de piridoxal",
        "targetValue": 124.0,
        "sd1": 7.0,
        "sd1Low": 117.0,
        "sd1High": 131.0,
        "sd2Low": 110.0,
        "sd2High": 138.0,
        "rejectLow": 102.0,
        "rejectHigh": 146.0,
        "unit": "U/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18010 lote 0001747"
      },
      {
        "id": "ALT_GPT::18010::0001747::II::μkat/L::IFCC sin Fosfato de piridoxal",
        "productCode": "18010",
        "lot": "0001747",
        "controlLevel": "level_2",
        "analyteName": "ALT/GPT",
        "methodName": "IFCC sin Fosfato de piridoxal",
        "targetValue": 2.05,
        "sd1": 0.12,
        "sd1Low": 1.93,
        "sd1High": 2.17,
        "sd2Low": 1.81,
        "sd2High": 2.29,
        "rejectLow": 1.68,
        "rejectHigh": 2.42,
        "unit": "μkat/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18010 lote 0001747"
      },
      {
        "id": "ALT_GPT::18042::59322::I::U/L::IFCC sin Fosfato de piridoxal",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "ALT/GPT",
        "methodName": "IFCC sin Fosfato de piridoxal",
        "targetValue": 42.1,
        "sd1": 2.8,
        "sd1Low": 39.3,
        "sd1High": 44.9,
        "sd2Low": 36.5,
        "sd2High": 47.7,
        "rejectLow": 33.7,
        "rejectHigh": 50.5,
        "unit": "U/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "ALT_GPT::18042::59322::I::μkat/L::IFCC sin Fosfato de piridoxal",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "ALT/GPT",
        "methodName": "IFCC sin Fosfato de piridoxal",
        "targetValue": 0.698,
        "sd1": 0.047,
        "sd1Low": 0.651,
        "sd1High": 0.745,
        "sd2Low": 0.604,
        "sd2High": 0.792,
        "rejectLow": 0.558,
        "rejectHigh": 0.838,
        "unit": "μkat/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "ALT_GPT::18042::59322::I::U/L::IFCC con Fosfato de piridoxal",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "ALT/GPT",
        "methodName": "IFCC con Fosfato de piridoxal",
        "targetValue": 42.5,
        "sd1": 2.8,
        "sd1Low": 39.7,
        "sd1High": 45.3,
        "sd2Low": 36.9,
        "sd2High": 48.1,
        "rejectLow": 34.0,
        "rejectHigh": 51.0,
        "unit": "U/L",
        "traceability": "C-RSE/IFCC ERM-AD454/IFCC (IRMM)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "ALT_GPT::18043::58987::II::U/L::IFCC sin Fosfato de piridoxal",
        "productCode": "18043",
        "lot": "58987",
        "controlLevel": "level_2",
        "analyteName": "ALT/GPT",
        "methodName": "IFCC sin Fosfato de piridoxal",
        "targetValue": 128.0,
        "sd1": 8.0,
        "sd1Low": 120.0,
        "sd1High": 136.0,
        "sd2Low": 112.0,
        "sd2High": 144.0,
        "rejectLow": 105.0,
        "rejectHigh": 151.0,
        "unit": "U/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18043 lote 58987"
      },
      {
        "id": "ALT_GPT::18043::58987::II::μkat/L::IFCC sin Fosfato de piridoxal",
        "productCode": "18043",
        "lot": "58987",
        "controlLevel": "level_2",
        "analyteName": "ALT/GPT",
        "methodName": "IFCC sin Fosfato de piridoxal",
        "targetValue": 2.12,
        "sd1": 0.13,
        "sd1Low": 1.99,
        "sd1High": 2.25,
        "sd2Low": 1.86,
        "sd2High": 2.38,
        "rejectLow": 1.74,
        "rejectHigh": 2.5,
        "unit": "μkat/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18043 lote 58987"
      }
    ],
    "missingFields": []
  },
  "AMY": {
    "displayCode": "AMY",
    "displayName": "Amilasa directa",
    "canonicalNames": [
      "ALPHA AMYLASE DIRECT",
      "AMYLASE DIRECT",
      "ALPHA AMYLASE DIRECT"
    ],
    "productEntries": [
      {
        "productCode": "21550",
        "platformFamily": "bax00",
        "itemName": "alpha-AMYLASE - DIRECT",
        "description": "alpha-AMYLASE - DIRECT",
        "format": "8x20mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "21550"
      ],
      "BA200": [
        "21550"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": true,
      "matchedProductCount": 1
    },
    "facts": {
      "storageTempMinC": null,
      "storageTempMaxC": null,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": null,
      "detectionLimitValue": 1.64,
      "detectionLimitUnit": "U/L",
      "detectionLimitAlternateValue": 0.03,
      "detectionLimitAlternateUnit": "μkat/L",
      "quantificationLimitValue": 8.18,
      "quantificationLimitUnit": "U/L",
      "quantificationLimitAlternateValue": 0.14,
      "quantificationLimitAlternateUnit": "μkat/L",
      "linearityLimitValue": 1300.0,
      "linearityLimitUnit": "U/L",
      "linearityLimitAlternateValue": 21.6,
      "linearityLimitAlternateUnit": "μkat/L",
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 30.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 200 mg/dL), la lipemia (triglicéridos hasta 1625 mg/dL), el ácido ascórbico (hasta 30 mg/dL) y el paracetamol (hasta 20 mg/dL) no interfieren"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 200.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "hemólisis (hemoglobina hasta 200 mg/dL), la lipemia (triglicéridos hasta 1625 mg/dL), el ácido ascórbico (hasta 30 mg/dL) y el paracetamol (hasta 20 mg/dL) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 1625.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "lipemia (triglicéridos hasta 1625 mg/dL), el ácido ascórbico (hasta 30 mg/dL) y el paracetamol (hasta 20 mg/dL) no interfieren"
        },
        {
          "interferent": "ascorbic_acid",
          "label": "Ácido ascórbico",
          "thresholdValue": 30.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "ácido ascórbico (hasta 30 mg/dL) y el paracetamol (hasta 20 mg/dL) no interfieren"
        },
        {
          "interferent": "paracetamol",
          "label": "Paracetamol",
          "thresholdValue": 20.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "Suero/plasma: el paracetamol (hasta 20 mg/dL) no interfiere."
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 100.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "hemólisis (hemoglobina hasta 100 mg/dL), el ácido ascórbico (hasta 30 mg/dL) y el paracetamol (hasta 20 mg/dL) no interfieren"
        }
      ],
      "procedureLimitations": [
        "Suero/plasma: la bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 200 mg/dL), la lipemia (triglicéridos hasta 1625 mg/dL), el ácido ascórbico (hasta 30 mg/dL) y el paracetamol (hasta 20 mg/dL) no interfieren",
        "Orina: la bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 100 mg/dL), el ácido ascórbico (hasta 30 mg/dL) y el paracetamol (hasta 20 mg/dL) no interfieren"
      ],
      "notes": [
        "LIMITACIONES DEL PROCEDIMIENTO"
      ]
    },
    "qcReferences": [
      {
        "id": "AMY::18005::0004::I::U/L::Sustrato directo",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "α-AMILASA",
        "methodName": "Sustrato directo",
        "targetValue": 122.0,
        "sd1": 7.0,
        "sd1Low": 115.0,
        "sd1High": 129.0,
        "sd2Low": 108.0,
        "sd2High": 136.0,
        "rejectLow": 100.0,
        "rejectHigh": 144.0,
        "unit": "U/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "AMY::18005::0004::I::μkat/L::Sustrato directo",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "α-AMILASA PANCREÁTICA",
        "methodName": "Sustrato directo",
        "targetValue": 2.03,
        "sd1": 0.12,
        "sd1Low": 1.91,
        "sd1High": 2.15,
        "sd2Low": 1.79,
        "sd2High": 2.27,
        "rejectLow": 1.66,
        "rejectHigh": 2.4,
        "unit": "μkat/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "AMY::18009::0001739::I::U/L::Sustrato directo",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "α-AMILASA",
        "methodName": "Sustrato directo",
        "targetValue": 122.0,
        "sd1": 7.0,
        "sd1Low": 115.0,
        "sd1High": 129.0,
        "sd2Low": 108.0,
        "sd2High": 136.0,
        "rejectLow": 100.0,
        "rejectHigh": 144.0,
        "unit": "U/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "AMY::18009::0001739::I::μkat/L::Sustrato directo",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "α-AMILASA PANCREÁTICA",
        "methodName": "Sustrato directo",
        "targetValue": 2.03,
        "sd1": 0.12,
        "sd1Low": 1.91,
        "sd1High": 2.15,
        "sd2Low": 1.79,
        "sd2High": 2.27,
        "rejectLow": 1.66,
        "rejectHigh": 2.4,
        "unit": "μkat/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "AMY::18010::0001747::II::μkat/L::Sustrato directo",
        "productCode": "18010",
        "lot": "0001747",
        "controlLevel": "level_2",
        "analyteName": "α-AMILASA PANCREÁTICA",
        "methodName": "Sustrato directo",
        "targetValue": 5.22,
        "sd1": 0.31,
        "sd1Low": 4.91,
        "sd1High": 5.53,
        "sd2Low": 4.6,
        "sd2High": 5.84,
        "rejectLow": 4.28,
        "rejectHigh": 6.16,
        "unit": "μkat/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18010 lote 0001747"
      },
      {
        "id": "AMY::18042::59322::I::U/L::Sustrato directo",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "α-AMILASA",
        "methodName": "Sustrato directo",
        "targetValue": 101.0,
        "sd1": 6.0,
        "sd1Low": 95.0,
        "sd1High": 107.0,
        "sd2Low": 89.0,
        "sd2High": 113.0,
        "rejectLow": 83.0,
        "rejectHigh": 119.0,
        "unit": "U/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "AMY::18042::59322::I::μkat/L::Sustrato directo",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "α-AMILASA PANCREÁTICA",
        "methodName": "Sustrato directo",
        "targetValue": 1.67,
        "sd1": 0.1,
        "sd1Low": 1.57,
        "sd1High": 1.77,
        "sd2Low": 1.47,
        "sd2High": 1.87,
        "rejectLow": 1.37,
        "rejectHigh": 1.97,
        "unit": "μkat/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "AMY::18043::58987::II::μkat/L::Sustrato directo",
        "productCode": "18043",
        "lot": "58987",
        "controlLevel": "level_2",
        "analyteName": "α-AMILASA PANCREÁTICA",
        "methodName": "Sustrato directo",
        "targetValue": 3.74,
        "sd1": 0.22,
        "sd1Low": 3.52,
        "sd1High": 3.96,
        "sd2Low": 3.3,
        "sd2High": 4.18,
        "rejectLow": 3.07,
        "rejectHigh": 4.41,
        "unit": "μkat/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18043 lote 58987"
      }
    ],
    "missingFields": [
      "Sin temperatura de conservación",
      "Sin estabilidad a bordo"
    ]
  },
  "ANTI_ESTRE": {
    "displayCode": "ASO",
    "displayName": "Anti-estreptolisina O",
    "canonicalNames": [
      "ANTI STREPTOLYSIN O ASO",
      "ANTI ESTREPTOLISINA ASO",
      "ANTI ESTREPTOLISINA",
      "ASO"
    ],
    "productEntries": [
      {
        "productCode": "13923",
        "platformFamily": "other",
        "itemName": "ANTI-STREPTOLYSIN O (ASO)",
        "description": "ANTI-STREPTOLYSIN O (ASO) BSA 50 mL",
        "format": "50 mL",
        "systems": "BSA",
        "ifuDocs": 0,
        "valuesheetDocs": 0,
        "totalDocs": 0
      }
    ],
    "productCodesByPlatform": {
      "other": [
        "13923"
      ]
    },
    "missingIfuCodes": [
      "13923"
    ],
    "documentation": {
      "hasIfu": false,
      "hasValuesheet": false,
      "matchedProductCount": 1
    },
    "facts": {
      "storageTempMinC": null,
      "storageTempMaxC": null,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": null,
      "detectionLimitValue": 14.3,
      "detectionLimitUnit": "UI/mL",
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 800.0,
      "linearityLimitUnit": "UI/mL",
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 10.0,
          "unit": "g/L",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "hemólisis (hemoglobina 10 g/L), la bilirrubina (20 mg/dL) y el factor reumatoide (2200 UI/mL) no interfieren"
        },
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 20.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "bilirrubina (20 mg/dL) y el factor reumatoide (2200 UI/mL) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 10.0,
          "unit": "g/L",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "lipemia (triglicéridos 10 g/L), la hemólisis (hemoglobina 10 g/L), la bilirrubina (20 mg/dL) y el factor reumatoide (2200 UI/mL) no interfieren"
        },
        {
          "interferent": "rheumatoid_factor",
          "label": "Factor reumatoide",
          "thresholdValue": 2200.0,
          "unit": "UI/mL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "factor reumatoide (2200 UI/mL) no interfieren"
        }
      ],
      "procedureLimitations": [
        "La lipemia (triglicéridos 10 g/L), la hemólisis (hemoglobina 10 g/L), la bilirrubina (20 mg/dL) y el factor reumatoide (2200 UI/mL) no interfieren"
      ],
      "notes": []
    },
    "qcReferences": [],
    "missingFields": [
      "Sin IFU descargado",
      "Sin temperatura de conservación",
      "Sin estabilidad a bordo"
    ]
  },
  "ASPARTATO_": {
    "displayCode": "ASPARTATO_",
    "displayName": "ASPARTATO_",
    "canonicalNames": [
      "ASPARTATO"
    ],
    "productEntries": [],
    "productCodesByPlatform": {},
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": false,
      "hasValuesheet": false,
      "matchedProductCount": 0
    },
    "facts": {
      "storageTempMinC": null,
      "storageTempMaxC": null,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": null,
      "detectionLimitValue": null,
      "detectionLimitUnit": null,
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": null,
      "linearityLimitUnit": null,
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [],
      "procedureLimitations": [],
      "notes": []
    },
    "qcReferences": [],
    "missingFields": [
      "Sin producto enlazado",
      "Sin IFU descargado",
      "Sin temperatura de conservación",
      "Sin estabilidad a bordo",
      "Sin límite de linealidad",
      "Sin LOD/LOQ estructurado",
      "Sin umbrales de interferencia"
    ]
  },
  "AST_GOT": {
    "displayCode": "AST",
    "displayName": "Aspartato aminotransferasa",
    "canonicalNames": [
      "AST GOT",
      "ASPARTATE AMINOTRANS AST GOT",
      "AST"
    ],
    "productEntries": [
      {
        "productCode": "11531",
        "platformFamily": "manual",
        "itemName": "AST/GOT",
        "description": "AST/GOT 200mL",
        "format": "200mL",
        "systems": null,
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "manual": [
        "11531"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": true,
      "matchedProductCount": 1
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": null,
      "detectionLimitValue": 1.67,
      "detectionLimitUnit": "U/L",
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 800.0,
      "linearityLimitUnit": "U/L",
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 20.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La lipemia (triglicéridos 2 g/L) interfiere. La bilirrubina (20 mg/dL) y la hemólisis (hemoglobina 50 mg/dL) no interfieren"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 50.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La lipemia (triglicéridos 2 g/L) interfiere. La bilirrubina (20 mg/dL) y la hemólisis (hemoglobina 50 mg/dL) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 2.0,
          "unit": "g/L",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La lipemia (triglicéridos 2 g/L) interfiere. La bilirrubina (20 mg/dL) y la hemólisis (hemoglobina 50 mg/dL) no interfieren"
        }
      ],
      "procedureLimitations": [
        "La lipemia (triglicéridos 2 g/L) interfiere. La bilirrubina (20 mg/dL) y la hemólisis (hemoglobina 50 mg/dL) no interfieren"
      ],
      "notes": [
        "CONSERVAR A 2-8ºC",
        "CARACTERÍSTICAS METROLÓGICAS − Límite de detección: 1,67 U/L = 0,028 kat/L − Límite de linealidad: 800 U/L = 13,3 kat/L. Cuando se obtengan valores superiores, diluir la",
        "Interferencias: La lipemia (triglicéridos 2 g/L) interfiere. La bilirrubina (20 mg/dL) y la hemólisis (hemoglobina 50 mg/dL) no interfieren. Otros medicamentos y sustancias pueden interferir5."
      ]
    },
    "qcReferences": [
      {
        "id": "AST_GOT::18005::0004::I::U/L::IFCC sin Fosfato de piridoxal",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "AST/GOT",
        "methodName": "IFCC sin Fosfato de piridoxal",
        "targetValue": 45.1,
        "sd1": 3.8,
        "sd1Low": 41.3,
        "sd1High": 48.9,
        "sd2Low": 37.5,
        "sd2High": 52.7,
        "rejectLow": 33.8,
        "rejectHigh": 56.4,
        "unit": "U/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "AST_GOT::18005::0004::I::μkat/L::IFCC sin Fosfato de piridoxal",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "AST/GOT",
        "methodName": "IFCC sin Fosfato de piridoxal",
        "targetValue": 0.749,
        "sd1": 0.062,
        "sd1Low": 0.687,
        "sd1High": 0.811,
        "sd2Low": 0.625,
        "sd2High": 0.873,
        "rejectLow": 0.562,
        "rejectHigh": 0.936,
        "unit": "μkat/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "AST_GOT::18005::0004::I::U/L::IFCC con Fosfato de piridoxal",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "AST/GOT",
        "methodName": "IFCC con Fosfato de piridoxal",
        "targetValue": 56.4,
        "sd1": 4.7,
        "sd1Low": 51.7,
        "sd1High": 61.1,
        "sd2Low": 47.0,
        "sd2High": 65.8,
        "rejectLow": 42.3,
        "rejectHigh": 70.5,
        "unit": "U/L",
        "traceability": "C-RSE/IFCC ERM-AD457/IFCC (IRMM)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "AST_GOT::18009::0001739::I::U/L::IFCC sin Fosfato de piridoxal",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "AST/GOT",
        "methodName": "IFCC sin Fosfato de piridoxal",
        "targetValue": 45.1,
        "sd1": 3.8,
        "sd1Low": 41.3,
        "sd1High": 48.9,
        "sd2Low": 37.5,
        "sd2High": 52.7,
        "rejectLow": 33.8,
        "rejectHigh": 56.4,
        "unit": "U/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "AST_GOT::18009::0001739::I::μkat/L::IFCC sin Fosfato de piridoxal",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "AST/GOT",
        "methodName": "IFCC sin Fosfato de piridoxal",
        "targetValue": 0.749,
        "sd1": 0.062,
        "sd1Low": 0.687,
        "sd1High": 0.811,
        "sd2Low": 0.625,
        "sd2High": 0.873,
        "rejectLow": 0.562,
        "rejectHigh": 0.936,
        "unit": "μkat/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "AST_GOT::18009::0001739::I::U/L::IFCC con Fosfato de piridoxal",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "AST/GOT",
        "methodName": "IFCC con Fosfato de piridoxal",
        "targetValue": 56.4,
        "sd1": 4.7,
        "sd1Low": 51.7,
        "sd1High": 61.1,
        "sd2Low": 47.0,
        "sd2High": 65.8,
        "rejectLow": 42.3,
        "rejectHigh": 70.5,
        "unit": "U/L",
        "traceability": "C-RSE/IFCC ERM-AD457/IFCC (IRMM)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "AST_GOT::18010::0001747::II::U/L::IFCC sin Fosfato de piridoxal",
        "productCode": "18010",
        "lot": "0001747",
        "controlLevel": "level_2",
        "analyteName": "AST/GOT",
        "methodName": "IFCC sin Fosfato de piridoxal",
        "targetValue": 155.0,
        "sd1": 9.0,
        "sd1Low": 146.0,
        "sd1High": 164.0,
        "sd2Low": 137.0,
        "sd2High": 173.0,
        "rejectLow": 127.0,
        "rejectHigh": 183.0,
        "unit": "U/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18010 lote 0001747"
      },
      {
        "id": "AST_GOT::18010::0001747::II::μkat/L::IFCC sin Fosfato de piridoxal",
        "productCode": "18010",
        "lot": "0001747",
        "controlLevel": "level_2",
        "analyteName": "AST/GOT",
        "methodName": "IFCC sin Fosfato de piridoxal",
        "targetValue": 2.57,
        "sd1": 0.15,
        "sd1Low": 2.42,
        "sd1High": 2.72,
        "sd2Low": 2.27,
        "sd2High": 2.87,
        "rejectLow": 2.11,
        "rejectHigh": 3.03,
        "unit": "μkat/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18010 lote 0001747"
      },
      {
        "id": "AST_GOT::18042::59322::I::U/L::IFCC sin Fosfato de piridoxal",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "AST/GOT",
        "methodName": "IFCC sin Fosfato de piridoxal",
        "targetValue": 38.9,
        "sd1": 3.2,
        "sd1Low": 35.7,
        "sd1High": 42.1,
        "sd2Low": 32.5,
        "sd2High": 45.3,
        "rejectLow": 29.2,
        "rejectHigh": 48.6,
        "unit": "U/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "AST_GOT::18042::59322::I::μkat/L::IFCC sin Fosfato de piridoxal",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "AST/GOT",
        "methodName": "IFCC sin Fosfato de piridoxal",
        "targetValue": 0.646,
        "sd1": 0.054,
        "sd1Low": 0.592,
        "sd1High": 0.7,
        "sd2Low": 0.538,
        "sd2High": 0.754,
        "rejectLow": 0.485,
        "rejectHigh": 0.808,
        "unit": "μkat/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "AST_GOT::18042::59322::I::U/L::IFCC con Fosfato de piridoxal",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "AST/GOT",
        "methodName": "IFCC con Fosfato de piridoxal",
        "targetValue": 41.8,
        "sd1": 3.5,
        "sd1Low": 38.3,
        "sd1High": 45.3,
        "sd2Low": 34.8,
        "sd2High": 48.8,
        "rejectLow": 31.4,
        "rejectHigh": 52.3,
        "unit": "U/L",
        "traceability": "C-RSE/IFCC ERM-AD457/IFCC (IRMM)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "AST_GOT::18043::58987::II::U/L::IFCC sin Fosfato de piridoxal",
        "productCode": "18043",
        "lot": "58987",
        "controlLevel": "level_2",
        "analyteName": "AST/GOT",
        "methodName": "IFCC sin Fosfato de piridoxal",
        "targetValue": 133.0,
        "sd1": 8.0,
        "sd1Low": 125.0,
        "sd1High": 141.0,
        "sd2Low": 117.0,
        "sd2High": 149.0,
        "rejectLow": 109.0,
        "rejectHigh": 157.0,
        "unit": "U/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18043 lote 58987"
      },
      {
        "id": "AST_GOT::18043::58987::II::μkat/L::IFCC sin Fosfato de piridoxal",
        "productCode": "18043",
        "lot": "58987",
        "controlLevel": "level_2",
        "analyteName": "AST/GOT",
        "methodName": "IFCC sin Fosfato de piridoxal",
        "targetValue": 2.2,
        "sd1": 0.13,
        "sd1Low": 2.07,
        "sd1High": 2.33,
        "sd2Low": 1.94,
        "sd2High": 2.46,
        "rejectLow": 1.8,
        "rejectHigh": 2.6,
        "unit": "μkat/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18043 lote 58987"
      }
    ],
    "missingFields": [
      "Sin estabilidad a bordo"
    ]
  },
  "BILIRRUBIN": {
    "displayCode": "BILIRRUBIN",
    "displayName": "BILIRRUBIN",
    "canonicalNames": [
      "BILIRRUBIN"
    ],
    "productEntries": [],
    "productCodesByPlatform": {},
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": false,
      "hasValuesheet": false,
      "matchedProductCount": 0
    },
    "facts": {
      "storageTempMinC": null,
      "storageTempMaxC": null,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": null,
      "detectionLimitValue": null,
      "detectionLimitUnit": null,
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": null,
      "linearityLimitUnit": null,
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [],
      "procedureLimitations": [],
      "notes": []
    },
    "qcReferences": [],
    "missingFields": [
      "Sin producto enlazado",
      "Sin IFU descargado",
      "Sin temperatura de conservación",
      "Sin estabilidad a bordo",
      "Sin límite de linealidad",
      "Sin LOD/LOQ estructurado",
      "Sin umbrales de interferencia"
    ]
  },
  "BIL_D": {
    "displayCode": "BIL D",
    "displayName": "Bilirrubina directa",
    "canonicalNames": [
      "BILI DIRECT DPD",
      "BILIRUBIN DIRECT DPD",
      "BILIRUBIN DIRECT"
    ],
    "productEntries": [
      {
        "productCode": "11511",
        "platformFamily": "manual",
        "itemName": "BILIRUBIN (DIRECT)",
        "description": "BILIRUBIN (DIRECT)",
        "format": "4 x 50 mL",
        "systems": "Manual",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "11545",
        "platformFamily": "manual",
        "itemName": "BILIRUBIN (DIRECT)",
        "description": "BILIRUBIN (DIRECT)",
        "format": "2 x 500 mL",
        "systems": "Manual",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "12504",
        "platformFamily": "ax5",
        "itemName": "BILIRUBIN (DIRECT)",
        "description": "BILIRUBIN (DIRECT)",
        "format": "5 x 50 mL",
        "systems": "Ax5",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "21504",
        "platformFamily": "bax00",
        "itemName": "BILIRUBIN (DIRECT)",
        "description": "BILIRUBIN (DIRECT)",
        "format": "4x60mL + 4x15mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "23504",
        "platformFamily": "bax00",
        "itemName": "BILIRUBIN (DIRECT)",
        "description": "BILIRUBIN (DIRECT)",
        "format": "1x60mL + 1x15mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "21504",
        "23504"
      ],
      "BA200": [
        "21504",
        "23504"
      ],
      "A15": [
        "12504"
      ],
      "manual": [
        "11511",
        "11545"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": true,
      "matchedProductCount": 5
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": 1440.0,
      "onboardStabilityUnit": "months",
      "onboardStabilityRaw": 2.0,
      "blankDeterioration": "high_blank_absorbance",
      "detectionLimitValue": 0.09,
      "detectionLimitUnit": "mg/dL",
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": 0.37,
      "quantificationLimitUnit": "mg/dL",
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 15.0,
      "linearityLimitUnit": "mg/dL",
      "linearityLimitAlternateValue": 257.0,
      "linearityLimitAlternateUnit": "µmol/L",
      "interferenceThresholds": [
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 25.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "la hemólisis (hemoglobina 25 mg/dL) y la lipemia (triglicéridos 1300 mg/dL) interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 1300.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "la hemólisis (hemoglobina 25 mg/dL) y la lipemia (triglicéridos 1300 mg/dL) interfieren"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 10.0,
          "unit": "g/L",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La hemólisis no interfiere (hemoglobina 10 g/L). La lipemia (trigliceridos > 15 g/L) interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 15.0,
          "unit": "g/L",
          "effect": "interferes_above",
          "sourceExcerpt": "lipemia (trigliceridos > 15 g/L) interfieren"
        }
      ],
      "procedureLimitations": [
        "La hemólisis (hemoglobina 25 mg/dL) y la lipemia (triglicéridos 1300 mg/dL) interfieren",
        "la hemólisis (hemoglobina 25 mg/dL) y la lipemia (triglicéridos 1300 mg/dL) interfieren",
        "La hemólisis no interfiere (hemoglobina 10 g/L). La lipemia (trigliceridos > 15 g/L) interfieren"
      ],
      "notes": [
        "CONSERVACIÓN Y ESTABILIDAD Conservar a 2-8ºC. Los componentes son estables hasta la fecha de caducidad indicada en la etiqueta del kit, siempre que se conserven bien cerrados y se evite la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 2 meses. Indicaciones de deterioro: Absorbancia del blanco superior al límite indicado en “Parámetros de la prueba”.",
        "Cada laboratorio debe establecer su propio programa de Control de Calidad interno, así como procedimientos de corrección en el caso de que los resultados de los controles no se encuentren entre los límites de aceptación.",
        "CARACTERÍSTICAS METROLÓGICAS Las prestaciones metrológicas que se describen a continuación, han sido obtenidas utilizando un analizador BA400 y siguiendo las guías del Clinical & Laboratory Standards Institute (CLSI).  Límite de detección: 0,09 mg/dL = 1,60 mol/L.  Límite de linealidad: 15 mg/dL = 257 µmol/L.  Precisión:",
        " Interferencias: La hemólisis (hemoglobina 25 mg/dL) y la lipemia (triglicéridos 1300 mg/dL)"
      ]
    },
    "qcReferences": [
      {
        "id": "BIL_D::18005::0004::I::μmol/L::Sulfanílico diazoado",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "BILIRRUBINA (DIRECTA)",
        "methodName": "Sulfanílico diazoado",
        "targetValue": 11.3,
        "sd1": 1.1,
        "sd1Low": 10.2,
        "sd1High": 12.4,
        "sd2Low": 9.1,
        "sd2High": 13.5,
        "rejectLow": 7.9,
        "rejectHigh": 14.7,
        "unit": "μmol/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "BIL_D::18005::0004::I::mg/dL::Diclorofenildiazonio A25/A15",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "BILIRRUBINA (DIRECTA)",
        "methodName": "Diclorofenildiazonio A25/A15",
        "targetValue": 0.791,
        "sd1": 0.079,
        "sd1Low": 0.712,
        "sd1High": 0.87,
        "sd2Low": 0.633,
        "sd2High": 0.949,
        "rejectLow": 0.554,
        "rejectHigh": 1.028,
        "unit": "mg/dL",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "BIL_D::18005::0004::I::μmol/L::Diclorofenildiazonio A25/A15",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "BILIRRUBINA (DIRECTA)",
        "methodName": "Diclorofenildiazonio A25/A15",
        "targetValue": 13.5,
        "sd1": 1.4,
        "sd1Low": 12.1,
        "sd1High": 14.9,
        "sd2Low": 10.7,
        "sd2High": 16.3,
        "rejectLow": 9.5,
        "rejectHigh": 17.6,
        "unit": "μmol/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "BIL_D::18009::0001739::I::μmol/L::Sulfanílico diazoado",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "BILIRRUBINA (DIRECTA)",
        "methodName": "Sulfanílico diazoado",
        "targetValue": 11.3,
        "sd1": 1.1,
        "sd1Low": 10.2,
        "sd1High": 12.4,
        "sd2Low": 9.1,
        "sd2High": 13.5,
        "rejectLow": 7.9,
        "rejectHigh": 14.7,
        "unit": "μmol/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "BIL_D::18009::0001739::I::mg/dL::Diclorofenildiazonio A25/A15",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "BILIRRUBINA (DIRECTA)",
        "methodName": "Diclorofenildiazonio A25/A15",
        "targetValue": 0.791,
        "sd1": 0.079,
        "sd1Low": 0.712,
        "sd1High": 0.87,
        "sd2Low": 0.633,
        "sd2High": 0.949,
        "rejectLow": 0.554,
        "rejectHigh": 1.028,
        "unit": "mg/dL",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "BIL_D::18009::0001739::I::μmol/L::Diclorofenildiazonio A25/A15",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "BILIRRUBINA (DIRECTA)",
        "methodName": "Diclorofenildiazonio A25/A15",
        "targetValue": 13.5,
        "sd1": 1.4,
        "sd1Low": 12.1,
        "sd1High": 14.9,
        "sd2Low": 10.7,
        "sd2High": 16.3,
        "rejectLow": 9.5,
        "rejectHigh": 17.6,
        "unit": "μmol/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "BIL_D::18010::0001747::II::μmol/L::Sulfanílico diazoado",
        "productCode": "18010",
        "lot": "0001747",
        "controlLevel": "level_2",
        "analyteName": "BILIRRUBINA (DIRECTA)",
        "methodName": "Sulfanílico diazoado",
        "targetValue": 19.9,
        "sd1": 2.0,
        "sd1Low": 17.9,
        "sd1High": 21.9,
        "sd2Low": 15.9,
        "sd2High": 23.9,
        "rejectLow": 13.9,
        "rejectHigh": 25.9,
        "unit": "μmol/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18010 lote 0001747"
      },
      {
        "id": "BIL_D::18010::0001747::II::mg/dL::Diclorofenildiazonio A25/A15",
        "productCode": "18010",
        "lot": "0001747",
        "controlLevel": "level_2",
        "analyteName": "BILIRRUBINA (DIRECTA)",
        "methodName": "Diclorofenildiazonio A25/A15",
        "targetValue": 1.68,
        "sd1": 0.17,
        "sd1Low": 1.51,
        "sd1High": 1.85,
        "sd2Low": 1.34,
        "sd2High": 2.02,
        "rejectLow": 1.18,
        "rejectHigh": 2.18,
        "unit": "mg/dL",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18010 lote 0001747"
      },
      {
        "id": "BIL_D::18042::59322::I::μmol/L::Sulfanílico diazoado",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "BILIRRUBINA (DIRECTA)",
        "methodName": "Sulfanílico diazoado",
        "targetValue": 4.85,
        "sd1": 0.49,
        "sd1Low": 4.36,
        "sd1High": 5.34,
        "sd2Low": 3.87,
        "sd2High": 5.83,
        "rejectLow": 3.4,
        "rejectHigh": 6.31,
        "unit": "μmol/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "BIL_D::18042::59322::I::mg/dL::Diclorofenildiazonio A25/A15",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "BILIRRUBINA (DIRECTA)",
        "methodName": "Diclorofenildiazonio A25/A15",
        "targetValue": 0.369,
        "sd1": 0.037,
        "sd1Low": 0.332,
        "sd1High": 0.406,
        "sd2Low": 0.295,
        "sd2High": 0.443,
        "rejectLow": 0.258,
        "rejectHigh": 0.48,
        "unit": "mg/dL",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "BIL_D::18042::59322::I::μmol/L::Diclorofenildiazonio A25/A15",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "BILIRRUBINA (DIRECTA)",
        "methodName": "Diclorofenildiazonio A25/A15",
        "targetValue": 6.3,
        "sd1": 0.63,
        "sd1Low": 5.67,
        "sd1High": 6.93,
        "sd2Low": 5.04,
        "sd2High": 7.56,
        "rejectLow": 4.41,
        "rejectHigh": 8.19,
        "unit": "μmol/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "BIL_D::18043::58987::II::μmol/L::Sulfanílico diazoado",
        "productCode": "18043",
        "lot": "58987",
        "controlLevel": "level_2",
        "analyteName": "BILIRRUBINA (DIRECTA)",
        "methodName": "Sulfanílico diazoado",
        "targetValue": 22.5,
        "sd1": 2.3,
        "sd1Low": 20.2,
        "sd1High": 24.8,
        "sd2Low": 17.9,
        "sd2High": 27.1,
        "rejectLow": 15.8,
        "rejectHigh": 29.3,
        "unit": "μmol/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18043 lote 58987"
      },
      {
        "id": "BIL_D::18043::58987::II::mg/dL::Diclorofenildiazonio A25/A15",
        "productCode": "18043",
        "lot": "58987",
        "controlLevel": "level_2",
        "analyteName": "BILIRRUBINA (DIRECTA)",
        "methodName": "Diclorofenildiazonio A25/A15",
        "targetValue": 1.74,
        "sd1": 0.17,
        "sd1Low": 1.57,
        "sd1High": 1.91,
        "sd2Low": 1.4,
        "sd2High": 2.08,
        "rejectLow": 1.22,
        "rejectHigh": 2.26,
        "unit": "mg/dL",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18043 lote 58987"
      }
    ],
    "missingFields": []
  },
  "BIL_T": {
    "displayCode": "BIL T",
    "displayName": "Bilirrubina total",
    "canonicalNames": [
      "BILI TOTAL DPD",
      "BILIRUBIN TOTAL DPD",
      "BILIRUBIN TOTAL"
    ],
    "productEntries": [
      {
        "productCode": "11510",
        "platformFamily": "manual",
        "itemName": "BILIRUBIN (TOTAL)",
        "description": "BILIRUBIN (TOTAL)",
        "format": "4 x 50 mL",
        "systems": "Manual",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "11544",
        "platformFamily": "manual",
        "itemName": "BILIRUBIN (TOTAL)",
        "description": "BILIRUBIN (TOTAL)",
        "format": "2 x 500 mL",
        "systems": "Manual",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "12506",
        "platformFamily": "ax5",
        "itemName": "BILIRUBIN (TOTAL)",
        "description": "BILIRUBIN (TOTAL)",
        "format": "5 x 50 mL",
        "systems": "Ax5",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "21506",
        "platformFamily": "bax00",
        "itemName": "BILIRUBIN (TOTAL)",
        "description": "BILIRUBIN (TOTAL)",
        "format": "8x60mL + 8x15mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "23506",
        "platformFamily": "bax00",
        "itemName": "BILIRUBIN (TOTAL)",
        "description": "BILIRUBIN (TOTAL)",
        "format": "4x60 mL+ 4x15 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "21506",
        "23506"
      ],
      "BA200": [
        "21506",
        "23506"
      ],
      "A15": [
        "12506"
      ],
      "manual": [
        "11510",
        "11544"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": true,
      "matchedProductCount": 5
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": 2160.0,
      "onboardStabilityUnit": "months",
      "onboardStabilityRaw": 3.0,
      "blankDeterioration": "high_blank_absorbance",
      "detectionLimitValue": 0.109,
      "detectionLimitUnit": "mg/dL",
      "detectionLimitAlternateValue": 1.86,
      "detectionLimitAlternateUnit": "µmol/L",
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 38.0,
      "linearityLimitUnit": "mg/dL",
      "linearityLimitAlternateValue": 650.0,
      "linearityLimitAlternateUnit": "µmol/L",
      "interferenceThresholds": [
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 250.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La hemólisis (hemoglobina hasta 250 mg/dL) no interfiere. La lipemia (triglicéridos hasta 1300 mg/dL) interfiere"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 1300.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La hemólisis (hemoglobina hasta 250 mg/dL) no interfiere. La lipemia (triglicéridos hasta 1300 mg/dL) interfiere"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 10.0,
          "unit": "g/L",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La hemólisis no interfiere (hemoglobina 10 g/L). La lipemia (trigliceridos > 15 g/L) interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 15.0,
          "unit": "g/L",
          "effect": "interferes_above",
          "sourceExcerpt": "lipemia (trigliceridos > 15 g/L) interfieren"
        }
      ],
      "procedureLimitations": [
        "La hemólisis (hemoglobina hasta 250 mg/dL) no interfiere. La lipemia (triglicéridos hasta 1300 mg/dL) interfiere",
        "La hemólisis (hemoglobina 250 mg/dL) no interfiere. La lipemia (triglicéridos 1300 mg/dL) interfiere",
        "La hemólisis no interfiere (hemoglobina 10 g/L). La lipemia (trigliceridos > 15 g/L) interfieren"
      ],
      "notes": [
        "CONSERVACIÓN Y ESTABILIDAD Conservar a 2-8ºC. Los componentes son estables hasta la fecha de caducidad indicada en la etiqueta del kit, siempre que se conserven bien cerrados y se evite la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 3 meses. Indicaciones de deterioro: Absorbancia del blanco superior al límite indicado en “Parámetros de la prueba”.",
        "CARACTERÍSTICAS METROLÓGICAS Las prestaciones metrológicas que se describen a continuación, han sido obtenidas utilizando un analizador BA400 y siguiendo las guías del Clinical & Laboratory Standards Institute (CLSI). − Límite de detección: 0,109 mg/dL = 1,86 µmol/L. − Límite de linealidad: 38 mg/dL = 650 µmol/L. − Precisión:",
        "− Interferencias: La hemólisis (hemoglobina hasta 250 mg/dL) no interfiere. La lipemia (triglicéridos hasta 1300 mg/dL) interfiere. Otros medicamentos y sustancias pueden interferir8."
      ]
    },
    "qcReferences": [
      {
        "id": "BIL_T::18005::0004::I::mg/dL::Sulfanílico diazoado",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "BILIRRUBINA TOTAL",
        "methodName": "Sulfanílico diazoado",
        "targetValue": 1.96,
        "sd1": 0.2,
        "sd1Low": 1.76,
        "sd1High": 2.16,
        "sd2Low": 1.56,
        "sd2High": 2.36,
        "rejectLow": 1.37,
        "rejectHigh": 2.55,
        "unit": "mg/dL",
        "traceability": "SRM 916 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "BIL_T::18005::0004::I::μmol/L::Sulfanílico diazoado",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "BILIRRUBINA TOTAL",
        "methodName": "Sulfanílico diazoado",
        "targetValue": 33.6,
        "sd1": 3.4,
        "sd1Low": 30.2,
        "sd1High": 37.0,
        "sd2Low": 26.8,
        "sd2High": 40.4,
        "rejectLow": 23.5,
        "rejectHigh": 43.7,
        "unit": "μmol/L",
        "traceability": "SRM 916 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "BIL_T::18005::0004::I::mg/dL::Diclorofenildiazonio",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "BILIRRUBINA TOTAL",
        "methodName": "Diclorofenildiazonio",
        "targetValue": 1.96,
        "sd1": 0.2,
        "sd1Low": 1.76,
        "sd1High": 2.16,
        "sd2Low": 1.56,
        "sd2High": 2.36,
        "rejectLow": 1.37,
        "rejectHigh": 2.55,
        "unit": "mg/dL",
        "traceability": "SRM 916 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "BIL_T::18009::0001739::I::mg/dL::Sulfanílico diazoado",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "BILIRRUBINA TOTAL",
        "methodName": "Sulfanílico diazoado",
        "targetValue": 1.96,
        "sd1": 0.2,
        "sd1Low": 1.76,
        "sd1High": 2.16,
        "sd2Low": 1.56,
        "sd2High": 2.36,
        "rejectLow": 1.37,
        "rejectHigh": 2.55,
        "unit": "mg/dL",
        "traceability": "SRM 916 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "BIL_T::18009::0001739::I::μmol/L::Sulfanílico diazoado",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "BILIRRUBINA TOTAL",
        "methodName": "Sulfanílico diazoado",
        "targetValue": 33.6,
        "sd1": 3.4,
        "sd1Low": 30.2,
        "sd1High": 37.0,
        "sd2Low": 26.8,
        "sd2High": 40.4,
        "rejectLow": 23.5,
        "rejectHigh": 43.7,
        "unit": "μmol/L",
        "traceability": "SRM 916 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "BIL_T::18009::0001739::I::mg/dL::Diclorofenildiazonio",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "BILIRRUBINA TOTAL",
        "methodName": "Diclorofenildiazonio",
        "targetValue": 1.96,
        "sd1": 0.2,
        "sd1Low": 1.76,
        "sd1High": 2.16,
        "sd2Low": 1.56,
        "sd2High": 2.36,
        "rejectLow": 1.37,
        "rejectHigh": 2.55,
        "unit": "mg/dL",
        "traceability": "SRM 916 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "BIL_T::18010::0001747::II::mg/dL::Sulfanílico diazoado",
        "productCode": "18010",
        "lot": "0001747",
        "controlLevel": "level_2",
        "analyteName": "BILIRRUBINA TOTAL",
        "methodName": "Sulfanílico diazoado",
        "targetValue": 5.85,
        "sd1": 0.59,
        "sd1Low": 5.26,
        "sd1High": 6.44,
        "sd2Low": 4.67,
        "sd2High": 7.03,
        "rejectLow": 4.1,
        "rejectHigh": 7.61,
        "unit": "mg/dL",
        "traceability": "SRM 916 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18010 lote 0001747"
      },
      {
        "id": "BIL_T::18010::0001747::II::μmol/L::Sulfanílico diazoado",
        "productCode": "18010",
        "lot": "0001747",
        "controlLevel": "level_2",
        "analyteName": "BILIRRUBINA TOTAL",
        "methodName": "Sulfanílico diazoado",
        "targetValue": 100.0,
        "sd1": 10.0,
        "sd1Low": 90.0,
        "sd1High": 110.0,
        "sd2Low": 80.0,
        "sd2High": 120.0,
        "rejectLow": 70.0,
        "rejectHigh": 130.0,
        "unit": "μmol/L",
        "traceability": "SRM 916 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18010 lote 0001747"
      },
      {
        "id": "BIL_T::18042::59322::I::mg/dL::Sulfanílico diazoado",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "BILIRRUBINA TOTAL",
        "methodName": "Sulfanílico diazoado",
        "targetValue": 0.867,
        "sd1": 0.101,
        "sd1Low": 0.766,
        "sd1High": 0.968,
        "sd2Low": 0.665,
        "sd2High": 1.069,
        "rejectLow": 0.564,
        "rejectHigh": 1.17,
        "unit": "mg/dL",
        "traceability": "SRM 916 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "BIL_T::18042::59322::I::μmol/L::Sulfanílico diazoado",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "BILIRRUBINA TOTAL",
        "methodName": "Sulfanílico diazoado",
        "targetValue": 14.8,
        "sd1": 1.7,
        "sd1Low": 13.1,
        "sd1High": 16.5,
        "sd2Low": 11.4,
        "sd2High": 18.2,
        "rejectLow": 9.6,
        "rejectHigh": 20.0,
        "unit": "μmol/L",
        "traceability": "SRM 916 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "BIL_T::18042::59322::I::mg/dL::Diclorofenildiazonio",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "BILIRRUBINA TOTAL",
        "methodName": "Diclorofenildiazonio",
        "targetValue": 0.867,
        "sd1": 0.101,
        "sd1Low": 0.766,
        "sd1High": 0.968,
        "sd2Low": 0.665,
        "sd2High": 1.069,
        "rejectLow": 0.564,
        "rejectHigh": 1.17,
        "unit": "mg/dL",
        "traceability": "SRM 916 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "BIL_T::18043::58987::II::mg/dL::Sulfanílico diazoado",
        "productCode": "18043",
        "lot": "58987",
        "controlLevel": "level_2",
        "analyteName": "BILIRRUBINA TOTAL",
        "methodName": "Sulfanílico diazoado",
        "targetValue": 4.5,
        "sd1": 0.45,
        "sd1Low": 4.05,
        "sd1High": 4.95,
        "sd2Low": 3.6,
        "sd2High": 5.4,
        "rejectLow": 3.15,
        "rejectHigh": 5.85,
        "unit": "mg/dL",
        "traceability": "SRM 916 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18043 lote 58987"
      },
      {
        "id": "BIL_T::18043::58987::II::μmol/L::Sulfanílico diazoado",
        "productCode": "18043",
        "lot": "58987",
        "controlLevel": "level_2",
        "analyteName": "BILIRRUBINA TOTAL",
        "methodName": "Sulfanílico diazoado",
        "targetValue": 76.9,
        "sd1": 7.7,
        "sd1Low": 69.2,
        "sd1High": 84.6,
        "sd2Low": 61.5,
        "sd2High": 92.3,
        "rejectLow": 53.8,
        "rejectHigh": 100.0,
        "unit": "μmol/L",
        "traceability": "SRM 916 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18043 lote 58987"
      }
    ],
    "missingFields": []
  },
  "CALCIO_ARS": {
    "displayCode": "CALCIO_ARS",
    "displayName": "CALCIO_ARS",
    "canonicalNames": [
      "CALCIO ARS"
    ],
    "productEntries": [],
    "productCodesByPlatform": {},
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": false,
      "hasValuesheet": false,
      "matchedProductCount": 0
    },
    "facts": {
      "storageTempMinC": null,
      "storageTempMaxC": null,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": null,
      "detectionLimitValue": null,
      "detectionLimitUnit": null,
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": null,
      "linearityLimitUnit": null,
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [],
      "procedureLimitations": [],
      "notes": []
    },
    "qcReferences": [],
    "missingFields": [
      "Sin producto enlazado",
      "Sin IFU descargado",
      "Sin temperatura de conservación",
      "Sin estabilidad a bordo",
      "Sin límite de linealidad",
      "Sin LOD/LOQ estructurado",
      "Sin umbrales de interferencia"
    ]
  },
  "CA_ARS": {
    "displayCode": "CA ARS",
    "displayName": "Calcio arsenazo",
    "canonicalNames": [
      "CALCIUM ARSENAZO"
    ],
    "productEntries": [
      {
        "productCode": "11570",
        "platformFamily": "manual",
        "itemName": "CALCIUM-ARSENAZO",
        "description": "CALCIUM-ARSENAZO 200 mL",
        "format": "200 mL",
        "systems": null,
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 2
      },
      {
        "productCode": "12570",
        "platformFamily": "ax5",
        "itemName": "CALCIUM-ARSENAZO",
        "description": "CALCIUM-ARSENAZO BSA 10x50 mL",
        "format": "10x50 mL",
        "systems": "BSA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "21570",
        "platformFamily": "bax00",
        "itemName": "CALCIUM - ARSENAZO",
        "description": "CALCIUM - ARSENAZO",
        "format": "10 x 60 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "23570",
        "platformFamily": "bax00",
        "itemName": "CALCIUM-ARSENAZO",
        "description": "CALCIUM-ARSENAZO BA 4 x 60 mL",
        "format": "4 x 60 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "21570",
        "23570"
      ],
      "BA200": [
        "21570",
        "23570"
      ],
      "A15": [
        "12570"
      ],
      "manual": [
        "11570"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": true,
      "matchedProductCount": 4
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": 1440.0,
      "onboardStabilityUnit": "months",
      "onboardStabilityRaw": 2.0,
      "blankDeterioration": "high_blank_absorbance",
      "detectionLimitValue": 0.42,
      "detectionLimitUnit": "mg/dL",
      "detectionLimitAlternateValue": 0.105,
      "detectionLimitAlternateUnit": "mmol/L",
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 18.0,
      "linearityLimitUnit": "mg/dL",
      "linearityLimitAlternateValue": 4.5,
      "linearityLimitAlternateUnit": "mmol/L",
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 20.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "la bilirrubina (hasta 20 mg/dL), la hemólisis (hemoglobina hasta 250 mg/dL) y lipemia (triglicéridos hasta 1000 mg/dL) no interfieren"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 250.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "la bilirrubina (hasta 20 mg/dL), la hemólisis (hemoglobina hasta 250 mg/dL) y lipemia (triglicéridos hasta 1000 mg/dL) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 1000.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "la bilirrubina (hasta 20 mg/dL), la hemólisis (hemoglobina hasta 250 mg/dL) y lipemia (triglicéridos hasta 1000 mg/dL) no interfieren"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 2.5,
          "unit": "g/L",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La bilirrubina (< 20 mg/dL) no interfiere. La hemólisis (hemoglobina 2,5 g/L) y la"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 10.0,
          "unit": "g/L",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La bilirrubina (< 20 mg/dL) no interfiere. La hemólisis (hemoglobina 2,5 g/L) y la"
        }
      ],
      "procedureLimitations": [
        "la bilirrubina (hasta 20 mg/dL), la hemólisis (hemoglobina hasta 250 mg/dL) y lipemia (triglicéridos hasta 1000 mg/dL) no interfieren",
        "La bilirrubina (< 20 mg/dL) no interfiere. La hemólisis (hemoglobina 2,5 g/L) y la  Reactivo: Presencia de partículas, turbidez, absorbancia del blanco superior a 0,550 a 650 nm.  Patrón: Presencia de partículas, turbidez. lipemia (10 g/L) interfieren"
      ],
      "notes": [
        "CONSERVACIÓN Y ESTABILIDAD Conservar a 2-8ºC. Los componentes son estables hasta la fecha de caducidad indicada en la etiqueta del kit, siempre que se conserven bien cerrados y se evite la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 2 meses. Indicaciones de deterioro: Absorbancia del blanco superior al límite indicado en “Parámetros de la prueba”.",
        "CARACTERÍSTICAS METROLÓGICAS Las prestaciones metrológicas que se describen a continuación, han sido obtenidas utilizando un analizador BA400 y siguiendo las guías del Clinical & Laboratory Standards Institute (CLSI).  Límite de detección: 0,42 mg/dL = 0,105 mmol/L.",
        " Límite de linealidad: 18 mg/dL = 4,5 mmol/L.",
        "LIMITACIONES DEL PROCEDIMIENTO  Interferencias: la bilirrubina (hasta 20 mg/dL), la hemólisis (hemoglobina hasta 250 mg/dL) y lipemia (triglicéridos hasta 1000 mg/dL) no interfieren. Otros medicamentos y sustancias pueden interferir4."
      ]
    },
    "qcReferences": [
      {
        "id": "CA_ARS::18005::0004::I::mmol/L::Arsenazo III",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "CALCIO",
        "methodName": "Arsenazo III",
        "targetValue": 2.02,
        "sd1": 0.08,
        "sd1Low": 1.94,
        "sd1High": 2.1,
        "sd2Low": 1.86,
        "sd2High": 2.18,
        "rejectLow": 1.78,
        "rejectHigh": 2.26,
        "unit": "mmol/L",
        "traceability": "SRM 956 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "CA_ARS::18009::0001739::I::mmol/L::Arsenazo III",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "CALCIO",
        "methodName": "Arsenazo III",
        "targetValue": 2.02,
        "sd1": 0.08,
        "sd1Low": 1.94,
        "sd1High": 2.1,
        "sd2Low": 1.86,
        "sd2High": 2.18,
        "rejectLow": 1.78,
        "rejectHigh": 2.26,
        "unit": "mmol/L",
        "traceability": "SRM 956 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "CA_ARS::18010::0001747::II::mmol/L::Arsenazo III",
        "productCode": "18010",
        "lot": "0001747",
        "controlLevel": "level_2",
        "analyteName": "CALCIO",
        "methodName": "Arsenazo III",
        "targetValue": 3.08,
        "sd1": 0.12,
        "sd1Low": 2.96,
        "sd1High": 3.2,
        "sd2Low": 2.84,
        "sd2High": 3.32,
        "rejectLow": 2.71,
        "rejectHigh": 3.45,
        "unit": "mmol/L",
        "traceability": "SRM 956 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18010 lote 0001747"
      },
      {
        "id": "CA_ARS::18042::59322::I::mmol/L::Arsenazo III",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "CALCIO",
        "methodName": "Arsenazo III",
        "targetValue": 2.47,
        "sd1": 0.1,
        "sd1Low": 2.37,
        "sd1High": 2.57,
        "sd2Low": 2.27,
        "sd2High": 2.67,
        "rejectLow": 2.17,
        "rejectHigh": 2.77,
        "unit": "mmol/L",
        "traceability": "SRM 956 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "CA_ARS::18043::58987::II::mmol/L::Arsenazo III",
        "productCode": "18043",
        "lot": "58987",
        "controlLevel": "level_2",
        "analyteName": "CALCIO",
        "methodName": "Arsenazo III",
        "targetValue": 3.49,
        "sd1": 0.14,
        "sd1Low": 3.35,
        "sd1High": 3.63,
        "sd2Low": 3.21,
        "sd2High": 3.77,
        "rejectLow": 3.07,
        "rejectHigh": 3.91,
        "unit": "mmol/L",
        "traceability": "SRM 956 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18043 lote 58987"
      }
    ],
    "missingFields": []
  },
  "CA_CPC": {
    "displayCode": "CA CPC",
    "displayName": "Calcio CPC",
    "canonicalNames": [
      "CALCIUM CPC",
      "CALCIUM CRESOLPHTHALEIN",
      "CALCIUM CRESOLPHTHALEIN COMPLEXONE",
      "CALCIUM CRESOLPHTHALEIN"
    ],
    "productEntries": [
      {
        "productCode": "21511",
        "platformFamily": "bax00",
        "itemName": "CALCIUM- CRESOLPHTHALEIN",
        "description": "CALCIUM- CRESOLPHTHALEIN",
        "format": "8 x 60 + 8 x 15 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "23511",
        "platformFamily": "bax00",
        "itemName": "CALCIUM- CRESOLPHTHALEIN",
        "description": "CALCIUM- CRESOLPHTHALEIN",
        "format": "2 x 60 + 2 x 15 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "21511",
        "23511"
      ],
      "BA200": [
        "21511",
        "23511"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": true,
      "matchedProductCount": 2
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 30.0,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": "high_blank_absorbance",
      "detectionLimitValue": 0.5,
      "detectionLimitUnit": "mg/dL",
      "detectionLimitAlternateValue": 0.125,
      "detectionLimitAlternateUnit": "mmol/L",
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 20.0,
      "linearityLimitUnit": "mg/dL",
      "linearityLimitAlternateValue": 5.0,
      "linearityLimitAlternateUnit": "mmol/L",
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 20.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "la bilirrubina (hasta 20 mg/dL), la hemólisis (hemoglobina hasta 1000 mg/dL) y lipemia (triglicéridos hasta 3000 mg/dL) no interfieren"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 1000.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "la bilirrubina (hasta 20 mg/dL), la hemólisis (hemoglobina hasta 1000 mg/dL) y lipemia (triglicéridos hasta 3000 mg/dL) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 3000.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "la bilirrubina (hasta 20 mg/dL), la hemólisis (hemoglobina hasta 1000 mg/dL) y lipemia (triglicéridos hasta 3000 mg/dL) no interfieren"
        }
      ],
      "procedureLimitations": [
        "la bilirrubina (hasta 20 mg/dL), la hemólisis (hemoglobina hasta 1000 mg/dL) y lipemia (triglicéridos hasta 3000 mg/dL) no interfieren"
      ],
      "notes": [
        "CONSERVACIÓN Y ESTABILIDAD Conservar a 2-30ºC. Los componentes son estables hasta la fecha de caducidad indicada en la etiqueta del kit, siempre que se conserven bien cerrados y se evite la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 45 días.. Indicaciones de deterioro: Absorbancia del blanco superior al límite indicado en “Parámetros de la prueba”.",
        "Cada laboratorio debe establecer su propio programa de Control de Calidad interno, así como procedimientos de corrección en el caso de que los resultados de los controles no se encuentren entre los límites de aceptación.",
        " Límite de linealidad: 20 mg/dL = 5 mmol/L.  Precisión:",
        "LIMITACIONES DEL PROCEDIMIENTO  Interferencias: la bilirrubina (hasta 20 mg/dL), la hemólisis (hemoglobina hasta 1000 mg/dL) y lipemia (triglicéridos hasta 3000 mg/dL) no interfieren. Otros medicamentos y sustancias pueden interferir4."
      ]
    },
    "qcReferences": [
      {
        "id": "CA_CPC::18005::0004::I::mg/dL::o-Cresolftaleína",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "CALCIO",
        "methodName": "o-Cresolftaleína",
        "targetValue": 8.2,
        "sd1": 0.33,
        "sd1Low": 7.87,
        "sd1High": 8.53,
        "sd2Low": 7.54,
        "sd2High": 8.86,
        "rejectLow": 7.22,
        "rejectHigh": 9.18,
        "unit": "mg/dL",
        "traceability": "SRM 956 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "CA_CPC::18005::0004::I::mmol/L::o-Cresolftaleína",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "CALCIO",
        "methodName": "o-Cresolftaleína",
        "targetValue": 2.05,
        "sd1": 0.08,
        "sd1Low": 1.97,
        "sd1High": 2.13,
        "sd2Low": 1.89,
        "sd2High": 2.21,
        "rejectLow": 1.8,
        "rejectHigh": 2.3,
        "unit": "mmol/L",
        "traceability": "SRM 956 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "CA_CPC::18009::0001739::I::mg/dL::o-Cresolftaleína",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "CALCIO",
        "methodName": "o-Cresolftaleína",
        "targetValue": 8.2,
        "sd1": 0.33,
        "sd1Low": 7.87,
        "sd1High": 8.53,
        "sd2Low": 7.54,
        "sd2High": 8.86,
        "rejectLow": 7.22,
        "rejectHigh": 9.18,
        "unit": "mg/dL",
        "traceability": "SRM 956 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "CA_CPC::18009::0001739::I::mmol/L::o-Cresolftaleína",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "CALCIO",
        "methodName": "o-Cresolftaleína",
        "targetValue": 2.05,
        "sd1": 0.08,
        "sd1Low": 1.97,
        "sd1High": 2.13,
        "sd2Low": 1.89,
        "sd2High": 2.21,
        "rejectLow": 1.8,
        "rejectHigh": 2.3,
        "unit": "mmol/L",
        "traceability": "SRM 956 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "CA_CPC::18010::0001747::II::mg/dL::o-Cresolftaleína",
        "productCode": "18010",
        "lot": "0001747",
        "controlLevel": "level_2",
        "analyteName": "CALCIO",
        "methodName": "o-Cresolftaleína",
        "targetValue": 12.7,
        "sd1": 0.5,
        "sd1Low": 12.2,
        "sd1High": 13.2,
        "sd2Low": 11.7,
        "sd2High": 13.7,
        "rejectLow": 11.2,
        "rejectHigh": 14.2,
        "unit": "mg/dL",
        "traceability": "SRM 956 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18010 lote 0001747"
      },
      {
        "id": "CA_CPC::18042::59322::I::mg/dL::o-Cresolftaleína",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "CALCIO",
        "methodName": "o-Cresolftaleína",
        "targetValue": 9.37,
        "sd1": 0.37,
        "sd1Low": 9.0,
        "sd1High": 9.74,
        "sd2Low": 8.63,
        "sd2High": 10.11,
        "rejectLow": 8.25,
        "rejectHigh": 10.49,
        "unit": "mg/dL",
        "traceability": "SRM 956 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "CA_CPC::18042::59322::I::mmol/L::o-Cresolftaleína",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "CALCIO",
        "methodName": "o-Cresolftaleína",
        "targetValue": 2.34,
        "sd1": 0.09,
        "sd1Low": 2.25,
        "sd1High": 2.43,
        "sd2Low": 2.16,
        "sd2High": 2.52,
        "rejectLow": 2.06,
        "rejectHigh": 2.62,
        "unit": "mmol/L",
        "traceability": "SRM 956 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "CA_CPC::18043::58987::II::mg/dL::o-Cresolftaleína",
        "productCode": "18043",
        "lot": "58987",
        "controlLevel": "level_2",
        "analyteName": "CALCIO",
        "methodName": "o-Cresolftaleína",
        "targetValue": 13.2,
        "sd1": 0.5,
        "sd1Low": 12.7,
        "sd1High": 13.7,
        "sd2Low": 12.2,
        "sd2High": 14.2,
        "rejectLow": 11.6,
        "rejectHigh": 14.8,
        "unit": "mg/dL",
        "traceability": "SRM 956 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18043 lote 58987"
      }
    ],
    "missingFields": [
      "Sin estabilidad a bordo"
    ]
  },
  "CER": {
    "displayCode": "CER",
    "displayName": "Ceruloplasmina",
    "canonicalNames": [
      "CERULOPLASMIN"
    ],
    "productEntries": [
      {
        "productCode": "22340",
        "platformFamily": "bax00",
        "itemName": "CERULOPLASMIN",
        "description": "CERULOPLASMIN",
        "format": "1 x 50 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "22340"
      ],
      "BA200": [
        "22340"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": false,
      "matchedProductCount": 1
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": 2160.0,
      "onboardStabilityUnit": "months",
      "onboardStabilityRaw": 3.0,
      "blankDeterioration": null,
      "detectionLimitValue": 0.662,
      "detectionLimitUnit": "mg/dL",
      "detectionLimitAlternateValue": 0.007,
      "detectionLimitAlternateUnit": "g/L",
      "quantificationLimitValue": 1.84,
      "quantificationLimitUnit": "mg/dL",
      "quantificationLimitAlternateValue": 0.02,
      "quantificationLimitAlternateUnit": "g/L",
      "linearityLimitValue": 120.0,
      "linearityLimitUnit": "mg/dL",
      "linearityLimitAlternateValue": 1.2,
      "linearityLimitAlternateUnit": "g/L",
      "interferenceThresholds": [
        {
          "interferent": "rheumatoid_factor",
          "label": "Factor reumatoide",
          "thresholdValue": 103.0,
          "unit": "UI/mL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "El factor reumatoide (hasta 103 UI/mL) no interfiere."
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 500.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "hemólisis (hemoglobina hasta 500 mg/dL), la bilirrubina (hasta 30 mg/dL), la lipemia (triglicéridos hasta 326 mg/dL) y el factor reumatoide (hasta 103 UI/mL) no interfieren"
        },
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 30.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "bilirrubina (hasta 30 mg/dL), la lipemia (triglicéridos hasta 326 mg/dL) y el factor reumatoide (hasta 103 UI/mL) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 326.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "lipemia (triglicéridos hasta 326 mg/dL) y el factor reumatoide (hasta 103 UI/mL) no interfieren"
        }
      ],
      "procedureLimitations": [
        "La hemólisis (hemoglobina hasta 500 mg/dL), la bilirrubina (hasta 30 mg/dL), la lipemia (triglicéridos hasta 326 mg/dL) y el factor reumatoide (hasta 103 UI/mL) no interfieren"
      ],
      "notes": [
        "Conservar a 2-8ºC. Los componentes son estables una vez abiertos hasta la fecha de caducidad marcada en la etiqueta si estos se mantienen a la temperatura de almacenamiento recomendada, bien cerrados y se tiene cuidado de evitar la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 3 meses. Indicaciones de deterioro: Absorbancia del blanco superior al parametrización del analizador.",
        " Interferencias: la hemólisis (hemoglobina hasta 500 mg/dL), la bilirrubina (hasta 30 mg/dL- 513 mol/L), la lipemia (triglicéridos hasta 326 mg/dL- 3,68 mmol/L) y el factor reumatoide (hasta 103 UI/mL) no interfieren. Otros medicamentos y sustancias pueden interferir6."
      ]
    },
    "qcReferences": [],
    "missingFields": []
  },
  "CHOL": {
    "displayCode": "CHOL",
    "displayName": "Colesterol",
    "canonicalNames": [
      "CHOLESTEROL",
      "COLESTEROL",
      "CHOL"
    ],
    "productEntries": [
      {
        "productCode": "11505",
        "platformFamily": "manual",
        "itemName": "CHOLESTEROL",
        "description": "CHOLESTEROL",
        "format": "1 x 200 mL",
        "systems": "Manual",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "11506",
        "platformFamily": "manual",
        "itemName": "CHOLESTEROL",
        "description": "CHOLESTEROL",
        "format": "1 X 500 mL",
        "systems": "Manual",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "11539",
        "platformFamily": "manual",
        "itemName": "CHOLESTEROL",
        "description": "CHOLESTEROL",
        "format": "1 x 1L",
        "systems": "Manual",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "11805",
        "platformFamily": "manual",
        "itemName": "CHOLESTEROL",
        "description": "CHOLESTEROL",
        "format": "1 x 50 mL",
        "systems": "Manual",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "12505",
        "platformFamily": "ax5",
        "itemName": "CHOLESTEROL",
        "description": "CHOLESTEROL",
        "format": "10 x 50 mL",
        "systems": "Ax5",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "21505",
        "platformFamily": "bax00",
        "itemName": "CHOLESTEROL",
        "description": "CHOLESTEROL",
        "format": "10 x 60 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "23505",
        "platformFamily": "bax00",
        "itemName": "CHOLESTEROL",
        "description": "CHOLESTEROL",
        "format": "4 x 60 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "21505",
        "23505"
      ],
      "BA200": [
        "21505",
        "23505"
      ],
      "A15": [
        "12505"
      ],
      "manual": [
        "11505",
        "11506",
        "11539",
        "11805"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": true,
      "matchedProductCount": 7
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": 1440.0,
      "onboardStabilityUnit": "months",
      "onboardStabilityRaw": 2.0,
      "blankDeterioration": "high_blank_absorbance",
      "detectionLimitValue": 4.2,
      "detectionLimitUnit": "mg/dL",
      "detectionLimitAlternateValue": 0.109,
      "detectionLimitAlternateUnit": "mmol/L",
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 1000.0,
      "linearityLimitUnit": "mg/dL",
      "linearityLimitAlternateValue": 26.0,
      "linearityLimitAlternateUnit": "mmol/L",
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 10.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La hemólisis (hemoglobina hasta 500 mg/dL), la bilirrubina (hasta 10 mg/dL) y la lipemia (triglicéridos hasta 1000 mg/dL) no interfieren. El àcido ascórbico (hasta 6,25 mg/dL) no interfiere"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 500.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La hemólisis (hemoglobina hasta 500 mg/dL), la bilirrubina (hasta 10 mg/dL) y la lipemia (triglicéridos hasta 1000 mg/dL) no interfieren. El àcido ascórbico (hasta 6,25 mg/dL) no interfiere"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 1000.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La hemólisis (hemoglobina hasta 500 mg/dL), la bilirrubina (hasta 10 mg/dL) y la lipemia (triglicéridos hasta 1000 mg/dL) no interfieren. El àcido ascórbico (hasta 6,25 mg/dL) no interfiere"
        },
        {
          "interferent": "ascorbic_acid",
          "label": "Ácido ascórbico",
          "thresholdValue": 6.25,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La hemólisis (hemoglobina hasta 500 mg/dL), la bilirrubina (hasta 10 mg/dL) y la lipemia (triglicéridos hasta 1000 mg/dL) no interfieren. El àcido ascórbico (hasta 6,25 mg/dL) no interfiere"
        }
      ],
      "procedureLimitations": [
        "La hemólisis (hemoglobina hasta 500 mg/dL), la bilirrubina (hasta 10 mg/dL) y la lipemia (triglicéridos hasta 1000 mg/dL) no interfieren. El àcido ascórbico (hasta 6,25 mg/dL) no interfiere"
      ],
      "notes": [
        "CONSERVACIÓN Y ESTABILIDAD Conservar a 2-8 ºC. Los componentes son estables hasta la fecha de caducidad indicada en la etiqueta del kit, siempre que se conserven bien cerrados y se evite la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 2 meses. Indicaciones de deterioro: Absorbancia del blanco superior al límite indicado en “Parámetros de la prueba”.",
        "CARACTERÍSTICAS METROLÓGICAS Las prestaciones metrológicas que se describen a continuación, han sido obtenidas utilizando un analizador BA400 y siguiendo las guías del Clinical & Laboratory Standards Institute (CLSI). − Límite de detección: 4,2 mg/dL = 0,109 mmol/L − Límite de linealidad: 1000 mg/dL = 26 mmol/L. − Precisión:",
        "Interferencias: La hemólisis (hemoglobina hasta 500 mg/dL), la bilirrubina (hasta 10 mg/dL) y la lipemia (triglicéridos hasta 1000 mg/dL) no interfieren. El àcido ascórbico (hasta 6,25 mg/dL) no interfiere. Otros medicamentos y sustancias pueden interferir6."
      ]
    },
    "qcReferences": [
      {
        "id": "CHOL::18005::0004::I::mg/dL::Colesterol oxidasa/peroxidasa",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "COLESTEROL",
        "methodName": "Colesterol oxidasa/peroxidasa",
        "targetValue": 143.0,
        "sd1": 7.0,
        "sd1Low": 136.0,
        "sd1High": 150.0,
        "sd2Low": 129.0,
        "sd2High": 157.0,
        "rejectLow": 122.0,
        "rejectHigh": 164.0,
        "unit": "mg/dL",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "CHOL::18005::0004::I::mmol/L::Colesterol oxidasa/peroxidasa",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "COLESTEROL",
        "methodName": "Colesterol oxidasa/peroxidasa",
        "targetValue": 3.7,
        "sd1": 0.19,
        "sd1Low": 3.51,
        "sd1High": 3.89,
        "sd2Low": 3.32,
        "sd2High": 4.08,
        "rejectLow": 3.15,
        "rejectHigh": 4.26,
        "unit": "mmol/L",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "CHOL::18009::0001739::I::mg/dL::Colesterol oxidasa/peroxidasa",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "COLESTEROL",
        "methodName": "Colesterol oxidasa/peroxidasa",
        "targetValue": 143.0,
        "sd1": 7.0,
        "sd1Low": 136.0,
        "sd1High": 150.0,
        "sd2Low": 129.0,
        "sd2High": 157.0,
        "rejectLow": 122.0,
        "rejectHigh": 164.0,
        "unit": "mg/dL",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "CHOL::18009::0001739::I::mmol/L::Colesterol oxidasa/peroxidasa",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "COLESTEROL",
        "methodName": "Colesterol oxidasa/peroxidasa",
        "targetValue": 3.7,
        "sd1": 0.19,
        "sd1Low": 3.51,
        "sd1High": 3.89,
        "sd2Low": 3.32,
        "sd2High": 4.08,
        "rejectLow": 3.15,
        "rejectHigh": 4.26,
        "unit": "mmol/L",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "CHOL::18010::0001747::II::mg/dL::Colesterol oxidasa/peroxidasa",
        "productCode": "18010",
        "lot": "0001747",
        "controlLevel": "level_2",
        "analyteName": "COLESTEROL",
        "methodName": "Colesterol oxidasa/peroxidasa",
        "targetValue": 235.0,
        "sd1": 12.0,
        "sd1Low": 223.0,
        "sd1High": 247.0,
        "sd2Low": 211.0,
        "sd2High": 259.0,
        "rejectLow": 200.0,
        "rejectHigh": 270.0,
        "unit": "mg/dL",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18010 lote 0001747"
      },
      {
        "id": "CHOL::18040::60431::I::mg/dL::Colesterol oxidasa/peroxidasa",
        "productCode": "18040",
        "lot": "60431",
        "controlLevel": "level_1",
        "analyteName": "COLESTEROL",
        "methodName": "Colesterol oxidasa/peroxidasa",
        "targetValue": 217.0,
        "sd1": 11.0,
        "sd1Low": 206.0,
        "sd1High": 228.0,
        "sd2Low": 195.0,
        "sd2High": 239.0,
        "rejectLow": 184.0,
        "rejectHigh": 250.0,
        "unit": "mg/dL",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18040 lote 60431"
      },
      {
        "id": "CHOL::18041::59255::II::mg/dL::Colesterol oxidasa/peroxidasa",
        "productCode": "18041",
        "lot": "59255",
        "controlLevel": "level_2",
        "analyteName": "COLESTEROL",
        "methodName": "Colesterol oxidasa/peroxidasa",
        "targetValue": 234.0,
        "sd1": 12.0,
        "sd1Low": 222.0,
        "sd1High": 246.0,
        "sd2Low": 210.0,
        "sd2High": 258.0,
        "rejectLow": 199.0,
        "rejectHigh": 269.0,
        "unit": "mg/dL",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18041 lote 59255"
      },
      {
        "id": "CHOL::18042::59322::I::mg/dL::Colesterol oxidasa/peroxidasa",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "COLESTEROL",
        "methodName": "Colesterol oxidasa/peroxidasa",
        "targetValue": 128.0,
        "sd1": 6.0,
        "sd1Low": 122.0,
        "sd1High": 134.0,
        "sd2Low": 116.0,
        "sd2High": 140.0,
        "rejectLow": 109.0,
        "rejectHigh": 147.0,
        "unit": "mg/dL",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "CHOL::18042::59322::I::mmol/L::Colesterol oxidasa/peroxidasa",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "COLESTEROL",
        "methodName": "Colesterol oxidasa/peroxidasa",
        "targetValue": 3.31,
        "sd1": 0.17,
        "sd1Low": 3.14,
        "sd1High": 3.48,
        "sd2Low": 2.97,
        "sd2High": 3.65,
        "rejectLow": 2.81,
        "rejectHigh": 3.81,
        "unit": "mmol/L",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "CHOL::18043::58987::II::mg/dL::Colesterol oxidasa/peroxidasa",
        "productCode": "18043",
        "lot": "58987",
        "controlLevel": "level_2",
        "analyteName": "COLESTEROL",
        "methodName": "Colesterol oxidasa/peroxidasa",
        "targetValue": 197.0,
        "sd1": 10.0,
        "sd1Low": 187.0,
        "sd1High": 207.0,
        "sd2Low": 177.0,
        "sd2High": 217.0,
        "rejectLow": 167.0,
        "rejectHigh": 227.0,
        "unit": "mg/dL",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18043 lote 58987"
      }
    ],
    "missingFields": []
  },
  "CK": {
    "displayCode": "CK",
    "displayName": "Creatina quinasa",
    "canonicalNames": [
      "CREATINE KINASE CK",
      "CK"
    ],
    "productEntries": [
      {
        "productCode": "11790",
        "platformFamily": "manual",
        "itemName": "CREATINE KINASE (CK)",
        "description": "CREATINE KINASE (CK)",
        "format": "1 x 50 mL",
        "systems": "Manual",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "11791",
        "platformFamily": "manual",
        "itemName": "CREATINE KINASE (CK)",
        "description": "CREATINE KINASE (CK)",
        "format": "4 X 50 mL",
        "systems": "Manual",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "12524",
        "platformFamily": "ax5",
        "itemName": "CREATINE KINASE (CK)",
        "description": "CREATINE KINASE (CK)",
        "format": "3 x 15 mL",
        "systems": "Ax5",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "21790",
        "platformFamily": "bax00",
        "itemName": "CREATINE KINASE (CK)",
        "description": "CREATINE KINASE (CK)",
        "format": "2 x 60 + 2 x 15 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "23790",
        "platformFamily": "bax00",
        "itemName": "CREATINE KINASE (CK)",
        "description": "CREATINE KINASE (CK)",
        "format": "1 x 60 + 1 x 15 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "21790",
        "23790"
      ],
      "BA200": [
        "21790",
        "23790"
      ],
      "A15": [
        "12524"
      ],
      "manual": [
        "11790",
        "11791"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": true,
      "matchedProductCount": 5
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": 1440.0,
      "onboardStabilityUnit": "months",
      "onboardStabilityRaw": 2.0,
      "blankDeterioration": "high_blank_absorbance",
      "detectionLimitValue": 1.92,
      "detectionLimitUnit": "U/L",
      "detectionLimitAlternateValue": 31.0,
      "detectionLimitAlternateUnit": "nkat/L",
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 1300.0,
      "linearityLimitUnit": "U/L",
      "linearityLimitAlternateValue": 21671.0,
      "linearityLimitAlternateUnit": "nkat/L",
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 20.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La bilirrubina (hasta 20 mg/dL), la hemólisis (hemoglobina hasta 1000 mg/dL) y lipemia (triglicéridos hasta 500 mg/dL) no interfieren"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 1000.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La bilirrubina (hasta 20 mg/dL), la hemólisis (hemoglobina hasta 1000 mg/dL) y lipemia (triglicéridos hasta 500 mg/dL) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 500.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La bilirrubina (hasta 20 mg/dL), la hemólisis (hemoglobina hasta 1000 mg/dL) y lipemia (triglicéridos hasta 500 mg/dL) no interfieren"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 10.0,
          "unit": "g/L",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "hemolisis (hemoglobina < 10 g/L) no interfieren"
        }
      ],
      "procedureLimitations": [
        "La bilirrubina (hasta 20 mg/dL), la hemólisis (hemoglobina hasta 1000 mg/dL) y lipemia (triglicéridos hasta 500 mg/dL) no interfieren",
        "la bilirrubina (hasta 20 mg/dL), la hemólisis (hemoglobina hasta 1000 mg/dL) y lipemia (triglicéridos hasta 500 mg/dL) no interfieren",
        "La bilirrubina (< 20 mg/dL) y la hemolisis (hemoglobina < 10 g/L) no interfieren. La lipemia interfiere (triglicéridos > 5 g/L)"
      ],
      "notes": [
        "CONSERVACIÓN Y ESTABILIDAD Conservar a 2-8ºC. Los componentes son estables hasta la fecha de caducidad indicada en la etiqueta del kit, siempre que se conserven bien cerrados y se evite la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 2 meses. Indicaciones de deterioro: Absorbancia del blanco superior al límite indicado en “Parámetros de la prueba”.",
        "Cada laboratorio debe establecer su propio programa de Control de Calidad interno, así como procedimientos de corrección en el caso de que los resultados de los controles no se encuentren entre los límites de aceptación.",
        "− Límite de linealidad: 1300 U/L = 21671 nkat/L (21,67 kat/L).",
        "− Interferencias: La bilirrubina (hasta 20 mg/dL), la hemólisis (hemoglobina hasta 1000 mg/dL) y lipemia (triglicéridos hasta 500 mg/dL) no interfieren. Otros medicamentos y sustancias pueden interferir5."
      ]
    },
    "qcReferences": [
      {
        "id": "CK::18005::0004::I::U/L::IFCC",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "CK",
        "methodName": "IFCC",
        "targetValue": 189.0,
        "sd1": 13.0,
        "sd1Low": 176.0,
        "sd1High": 202.0,
        "sd2Low": 163.0,
        "sd2High": 215.0,
        "rejectLow": 151.0,
        "rejectHigh": 227.0,
        "unit": "U/L",
        "traceability": "C-RSE/IFCC ERM-AD455/IFCC (IRMM)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "CK::18005::0004::I::μkat/L::IFCC",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "CK",
        "methodName": "IFCC",
        "targetValue": 3.14,
        "sd1": 0.21,
        "sd1Low": 2.93,
        "sd1High": 3.35,
        "sd2Low": 2.72,
        "sd2High": 3.56,
        "rejectLow": 2.51,
        "rejectHigh": 3.77,
        "unit": "μkat/L",
        "traceability": "C-RSE/IFCC ERM-AD455/IFCC (IRMM)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "CK::18009::0001739::I::U/L::IFCC",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "CK",
        "methodName": "IFCC",
        "targetValue": 189.0,
        "sd1": 13.0,
        "sd1Low": 176.0,
        "sd1High": 202.0,
        "sd2Low": 163.0,
        "sd2High": 215.0,
        "rejectLow": 151.0,
        "rejectHigh": 227.0,
        "unit": "U/L",
        "traceability": "C-RSE/IFCC ERM-AD455/IFCC (IRMM)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "CK::18009::0001739::I::μkat/L::IFCC",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "CK",
        "methodName": "IFCC",
        "targetValue": 3.14,
        "sd1": 0.21,
        "sd1Low": 2.93,
        "sd1High": 3.35,
        "sd2Low": 2.72,
        "sd2High": 3.56,
        "rejectLow": 2.51,
        "rejectHigh": 3.77,
        "unit": "μkat/L",
        "traceability": "C-RSE/IFCC ERM-AD455/IFCC (IRMM)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "CK::18010::0001747::II::μkat/L::Butiriltiocolina",
        "productCode": "18010",
        "lot": "0001747",
        "controlLevel": "level_2",
        "analyteName": "CK",
        "methodName": "Butiriltiocolina",
        "targetValue": null,
        "sd1": null,
        "sd1Low": null,
        "sd1High": null,
        "sd2Low": null,
        "sd2High": null,
        "rejectLow": null,
        "rejectHigh": null,
        "unit": "μkat/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18010 lote 0001747"
      },
      {
        "id": "CK::18010::0001747::II::U/L::IFCC",
        "productCode": "18010",
        "lot": "0001747",
        "controlLevel": "level_2",
        "analyteName": "CK",
        "methodName": "IFCC",
        "targetValue": 509.0,
        "sd1": 34.0,
        "sd1Low": 475.0,
        "sd1High": 543.0,
        "sd2Low": 441.0,
        "sd2High": 577.0,
        "rejectLow": 407.0,
        "rejectHigh": 611.0,
        "unit": "U/L",
        "traceability": "C-RSE/IFCC ERM-AD455/IFCC (IRMM)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18010 lote 0001747"
      },
      {
        "id": "CK::18042::59322::I::U/L::IFCC",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "CK",
        "methodName": "IFCC",
        "targetValue": 132.0,
        "sd1": 9.0,
        "sd1Low": 123.0,
        "sd1High": 141.0,
        "sd2Low": 114.0,
        "sd2High": 150.0,
        "rejectLow": 106.0,
        "rejectHigh": 158.0,
        "unit": "U/L",
        "traceability": "C-RSE/IFCC ERM-AD455/IFCC (IRMM)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "CK::18042::59322::I::μkat/L::IFCC",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "CK",
        "methodName": "IFCC",
        "targetValue": 2.19,
        "sd1": 0.15,
        "sd1Low": 2.04,
        "sd1High": 2.34,
        "sd2Low": 1.89,
        "sd2High": 2.49,
        "rejectLow": 1.75,
        "rejectHigh": 2.63,
        "unit": "μkat/L",
        "traceability": "C-RSE/IFCC ERM-AD455/IFCC (IRMM)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "CK::18043::58987::II::μkat/L::Butiriltiocolina",
        "productCode": "18043",
        "lot": "58987",
        "controlLevel": "level_2",
        "analyteName": "CK",
        "methodName": "Butiriltiocolina",
        "targetValue": 169.0,
        "sd1": 14.0,
        "sd1Low": 155.0,
        "sd1High": 183.0,
        "sd2Low": 141.0,
        "sd2High": 197.0,
        "rejectLow": 127.0,
        "rejectHigh": 211.0,
        "unit": "μkat/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18043 lote 58987"
      },
      {
        "id": "CK::18043::58987::II::U/L::IFCC",
        "productCode": "18043",
        "lot": "58987",
        "controlLevel": "level_2",
        "analyteName": "CK",
        "methodName": "IFCC",
        "targetValue": 253.0,
        "sd1": 17.0,
        "sd1Low": 236.0,
        "sd1High": 270.0,
        "sd2Low": 219.0,
        "sd2High": 287.0,
        "rejectLow": 202.0,
        "rejectHigh": 304.0,
        "unit": "U/L",
        "traceability": "C-RSE/IFCC ERM-AD455/IFCC (IRMM)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18043 lote 58987"
      }
    ],
    "missingFields": []
  },
  "COLESTEROL": {
    "displayCode": "COLESTEROL",
    "displayName": "COLESTEROL",
    "canonicalNames": [
      "COLESTEROL"
    ],
    "productEntries": [],
    "productCodesByPlatform": {},
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": false,
      "hasValuesheet": false,
      "matchedProductCount": 0
    },
    "facts": {
      "storageTempMinC": null,
      "storageTempMaxC": null,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": null,
      "detectionLimitValue": null,
      "detectionLimitUnit": null,
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": null,
      "linearityLimitUnit": null,
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [],
      "procedureLimitations": [],
      "notes": []
    },
    "qcReferences": [],
    "missingFields": [
      "Sin producto enlazado",
      "Sin IFU descargado",
      "Sin temperatura de conservación",
      "Sin estabilidad a bordo",
      "Sin límite de linealidad",
      "Sin LOD/LOQ estructurado",
      "Sin umbrales de interferencia"
    ]
  },
  "CREATININA": {
    "displayCode": "CREATININA",
    "displayName": "CREATININA",
    "canonicalNames": [
      "CREATININA"
    ],
    "productEntries": [],
    "productCodesByPlatform": {},
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": false,
      "hasValuesheet": false,
      "matchedProductCount": 0
    },
    "facts": {
      "storageTempMinC": null,
      "storageTempMaxC": null,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": null,
      "detectionLimitValue": null,
      "detectionLimitUnit": null,
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": null,
      "linearityLimitUnit": null,
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [],
      "procedureLimitations": [],
      "notes": []
    },
    "qcReferences": [],
    "missingFields": [
      "Sin producto enlazado",
      "Sin IFU descargado",
      "Sin temperatura de conservación",
      "Sin estabilidad a bordo",
      "Sin límite de linealidad",
      "Sin LOD/LOQ estructurado",
      "Sin umbrales de interferencia"
    ]
  },
  "CREA_ENZ": {
    "displayCode": "CREA ENZ",
    "displayName": "Creatinina enzimática",
    "canonicalNames": [
      "CREATININE ENZYMATIC"
    ],
    "productEntries": [
      {
        "productCode": "11734",
        "platformFamily": "manual",
        "itemName": "CREATININE- ENZYMATIC",
        "description": "CREATININE- ENZYMATIC",
        "format": "1 x 80 mL",
        "systems": "Manual",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "12734",
        "platformFamily": "ax5",
        "itemName": "CREATININE-ENZYMATIC",
        "description": "CREATININE-ENZYMATIC",
        "format": "60 mL",
        "systems": "Ax5",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "21734",
        "platformFamily": "bax00",
        "itemName": "CREATININE-ENZYMATIC",
        "description": "CREATININE-ENZYMATIC",
        "format": "2 x 60 + 2 x 20 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "21734"
      ],
      "BA200": [
        "21734"
      ],
      "A15": [
        "12734"
      ],
      "manual": [
        "11734"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": true,
      "matchedProductCount": 3
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": "high_blank_absorbance",
      "detectionLimitValue": 0.05,
      "detectionLimitUnit": "mg/dL",
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 30.0,
      "linearityLimitUnit": "mg/dL",
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 24.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "la bilirrubina (hasta 24 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 1600 mg/dL) no interfieren"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 500.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "la bilirrubina (hasta 24 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 1600 mg/dL) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 1600.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "la bilirrubina (hasta 24 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 1600 mg/dL) no interfieren"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 5.0,
          "unit": "g/L",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La hemoglobina (5 g/L) y la lipemia (triglicéridos 16 g/L) no interfieren. La bilirrubina (> 24 mg/dL) puede interferir"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 16.0,
          "unit": "g/L",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La hemoglobina (5 g/L) y la lipemia (triglicéridos 16 g/L) no interfieren. La bilirrubina (> 24 mg/dL) puede interferir"
        }
      ],
      "procedureLimitations": [
        "la bilirrubina (hasta 24 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 1600 mg/dL) no interfieren",
        "La hemoglobina (5 g/L) y la lipemia (triglicéridos 16 g/L) no interfieren. La bilirrubina (> 24 mg/dL) puede interferir"
      ],
      "notes": [
        "CONSERVACIÓN Y ESTABILIDAD Conservar a 2-8ºC. Los componentes son estables hasta la fecha de caducidad indicada en la etiqueta del kit, siempre que se conserven bien cerrados y se evite la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 2 meses. Indicaciones de deterioro: Absorbancia del blanco superior al límite indicado en “Parámetros de la prueba”.",
        " Límite de detección: 0,05 mg/dL = 4,43 mol/L.",
        " Límite de linealidad: 30 mg/dL = 2652 mol/L.",
        "LIMITACIONES DEL PROCEDIMIENTO  Interferencias: la bilirrubina (hasta 24 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 1600 mg/dL) no interfieren. Otros medicamentos y sustancias pueden interferir5."
      ]
    },
    "qcReferences": [
      {
        "id": "CREA_ENZ::18005::0004::I::μmol/L::Enzimático",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "CREATININA",
        "methodName": "Enzimático",
        "targetValue": 142.0,
        "sd1": 9.0,
        "sd1Low": 133.0,
        "sd1High": 151.0,
        "sd2Low": 124.0,
        "sd2High": 160.0,
        "rejectLow": 116.0,
        "rejectHigh": 168.0,
        "unit": "μmol/L",
        "traceability": "SRM 967 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "CREA_ENZ::18009::0001739::I::μmol/L::Enzimático",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "CREATININA",
        "methodName": "Enzimático",
        "targetValue": 142.0,
        "sd1": 9.0,
        "sd1Low": 133.0,
        "sd1High": 151.0,
        "sd2Low": 124.0,
        "sd2High": 160.0,
        "rejectLow": 116.0,
        "rejectHigh": 168.0,
        "unit": "μmol/L",
        "traceability": "SRM 967 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "CREA_ENZ::18010::0001747::II::μmol/L::Enzimático",
        "productCode": "18010",
        "lot": "0001747",
        "controlLevel": "level_2",
        "analyteName": "CREATININA",
        "methodName": "Enzimático",
        "targetValue": 445.0,
        "sd1": 27.0,
        "sd1Low": 418.0,
        "sd1High": 472.0,
        "sd2Low": 391.0,
        "sd2High": 499.0,
        "rejectLow": 365.0,
        "rejectHigh": 525.0,
        "unit": "μmol/L",
        "traceability": "SRM 967 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18010 lote 0001747"
      },
      {
        "id": "CREA_ENZ::18042::59322::I::μmol/L::Enzimático",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "CREATININA",
        "methodName": "Enzimático",
        "targetValue": 98.3,
        "sd1": 5.9,
        "sd1Low": 92.4,
        "sd1High": 104.2,
        "sd2Low": 86.5,
        "sd2High": 110.1,
        "rejectLow": 80.6,
        "rejectHigh": 116.0,
        "unit": "μmol/L",
        "traceability": "SRM 967 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "CREA_ENZ::18043::58987::II::μmol/L::Enzimático",
        "productCode": "18043",
        "lot": "58987",
        "controlLevel": "level_2",
        "analyteName": "CREATININA",
        "methodName": "Enzimático",
        "targetValue": 321.0,
        "sd1": 19.0,
        "sd1Low": 302.0,
        "sd1High": 340.0,
        "sd2Low": 283.0,
        "sd2High": 359.0,
        "rejectLow": 263.0,
        "rejectHigh": 379.0,
        "unit": "μmol/L",
        "traceability": "SRM 967 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18043 lote 58987"
      }
    ],
    "missingFields": [
      "Sin estabilidad a bordo"
    ]
  },
  "CREA_JAFFE": {
    "displayCode": "CREA",
    "displayName": "Creatinina",
    "canonicalNames": [
      "CREATININE"
    ],
    "productEntries": [
      {
        "productCode": "11502",
        "platformFamily": "manual",
        "itemName": "CREATININE",
        "description": "CREATININE",
        "format": "4 x 50 mL",
        "systems": "Manual",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "11542",
        "platformFamily": "manual",
        "itemName": "CREATININE",
        "description": "CREATININE",
        "format": "1 x 1 L",
        "systems": "Manual",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "11802",
        "platformFamily": "manual",
        "itemName": "CREATININE",
        "description": "CREATININE",
        "format": "2 x 50 mL",
        "systems": "Manual",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "12502",
        "platformFamily": "ax5",
        "itemName": "CREATININE",
        "description": "CREATININE",
        "format": "10 x 50 mL",
        "systems": "Ax5",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "21502",
        "platformFamily": "bax00",
        "itemName": "CREATININE",
        "description": "CREATININE",
        "format": "5 x 60 + 5 x 60 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "23502",
        "platformFamily": "bax00",
        "itemName": "CREATININE",
        "description": "CREATININE",
        "format": "5 x 20 + 5 x 20 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "21502",
        "23502"
      ],
      "BA200": [
        "21502",
        "23502"
      ],
      "A15": [
        "12502"
      ],
      "manual": [
        "11502",
        "11542",
        "11802"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": true,
      "matchedProductCount": 6
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 30.0,
      "onboardStabilityHours": 720.0,
      "onboardStabilityUnit": "days",
      "onboardStabilityRaw": 30.0,
      "blankDeterioration": "high_blank_absorbance",
      "detectionLimitValue": 0.04,
      "detectionLimitUnit": "mg/dL",
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 20.0,
      "linearityLimitUnit": "mg/dL",
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 10.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "Bilirrubina (hasta 10 mg/dL), hemólisis (hemoglobina hasta 500 mg/dL), lipemia (triglicéridos hasta 600 mg/dL) y cuerpos proteicos y cetónicos no interfieren"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 500.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "Bilirrubina (hasta 3 mg/dL), hemólisis (hemoglobina hasta 500 mg/dL), lipemia (triglicéridos hasta 600 mg/dL) y cuerpos proteicos y cetónicos no interfieren. Una concentración elevada de compuestos reductores puede interferir"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 600.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "Bilirrubina (hasta 3 mg/dL), hemólisis (hemoglobina hasta 500 mg/dL), lipemia (triglicéridos hasta 600 mg/dL) y cuerpos proteicos y cetónicos no interfieren. Una concentración elevada de compuestos reductores puede interferir"
        },
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 3.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "Bilirrubina (hasta 3 mg/dL), hemólisis (hemoglobina hasta 500 mg/dL), lipemia (triglicéridos hasta 600 mg/dL) y cuerpos proteicos y cetónicos no interfieren. Una concentración elevada de compuestos reductores puede interferir"
        }
      ],
      "procedureLimitations": [
        "Bilirrubina (hasta 10 mg/dL), hemólisis (hemoglobina hasta 500 mg/dL), lipemia (triglicéridos hasta 600 mg/dL) y cuerpos proteicos y cetónicos no interfieren. Una concentración elevada de compuestos reductores puede interferir. Otros fármacos y sustancias pueden interferir 9. COD 21502 COD 23502 NOTA 1. Para la medición en",
        "Bilirrubina (hasta 10 mg/dL), hemólisis (hemoglobina hasta 500 mg/dL), lipemia (triglicéridos hasta 600 mg/dL) y cuerpos proteicos y cetónicos no interfieren. Una concentración elevada de compuestos reductores puede interferir. Otros fármacos y sustancias pueden interferir 9",
        "Bilirrubina (hasta 3 mg/dL), hemólisis (hemoglobina hasta 500 mg/dL), lipemia (triglicéridos hasta 600 mg/dL) y cuerpos proteicos y cetónicos no interfieren. Una concentración elevada de compuestos reductores puede interferir"
      ],
      "notes": [
        "CONSERVACIÓN Y ESTABILIDAD Conservar a 2-30ºC. Los componentes son estables hasta la fecha de caducidad indicada en la etiqueta del kit, siempre que se conserven bien cerrados y se evite la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador a 2-8ºC son estables 30 días. Indicaciones de deterioro: Reactivos: RA se trata de una solución de NaOH de concentración elevada. Algunas condiciones, (p.ej. conservar a una temperatura inferior a la recomendada) puede provocar la aparición de un ligero precipitado en el vial que no interfiere en la realización del ensayo, y que desaparece mediante una ligera rotación previa al ensayo. RB, presencia de partículas y turbidez. Absorbancia del blanco superior al límite indicado en “Parámetros de la prueba”.",
        "CARACTERÍSTICAS METROLÓGICAS Las prestaciones metrológicas que se describen a continuación, han sido obtenidas utilizando un analizador BA400 y siguiendo las guías del Clinical & Laboratory Standards Institute (CLSI). − Límite de detección: 0,04 mg/dL = 3,95 mol/L. − Límite de linealidad: 20 mg/dL = 1768 mol/L. − Precisión:"
      ]
    },
    "qcReferences": [
      {
        "id": "CREA_JAFFE::18005::0004::I::mg/dL::Jaffé compensado",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "CREATININA",
        "methodName": "Jaffé compensado",
        "targetValue": 1.54,
        "sd1": 0.09,
        "sd1Low": 1.45,
        "sd1High": 1.63,
        "sd2Low": 1.36,
        "sd2High": 1.72,
        "rejectLow": 1.26,
        "rejectHigh": 1.82,
        "unit": "mg/dL",
        "traceability": "SRM 967 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "CREA_JAFFE::18005::0004::I::μmol/L::Jaffé compensado",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "CREATININA",
        "methodName": "Jaffé compensado",
        "targetValue": 136.0,
        "sd1": 8.0,
        "sd1Low": 128.0,
        "sd1High": 144.0,
        "sd2Low": 120.0,
        "sd2High": 152.0,
        "rejectLow": 112.0,
        "rejectHigh": 160.0,
        "unit": "μmol/L",
        "traceability": "SRM 967 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "CREA_JAFFE::18009::0001739::I::mg/dL::Jaffé compensado",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "CREATININA",
        "methodName": "Jaffé compensado",
        "targetValue": 1.54,
        "sd1": 0.09,
        "sd1Low": 1.45,
        "sd1High": 1.63,
        "sd2Low": 1.36,
        "sd2High": 1.72,
        "rejectLow": 1.26,
        "rejectHigh": 1.82,
        "unit": "mg/dL",
        "traceability": "SRM 967 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "CREA_JAFFE::18009::0001739::I::μmol/L::Jaffé compensado",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "CREATININA",
        "methodName": "Jaffé compensado",
        "targetValue": 136.0,
        "sd1": 8.0,
        "sd1Low": 128.0,
        "sd1High": 144.0,
        "sd2Low": 120.0,
        "sd2High": 152.0,
        "rejectLow": 112.0,
        "rejectHigh": 160.0,
        "unit": "μmol/L",
        "traceability": "SRM 967 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "CREA_JAFFE::18010::0001747::II::mg/dL::Jaffé compensado",
        "productCode": "18010",
        "lot": "0001747",
        "controlLevel": "level_2",
        "analyteName": "CREATININA",
        "methodName": "Jaffé compensado",
        "targetValue": 4.97,
        "sd1": 0.3,
        "sd1Low": 4.67,
        "sd1High": 5.27,
        "sd2Low": 4.37,
        "sd2High": 5.57,
        "rejectLow": 4.08,
        "rejectHigh": 5.86,
        "unit": "mg/dL",
        "traceability": "SRM 967 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18010 lote 0001747"
      },
      {
        "id": "CREA_JAFFE::18042::59322::I::mg/dL::Jaffé compensado",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "CREATININA",
        "methodName": "Jaffé compensado",
        "targetValue": 1.12,
        "sd1": 0.07,
        "sd1Low": 1.05,
        "sd1High": 1.19,
        "sd2Low": 0.98,
        "sd2High": 1.26,
        "rejectLow": 0.92,
        "rejectHigh": 1.32,
        "unit": "mg/dL",
        "traceability": "SRM 967 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "CREA_JAFFE::18042::59322::I::μmol/L::Jaffé compensado",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "CREATININA",
        "methodName": "Jaffé compensado",
        "targetValue": 99.1,
        "sd1": 5.9,
        "sd1Low": 93.2,
        "sd1High": 105.0,
        "sd2Low": 87.3,
        "sd2High": 110.9,
        "rejectLow": 81.3,
        "rejectHigh": 116.9,
        "unit": "μmol/L",
        "traceability": "SRM 967 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "CREA_JAFFE::18043::58987::II::mg/dL::Jaffé compensado",
        "productCode": "18043",
        "lot": "58987",
        "controlLevel": "level_2",
        "analyteName": "CREATININA",
        "methodName": "Jaffé compensado",
        "targetValue": 3.75,
        "sd1": 0.23,
        "sd1Low": 3.52,
        "sd1High": 3.98,
        "sd2Low": 3.29,
        "sd2High": 4.21,
        "rejectLow": 3.08,
        "rejectHigh": 4.43,
        "unit": "mg/dL",
        "traceability": "SRM 967 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18043 lote 58987"
      }
    ],
    "missingFields": []
  },
  "CRP": {
    "displayCode": "CRP",
    "displayName": "Proteína C reactiva",
    "canonicalNames": [
      "C REACTIVE PROTEIN CRP",
      "CRPHS",
      "CRP"
    ],
    "productEntries": [
      {
        "productCode": "13921",
        "platformFamily": "other",
        "itemName": "C-REACTIVE PROTEIN (CRP)",
        "description": "C-REACTIVE PROTEIN (CRP) 2x50 mL",
        "format": "2x50 mL",
        "systems": null,
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "22921",
        "platformFamily": "bax00",
        "itemName": "C-REACTIVE PROTEIN (CRP)",
        "description": "C-REACTIVE PROTEIN (CRP)",
        "format": "4 x 60 + 4 x 15 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "23921",
        "platformFamily": "bax00",
        "itemName": "C-REACTIVE PROTEIN (CRP)",
        "description": "C-REACTIVE PROTEIN (CRP)",
        "format": "1 x 60 + 1 x 15 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "31321",
        "platformFamily": "other",
        "itemName": "C-REACTIVE PROTEIN (CRP)",
        "description": "C-REACTIVE PROTEIN (CRP) 20 mL",
        "format": "20 mL",
        "systems": null,
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "31921",
        "platformFamily": "other",
        "itemName": "C-REACTIVE PROTEIN (CRP)",
        "description": "C-REACTIVE PROTEIN (CRP) 50 mL",
        "format": "50 mL",
        "systems": null,
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "22921",
        "23921"
      ],
      "BA200": [
        "22921",
        "23921"
      ],
      "other": [
        "13921",
        "31321",
        "31921"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": false,
      "matchedProductCount": 5
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": 1440.0,
      "onboardStabilityUnit": "months",
      "onboardStabilityRaw": 2.0,
      "blankDeterioration": "high_blank_absorbance",
      "detectionLimitValue": 1.9,
      "detectionLimitUnit": "mg/L",
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 150.0,
      "linearityLimitUnit": "mg/L",
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 30.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La bilirrubina (hasta 30 mg/dL), el factor reumatoide (hasta 300 UI/mL), la hemólisis (hemoglobina hasta 500 mg/dL) y la lipemia (triglicéridos hasta 1625 mg/dL) no interfieren"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 500.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La bilirrubina (hasta 30 mg/dL), el factor reumatoide (hasta 300 UI/mL), la hemólisis (hemoglobina hasta 500 mg/dL) y la lipemia (triglicéridos hasta 1625 mg/dL) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 1625.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La bilirrubina (hasta 30 mg/dL), el factor reumatoide (hasta 300 UI/mL), la hemólisis (hemoglobina hasta 500 mg/dL) y la lipemia (triglicéridos hasta 1625 mg/dL) no interfieren"
        },
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 20.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La lipemia (trigliceridos 10 g/L), la hemólisis (hemoglobina 10 g/L), la bilirrubina (20 mg/dL) y el factor reumatoide (200 UI/mL) no interfieren"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 10.0,
          "unit": "g/L",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La lipemia (trigliceridos 10 g/L), la hemólisis (hemoglobina 10 g/L), la bilirrubina (20 mg/dL) y el factor reumatoide (200 UI/mL) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 10.0,
          "unit": "g/L",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La lipemia (trigliceridos 10 g/L), la hemólisis (hemoglobina 10 g/L), la bilirrubina (20 mg/dL) y el factor reumatoide (200 UI/mL) no interfieren"
        },
        {
          "interferent": "rheumatoid_factor",
          "label": "Factor reumatoide",
          "thresholdValue": 300.0,
          "unit": "UI/mL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "factor reumatoide (hasta 300 UI/mL), la hemólisis (hemoglobina hasta 500 mg/dL) y la lipemia (triglicéridos hasta 1625 mg/dL) no interfieren"
        },
        {
          "interferent": "rheumatoid_factor",
          "label": "Factor reumatoide",
          "thresholdValue": 200.0,
          "unit": "UI/mL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "factor reumatoide (200 UI/mL) no interfieren"
        }
      ],
      "procedureLimitations": [
        "La bilirrubina (hasta 30 mg/dL), el factor reumatoide (hasta 300 UI/mL), la hemólisis (hemoglobina hasta 500 mg/dL) y la lipemia (triglicéridos hasta 1625 mg/dL) no interfieren",
        "La lipemia (trigliceridos 10 g/L), la hemólisis (hemoglobina 10 g/L), la bilirrubina (20 mg/dL) y el factor reumatoide (200 UI/mL) no interfieren"
      ],
      "notes": [
        "CONSERVACIÓN Y ESTABILIDAD Conservar a 2-8ºC. Los componentes son estables hasta la fecha de caducidad indicada en la etiqueta del kit, siempre que se conserven bien cerrados y se evite la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 2 meses. Indicaciones de deterioro: Absorbancia del blanco superior al límite indicado en “Parámetros de la prueba”.",
        "Las prestaciones metrológicas que se describen a continuación, han sido obtenidas utilizando un analizador BA400 y siguiendo las guías del Clinical & Laboratory Standards Institute (CLSI). − Límite de detección: 1.9 mg/L.",
        "− Límite de linealidad: 150 mg/L. − Precisión:",
        "LIMITACIONES DEL PROCEDIMIENTO − Interferencias: La bilirrubina (hasta 30 mg/dL), el factor reumatoide (hasta 300 UI/mL), la hemólisis (hemoglobina hasta 500 mg/dL) y la lipemia (triglicéridos hasta 1625 mg/dL) no interfieren. Otros medicamentos y sustancias pueden interferir7."
      ]
    },
    "qcReferences": [],
    "missingFields": []
  },
  "FACTOR_REU": {
    "displayCode": "FR",
    "displayName": "Factor reumatoide",
    "canonicalNames": [
      "RHEUMATOID FACTORS RF",
      "FACTOR REUMATOIDE FR",
      "FACTOR REUMATOIDE",
      "RF"
    ],
    "productEntries": [
      {
        "productCode": "13922",
        "platformFamily": "other",
        "itemName": "RHEUMATOID FACTORS (RF)",
        "description": "RHEUMATOID FACTORS (RF) 50 mL",
        "format": "50 mL",
        "systems": null,
        "ifuDocs": 0,
        "valuesheetDocs": 0,
        "totalDocs": 0
      }
    ],
    "productCodesByPlatform": {
      "other": [
        "13922"
      ]
    },
    "missingIfuCodes": [
      "13922"
    ],
    "documentation": {
      "hasIfu": false,
      "hasValuesheet": false,
      "matchedProductCount": 1
    },
    "facts": {
      "storageTempMinC": null,
      "storageTempMaxC": null,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": null,
      "detectionLimitValue": 1.0,
      "detectionLimitUnit": "UI/mL",
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 175.0,
      "linearityLimitUnit": "UI/mL",
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 500.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "hemólisis (hemoglobina hasta 500 mg/dL) y la lipemia (triglicéridos hasta 1000 mg/dL) no interfieren"
        },
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 30.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y la lipemia (triglicéridos hasta 1000 mg/dL) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 1000.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "lipemia (triglicéridos hasta 1000 mg/dL) no interfieren"
        }
      ],
      "procedureLimitations": [
        "La bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y la lipemia (triglicéridos hasta 1000 mg/dL) no interfieren"
      ],
      "notes": []
    },
    "qcReferences": [],
    "missingFields": [
      "Sin IFU descargado",
      "Sin temperatura de conservación",
      "Sin estabilidad a bordo"
    ]
  },
  "FOSFORO": {
    "displayCode": "FOSFORO",
    "displayName": "FOSFORO",
    "canonicalNames": [
      "FOSFORO"
    ],
    "productEntries": [],
    "productCodesByPlatform": {},
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": false,
      "hasValuesheet": false,
      "matchedProductCount": 0
    },
    "facts": {
      "storageTempMinC": null,
      "storageTempMaxC": null,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": null,
      "detectionLimitValue": null,
      "detectionLimitUnit": null,
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": null,
      "linearityLimitUnit": null,
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [],
      "procedureLimitations": [],
      "notes": []
    },
    "qcReferences": [],
    "missingFields": [
      "Sin producto enlazado",
      "Sin IFU descargado",
      "Sin temperatura de conservación",
      "Sin estabilidad a bordo",
      "Sin límite de linealidad",
      "Sin LOD/LOQ estructurado",
      "Sin umbrales de interferencia"
    ]
  },
  "FRUCT": {
    "displayCode": "FRUCT",
    "displayName": "Fructosamina",
    "canonicalNames": [
      "FRUCTOSAMINE"
    ],
    "productEntries": [
      {
        "productCode": "11046",
        "platformFamily": "manual",
        "itemName": "FRUCTOSAMINE",
        "description": "FRUCTOSAMINE 2x50 mL",
        "format": "2x50 mL",
        "systems": null,
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "manual": [
        "11046"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": false,
      "matchedProductCount": 1
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": "high_blank_absorbance",
      "detectionLimitValue": 0.14,
      "detectionLimitUnit": "mmol/L",
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 7.0,
      "linearityLimitUnit": "mmol/L",
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 20.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "bilirrubina (20 mg/dL) no interfieren"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 10.0,
          "unit": "g/L",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "Lipidos (triglicéridos 10 g/L), hemoglobina (10 g/L) y bilirrubina (20 mg/dL) no"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 10.0,
          "unit": "g/L",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "Lipidos (triglicéridos 10 g/L), hemoglobina (10 g/L) y bilirrubina (20 mg/dL) no"
        }
      ],
      "procedureLimitations": [
        "Lipidos (triglicéridos 10 g/L), hemoglobina (10 g/L) y bilirrubina (20 mg/dL) no interfieren"
      ],
      "notes": [
        "CONSERVAR A 2-8ºC",
        " Reactivo: Presencia de partículas, turbidez, absorbancia del blanco superior a 0,065 a 530 nm",
        "Límite de detección: 0,14 mmol/L (DMF), 16 mol/L (albúmina glicada).",
        "Límite de linealidad: 7 mmol/L",
        " Interferencias: Lipidos (triglicéridos 10 g/L), hemoglobina (10 g/L) y bilirrubina (20 mg/dL) no"
      ]
    },
    "qcReferences": [],
    "missingFields": [
      "Sin estabilidad a bordo"
    ]
  },
  "G6PDH": {
    "displayCode": "G6PDH",
    "displayName": "G6PDH",
    "canonicalNames": [
      "GLUCOSE 6 PHOSPHATE DEHYDROGENASE G6PDH",
      "GLUCOSE 6 PHOSPHATE DEHYDROGENASE G6PDH"
    ],
    "productEntries": [
      {
        "productCode": "12603",
        "platformFamily": "ax5",
        "itemName": "GLUCOSE-6-PHOSPHATE DEHYDROGENASE (G6PDH)",
        "description": "GLUCOSE-6-PHOSPHATE DEHYDROGENASE (G6PDH)",
        "format": "50 mL",
        "systems": "Ax5",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "21603",
        "platformFamily": "bax00",
        "itemName": "GLUCOSE-6-PHOSPHATE DEHYDROGENASE (G6PDH)",
        "description": "GLUCOSE-6-PHOSPHATE DEHYDROGENASE (G6PDH)",
        "format": "1x60mL + 1x15mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "21603"
      ],
      "BA200": [
        "21603"
      ],
      "A15": [
        "12603"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": false,
      "matchedProductCount": 2
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": 2160.0,
      "onboardStabilityUnit": "months",
      "onboardStabilityRaw": 3.0,
      "blankDeterioration": "high_blank_absorbance",
      "detectionLimitValue": null,
      "detectionLimitUnit": null,
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": null,
      "linearityLimitUnit": null,
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 30.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "bilirrubina (hasta 30 mg/dL) y la lipemia (triglicéridos hasta 1840 mg/dL - 20,8 mmol/L) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 1840.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "lipemia (triglicéridos hasta 1840 mg/dL) no interfieren"
        }
      ],
      "procedureLimitations": [
        "La bilirrubina (hasta 30 mg/dL) y la lipemia (triglicéridos hasta 1840 mg/dL) no interfieren",
        "La bilirrubina (hasta 30 mg/dL) y la lipemia (triglicéridos hasta 1840 mg/dL - 20,8 mmol/L) no interfieren"
      ],
      "notes": [
        "CONSERVACIÓN Y ESTABILIDAD Los componentes son estables una vez abiertos hasta la fecha de caducidad marcada en la etiqueta si estos se mantienen a la temperatura de almacenamiento recomendada, bien cerrados y se tiene cuidado de evitar la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 3 meses. Indicaciones de deterioro: − Reactivos A, B, C: Presencia de partículas, turbidez, absorbancia del blanco superior al límite",
        "LIMITACIONES DEL PROCEDIMIENTO − Interferencias: La bilirrubina (hasta 30 mg/dL) y la lipemia (triglicéridos hasta 1840 mg/dL) no",
        "Conservar a 2-8ºC. Los componentes son estables una vez abiertos hasta la fecha de caducidad marcada en la etiqueta si estos se mantienen a la temperatura de almacenamiento recomendada, bien cerrados y se tiene cuidado de evitar la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 3 meses. Indicaciones de deterioro: − Reactivos A, B, C: Presencia de partículas, turbidez, absorbancia del blanco superior a 0,400 a",
        "− Interferencias: La bilirrubina (hasta 30 mg/dL) y la lipemia (triglicéridos hasta 1840 mg/dL - 20,8"
      ]
    },
    "qcReferences": [],
    "missingFields": [
      "Sin límite de linealidad",
      "Sin LOD/LOQ estructurado"
    ]
  },
  "GGT": {
    "displayCode": "GGT",
    "displayName": "Gamma GT",
    "canonicalNames": [
      "GAMMA GT",
      "GAMMA GLUTAMYL TRANSFERASE"
    ],
    "productEntries": [
      {
        "productCode": "11520",
        "platformFamily": "manual",
        "itemName": "gamma-GLUTAMYL TRANSFERASE",
        "description": "gamma-GLUTAMYL TRANSFERASE 200 mL",
        "format": "200 mL",
        "systems": null,
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "12520",
        "platformFamily": "ax5",
        "itemName": "gamma-GLUTAMYL TRANSFERASE",
        "description": "gamma-GLUTAMYL TRANSFERASE BSA 5x50 mL",
        "format": "5x50 mL",
        "systems": "BSA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "A15": [
        "12520"
      ],
      "manual": [
        "11520"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": false,
      "matchedProductCount": 2
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": "high_blank_absorbance",
      "detectionLimitValue": 5.8,
      "detectionLimitUnit": "U/L",
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 600.0,
      "linearityLimitUnit": "U/L",
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 5.0,
          "unit": "g/L",
          "effect": "interferes_above",
          "sourceExcerpt": "hemólisis (hemoglobina > 5 g/L), la lipemia (triglicéridos > 4 g/L) y la bilirrubina (> 10 mg/dL) interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 4.0,
          "unit": "g/L",
          "effect": "interferes_above",
          "sourceExcerpt": "lipemia (triglicéridos > 4 g/L) y la bilirrubina (> 10 mg/dL) interfieren"
        },
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 10.0,
          "unit": "mg/dL",
          "effect": "interferes_above",
          "sourceExcerpt": "La bilirrubina (> 10 mg/dL) interfiere."
        }
      ],
      "procedureLimitations": [
        "La hemólisis (hemoglobina > 5 g/L), la lipemia (triglicéridos > 4 g/L) y la bilirrubina (> 10 mg/dL) interfieren"
      ],
      "notes": [
        "CONSERVAR A 2-8ºC",
        "Límite absorbancia blanco Límite blanco cinético Limite de linealidad",
        " Límite de linealidad: 600 U/L = 10,0 kat/L.",
        " Interferencias: La hemólisis (hemoglobina > 5 g/L), la lipemia (triglicéridos > 4 g/L) y la",
        " Reactivos: Presencia de partículas, turbidez, absorbancia del blanco superior a 1,000 a 410"
      ]
    },
    "qcReferences": [],
    "missingFields": [
      "Sin estabilidad a bordo"
    ]
  },
  "GLU": {
    "displayCode": "GLU",
    "displayName": "Glucosa",
    "canonicalNames": [
      "GLUCOSE",
      "GLUCOSA",
      "GLU"
    ],
    "productEntries": [
      {
        "productCode": "11503",
        "platformFamily": "manual",
        "itemName": "GLUCOSE",
        "description": "GLUCOSE",
        "format": "1 x 200 mL",
        "systems": "Manual",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "11504",
        "platformFamily": "manual",
        "itemName": "GLUCOSE",
        "description": "GLUCOSE",
        "format": "1 X 500 mL",
        "systems": "Manual",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "11538",
        "platformFamily": "manual",
        "itemName": "GLUCOSE",
        "description": "GLUCOSE",
        "format": "1 x 1 L",
        "systems": "Manual",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "11803",
        "platformFamily": "manual",
        "itemName": "GLUCOSE",
        "description": "GLUCOSE",
        "format": "1 x 50 mL",
        "systems": "Manual",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "12503",
        "platformFamily": "ax5",
        "itemName": "GLUCOSE",
        "description": "GLUCOSE",
        "format": null,
        "systems": "Ax5",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "21503",
        "platformFamily": "bax00",
        "itemName": "GLUCOSE",
        "description": "GLUCOSE",
        "format": null,
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "23503",
        "platformFamily": "bax00",
        "itemName": "GLUCOSE",
        "description": "GLUCOSE",
        "format": null,
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "21503",
        "23503"
      ],
      "BA200": [
        "21503",
        "23503"
      ],
      "A15": [
        "12503"
      ],
      "manual": [
        "11503",
        "11504",
        "11538",
        "11803"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": true,
      "matchedProductCount": 7
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": 1440.0,
      "onboardStabilityUnit": "months",
      "onboardStabilityRaw": 2.0,
      "blankDeterioration": "high_blank_absorbance",
      "detectionLimitValue": 1.6,
      "detectionLimitUnit": "mg/dL",
      "detectionLimitAlternateValue": 0.08,
      "detectionLimitAlternateUnit": "mmol/L",
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 500.0,
      "linearityLimitUnit": "mg/dL",
      "linearityLimitAlternateValue": 27.5,
      "linearityLimitAlternateUnit": "mmol/L",
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 12.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "Suero/plasma: La bilirrubina (hasta 12 mg/dL - 205 µmol/L), la hemólisis (hemoglobina hasta 500 mg/dL), la lipemia (triglicéridos hasta 163 mg/dL - 1,84 mmol/L), el ácido úrico (hasta 20 mg/dL - 1190 µmol/L), el ácido ascórbico (hasta 6 mg/dL - 341 µmol/L) y el acetaminofén (hasta 20 mg/dL - 1324 µmol/L) no interfieren. LCR: La hemólisis (hemoglobina hasta 500 mg/dL) no interfiere"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 500.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "Suero/plasma: La bilirrubina (hasta 12 mg/dL - 205 µmol/L), la hemólisis (hemoglobina hasta 500 mg/dL), la lipemia (triglicéridos hasta 163 mg/dL - 1,84 mmol/L), el ácido úrico (hasta 20 mg/dL - 1190 µmol/L), el ácido ascórbico (hasta 6 mg/dL - 341 µmol/L) y el acetaminofén (hasta 20 mg/dL - 1324 µmol/L) no interfieren. LCR: La hemólisis (hemoglobina hasta 500 mg/dL) no interfiere"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 163.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "Suero/plasma: La bilirrubina (hasta 12 mg/dL - 205 µmol/L), la hemólisis (hemoglobina hasta 500 mg/dL), la lipemia (triglicéridos hasta 163 mg/dL - 1,84 mmol/L), el ácido úrico (hasta 20 mg/dL - 1190 µmol/L), el ácido ascórbico (hasta 6 mg/dL - 341 µmol/L) y el acetaminofén (hasta 20 mg/dL - 1324 µmol/L) no interfieren. LCR: La hemólisis (hemoglobina hasta 500 mg/dL) no interfiere"
        },
        {
          "interferent": "ascorbic_acid",
          "label": "Ácido ascórbico",
          "thresholdValue": 6.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "Suero/plasma: La bilirrubina (hasta 12 mg/dL - 205 µmol/L), la hemólisis (hemoglobina hasta 500 mg/dL), la lipemia (triglicéridos hasta 163 mg/dL - 1,84 mmol/L), el ácido úrico (hasta 20 mg/dL - 1190 µmol/L), el ácido ascórbico (hasta 6 mg/dL - 341 µmol/L) y el acetaminofén (hasta 20 mg/dL - 1324 µmol/L) no interfieren. LCR: La hemólisis (hemoglobina hasta 500 mg/dL) no interfiere"
        },
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 10.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La hemólisis (hemoglobina hasta 300 mg/dL), la bilirrubina (hasta 10 mg/dL) y la lipemia (triglicéridos hasta 125 mg/dL) no interfieren. El àcido ascórbico (hasta 25 mg/dL) no interfiere"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 300.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La hemólisis (hemoglobina hasta 300 mg/dL), la bilirrubina (hasta 10 mg/dL) y la lipemia (triglicéridos hasta 125 mg/dL) no interfieren. El àcido ascórbico (hasta 25 mg/dL) no interfiere"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 125.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La hemólisis (hemoglobina hasta 300 mg/dL), la bilirrubina (hasta 10 mg/dL) y la lipemia (triglicéridos hasta 125 mg/dL) no interfieren. El àcido ascórbico (hasta 25 mg/dL) no interfiere"
        },
        {
          "interferent": "ascorbic_acid",
          "label": "Ácido ascórbico",
          "thresholdValue": 25.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La hemólisis (hemoglobina hasta 300 mg/dL), la bilirrubina (hasta 10 mg/dL) y la lipemia (triglicéridos hasta 125 mg/dL) no interfieren. El àcido ascórbico (hasta 25 mg/dL) no interfiere"
        }
      ],
      "procedureLimitations": [
        "Suero/plasma: La bilirrubina (hasta 12 mg/dL - 205 µmol/L), la hemólisis (hemoglobina hasta 500 mg/dL), la lipemia (triglicéridos hasta 163 mg/dL - 1,84 mmol/L), el ácido úrico (hasta 20 mg/dL - 1190 µmol/L), el ácido ascórbico (hasta 6 mg/dL - 341 µmol/L) y el acetaminofén (hasta 20 mg/dL - 1324 µmol/L) no interfieren. LCR: La hemólisis (hemoglobina hasta 500 mg/dL) no interfiere",
        "La hemólisis (hemoglobina hasta 300 mg/dL), la bilirrubina (hasta 10 mg/dL) y la lipemia (triglicéridos hasta 125 mg/dL) no interfieren. El àcido ascórbico (hasta 25 mg/dL) no interfiere"
      ],
      "notes": [
        "LIMITACIONES DEL PROCEDIMIENTO Interferencias: Suero/plasma: La bilirrubina (hasta 12 mg/dL - 205 µmol/L), la hemólisis (hemoglobina hasta 500 mg/dL), la lipemia (triglicéridos hasta 163 mg/dL - 1,84 mmol/L), el ácido úrico (hasta 20 mg/dL - 1190 µmol/L), el ácido ascórbico (hasta 6 mg/dL - 341 µmol/L) y el acetaminofén (hasta 20 mg/dL - 1324 µmol/L) no interfieren. LCR: La hemólisis (hemoglobina hasta 500 mg/dL) no interfiere. Pueden interferir otros fármacos y sustancias6."
      ]
    },
    "qcReferences": [
      {
        "id": "GLU::18005::0004::I::mg/dL::Glucosa oxidasa/peroxidasa",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "GLUCOSA",
        "methodName": "Glucosa oxidasa/peroxidasa",
        "targetValue": 91.0,
        "sd1": 4.6,
        "sd1Low": 86.4,
        "sd1High": 95.6,
        "sd2Low": 81.8,
        "sd2High": 100.2,
        "rejectLow": 77.4,
        "rejectHigh": 104.7,
        "unit": "mg/dL",
        "traceability": "SRM 965 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "GLU::18005::0004::I::mmol/L::Glucosa oxidasa/peroxidasa",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "GLUCOSA",
        "methodName": "Glucosa oxidasa/peroxidasa",
        "targetValue": 5.05,
        "sd1": 0.25,
        "sd1Low": 4.8,
        "sd1High": 5.3,
        "sd2Low": 4.55,
        "sd2High": 5.55,
        "rejectLow": 4.29,
        "rejectHigh": 5.81,
        "unit": "mmol/L",
        "traceability": "SRM 965 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "GLU::18009::0001739::I::mg/dL::Glucosa oxidasa/peroxidasa",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "GLUCOSA",
        "methodName": "Glucosa oxidasa/peroxidasa",
        "targetValue": 91.0,
        "sd1": 4.6,
        "sd1Low": 86.4,
        "sd1High": 95.6,
        "sd2Low": 81.8,
        "sd2High": 100.2,
        "rejectLow": 77.4,
        "rejectHigh": 104.7,
        "unit": "mg/dL",
        "traceability": "SRM 965 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "GLU::18009::0001739::I::mmol/L::Glucosa oxidasa/peroxidasa",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "GLUCOSA",
        "methodName": "Glucosa oxidasa/peroxidasa",
        "targetValue": 5.05,
        "sd1": 0.25,
        "sd1Low": 4.8,
        "sd1High": 5.3,
        "sd2Low": 4.55,
        "sd2High": 5.55,
        "rejectLow": 4.29,
        "rejectHigh": 5.81,
        "unit": "mmol/L",
        "traceability": "SRM 965 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "GLU::18010::0001747::II::mg/dL::Glucosa oxidasa/peroxidasa",
        "productCode": "18010",
        "lot": "0001747",
        "controlLevel": "level_2",
        "analyteName": "GLUCOSA",
        "methodName": "Glucosa oxidasa/peroxidasa",
        "targetValue": 257.0,
        "sd1": 13.0,
        "sd1Low": 244.0,
        "sd1High": 270.0,
        "sd2Low": 231.0,
        "sd2High": 283.0,
        "rejectLow": 218.0,
        "rejectHigh": 296.0,
        "unit": "mg/dL",
        "traceability": "SRM 965 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18010 lote 0001747"
      },
      {
        "id": "GLU::18010::0001747::II::mmol/L::Glucosa oxidasa/peroxidasa",
        "productCode": "18010",
        "lot": "0001747",
        "controlLevel": "level_2",
        "analyteName": "GLUCOSA",
        "methodName": "Glucosa oxidasa/peroxidasa",
        "targetValue": 14.2,
        "sd1": 0.7,
        "sd1Low": 13.5,
        "sd1High": 14.9,
        "sd2Low": 12.8,
        "sd2High": 15.6,
        "rejectLow": 12.1,
        "rejectHigh": 16.3,
        "unit": "mmol/L",
        "traceability": "SRM 965 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18010 lote 0001747"
      },
      {
        "id": "GLU::18042::59322::I::mg/dL::Glucosa oxidasa/peroxidasa",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "GLUCOSA",
        "methodName": "Glucosa oxidasa/peroxidasa",
        "targetValue": 85.8,
        "sd1": 4.3,
        "sd1Low": 81.5,
        "sd1High": 90.1,
        "sd2Low": 77.2,
        "sd2High": 94.4,
        "rejectLow": 72.9,
        "rejectHigh": 98.7,
        "unit": "mg/dL",
        "traceability": "SRM 965 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "GLU::18042::59322::I::mmol/L::Glucosa oxidasa/peroxidasa",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "GLUCOSA",
        "methodName": "Glucosa oxidasa/peroxidasa",
        "targetValue": 4.77,
        "sd1": 0.24,
        "sd1Low": 4.53,
        "sd1High": 5.01,
        "sd2Low": 4.29,
        "sd2High": 5.25,
        "rejectLow": 4.05,
        "rejectHigh": 5.49,
        "unit": "mmol/L",
        "traceability": "SRM 965 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "GLU::18043::58987::II::mg/dL::Glucosa oxidasa/peroxidasa",
        "productCode": "18043",
        "lot": "58987",
        "controlLevel": "level_2",
        "analyteName": "GLUCOSA",
        "methodName": "Glucosa oxidasa/peroxidasa",
        "targetValue": 211.0,
        "sd1": 11.0,
        "sd1Low": 200.0,
        "sd1High": 222.0,
        "sd2Low": 189.0,
        "sd2High": 233.0,
        "rejectLow": 179.0,
        "rejectHigh": 243.0,
        "unit": "mg/dL",
        "traceability": "SRM 965 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18043 lote 58987"
      },
      {
        "id": "GLU::18043::58987::II::mmol/L::Glucosa oxidasa/peroxidasa",
        "productCode": "18043",
        "lot": "58987",
        "controlLevel": "level_2",
        "analyteName": "GLUCOSA",
        "methodName": "Glucosa oxidasa/peroxidasa",
        "targetValue": 11.7,
        "sd1": 0.6,
        "sd1Low": 11.1,
        "sd1High": 12.3,
        "sd2Low": 10.5,
        "sd2High": 12.9,
        "rejectLow": 9.9,
        "rejectHigh": 13.5,
        "unit": "mmol/L",
        "traceability": "SRM 965 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18043 lote 58987"
      }
    ],
    "missingFields": []
  },
  "GLUCOSA": {
    "displayCode": "GLUCOSA",
    "displayName": "GLUCOSA",
    "canonicalNames": [
      "GLUCOSA"
    ],
    "productEntries": [],
    "productCodesByPlatform": {},
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": false,
      "hasValuesheet": false,
      "matchedProductCount": 0
    },
    "facts": {
      "storageTempMinC": null,
      "storageTempMaxC": null,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": null,
      "detectionLimitValue": null,
      "detectionLimitUnit": null,
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": null,
      "linearityLimitUnit": null,
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [],
      "procedureLimitations": [],
      "notes": []
    },
    "qcReferences": [],
    "missingFields": [
      "Sin producto enlazado",
      "Sin IFU descargado",
      "Sin temperatura de conservación",
      "Sin estabilidad a bordo",
      "Sin límite de linealidad",
      "Sin LOD/LOQ estructurado",
      "Sin umbrales de interferencia"
    ]
  },
  "GLU_HK": {
    "displayCode": "GLU HK",
    "displayName": "Glucosa hexokinasa",
    "canonicalNames": [
      "GLUCOSE HEXOKINASE",
      "GLUCOSE HEXOKINASE",
      "GLUCOSA HEXOKINASA",
      "GLU HK"
    ],
    "productEntries": [
      {
        "productCode": "11656",
        "platformFamily": "manual",
        "itemName": "GLUCOSE HEXOKINASE",
        "description": "GLUCOSE HEXOKINASE",
        "format": "1 x 200 mL",
        "systems": "Manual",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "12756",
        "platformFamily": "ax5",
        "itemName": "GLUCOSE-HEXOKINASE",
        "description": "GLUCOSE-HEXOKINASE",
        "format": null,
        "systems": "Ax5",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "21656",
        "platformFamily": "bax00",
        "itemName": "GLUCOSE HEXOKINASE",
        "description": "GLUCOSE HEXOKINASE",
        "format": null,
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "23656",
        "platformFamily": "bax00",
        "itemName": "GLUCOSE HEXOKINASE",
        "description": "GLUCOSE HEXOKINASE",
        "format": null,
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "21656",
        "23656"
      ],
      "BA200": [
        "21656",
        "23656"
      ],
      "A15": [
        "12756"
      ],
      "manual": [
        "11656"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": true,
      "matchedProductCount": 4
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": "high_blank_absorbance",
      "detectionLimitValue": 2.26,
      "detectionLimitUnit": "mg/dL",
      "detectionLimitAlternateValue": 0.125,
      "detectionLimitAlternateUnit": "mmol/L",
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 800.0,
      "linearityLimitUnit": "mg/dL",
      "linearityLimitAlternateValue": 44.4,
      "linearityLimitAlternateUnit": "mmol/L",
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 30.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "Suero/plasma: Bilirrubina (hasta 30 mg/dL – 513 mol/L), hemólisis (hemoglobina hasta 500 mg/dL), lipemia (triglicéridos hasta 1392 mg/dL - 15,7 mmol/L), ácido úrico (hasta 20 mg/dL), ácido ascórbico (hasta 6 mg/dL) y acetaminofén (hasta 20 mg/dL) no interfieren. Orina: Bilirrubina (hasta 30 mg/dL - 513 mol/L), hemólisis (hemoglobina hasta 500 mg/dL), urea (hasta 5888 mg/dL - 977 mmol/L), ácido ascórbico (hasta 30 mg/dL) y acetaminofén (hasta 20 mg/dL) no interfieren. LCR: La hemólisis (hemoglobina hasta 500 mg/dL) no interfiere"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 500.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "Suero/plasma: Bilirrubina (hasta 30 mg/dL – 513 mol/L), hemólisis (hemoglobina hasta 500 mg/dL), lipemia (triglicéridos hasta 1392 mg/dL - 15,7 mmol/L), ácido úrico (hasta 20 mg/dL), ácido ascórbico (hasta 6 mg/dL) y acetaminofén (hasta 20 mg/dL) no interfieren. Orina: Bilirrubina (hasta 30 mg/dL - 513 mol/L), hemólisis (hemoglobina hasta 500 mg/dL), urea (hasta 5888 mg/dL - 977 mmol/L), ácido ascórbico (hasta 30 mg/dL) y acetaminofén (hasta 20 mg/dL) no interfieren. LCR: La hemólisis (hemoglobina hasta 500 mg/dL) no interfiere"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 1625.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "la bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 1625 mg/dL) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 1392.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "Suero/plasma: Bilirrubina (hasta 30 mg/dL – 513 mol/L), hemólisis (hemoglobina hasta 500 mg/dL), lipemia (triglicéridos hasta 1392 mg/dL - 15,7 mmol/L), ácido úrico (hasta 20 mg/dL), ácido ascórbico (hasta 6 mg/dL) y acetaminofén (hasta 20 mg/dL) no interfieren. Orina: Bilirrubina (hasta 30 mg/dL - 513 mol/L), hemólisis (hemoglobina hasta 500 mg/dL), urea (hasta 5888 mg/dL - 977 mmol/L), ácido ascórbico (hasta 30 mg/dL) y acetaminofén (hasta 20 mg/dL) no interfieren. LCR: La hemólisis (hemoglobina hasta 500 mg/dL) no interfiere"
        },
        {
          "interferent": "ascorbic_acid",
          "label": "Ácido ascórbico",
          "thresholdValue": 6.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "Suero/plasma: Bilirrubina (hasta 30 mg/dL – 513 mol/L), hemólisis (hemoglobina hasta 500 mg/dL), lipemia (triglicéridos hasta 1392 mg/dL - 15,7 mmol/L), ácido úrico (hasta 20 mg/dL), ácido ascórbico (hasta 6 mg/dL) y acetaminofén (hasta 20 mg/dL) no interfieren. Orina: Bilirrubina (hasta 30 mg/dL - 513 mol/L), hemólisis (hemoglobina hasta 500 mg/dL), urea (hasta 5888 mg/dL - 977 mmol/L), ácido ascórbico (hasta 30 mg/dL) y acetaminofén (hasta 20 mg/dL) no interfieren. LCR: La hemólisis (hemoglobina hasta 500 mg/dL) no interfiere"
        },
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 20.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "bilirrubina (20 mg/dL) no interfieren"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 10.0,
          "unit": "g/L",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La hemoglobina (10 g/L), la lipemia (triglicéridos 10 g/L) y la bilirrubina"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 10.0,
          "unit": "g/L",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "lipemia (triglicéridos 10 g/L) y la bilirrubina (20 mg/dL) no interfieren"
        }
      ],
      "procedureLimitations": [
        "la bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 1625 mg/dL) no interfieren",
        "Suero/plasma: Bilirrubina (hasta 30 mg/dL - 513 mol/L), hemólisis (hemoglobina hasta 500 mg/dL), lipemia (triglicéridos hasta 1392 mg/dL - 15,7 mmol/L), ácido úrico (hasta 20 mg/dL), ácido ascórbico (hasta 6 mg/dL) y acetaminofén (hasta 20 mg/dL) no interfieren. Orina: bilirrubina (hasta 30 mg/dL - 513 mol/L), hemólisis (hemoglobina hasta 500 mg/dL), urea (hasta 5888 mg/dL - 977 mmol/L), ácido ascórbico (hasta 30 mg/dL) y acetaminofén (hasta 20 mg/dL) no interfieren. LCR: la hemólisis (hemoglobina hasta 500 mg/dL) no interfiere",
        "Suero/plasma: Bilirrubina (hasta 30 mg/dL – 513 mol/L), hemólisis (hemoglobina hasta 500 mg/dL), lipemia (triglicéridos hasta 1392 mg/dL - 15,7 mmol/L), ácido úrico (hasta 20 mg/dL), ácido ascórbico (hasta 6 mg/dL) y acetaminofén (hasta 20 mg/dL) no interfieren. Orina: Bilirrubina (hasta 30 mg/dL - 513 mol/L), hemólisis (hemoglobina hasta 500 mg/dL), urea (hasta 5888 mg/dL - 977 mmol/L), ácido ascórbico (hasta 30 mg/dL) y acetaminofén (hasta 20 mg/dL) no interfieren. LCR: La hemólisis (hemoglobina hasta 500 mg/dL) no interfiere",
        "La hemoglobina (10 g/L), la lipemia (triglicéridos 10 g/L) y la bilirrubina (20 mg/dL) no interfieren"
      ],
      "notes": [
        "CONSERVACIÓN Y ESTABILIDAD Conservar a 2-8ºC. Los componentes son estables hasta la fecha de caducidad indicada en la etiqueta del kit, siempre que se conserven bien cerrados y se evite la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 2 meses. Indicaciones de deterioro: Absorbancia del blanco superior al límite indicado en “Parámetros de la prueba”.",
        "CARACTERÍSTICAS METROLÓGICAS Las prestaciones metrológicas que se describen a continuación, han sido obtenidas utilizando un analizador BA400 y siguiendo las guías del Clinical & Laboratory Standards Institute (CLSI).  Límite de detección: 2,26 mg/dL = 0,125 mmol/L.  Límite de linealidad: 800 mg/dL = 44,4 mmol/L.  Precisión:",
        " Interferencias: la bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 1625 mg/dL) no interfieren. Otros medicamentos y sustancias pueden interferir5."
      ]
    },
    "qcReferences": [
      {
        "id": "GLU_HK::18005::0004::I::mg/dL::Hexokinasa",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "GLUCOSA",
        "methodName": "Hexokinasa",
        "targetValue": 91.0,
        "sd1": 4.6,
        "sd1Low": 86.4,
        "sd1High": 95.6,
        "sd2Low": 81.8,
        "sd2High": 100.2,
        "rejectLow": 77.4,
        "rejectHigh": 104.7,
        "unit": "mg/dL",
        "traceability": "SRM 965 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "GLU_HK::18009::0001739::I::mg/dL::Hexokinasa",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "GLUCOSA",
        "methodName": "Hexokinasa",
        "targetValue": 91.0,
        "sd1": 4.6,
        "sd1Low": 86.4,
        "sd1High": 95.6,
        "sd2Low": 81.8,
        "sd2High": 100.2,
        "rejectLow": 77.4,
        "rejectHigh": 104.7,
        "unit": "mg/dL",
        "traceability": "SRM 965 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "GLU_HK::18042::59322::I::mg/dL::Hexokinasa",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "GLUCOSA",
        "methodName": "Hexokinasa",
        "targetValue": 85.8,
        "sd1": 4.3,
        "sd1Low": 81.5,
        "sd1High": 90.1,
        "sd2Low": 77.2,
        "sd2High": 94.4,
        "rejectLow": 72.9,
        "rejectHigh": 98.7,
        "unit": "mg/dL",
        "traceability": "SRM 965 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      }
    ],
    "missingFields": [
      "Sin estabilidad a bordo"
    ]
  },
  "HAPTO": {
    "displayCode": "HAPTO",
    "displayName": "Haptoglobina",
    "canonicalNames": [
      "HAPTOGLOBIN"
    ],
    "productEntries": [
      {
        "productCode": "23218",
        "platformFamily": "bax00",
        "itemName": "HAPTOGLOBIN",
        "description": "HAPTOGLOBIN",
        "format": "1 x 40 + 1 x 10 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "23218"
      ],
      "BA200": [
        "23218"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": false,
      "matchedProductCount": 1
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": 2160.0,
      "onboardStabilityUnit": "months",
      "onboardStabilityRaw": 3.0,
      "blankDeterioration": null,
      "detectionLimitValue": 1.22,
      "detectionLimitUnit": "mg/dL",
      "detectionLimitAlternateValue": 0.012,
      "detectionLimitAlternateUnit": "g/L",
      "quantificationLimitValue": 14.3,
      "quantificationLimitUnit": "mg/dL",
      "quantificationLimitAlternateValue": 0.14,
      "quantificationLimitAlternateUnit": "g/L",
      "linearityLimitValue": 500.0,
      "linearityLimitUnit": "mg/dL",
      "linearityLimitAlternateValue": 5.0,
      "linearityLimitAlternateUnit": "g/L",
      "interferenceThresholds": [
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 25.0,
          "unit": "mg/dL",
          "effect": "interferes_at_or_above",
          "sourceExcerpt": "La hemólisis (hemoglobina a 25 mg/dL) interfiere."
        },
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 30.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "bilirrubina (hasta 30 mg/dL), la lipemia (triglicéridos hasta 1300 mg/dL) y los anticuerpos reumatoideos (hasta 320 UI/mL) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 1300.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "lipemia (triglicéridos hasta 1300 mg/dL) y los anticuerpos reumatoideos (hasta 320 UI/mL) no interfieren"
        },
        {
          "interferent": "rheumatoid_factor",
          "label": "Factor reumatoide / anticuerpos reumatoideos",
          "thresholdValue": 320.0,
          "unit": "UI/mL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "Los anticuerpos reumatoideos (hasta 320 UI/mL) no interfieren."
        }
      ],
      "procedureLimitations": [
        "La hemólisis (hemoglobina a 25 mg/dL) interfiere. La bilirrubina (hasta 30 mg/dL), la lipemia (triglicéridos hasta 1300 mg/dL) y los anticuerpos reumatoideos (hasta 320 UI/mL) no interfieren"
      ],
      "notes": [
        "CONSERVACIÓN Y ESTABILIDAD Conservar a 2-8ºC. Los componentes son estables una vez abiertos hasta la fecha de caducidad marcada en la etiqueta si estos se mantienen a la temperatura de almacenamiento recomendada, bien cerrados y se tiene cuidado de evitar la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 3 meses. Indicaciones de deterioro: Absorbancia del blanco superior al parametrización del analizador.",
        "− Interferencias: La hemólisis (hemoglobina a 25 mg/dL) interfiere. La bilirrubina (hasta 30 mg/dL - 513 mol/L), la lipemia (triglicéridos hasta 1300 mg/dL - 14,7 mmol/L) y los anticuerpos reumatoideos (hasta 320 UI/mL) no interfieren. Pueden interferir otros fármacos y sustancias6."
      ]
    },
    "qcReferences": [],
    "missingFields": []
  },
  "HCY": {
    "displayCode": "HCY",
    "displayName": "Homocisteína",
    "canonicalNames": [
      "HOMOCYSTEINE"
    ],
    "productEntries": [
      {
        "productCode": "23737",
        "platformFamily": "bax00",
        "itemName": "HOMOCYSTEINE",
        "description": "HOMOCYSTEINE",
        "format": "1 x 20 + 1 x 5.4 m",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "23737"
      ],
      "BA200": [
        "23737"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": false,
      "matchedProductCount": 1
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": null,
      "detectionLimitValue": null,
      "detectionLimitUnit": null,
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": null,
      "linearityLimitUnit": null,
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 40.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "bilirrubina (hasta 40 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 750 mg/dL) no interfieren"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 500.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 750 mg/dL) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 750.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "lipemia (triglicéridos hasta 750 mg/dL) no interfieren"
        }
      ],
      "procedureLimitations": [
        "la bilirrubina (hasta 40 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 750 mg/dL) no interfieren"
      ],
      "notes": [
        "Todos los componentes de origen humano han resultado ser negativos para el antígeno HBs y para los anticuerpos anti-HCV y anti-HIV. Sin embargo, deben tratarse con precaución como potencialmente infecciosos. Conservar a 2-8ºC, una vez abierto. Estable hasta la fecha de caducidad indicada en la etiqueta, siempre que se conserve bien cerrado y se evite la contaminación durante su uso. Cada laboratorio debe establecer su propio programa de Control de Calidad interno, así como procedimientos de corrección en el caso de que los resultados de los controles no se encuentren entre los límites de aceptación.",
        "LIMITACIONES DEL PROCEDIMIENTO  Interferencias: la bilirrubina (hasta 40 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia"
      ]
    },
    "qcReferences": [],
    "missingFields": [
      "Sin estabilidad a bordo",
      "Sin límite de linealidad",
      "Sin LOD/LOQ estructurado"
    ]
  },
  "HEMOGLOBIN": {
    "displayCode": "HEMOGLOBIN",
    "displayName": "HEMOGLOBIN",
    "canonicalNames": [
      "HEMOGLOBIN"
    ],
    "productEntries": [],
    "productCodesByPlatform": {},
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": false,
      "hasValuesheet": false,
      "matchedProductCount": 0
    },
    "facts": {
      "storageTempMinC": null,
      "storageTempMaxC": null,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": null,
      "detectionLimitValue": null,
      "detectionLimitUnit": null,
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": null,
      "linearityLimitUnit": null,
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [],
      "procedureLimitations": [],
      "notes": []
    },
    "qcReferences": [],
    "missingFields": [
      "Sin producto enlazado",
      "Sin IFU descargado",
      "Sin temperatura de conservación",
      "Sin estabilidad a bordo",
      "Sin límite de linealidad",
      "Sin LOD/LOQ estructurado",
      "Sin umbrales de interferencia"
    ]
  },
  "HGB": {
    "displayCode": "HGB",
    "displayName": "Hemoglobina A1C directa",
    "canonicalNames": [
      "HEMOGLOBIN A1C DIRECT HBA1C DIR",
      "HEMOGLOBINA A1C DIRECTO HBA1C DIR",
      "HBA1C DIR",
      "HEMOGLOBIN",
      "HEMOGLOBINA",
      "HGB"
    ],
    "productEntries": [
      {
        "productCode": "22147",
        "platformFamily": "bax00",
        "itemName": "HbA1C-DIR",
        "description": "HbA1C-DIR 1x60+1x12mL",
        "format": "1x60+1x12mL",
        "systems": null,
        "ifuDocs": 2,
        "valuesheetDocs": 0,
        "totalDocs": 6
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "22147"
      ],
      "BA200": [
        "22147"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": false,
      "matchedProductCount": 1
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": 720.0,
      "onboardStabilityUnit": "days",
      "onboardStabilityRaw": 30.0,
      "blankDeterioration": "high_blank_absorbance",
      "detectionLimitValue": 1.9,
      "detectionLimitUnit": "mmol/mol",
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 140.0,
      "linearityLimitUnit": "mmol/mol",
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 10.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "bilirrubina (hasta 10 mg/dL) y la lipemia (triglicéridos hasta 400 mg/dL) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 400.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La lipemia (triglicéridos hasta 400 mg/dL) no interfiere."
        }
      ],
      "procedureLimitations": [
        "La bilirrubina (hasta 10 mg/dL) y la lipemia (triglicéridos hasta 400 mg/dL) no interfieren"
      ],
      "notes": [
        "Conservar a 2-8ºC. Los componentes son estables hasta la fecha de caducidad indicada en la etiqueta del kit, siempre que se conserven bien cerrados y se evite la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 30 días. Indicaciones de deterioro: Absorbancia del blanco superior al límite indicado en “Parámetros de la prueba”.",
        "− Límite de detección: 1,9 mmol/mol. − Intervalo de medida: (valor aproximado dependiendo de la concentración del patrón más elevado): 2 - 140",
        "− Interferencias: la bilirrubina (hasta 10 mg/dL) y la lipemia (triglicéridos hasta 400 mg/dL) no interfieren. Otros"
      ]
    },
    "qcReferences": [],
    "missingFields": []
  },
  "HIERRO_FER": {
    "displayCode": "HIERRO FER",
    "displayName": "Hierro ferrozina",
    "canonicalNames": [
      "IRON FERROZINE",
      "HIERRO FERROZINA",
      "HIERRO FERROCINA"
    ],
    "productEntries": [
      {
        "productCode": "12509",
        "platformFamily": "ax5",
        "itemName": "IRON FERROZINE",
        "description": "IRON FERROZINE BSA 5x50mL",
        "format": "5x50mL",
        "systems": "BSA",
        "ifuDocs": 0,
        "valuesheetDocs": 0,
        "totalDocs": 0
      },
      {
        "productCode": "21509",
        "platformFamily": "bax00",
        "itemName": "IRON FERROZINE",
        "description": "IRON FERROZINE BA 4x60+4x15 mL",
        "format": "4x60+4x15 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "21509"
      ],
      "BA200": [
        "21509"
      ],
      "A15": [
        "12509"
      ]
    },
    "missingIfuCodes": [
      "12509"
    ],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": false,
      "matchedProductCount": 2
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": null,
      "detectionLimitValue": 2.46,
      "detectionLimitUnit": "μg/dL",
      "detectionLimitAlternateValue": 0.44,
      "detectionLimitAlternateUnit": "μmol/L",
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 1000.0,
      "linearityLimitUnit": "μg/dL",
      "linearityLimitAlternateValue": 179.0,
      "linearityLimitAlternateUnit": "μmol/L",
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 20.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "bilirrubina (hasta 20 mg/dL) y la lipemia (triglicéridos hasta 1500 mg/dL) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 1500.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "lipemia (triglicéridos hasta 1500 mg/dL) no interfieren"
        }
      ],
      "procedureLimitations": [
        "La bilirrubina (hasta 20 mg/dL) y la lipemia (triglicéridos hasta 1500 mg/dL) no interfieren. La hemólisis interfiere"
      ],
      "notes": [
        "CONSERVACIÓN Y ESTABILIDAD Conservar a 2-8 ºC. Los componentes son estables hasta la fecha de caducidad indicada en la etiqueta del kit, siempre que se conserven bien cerrados y se evite la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 2 meses. Indicaciones de deterioro: Absorbancia del blanco superior al límite indicado en “Parámetros de la prueba”.",
        "LIMITACIONES DEL PROCEDIMIENTO  Interferencias: la bilirrubina (hasta 20 mg/dL) y la lipemia (triglicéridos hasta 1500 mg/dL) no"
      ]
    },
    "qcReferences": [],
    "missingFields": [
      "Sin estabilidad a bordo"
    ]
  },
  "LACTATO_DE": {
    "displayCode": "LACTATO_DE",
    "displayName": "LACTATO_DE",
    "canonicalNames": [
      "LACTATO DE"
    ],
    "productEntries": [],
    "productCodesByPlatform": {},
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": false,
      "hasValuesheet": false,
      "matchedProductCount": 0
    },
    "facts": {
      "storageTempMinC": null,
      "storageTempMaxC": null,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": null,
      "detectionLimitValue": null,
      "detectionLimitUnit": null,
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": null,
      "linearityLimitUnit": null,
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [],
      "procedureLimitations": [],
      "notes": []
    },
    "qcReferences": [],
    "missingFields": [
      "Sin producto enlazado",
      "Sin IFU descargado",
      "Sin temperatura de conservación",
      "Sin estabilidad a bordo",
      "Sin límite de linealidad",
      "Sin LOD/LOQ estructurado",
      "Sin umbrales de interferencia"
    ]
  },
  "LDH": {
    "displayCode": "LDH",
    "displayName": "Lactato deshidrogenasa",
    "canonicalNames": [
      "LACTATE DEHYDROGENASE LDH",
      "LACTATE DEHYDROGENASE",
      "LACTATO DESHIDROGENASA",
      "LDH"
    ],
    "productEntries": [
      {
        "productCode": "11580",
        "platformFamily": "manual",
        "itemName": "LACTATE DEHYDROGENASE (LDH)",
        "description": "LACTATE DEHYDROGENASE (LDH) 50 mL",
        "format": "50 mL",
        "systems": null,
        "ifuDocs": 0,
        "valuesheetDocs": 0,
        "totalDocs": 0
      },
      {
        "productCode": "11581",
        "platformFamily": "manual",
        "itemName": "LACTATE DEHYDROGENASE (LDH)",
        "description": "LACTATE DEHYDROGENASE (LDH) 200 mL",
        "format": "200 mL",
        "systems": null,
        "ifuDocs": 0,
        "valuesheetDocs": 0,
        "totalDocs": 0
      },
      {
        "productCode": "12580",
        "platformFamily": "ax5",
        "itemName": "LACTATE DEHYDROGENASE (LDH)",
        "description": "LACTATE DEHYDROGENASE (LDH) 5x50 mL",
        "format": "5x50 mL",
        "systems": null,
        "ifuDocs": 0,
        "valuesheetDocs": 0,
        "totalDocs": 0
      },
      {
        "productCode": "21580",
        "platformFamily": "bax00",
        "itemName": "LACTATE DEHYDROGENASE (LDH)",
        "description": "LACTATE DEHYDROGENASE (LDH)",
        "format": "8 x 60 + 8 x 15 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "23580",
        "platformFamily": "bax00",
        "itemName": "LACTATE DEHYDROGENASE(LDH)BA",
        "description": "LACTATE DEHYDROGENASE(LDH)BA 4x60+4x15mL",
        "format": "4x60+4x15mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "21580",
        "23580"
      ],
      "BA200": [
        "21580",
        "23580"
      ],
      "A15": [
        "12580"
      ],
      "manual": [
        "11580",
        "11581"
      ]
    },
    "missingIfuCodes": [
      "11580",
      "11581",
      "12580"
    ],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": false,
      "matchedProductCount": 5
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": 1440.0,
      "onboardStabilityUnit": "months",
      "onboardStabilityRaw": 2.0,
      "blankDeterioration": null,
      "detectionLimitValue": 24.4,
      "detectionLimitUnit": "U/L",
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 1250.0,
      "linearityLimitUnit": "U/L",
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 20.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "la bilirrubina (hasta 20 mg/dL) y lipemia (triglicéridos hasta 1000 mg/dL) no interfieren. La hemólisis o la tardía separación del suero ocasionan resultados elevados debido a la elevada concentración de LD en los eritrocitos"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 1000.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "la bilirrubina (hasta 20 mg/dL) y lipemia (triglicéridos hasta 1000 mg/dL) no interfieren. La hemólisis o la tardía separación del suero ocasionan resultados elevados debido a la elevada concentración de LD en los eritrocitos"
        }
      ],
      "procedureLimitations": [
        "la bilirrubina (hasta 20 mg/dL) y lipemia (triglicéridos hasta 1000 mg/dL) no interfieren. La hemólisis o la tardía separación del suero ocasionan resultados elevados debido a la elevada concentración de LD en los eritrocitos"
      ],
      "notes": [
        "CONSERVACIÓN Y ESTABILIDAD Conservar a 2-8ºC. Los componentes son estables hasta la fecha de caducidad indicada en la etiqueta del kit, siempre que se conserven bien cerrados y se evite la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 2 meses. Indicaciones de deterioro: Absorbancia del blanco inferior al límite indicado en “Parámetros de la prueba”.",
        "− Límite de detección: 24,4 U/L = 0,405 kat/L.",
        "− Límite de linealidad: 1250 U/L = 20,92 kat/L.",
        "− Interferencias: la bilirrubina (hasta 20 mg/dL) y lipemia (triglicéridos hasta 1000 mg/dL) no interfieren. La hemólisis o la tardía separación del suero ocasionan resultados elevados debido a la elevada concentración de LD en los eritrocitos. Otros medicamentos y sustancias pueden interferir5."
      ]
    },
    "qcReferences": [],
    "missingFields": []
  },
  "LDH_IFCC": {
    "displayCode": "LDH IFCC",
    "displayName": "Lactato deshidrogenasa IFCC",
    "canonicalNames": [
      "LACTATE DEHYDROGENASE LDH IFCC",
      "LACTATE DEHYDROGENASE IFCC",
      "LDH IFCC"
    ],
    "productEntries": [
      {
        "productCode": "21586",
        "platformFamily": "bax00",
        "itemName": "LACTATE DEHYDROGENASE (LDH) - IFCC",
        "description": "LACTATE DEHYDROGENASE (LDH) - IFCC",
        "format": "8 x 60 + 8 x 15 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "21586"
      ],
      "BA200": [
        "21586"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": false,
      "matchedProductCount": 1
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": 1440.0,
      "onboardStabilityUnit": "months",
      "onboardStabilityRaw": 2.0,
      "blankDeterioration": null,
      "detectionLimitValue": 16.9,
      "detectionLimitUnit": "U/L",
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 1500.0,
      "linearityLimitUnit": "U/L",
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 30.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "Bilirrubina (hasta 30 mg/dL) y lipemia (triglicéridos hasta 1099 mg/dL) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 1099.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "lipemia (triglicéridos hasta 1099 mg/dL) no interfieren"
        }
      ],
      "procedureLimitations": [
        "La hemólisis Lactato + NAD+ Piruvato + NADH lactato deshidrogenasa en los glóbulos rojos. Bilirrubina (hasta 30 mg/dL) y lipemia (triglicéridos hasta 1099 mg/dL) no interfieren"
      ],
      "notes": [
        "CONSERVACIÓN Y ESTABILIDAD Conservar a 2-8ºC. Los componentes son estables hasta la fecha de caducidad indicada en la etiqueta del kit, siempre que se conserven bien cerrados y se evite la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 2 meses. Indicaciones de deterioro: Absorbancia del blanco superior al límite indicado en “Parámetros de la prueba”.",
        "− Límite de detección: 16,9 U/L = 0,28 kat/L.",
        "− Límite de linealidad: 1500 U/L = 25,00 kat/L",
        "− Interferencias: La hemólisis"
      ]
    },
    "qcReferences": [],
    "missingFields": []
  },
  "LIPASA": {
    "displayCode": "LIPASA",
    "displayName": "Lipasa",
    "canonicalNames": [
      "LIPASE",
      "LIPASA"
    ],
    "productEntries": [
      {
        "productCode": "21760",
        "platformFamily": "bax00",
        "itemName": "LIPASE",
        "description": "LIPASE BA 1x20 mL + 1x10 mL",
        "format": "1x20 mL + 1x10 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 2
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "21760"
      ],
      "BA200": [
        "21760"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": false,
      "matchedProductCount": 1
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": 720.0,
      "onboardStabilityUnit": "days",
      "onboardStabilityRaw": 30.0,
      "blankDeterioration": null,
      "detectionLimitValue": 4.89,
      "detectionLimitUnit": "U/L",
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": 8.52,
      "quantificationLimitUnit": "U/L",
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 250.0,
      "linearityLimitUnit": "U/L",
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 30.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La hemólisis (hemoglobina hasta 500 mg/dL), la bilirrubina (hasta 30 mg/dL) y la lipemia (triglicéridos hasta 300 mg/dL) no interfieren"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 500.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La hemólisis (hemoglobina hasta 500 mg/dL), la bilirrubina (hasta 30 mg/dL) y la lipemia (triglicéridos hasta 300 mg/dL) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 300.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La hemólisis (hemoglobina hasta 500 mg/dL), la bilirrubina (hasta 30 mg/dL) y la lipemia (triglicéridos hasta 300 mg/dL) no interfieren"
        }
      ],
      "procedureLimitations": [
        "La hemólisis (hemoglobina hasta 500 mg/dL), la bilirrubina (hasta 30 mg/dL) y la lipemia (triglicéridos hasta 300 mg/dL) no interfieren"
      ],
      "notes": [
        "CONSERVACIÓN Y ESTABILIDAD Conservar a 2-8ºC. Los componentes son estables hasta la fecha de caducidad indicada en la etiqueta del kit, siempre que se conserven bien cerrados y se evite la contaminación durante su uso. El reactivo B puede presentar agregados que no afectan a su funcionalidad. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 30 días. Indicaciones de deterioro: Absorbancia del blanco superior al límite indicado en “Parámetros de la prueba”.",
        "− Límite de detección: 4,89 U/L = 0,08 kat/L. Límite de cuantificación: 8,52 U/L = 0,14 ka/L.",
        "− Límite de linealidad: 250 U/L = 4,17 kat/L. Cuando se obtengan valores superiores, diluir la muestra 1/2 con agua destilada y repetir la medición. Rango de medida: (8,52 U/L = 0,14 ka/L) - (250 U/L = 4,17 kat/L).",
        "Interferencias: La hemólisis (hemoglobina hasta 500 mg/dL), la bilirrubina (hasta 30 mg/dL) y la lipemia (triglicéridos hasta 300 mg/dL) no interfieren. Otros medicamentos y sustancias pueden interferir6."
      ]
    },
    "qcReferences": [],
    "missingFields": []
  },
  "MAGNESIO_X": {
    "displayCode": "MG X",
    "displayName": "Magnesio xylidyl blue",
    "canonicalNames": [
      "MAGNESIUM XYLIDIL",
      "MAGNESIO XYLIDIL",
      "MAGNESIUM"
    ],
    "productEntries": [
      {
        "productCode": "12797",
        "platformFamily": "ax5",
        "itemName": "MAGNESIUM",
        "description": "MAGNESIUM BSA 5x20 mL",
        "format": "5x20 mL",
        "systems": "BSA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "A15": [
        "12797"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": false,
      "matchedProductCount": 1
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": 168.0,
      "onboardStabilityUnit": "days",
      "onboardStabilityRaw": 7.0,
      "blankDeterioration": "high_blank_absorbance",
      "detectionLimitValue": 0.21,
      "detectionLimitUnit": "mg/dL",
      "detectionLimitAlternateValue": 0.08,
      "detectionLimitAlternateUnit": "mmol/L",
      "quantificationLimitValue": 0.99,
      "quantificationLimitUnit": "mg/dL",
      "quantificationLimitAlternateValue": 0.4,
      "quantificationLimitAlternateUnit": "mmol/L",
      "linearityLimitValue": 4.0,
      "linearityLimitUnit": "mg/dL",
      "linearityLimitAlternateValue": 1.64,
      "linearityLimitAlternateUnit": "mmol/L",
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 6.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La bilirrubina (hasta 6 mg/dL), la hemólisis (hemoglobina hasta 300 mg/dL) y la lipemia (triglicéridos hasta 223 mg/dL) no interfieren"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 300.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La bilirrubina (hasta 6 mg/dL), la hemólisis (hemoglobina hasta 300 mg/dL) y la lipemia (triglicéridos hasta 223 mg/dL) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 223.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La bilirrubina (hasta 6 mg/dL), la hemólisis (hemoglobina hasta 300 mg/dL) y la lipemia (triglicéridos hasta 223 mg/dL) no interfieren"
        }
      ],
      "procedureLimitations": [
        "La bilirrubina (hasta 6 mg/dL), la hemólisis (hemoglobina hasta 300 mg/dL) y la lipemia (triglicéridos hasta 223 mg/dL) no interfieren"
      ],
      "notes": [
        "CONSERVACIÓN Y ESTABILIDAD Conservar a 2-8ºC. Los componentes son estables hasta la fecha de caducidad indicada en la etiqueta del kit, siempre que se conserven bien cerrados y se evite la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 7 días. Indicaciones de deterioro: Absorbancia del blanco superior al límite indicado en “Parámetros de la prueba”.",
        "CARACTERÍSTICAS METROLÓGICAS Las prestaciones metrológicas que se describen a continuación, han sido obtenidas utilizando un analizador A25. Los resultados son similares a los del A15. − Límite de detección: 0,21 mg/dL = 0,08 mmol/L. Límite de cuantificación: 0,99 mg/dL = 0,40",
        "− Límite de linealidad: 4 mg/dL = 1,64 mmol/L. Para muestras con valores superiores, diluir manualmente o consultar los Parámetros de la prueba para dilución automática (estas muestras se diluirán con el mismo factor de dilución).",
        "Interferencias: La bilirrubina (hasta 6 mg/dL), la hemólisis (hemoglobina hasta 300 mg/dL) y la lipemia (triglicéridos hasta 223 mg/dL) no interfieren. Otros medicamentos y sustancias pueden interferir6."
      ]
    },
    "qcReferences": [],
    "missingFields": []
  },
  "MALB_U": {
    "displayCode": "MALB",
    "displayName": "Microalbúmina orina",
    "canonicalNames": [
      "ALBUMIN MICROALBUMINURIA",
      "MICROALBUMIN URINE",
      "ALBUMIN MAU"
    ],
    "productEntries": [
      {
        "productCode": "13324",
        "platformFamily": "other",
        "itemName": "ALBUMIN (MICROALBUMINURIA)",
        "description": "ALBUMIN (MICROALBUMINURIA) BSA 50 mL",
        "format": "50 mL",
        "systems": "BSA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "22324",
        "platformFamily": "bax00",
        "itemName": "ALBUMIN (MICROALBUMINURIA)",
        "description": "ALBUMIN (MICROALBUMINURIA)",
        "format": "4 x 60 + 4 x 15 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "23324",
        "platformFamily": "bax00",
        "itemName": "ALBUMIN (MICROALBUMINURIA)",
        "description": "ALBUMIN (MICROALBUMINURIA)",
        "format": "1 x 60 + 1 x 15 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "31324",
        "platformFamily": "other",
        "itemName": "ALBUMIN (MICROALBUMINURIA)",
        "description": "ALBUMIN (MICROALBUMINURIA) 20 mL",
        "format": "20 mL",
        "systems": null,
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "31924",
        "platformFamily": "other",
        "itemName": "ALBUMIN (MICROALBUMINURIA)",
        "description": "ALBUMIN (MICROALBUMINURIA) 50 mL",
        "format": "50 mL",
        "systems": null,
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "22324",
        "23324"
      ],
      "BA200": [
        "22324",
        "23324"
      ],
      "other": [
        "13324",
        "31324",
        "31924"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": false,
      "matchedProductCount": 5
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": 1440.0,
      "onboardStabilityUnit": "months",
      "onboardStabilityRaw": 2.0,
      "blankDeterioration": "high_blank_absorbance",
      "detectionLimitValue": 1.46,
      "detectionLimitUnit": "mg/L",
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": 2.29,
      "quantificationLimitUnit": "mg/L",
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 200.0,
      "linearityLimitUnit": "mg/L",
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 30.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "bilirrubina (hasta 30 mg/dL) y la hemólisis (hemoglobina hasta 500 mg/dL) no interfieren"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 500.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "hemólisis (hemoglobina hasta 500 mg/dL) no interfieren"
        }
      ],
      "procedureLimitations": [
        "La bilirrubina (hasta 30 mg/dL) y la hemólisis (hemoglobina hasta 500 mg/dL) no interfieren",
        "la bilirrubina (hasta 30 mg/dL) y la hemólisis (hemoglobina hasta 500 mg/dL) no interfieren"
      ],
      "notes": [
        "CONSERVACIÓN Y ESTABILIDAD Conservar a 2-8ºC. Los componentes son estables una vez abiertos hasta la fecha de caducidad marcada en la etiqueta si estos se mantienen a la temperatura de almacenamiento recomendada bien cerrados y se tiene cuidado de evitar la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 2 meses. Indicaciones de deterioro: Absorbancia del blanco superior al límite indicado en la parametrización del analizador.",
        "− Límite de detección: 1,46 mg/L. Límite de cuantificación: 2,29 mg/L. − Límite de linealidad: 200 mg/L. Intervalo de medición: 2,29 - 200 mg/L. Para muestras con valores superiores, diluir manualmente o consultar los Parámetros de la prueba para dilución automática (estas muestras se diluirán con el mismo factor de dilución).",
        "− Interferencias: La bilirrubina (hasta 30 mg/dL) y la hemólisis (hemoglobina hasta 500 mg/dL) no"
      ]
    },
    "qcReferences": [],
    "missingFields": []
  },
  "MG": {
    "displayCode": "MG",
    "displayName": "Magnesio",
    "canonicalNames": [
      "MAGNESIUM"
    ],
    "productEntries": [
      {
        "productCode": "11797",
        "platformFamily": "manual",
        "itemName": "MAGNESIUM",
        "description": "MAGNESIUM 4X50 mL",
        "format": "4X50 mL",
        "systems": null,
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "12797",
        "platformFamily": "ax5",
        "itemName": "MAGNESIUM",
        "description": "MAGNESIUM BSA 5x20 mL",
        "format": "5x20 mL",
        "systems": "BSA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "21797",
        "platformFamily": "bax00",
        "itemName": "MAGNESIUM",
        "description": "MAGNESIUM",
        "format": "2 x 60 + 2 x 15 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "23797",
        "platformFamily": "bax00",
        "itemName": "MAGNESIUM",
        "description": "MAGNESIUM",
        "format": "1 x 60 + 1 x 15 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "21797",
        "23797"
      ],
      "BA200": [
        "21797",
        "23797"
      ],
      "A15": [
        "12797"
      ],
      "manual": [
        "11797"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": true,
      "matchedProductCount": 4
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": 720.0,
      "onboardStabilityUnit": "days",
      "onboardStabilityRaw": 30.0,
      "blankDeterioration": "high_blank_absorbance",
      "detectionLimitValue": 0.16,
      "detectionLimitUnit": "mg/dL",
      "detectionLimitAlternateValue": 0.06,
      "detectionLimitAlternateUnit": "mmol/L",
      "quantificationLimitValue": 0.45,
      "quantificationLimitUnit": "mg/dL",
      "quantificationLimitAlternateValue": 0.18,
      "quantificationLimitAlternateUnit": "mmol/L",
      "linearityLimitValue": 4.0,
      "linearityLimitUnit": "mg/dL",
      "linearityLimitAlternateValue": 1.64,
      "linearityLimitAlternateUnit": "mmol/L",
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 6.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La bilirrubina (hasta 6 mg/dL), la hemólisis (hemoglobina hasta 300 mg/dL) y la lipemia (triglicéridos hasta 158 mg/dL) no interfieren"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 300.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La bilirrubina (hasta 6 mg/dL), la hemólisis (hemoglobina hasta 300 mg/dL) y la lipemia (triglicéridos hasta 158 mg/dL) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 158.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La bilirrubina (hasta 6 mg/dL), la hemólisis (hemoglobina hasta 300 mg/dL) y la lipemia (triglicéridos hasta 158 mg/dL) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 223.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La bilirrubina (hasta 6 mg/dL), la hemólisis (hemoglobina hasta 300 mg/dL) y la lipemia (triglicéridos hasta 223 mg/dL) no interfieren"
        }
      ],
      "procedureLimitations": [
        "La bilirrubina (hasta 6 mg/dL), la hemólisis (hemoglobina hasta 300 mg/dL) y la lipemia (triglicéridos hasta 158 mg/dL) no interfieren",
        "La bilirrubina (hasta 6 mg/dL), la hemólisis (hemoglobina hasta 300 mg/dL) y la lipemia (triglicéridos hasta 223 mg/dL) no interfieren"
      ],
      "notes": [
        "CONSERVACIÓN Y ESTABILIDAD Conservar a 2-8ºC. Los componentes son estables hasta la fecha de caducidad indicada en la etiqueta del kit, siempre que se conserven bien cerrados y se evite la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 30 días. Indicaciones de deterioro: Absorbancia del blanco superior al límite indicado en “Parámetros de la prueba”.",
        "− Límite de detección: 0,16 mg/dL = 0,06 mmol/L. Límite de cuantificación: 0,45 mg/dL = 0,18 mmol/L.",
        "Límite de linealidad: 4 mg/dL = 1,64 mmol/L",
        "LIMITACIONES DEL PROCEDIMIENTO − Interferencias: La bilirrubina (hasta 6 mg/dL), la hemólisis (hemoglobina hasta 300 mg/dL) y la lipemia (triglicéridos hasta 158 mg/dL) no interfieren. Otros medicamentos y sustancias pueden interferir6."
      ]
    },
    "qcReferences": [
      {
        "id": "MG::18005::0004::I::μkat/L::IFCC",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "MAGNESIO",
        "methodName": "IFCC",
        "targetValue": 3.29,
        "sd1": 0.2,
        "sd1Low": 3.09,
        "sd1High": 3.49,
        "sd2Low": 2.89,
        "sd2High": 3.69,
        "rejectLow": 2.7,
        "rejectHigh": 3.88,
        "unit": "μkat/L",
        "traceability": "C-RSE/IFCC ERM-AD453/IFCC (IRMM)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "MG::18005::0004::I::mg/dL::Azul de Xilidilo",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "MAGNESIO",
        "methodName": "Azul de Xilidilo",
        "targetValue": 1.45,
        "sd1": 0.1,
        "sd1Low": 1.35,
        "sd1High": 1.55,
        "sd2Low": 1.25,
        "sd2High": 1.65,
        "rejectLow": 1.16,
        "rejectHigh": 1.74,
        "unit": "mg/dL",
        "traceability": "SRM 956 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "MG::18005::0004::I::mmol/L::Azul de Xilidilo",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "MAGNESIO",
        "methodName": "Azul de Xilidilo",
        "targetValue": 0.594,
        "sd1": 0.04,
        "sd1Low": 0.554,
        "sd1High": 0.634,
        "sd2Low": 0.514,
        "sd2High": 0.674,
        "rejectLow": 0.475,
        "rejectHigh": 0.713,
        "unit": "mmol/L",
        "traceability": "SRM 956 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "MG::18009::0001739::I::μkat/L::IFCC",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "MAGNESIO",
        "methodName": "IFCC",
        "targetValue": 3.29,
        "sd1": 0.2,
        "sd1Low": 3.09,
        "sd1High": 3.49,
        "sd2Low": 2.89,
        "sd2High": 3.69,
        "rejectLow": 2.7,
        "rejectHigh": 3.88,
        "unit": "μkat/L",
        "traceability": "C-RSE/IFCC ERM-AD453/IFCC (IRMM)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "MG::18009::0001739::I::mg/dL::Azul de Xilidilo",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "MAGNESIO",
        "methodName": "Azul de Xilidilo",
        "targetValue": 1.45,
        "sd1": 0.1,
        "sd1Low": 1.35,
        "sd1High": 1.55,
        "sd2Low": 1.25,
        "sd2High": 1.65,
        "rejectLow": 1.16,
        "rejectHigh": 1.74,
        "unit": "mg/dL",
        "traceability": "SRM 956 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "MG::18009::0001739::I::mmol/L::Azul de Xilidilo",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "MAGNESIO",
        "methodName": "Azul de Xilidilo",
        "targetValue": 0.594,
        "sd1": 0.04,
        "sd1Low": 0.554,
        "sd1High": 0.634,
        "sd2Low": 0.514,
        "sd2High": 0.674,
        "rejectLow": 0.475,
        "rejectHigh": 0.713,
        "unit": "mmol/L",
        "traceability": "SRM 956 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "MG::18010::0001747::II::μkat/L::IFCC",
        "productCode": "18010",
        "lot": "0001747",
        "controlLevel": "level_2",
        "analyteName": "MAGNESIO",
        "methodName": "IFCC",
        "targetValue": 6.64,
        "sd1": 0.4,
        "sd1Low": 6.24,
        "sd1High": 7.04,
        "sd2Low": 5.84,
        "sd2High": 7.44,
        "rejectLow": 5.44,
        "rejectHigh": 7.84,
        "unit": "μkat/L",
        "traceability": "C-RSE/IFCC ERM-AD453/IFCC (IRMM)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18010 lote 0001747"
      },
      {
        "id": "MG::18010::0001747::II::mg/dL::Azul de Xilidilo",
        "productCode": "18010",
        "lot": "0001747",
        "controlLevel": "level_2",
        "analyteName": "MAGNESIO",
        "methodName": "Azul de Xilidilo",
        "targetValue": 3.3,
        "sd1": 0.22,
        "sd1Low": 3.08,
        "sd1High": 3.52,
        "sd2Low": 2.86,
        "sd2High": 3.74,
        "rejectLow": 2.64,
        "rejectHigh": 3.96,
        "unit": "mg/dL",
        "traceability": "SRM 956 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18010 lote 0001747"
      },
      {
        "id": "MG::18042::59322::I::μkat/L::IFCC",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "MAGNESIO",
        "methodName": "IFCC",
        "targetValue": 3.58,
        "sd1": 0.21,
        "sd1Low": 3.37,
        "sd1High": 3.79,
        "sd2Low": 3.16,
        "sd2High": 4.0,
        "rejectLow": 2.94,
        "rejectHigh": 4.22,
        "unit": "μkat/L",
        "traceability": "C-RSE/IFCC ERM-AD453/IFCC (IRMM)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "MG::18042::59322::I::mg/dL::Azul de Xilidilo",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "MAGNESIO",
        "methodName": "Azul de Xilidilo",
        "targetValue": 1.58,
        "sd1": 0.11,
        "sd1Low": 1.47,
        "sd1High": 1.69,
        "sd2Low": 1.36,
        "sd2High": 1.8,
        "rejectLow": 1.26,
        "rejectHigh": 1.9,
        "unit": "mg/dL",
        "traceability": "SRM 956 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "MG::18042::59322::I::mmol/L::Azul de Xilidilo",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "MAGNESIO",
        "methodName": "Azul de Xilidilo",
        "targetValue": 0.647,
        "sd1": 0.043,
        "sd1Low": 0.604,
        "sd1High": 0.69,
        "sd2Low": 0.561,
        "sd2High": 0.733,
        "rejectLow": 0.518,
        "rejectHigh": 0.776,
        "unit": "mmol/L",
        "traceability": "SRM 956 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "MG::18043::58987::II::μkat/L::IFCC",
        "productCode": "18043",
        "lot": "58987",
        "controlLevel": "level_2",
        "analyteName": "MAGNESIO",
        "methodName": "IFCC",
        "targetValue": 6.94,
        "sd1": 0.42,
        "sd1Low": 6.52,
        "sd1High": 7.36,
        "sd2Low": 6.1,
        "sd2High": 7.78,
        "rejectLow": 5.69,
        "rejectHigh": 8.19,
        "unit": "μkat/L",
        "traceability": "C-RSE/IFCC ERM-AD453/IFCC (IRMM)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18043 lote 58987"
      },
      {
        "id": "MG::18043::58987::II::mg/dL::Azul de Xilidilo",
        "productCode": "18043",
        "lot": "58987",
        "controlLevel": "level_2",
        "analyteName": "MAGNESIO",
        "methodName": "Azul de Xilidilo",
        "targetValue": 3.28,
        "sd1": 0.22,
        "sd1Low": 3.06,
        "sd1High": 3.5,
        "sd2Low": 2.84,
        "sd2High": 3.72,
        "rejectLow": 2.62,
        "rejectHigh": 3.94,
        "unit": "mg/dL",
        "traceability": "SRM 956 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18043 lote 58987"
      },
      {
        "id": "MG::18054::0001036::I::NOUNIT::NOMETHOD",
        "productCode": "18054",
        "lot": "0001036",
        "controlLevel": "level_1",
        "analyteName": "MAGNESIO",
        "methodName": null,
        "targetValue": 0.598,
        "sd1": null,
        "sd1Low": null,
        "sd1High": null,
        "sd2Low": null,
        "sd2High": null,
        "rejectLow": 0.478,
        "rejectHigh": 0.718,
        "unit": null,
        "traceability": null,
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18054 lote 0001036"
      },
      {
        "id": "MG::18054::0001036::I::NOUNIT::NOMETHOD",
        "productCode": "18054",
        "lot": "0001036",
        "controlLevel": "level_1",
        "analyteName": "MAGNESIO",
        "methodName": null,
        "targetValue": 3.82,
        "sd1": null,
        "sd1Low": null,
        "sd1High": null,
        "sd2Low": null,
        "sd2High": null,
        "rejectLow": 3.06,
        "rejectHigh": 4.58,
        "unit": null,
        "traceability": null,
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18054 lote 0001036"
      },
      {
        "id": "MG::18066::0000619::II::NOUNIT::NOMETHOD",
        "productCode": "18066",
        "lot": "0000619",
        "controlLevel": "level_2",
        "analyteName": "MAGNESIO",
        "methodName": null,
        "targetValue": 13.5,
        "sd1": 0.9,
        "sd1Low": 12.6,
        "sd1High": 14.4,
        "sd2Low": 11.7,
        "sd2High": 15.3,
        "rejectLow": 10.8,
        "rejectHigh": 16.2,
        "unit": null,
        "traceability": null,
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18066 lote 0000619"
      },
      {
        "id": "MG::18066::0000619::II::NOUNIT::NOMETHOD",
        "productCode": "18066",
        "lot": "0000619",
        "controlLevel": "level_2",
        "analyteName": "MAGNESIO",
        "methodName": null,
        "targetValue": 13.2,
        "sd1": 0.9,
        "sd1Low": 12.3,
        "sd1High": 14.1,
        "sd2Low": 11.4,
        "sd2High": 15.0,
        "rejectLow": 10.6,
        "rejectHigh": 15.8,
        "unit": null,
        "traceability": null,
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18066 lote 0000619"
      }
    ],
    "missingFields": []
  },
  "NH3": {
    "displayCode": "NH3",
    "displayName": "Amonio",
    "canonicalNames": [
      "AMMONIA"
    ],
    "productEntries": [
      {
        "productCode": "12532",
        "platformFamily": "ax5",
        "itemName": "AMMONIA",
        "description": "AMMONIA A25 27 mL",
        "format": "27 mL",
        "systems": "A25",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "23532",
        "platformFamily": "bax00",
        "itemName": "AMMONIA",
        "description": "AMMONIA",
        "format": "1 x 20 + 1 x 7 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "23532"
      ],
      "BA200": [
        "23532"
      ],
      "A15": [
        "12532"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": false,
      "matchedProductCount": 2
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": null,
      "detectionLimitValue": 26.2,
      "detectionLimitUnit": "µmol/L",
      "detectionLimitAlternateValue": 44.5,
      "detectionLimitAlternateUnit": "µg/dL",
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 600.0,
      "linearityLimitUnit": "µmol/L",
      "linearityLimitAlternateValue": 1022.0,
      "linearityLimitAlternateUnit": "µg/dL",
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 30.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "la bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 50 mg/dL) no interfieren. Lipemia, la turbidez de la muestra interfiere en los resultados"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 50.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "la bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 50 mg/dL) no interfieren. Lipemia, la turbidez de la muestra interfiere en los resultados"
        }
      ],
      "procedureLimitations": [
        "la bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 50 mg/dL) no interfieren. Lipemia, la turbidez de la muestra interfiere en los resultados",
        "La bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 50 mg/dL) no interfieren. Lipemia, la turbidez de la muestra interfiere en los resultados"
      ],
      "notes": [
        "CONSERVACIÓN Y ESTABILIDAD Conservar a 2-8ºC. Los componentes son estables hasta la fecha de caducidad indicada en la etiqueta del kit, siempre que se conserven bien cerrados y se evite la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 40 días. Indicaciones de deterioro: Absorbancia del blanco inferior al límite indicado en “Parámetros de la prueba”.",
        " Límite de detección: 26,2 µmol/L = 44,5 µg/dL.  Límite de linealidad: 600 µmol/L = 1022 µg/dL. Cuando se obtengan valores superiores, diluir",
        "LIMITACIONES DEL PROCEDIMIENTO Interferencias: la bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 50 mg/dL) no interfieren. Lipemia, la turbidez de la muestra interfiere en los resultados. Otros medicamentos y sustancias pueden interferir6.",
        "CONSERVACIÓN Y ESTABILIDAD Conservar a 2-8ºC. Los componentes son estables hasta la fecha de caducidad indicada en la etiqueta del kit, siempre que se conserven bien cerrados y se evite la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estable 20 días. Indicaciones de deterioro: Absorbancia del blanco inferior al límite indicado en “Parámetros de la prueba”."
      ]
    },
    "qcReferences": [],
    "missingFields": [
      "Sin estabilidad a bordo"
    ]
  },
  "OX": {
    "displayCode": "OX",
    "displayName": "Oxalato",
    "canonicalNames": [
      "OXALATE"
    ],
    "productEntries": [
      {
        "productCode": "12539",
        "platformFamily": "ax5",
        "itemName": "OXALATE",
        "description": "OXALATE A25 25 mL",
        "format": "25 mL",
        "systems": "A25",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "23539",
        "platformFamily": "bax00",
        "itemName": "OXALATE",
        "description": "OXALATE",
        "format": "1x20mL + 1x5mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "23539"
      ],
      "BA200": [
        "23539"
      ],
      "A15": [
        "12539"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": false,
      "matchedProductCount": 2
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": 1440.0,
      "onboardStabilityUnit": "days",
      "onboardStabilityRaw": 60.0,
      "blankDeterioration": "high_blank_absorbance",
      "detectionLimitValue": 0.63,
      "detectionLimitUnit": "mg/L",
      "detectionLimitAlternateValue": 0.007,
      "detectionLimitAlternateUnit": "mmol/L",
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 180.0,
      "linearityLimitUnit": "mg/L",
      "linearityLimitAlternateValue": 2.0,
      "linearityLimitAlternateUnit": "mmol/L",
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 30.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 450 mg/dL), el ácido ascórbico (hasta 16 mmol/L) no interfieren"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 450.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 450 mg/dL), el ácido ascórbico (hasta 16 mmol/L) no interfieren"
        },
        {
          "interferent": "ascorbic_acid",
          "label": "Ácido ascórbico",
          "thresholdValue": 16.0,
          "unit": "mmol/L",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 450 mg/dL), el ácido ascórbico (hasta 16 mmol/L) no interfieren"
        }
      ],
      "procedureLimitations": [
        "La bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 450 mg/dL), el ácido ascórbico (hasta 16 mmol/L) no interfieren"
      ],
      "notes": [
        "CONSERVACIÓN Y ESTABILIDAD Conservar a 2-8ºC. Los componentes son estables hasta la fecha de caducidad indicada en la etiqueta del kit, siempre que se conserven bien cerrados y se evite la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 2 meses.",
        "Indicaciones de deterioro: Absorbancia del blanco superior al límite indicado en “Parámetros de la prueba”.",
        "CARACTERÍSTICAS METROLÓGICAS Las prestaciones metrológicas que se describen a continuación, han sido obtenidas utilizando un analizador BA400 y siguiendo las guías del Clinical & Laboratory Standards Institute (CLSI).  Límite de detección: 0,630 mg/L = 0,007 mmol/L.  Límite de linealidad: 180 mg/L = 2,00 mmol/L.",
        "LIMITACIONES DEL PROCEDIMIENTO  Interferencias: La bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 450 mg/dL), el ácido ascórbico"
      ]
    },
    "qcReferences": [],
    "missingFields": []
  },
  "PHOS": {
    "displayCode": "PHOS",
    "displayName": "Fósforo",
    "canonicalNames": [
      "PHOSPHORUS"
    ],
    "productEntries": [
      {
        "productCode": "11508",
        "platformFamily": "manual",
        "itemName": "PHOSPHORUS",
        "description": "PHOSPHORUS 170 mL",
        "format": "170 mL",
        "systems": null,
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 4
      },
      {
        "productCode": "12508",
        "platformFamily": "ax5",
        "itemName": "PHOSPHORUS",
        "description": "PHOSPHORUS BSA 3x24+2x15 mL",
        "format": "3x24+2x15 mL",
        "systems": "BSA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 4
      },
      {
        "productCode": "21518",
        "platformFamily": "bax00",
        "itemName": "PHOSPHORUS",
        "description": "PHOSPHORUS",
        "format": "4 x 50 + 4 x 20 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 4
      },
      {
        "productCode": "23518",
        "platformFamily": "bax00",
        "itemName": "PHOSPHORUS",
        "description": "PHOSPHORUS",
        "format": "1 x 50 + 1 x 20 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 4
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "21518",
        "23518"
      ],
      "BA200": [
        "21518",
        "23518"
      ],
      "A15": [
        "12508"
      ],
      "manual": [
        "11508"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": true,
      "matchedProductCount": 4
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 30.0,
      "onboardStabilityHours": 1440.0,
      "onboardStabilityUnit": "months",
      "onboardStabilityRaw": 2.0,
      "blankDeterioration": "high_blank_absorbance",
      "detectionLimitValue": 0.25,
      "detectionLimitUnit": "mg/dL",
      "detectionLimitAlternateValue": 0.08,
      "detectionLimitAlternateUnit": "mmol/L",
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 20.0,
      "linearityLimitUnit": "mg/dL",
      "linearityLimitAlternateValue": 6.46,
      "linearityLimitAlternateUnit": "mmol/L",
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 20.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "la bilirrubina (hasta 20 mg/dL), la hemólisis (hemoglobina hasta 1000 mg/dL) y lipemia (triglicéridos hasta 1000 mg/dL) no interfieren"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 1000.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "la bilirrubina (hasta 20 mg/dL), la hemólisis (hemoglobina hasta 1000 mg/dL) y lipemia (triglicéridos hasta 1000 mg/dL) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 1000.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "la bilirrubina (hasta 20 mg/dL), la hemólisis (hemoglobina hasta 1000 mg/dL) y lipemia (triglicéridos hasta 1000 mg/dL) no interfieren"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 10.0,
          "unit": "g/L",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "la hemoglobina (10 g/L), la lipemia (triglicéridos 10 g/L) y la bilirrubina"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 10.0,
          "unit": "g/L",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "lipemia (triglicéridos 10 g/L) y la bilirrubina (20 mg/dL) no interfieren"
        }
      ],
      "procedureLimitations": [
        "la bilirrubina (hasta 20 mg/dL), la hemólisis (hemoglobina hasta 1000 mg/dL) y lipemia (triglicéridos hasta 1000 mg/dL) no interfieren",
        "la hemoglobina (10 g/L), la lipemia (triglicéridos 10 g/L) y la bilirrubina (20 mg/dL) no interfieren"
      ],
      "notes": [
        "CONSERVACIÓN Y ESTABILIDAD Conservar a 2-30ºC. Los componentes son estables hasta la fecha de caducidad indicada en la etiqueta del kit, siempre que se conserven bien cerrados y se evite la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 2 meses. Indicaciones de deterioro: Absorbancia del blanco superior al límite indicado en “Parámetros de la prueba”.",
        "CARACTERÍSTICAS METROLÓGICAS Las prestaciones metrológicas que se describen a continuación, han sido obtenidas utilizando un analizador BA400 y siguiendo las guías del Clinical & Laboratory Standards Institute (CLSI).  Límite de detección: 0,25 mg/dL = 0,080 mmol/L.",
        " Límite de linealidad: 20 mg/dL = 6,46 mmol/L.",
        "LIMITACIONES DEL PROCEDIMIENTO  Interferencias: la bilirrubina (hasta 20 mg/dL), la hemólisis (hemoglobina hasta 1000 mg/dL) y lipemia (triglicéridos hasta 1000 mg/dL) no interfieren. Otros medicamentos y sustancias pueden interferir5."
      ]
    },
    "qcReferences": [
      {
        "id": "PHOS::18005::0004::I::mg/dL::Fosfomolibdato/UV",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "FÓSFORO",
        "methodName": "Fosfomolibdato/UV",
        "targetValue": 3.38,
        "sd1": 0.2,
        "sd1Low": 3.18,
        "sd1High": 3.58,
        "sd2Low": 2.98,
        "sd2High": 3.78,
        "rejectLow": 2.77,
        "rejectHigh": 3.99,
        "unit": "mg/dL",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "PHOS::18005::0004::I::mmol/L::Fosfomolibdato/UV",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "FÓSFORO",
        "methodName": "Fosfomolibdato/UV",
        "targetValue": 1.09,
        "sd1": 0.07,
        "sd1Low": 1.02,
        "sd1High": 1.16,
        "sd2Low": 0.95,
        "sd2High": 1.23,
        "rejectLow": 0.89,
        "rejectHigh": 1.29,
        "unit": "mmol/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "PHOS::18009::0001739::I::mg/dL::Fosfomolibdato/UV",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "FÓSFORO",
        "methodName": "Fosfomolibdato/UV",
        "targetValue": 3.38,
        "sd1": 0.2,
        "sd1Low": 3.18,
        "sd1High": 3.58,
        "sd2Low": 2.98,
        "sd2High": 3.78,
        "rejectLow": 2.77,
        "rejectHigh": 3.99,
        "unit": "mg/dL",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "PHOS::18009::0001739::I::mmol/L::Fosfomolibdato/UV",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "FÓSFORO",
        "methodName": "Fosfomolibdato/UV",
        "targetValue": 1.09,
        "sd1": 0.07,
        "sd1Low": 1.02,
        "sd1High": 1.16,
        "sd2Low": 0.95,
        "sd2High": 1.23,
        "rejectLow": 0.89,
        "rejectHigh": 1.29,
        "unit": "mmol/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "PHOS::18010::0001747::II::mmol/L::Acil-Coa oxidasa/peroxidasa",
        "productCode": "18010",
        "lot": "0001747",
        "controlLevel": "level_2",
        "analyteName": "FÓSFORO",
        "methodName": "Acil-Coa oxidasa/peroxidasa",
        "targetValue": 0.548,
        "sd1": 0.037,
        "sd1Low": 0.511,
        "sd1High": 0.585,
        "sd2Low": 0.474,
        "sd2High": 0.622,
        "rejectLow": 0.438,
        "rejectHigh": 0.658,
        "unit": "mmol/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18010 lote 0001747"
      },
      {
        "id": "PHOS::18010::0001747::II::mg/dL::Fosfomolibdato/UV",
        "productCode": "18010",
        "lot": "0001747",
        "controlLevel": "level_2",
        "analyteName": "FÓSFORO",
        "methodName": "Fosfomolibdato/UV",
        "targetValue": 8.67,
        "sd1": 0.52,
        "sd1Low": 8.15,
        "sd1High": 9.19,
        "sd2Low": 7.63,
        "sd2High": 9.71,
        "rejectLow": 7.11,
        "rejectHigh": 10.23,
        "unit": "mg/dL",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18010 lote 0001747"
      },
      {
        "id": "PHOS::18042::59322::I::mg/dL::Fosfomolibdato/UV",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "FÓSFORO",
        "methodName": "Fosfomolibdato/UV",
        "targetValue": 3.88,
        "sd1": 0.23,
        "sd1Low": 3.65,
        "sd1High": 4.11,
        "sd2Low": 3.42,
        "sd2High": 4.34,
        "rejectLow": 3.18,
        "rejectHigh": 4.58,
        "unit": "mg/dL",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "PHOS::18042::59322::I::mmol/L::Fosfomolibdato/UV",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "FÓSFORO",
        "methodName": "Fosfomolibdato/UV",
        "targetValue": 1.25,
        "sd1": 0.08,
        "sd1Low": 1.17,
        "sd1High": 1.33,
        "sd2Low": 1.09,
        "sd2High": 1.41,
        "rejectLow": 1.03,
        "rejectHigh": 1.48,
        "unit": "mmol/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "PHOS::18043::58987::II::mmol/L::Acil-Coa oxidasa/peroxidasa",
        "productCode": "18043",
        "lot": "58987",
        "controlLevel": "level_2",
        "analyteName": "FÓSFORO",
        "methodName": "Acil-Coa oxidasa/peroxidasa",
        "targetValue": 0.684,
        "sd1": 0.046,
        "sd1Low": 0.638,
        "sd1High": 0.73,
        "sd2Low": 0.592,
        "sd2High": 0.776,
        "rejectLow": 0.547,
        "rejectHigh": 0.821,
        "unit": "mmol/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18043 lote 58987"
      },
      {
        "id": "PHOS::18043::58987::II::mg/dL::Fosfomolibdato/UV",
        "productCode": "18043",
        "lot": "58987",
        "controlLevel": "level_2",
        "analyteName": "FÓSFORO",
        "methodName": "Fosfomolibdato/UV",
        "targetValue": 9.88,
        "sd1": 0.59,
        "sd1Low": 9.29,
        "sd1High": 10.47,
        "sd2Low": 8.7,
        "sd2High": 11.06,
        "rejectLow": 8.1,
        "rejectHigh": 11.66,
        "unit": "mg/dL",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18043 lote 58987"
      },
      {
        "id": "PHOS::18054::0001036::I::NOUNIT::NOMETHOD",
        "productCode": "18054",
        "lot": "0001036",
        "controlLevel": "level_1",
        "analyteName": "FÓSFORO",
        "methodName": null,
        "targetValue": 1.56,
        "sd1": null,
        "sd1Low": null,
        "sd1High": null,
        "sd2Low": null,
        "sd2High": null,
        "rejectLow": 1.25,
        "rejectHigh": 1.87,
        "unit": null,
        "traceability": null,
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18054 lote 0001036"
      },
      {
        "id": "PHOS::18054::0001036::I::NOUNIT::NOMETHOD",
        "productCode": "18054",
        "lot": "0001036",
        "controlLevel": "level_1",
        "analyteName": "FÓSFORO",
        "methodName": null,
        "targetValue": 37.1,
        "sd1": 2.5,
        "sd1Low": 34.6,
        "sd1High": 39.6,
        "sd2Low": 32.1,
        "sd2High": 42.1,
        "rejectLow": 29.7,
        "rejectHigh": 44.5,
        "unit": null,
        "traceability": null,
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18054 lote 0001036"
      },
      {
        "id": "PHOS::18066::0000619::II::NOUNIT::NOMETHOD",
        "productCode": "18066",
        "lot": "0000619",
        "controlLevel": "level_2",
        "analyteName": "FÓSFORO",
        "methodName": null,
        "targetValue": 5.42,
        "sd1": null,
        "sd1Low": null,
        "sd1High": null,
        "sd2Low": null,
        "sd2High": null,
        "rejectLow": 4.34,
        "rejectHigh": 6.5,
        "unit": null,
        "traceability": null,
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18066 lote 0000619"
      },
      {
        "id": "PHOS::18066::0000619::II::NOUNIT::NOMETHOD",
        "productCode": "18066",
        "lot": "0000619",
        "controlLevel": "level_2",
        "analyteName": "FÓSFORO",
        "methodName": null,
        "targetValue": 71.9,
        "sd1": 4.8,
        "sd1Low": 67.1,
        "sd1High": 76.7,
        "sd2Low": 62.3,
        "sd2High": 81.5,
        "rejectLow": 57.5,
        "rejectHigh": 86.3,
        "unit": null,
        "traceability": null,
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18066 lote 0000619"
      }
    ],
    "missingFields": []
  },
  "PROTEINAS_": {
    "displayCode": "PROTEINAS_",
    "displayName": "PROTEINAS_",
    "canonicalNames": [
      "PROTEINAS"
    ],
    "productEntries": [],
    "productCodesByPlatform": {},
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": false,
      "hasValuesheet": false,
      "matchedProductCount": 0
    },
    "facts": {
      "storageTempMinC": null,
      "storageTempMaxC": null,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": null,
      "detectionLimitValue": null,
      "detectionLimitUnit": null,
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": null,
      "linearityLimitUnit": null,
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [],
      "procedureLimitations": [],
      "notes": []
    },
    "qcReferences": [],
    "missingFields": [
      "Sin producto enlazado",
      "Sin IFU descargado",
      "Sin temperatura de conservación",
      "Sin estabilidad a bordo",
      "Sin límite de linealidad",
      "Sin LOD/LOQ estructurado",
      "Sin umbrales de interferencia"
    ]
  },
  "PROTEINA_C": {
    "displayCode": "PROT C",
    "displayName": "Proteína C reactiva",
    "canonicalNames": [
      "C REACTIVE PROTEIN CRP",
      "PROTEINA C REACTIVA PCR",
      "PROTEINA C REACTIVA",
      "CRP"
    ],
    "productEntries": [
      {
        "productCode": "13921",
        "platformFamily": "other",
        "itemName": "C-REACTIVE PROTEIN (CRP)",
        "description": "C-REACTIVE PROTEIN (CRP) 2x50 mL",
        "format": "2x50 mL",
        "systems": null,
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "other": [
        "13921"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": false,
      "matchedProductCount": 1
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": "high_blank_absorbance",
      "detectionLimitValue": 1.2,
      "detectionLimitUnit": "mg/L",
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 150.0,
      "linearityLimitUnit": "mg/L",
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [
        {
          "interferent": "rheumatoid_factor",
          "label": "Factor reumatoide",
          "thresholdValue": 200.0,
          "unit": "UI/mL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "El factor reumatoide (200 UI/mL) no interfiere."
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 10.0,
          "unit": "g/L",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "hemólisis (hemoglobina 10 g/L), la bilirrubina (20 mg/dL) y el factor reumatoide (200 UI/mL) no interfieren"
        },
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 20.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "bilirrubina (20 mg/dL) y el factor reumatoide (200 UI/mL) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 10.0,
          "unit": "g/L",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "lipemia (triglicéridos 10 g/L), la hemólisis (hemoglobina 10 g/L), la bilirrubina (20 mg/dL) y el factor reumatoide (200 UI/mL) no interfieren"
        }
      ],
      "procedureLimitations": [
        "La lipemia (triglicéridos 10 g/L), la hemólisis (hemoglobina 10 g/L), la bilirrubina (20 mg/dL) y el factor reumatoide (200 UI/mL) no interfieren"
      ],
      "notes": [
        "Conservar a 2-8ºC. Los Reactivos son estables hasta la fecha de caducidad indicada en la etiqueta, siempre que se conserven bien cerrados y se evite la contaminación durante su uso.",
        "Indicaciones de deterioro: − Reactivos: Absorbancia del blanco superior al límite indicado en “Parámetros del ensayo”.",
        "− Límite de detección: 1,20 mg/L",
        "− Límite de linealidad: 150 mg/L. Cuando se obtengan valores superiores, diluir la muestra 1/5",
        "− Interferencias: La lipemia (trigliceridos 10 g/L), la hemólisis (hemoglobina 10 g/L), la bilirrubina (20 mg/dL) y el factor reumatoide (200 UI/mL) no interfieren. Otros medicamentos y sustancias pueden interferir6."
      ]
    },
    "qcReferences": [],
    "missingFields": [
      "Sin estabilidad a bordo"
    ]
  },
  "PROTEINA_T": {
    "displayCode": "PROTEINA_T",
    "displayName": "PROTEINA_T",
    "canonicalNames": [
      "PROTEINA T"
    ],
    "productEntries": [],
    "productCodesByPlatform": {},
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": false,
      "hasValuesheet": false,
      "matchedProductCount": 0
    },
    "facts": {
      "storageTempMinC": null,
      "storageTempMaxC": null,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": null,
      "detectionLimitValue": null,
      "detectionLimitUnit": null,
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": null,
      "linearityLimitUnit": null,
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [],
      "procedureLimitations": [],
      "notes": []
    },
    "qcReferences": [],
    "missingFields": [
      "Sin producto enlazado",
      "Sin IFU descargado",
      "Sin temperatura de conservación",
      "Sin estabilidad a bordo",
      "Sin límite de linealidad",
      "Sin LOD/LOQ estructurado",
      "Sin umbrales de interferencia"
    ]
  },
  "PROT_T": {
    "displayCode": "PROT T",
    "displayName": "Proteína total",
    "canonicalNames": [
      "PROTEIN TOTAL",
      "PROTEIN TOTAL BIREAGENT",
      "PROTEIN TOTAL"
    ],
    "productEntries": [
      {
        "productCode": "11500",
        "platformFamily": "manual",
        "itemName": "PROTEIN (TOTAL)",
        "description": "PROTEIN (TOTAL) 2x250 mL",
        "format": "2x250 mL",
        "systems": null,
        "ifuDocs": 0,
        "valuesheetDocs": 0,
        "totalDocs": 0
      },
      {
        "productCode": "12500",
        "platformFamily": "ax5",
        "itemName": "PROTEIN (TOTAL)",
        "description": "PROTEIN (TOTAL) BSA 10x50 mL",
        "format": "10x50 mL",
        "systems": "BSA",
        "ifuDocs": 0,
        "valuesheetDocs": 0,
        "totalDocs": 0
      },
      {
        "productCode": "21513",
        "platformFamily": "bax00",
        "itemName": "PROTEIN (TOTAL)",
        "description": "PROTEIN (TOTAL)",
        "format": "2 x 60 + 2 x 20 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "23513",
        "platformFamily": "bax00",
        "itemName": "PROTEIN (TOTAL) BIREAGENT",
        "description": "PROTEIN (TOTAL) BIREAGENT BA 1x60+1x20mL",
        "format": "1x60+1x20mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "21513",
        "23513"
      ],
      "BA200": [
        "21513",
        "23513"
      ],
      "A15": [
        "12500"
      ],
      "manual": [
        "11500"
      ]
    },
    "missingIfuCodes": [
      "11500",
      "12500"
    ],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": false,
      "matchedProductCount": 4
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 30.0,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": "high_blank_absorbance",
      "detectionLimitValue": 0.8,
      "detectionLimitUnit": "g/L",
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 150.0,
      "linearityLimitUnit": "g/L",
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 30.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "la bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 975 mg/dL) no interfieren"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 500.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "la bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 975 mg/dL) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 975.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "la bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 975 mg/dL) no interfieren"
        }
      ],
      "procedureLimitations": [
        "la bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 975 mg/dL) no interfieren"
      ],
      "notes": [
        "CONSERVACIÓN Y ESTABILIDAD Conservar a 2-30ºC. Los componentes son estables hasta la fecha de caducidad indicada en la etiqueta del kit, siempre que se conserven bien cerrados y se evite la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 42 días. Indicaciones de deterioro: Absorbancia del blanco superior al límite indicado en “Parámetros de la prueba”.",
        "CONTROL DE CALIDAD Se recomienda el uso de los Sueros Control Bioquímica niveles I (cod. 18005, 18009 y 18042) y II (cod. 18007, 18010 y 18043) para verificar la exactitud del procedimiento de medida. Cada laboratorio debe establecer su propio programa de Control de Calidad interno, así como procedimientos de corrección en el caso de que los resultados de los controles no se encuentren entre los límites de aceptación.",
        "Límite de linealidad: 150 g/L",
        "LIMITACIONES DEL PROCEDIMIENTO  Interferencias: la bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 975 mg/dL) no interfieren. Otros medicamentos y sustancias pueden interferir5."
      ]
    },
    "qcReferences": [],
    "missingFields": [
      "Sin estabilidad a bordo"
    ]
  },
  "PROT_U": {
    "displayCode": "PROT U",
    "displayName": "Proteína en orina",
    "canonicalNames": [
      "PROTEIN URINE",
      "PROTEIN URINE",
      "PROTEIN URINE",
      "PROTEIN URINE"
    ],
    "productEntries": [
      {
        "productCode": "21512",
        "platformFamily": "bax00",
        "itemName": "PROTEIN (URINE)",
        "description": "PROTEIN (URINE)",
        "format": "8 x 20 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "21512"
      ],
      "BA200": [
        "21512"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": false,
      "matchedProductCount": 1
    },
    "facts": {
      "storageTempMinC": 15.0,
      "storageTempMaxC": 30.0,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": "high_blank_absorbance",
      "detectionLimitValue": 26.0,
      "detectionLimitUnit": "mg/L",
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 2000.0,
      "linearityLimitUnit": "mg/L",
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 20.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La bilirrubina (20 mg/dL) no interfiere."
        }
      ],
      "procedureLimitations": [
        "La bilirrubina (20 mg/dL) no interfiere. La hemólisis interfiere"
      ],
      "notes": [
        "CONSERVACIÓN Y ESTABILIDAD Conservar a 15-30ºC. Los componentes son estables hasta la fecha de caducidad indicada en la etiqueta del kit, siempre que se conserven bien cerrados y se evite la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 2 meses. Indicaciones de deterioro: Absorbancia del blanco superior al límite indicado en “Parámetros de la prueba”.",
        "S. Patrón de Proteína (Orina) (BioSystems Cod. 11603). Albúmina bovina. La concentración viene indicada en la etiqueta del vial. El valor de concentración es trazable al Material de Referencia Certificado SRM 927 (National Institute of Standards and Technology, NIST). Conservar a 2-8ºC, una vez abierto. Estable hasta la fecha de caducidad indicada en la etiqueta, siempre que se conserve bien cerrado y se evite la contaminación durante su uso.",
        "CARACTERÍSTICAS METROLÓGICAS Las prestaciones metrológicas que se describen a continuación, han sido obtenidas utilizando un analizador BA400 y siguiendo las guías del Clinical & Laboratory Standards Institute (CLSI).  Límite de detección: 26,0 mg/L.",
        " Límite de linealidad: 2000 mg/L.",
        "LIMITACIONES DEL PROCEDIMIENTO  Interferencias: La bilirrubina (20 mg/dL) no medicamentos y sustancias pueden interferir2."
      ]
    },
    "qcReferences": [],
    "missingFields": [
      "Sin estabilidad a bordo"
    ]
  },
  "TBA": {
    "displayCode": "TBA",
    "displayName": "Ácidos biliares totales",
    "canonicalNames": [
      "TOTAL BILE ACIDS",
      "TBA"
    ],
    "productEntries": [
      {
        "productCode": "23551",
        "platformFamily": "bax00",
        "itemName": "TOTAL BILE ACIDS",
        "description": "TOTAL BILE ACIDS",
        "format": "1 x 60 + 1 x 20 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "23551"
      ],
      "BA200": [
        "23551"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": true,
      "matchedProductCount": 1
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": 1440.0,
      "onboardStabilityUnit": "months",
      "onboardStabilityRaw": 2.0,
      "blankDeterioration": "high_blank_absorbance",
      "detectionLimitValue": 0.7,
      "detectionLimitUnit": "μmol/L",
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 200.0,
      "linearityLimitUnit": "μmol/L",
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 50.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "El ácido ascórbico (hasta 50 mg/dL), la bilirrubina (hasta 50 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 2000 mg/dL) no interfieren"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 500.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "El ácido ascórbico (hasta 50 mg/dL), la bilirrubina (hasta 50 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 2000 mg/dL) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 2000.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "El ácido ascórbico (hasta 50 mg/dL), la bilirrubina (hasta 50 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 2000 mg/dL) no interfieren"
        },
        {
          "interferent": "ascorbic_acid",
          "label": "Ácido ascórbico",
          "thresholdValue": 50.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "El ácido ascórbico (hasta 50 mg/dL), la bilirrubina (hasta 50 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 2000 mg/dL) no interfieren"
        }
      ],
      "procedureLimitations": [
        "El ácido ascórbico (hasta 50 mg/dL), la bilirrubina (hasta 50 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y la lipemia (triglicéridos hasta 2000 mg/dL) no interfieren"
      ],
      "notes": [
        "CONSERVACIÓN Y ESTABILIDAD Conservar a 2-8ºC. Los componentes son estables hasta la fecha de caducidad indicada en la etiqueta del kit, siempre que se conserven bien cerrados y se evite la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 2 meses. Indicaciones de deterioro: Absorbancia del blanco superior al límite indicado en “Parámetros de la prueba”.",
        "LIMITACIONES DEL PROCEDIMIENTO − Interferencias: El ácido ascórbico (hasta 50 mg/dL), la bilirrubina (hasta 50 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 2000 mg/dL) no interfieren. Otros medicamentos y sustancias pueden interferir1."
      ]
    },
    "qcReferences": [
      {
        "id": "TBA::18005::0004::I::μmol/L::Enzimático cíclico",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "ÀCIDOS BILIARES TOTALES",
        "methodName": "Enzimático cíclico",
        "targetValue": 16.4,
        "sd1": 1.0,
        "sd1Low": 15.4,
        "sd1High": 17.4,
        "sd2Low": 14.4,
        "sd2High": 18.4,
        "rejectLow": 13.4,
        "rejectHigh": 19.4,
        "unit": "μmol/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "TBA::18009::0001739::I::μmol/L::Enzimático cíclico",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "ÀCIDOS BILIARES TOTALES",
        "methodName": "Enzimático cíclico",
        "targetValue": 16.4,
        "sd1": 1.0,
        "sd1Low": 15.4,
        "sd1High": 17.4,
        "sd2Low": 14.4,
        "sd2High": 18.4,
        "rejectLow": 13.4,
        "rejectHigh": 19.4,
        "unit": "μmol/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "TBA::18010::0001747::II::μmol/L::Enzimático cíclico",
        "productCode": "18010",
        "lot": "0001747",
        "controlLevel": "level_2",
        "analyteName": "ÀCIDOS BILIARES TOTALES",
        "methodName": "Enzimático cíclico",
        "targetValue": 121.0,
        "sd1": 7.0,
        "sd1Low": 114.0,
        "sd1High": 128.0,
        "sd2Low": 107.0,
        "sd2High": 135.0,
        "rejectLow": 99.0,
        "rejectHigh": 143.0,
        "unit": "μmol/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18010 lote 0001747"
      },
      {
        "id": "TBA::18042::59322::I::μmol/L::Enzimático cíclico",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "ÀCIDOS BILIARES TOTALES",
        "methodName": "Enzimático cíclico",
        "targetValue": 16.7,
        "sd1": 1.0,
        "sd1Low": 15.7,
        "sd1High": 17.7,
        "sd2Low": 14.7,
        "sd2High": 18.7,
        "rejectLow": 13.7,
        "rejectHigh": 19.7,
        "unit": "μmol/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "TBA::18043::58987::II::μmol/L::Enzimático cíclico",
        "productCode": "18043",
        "lot": "58987",
        "controlLevel": "level_2",
        "analyteName": "ÀCIDOS BILIARES TOTALES",
        "methodName": "Enzimático cíclico",
        "targetValue": 97.5,
        "sd1": 5.9,
        "sd1Low": 91.6,
        "sd1High": 103.4,
        "sd2Low": 85.7,
        "sd2High": 109.3,
        "rejectLow": 80.0,
        "rejectHigh": 115.1,
        "unit": "μmol/L",
        "traceability": "BMC",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18043 lote 58987"
      }
    ],
    "missingFields": []
  },
  "TG": {
    "displayCode": "TG",
    "displayName": "Triglicéridos",
    "canonicalNames": [
      "TRIGLYCERIDES"
    ],
    "productEntries": [
      {
        "productCode": "11528",
        "platformFamily": "manual",
        "itemName": "TRIGLYCERIDES",
        "description": "TRIGLYCERIDES 4x50 mL",
        "format": "4x50 mL",
        "systems": null,
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "11529",
        "platformFamily": "manual",
        "itemName": "TRIGLYCERIDES",
        "description": "TRIGLYCERIDES 2x250 mL",
        "format": "2x250 mL",
        "systems": null,
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "12528",
        "platformFamily": "ax5",
        "itemName": "TRIGLYCERIDES",
        "description": "TRIGLYCERIDES BSA 10 x 50 mL",
        "format": "10 x 50 mL",
        "systems": "BSA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "21528",
        "platformFamily": "bax00",
        "itemName": "TRIGLYCERIDES",
        "description": "TRIGLYCERIDES",
        "format": "10 x 60 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "23528",
        "platformFamily": "bax00",
        "itemName": "TRIGLYCERIDES",
        "description": "TRIGLYCERIDES",
        "format": "4 x 60 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "21528",
        "23528"
      ],
      "BA200": [
        "21528",
        "23528"
      ],
      "A15": [
        "12528"
      ],
      "manual": [
        "11528",
        "11529"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": false,
      "matchedProductCount": 5
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": 1440.0,
      "onboardStabilityUnit": "months",
      "onboardStabilityRaw": 2.0,
      "blankDeterioration": "high_blank_absorbance",
      "detectionLimitValue": 5.99,
      "detectionLimitUnit": "mg/dL",
      "detectionLimitAlternateValue": 0.067,
      "detectionLimitAlternateUnit": "mmol/L",
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 600.0,
      "linearityLimitUnit": "mg/dL",
      "linearityLimitAlternateValue": 6.78,
      "linearityLimitAlternateUnit": "mmol/L",
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 2.5,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La hemólisis (hemoglobina hasta 1000 mg/dL), la bilirrubina (hasta 2,5 mg/dL) no interfieren. El ácido ascórbico (hasta 5 mg/dL) no interfiere"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 1000.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La hemólisis (hemoglobina hasta 1000 mg/dL), la bilirrubina (hasta 2,5 mg/dL) no interfieren. El ácido ascórbico (hasta 5 mg/dL) no interfiere"
        },
        {
          "interferent": "ascorbic_acid",
          "label": "Ácido ascórbico",
          "thresholdValue": 5.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La hemólisis (hemoglobina hasta 1000 mg/dL), la bilirrubina (hasta 2,5 mg/dL) no interfieren. El ácido ascórbico (hasta 5 mg/dL) no interfiere"
        }
      ],
      "procedureLimitations": [
        "La hemólisis (hemoglobina hasta 1000 mg/dL), la bilirrubina (hasta 2,5 mg/dL) no interfieren. El ácido ascórbico (hasta 5 mg/dL) no interfiere"
      ],
      "notes": [
        "CONSERVACIÓN Y ESTABILIDAD Conservar a 2-8 ºC. Los componentes son estables hasta la fecha de caducidad indicada en la etiqueta del kit, siempre que se conserven bien cerrados y se evite la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 2 meses. Indicaciones de deterioro: Absorbancia del blanco superior al límite indicado en “Parámetros de la prueba”.",
        "CARACTERÍSTICAS METROLÓGICAS Las prestaciones metrológicas que se describen a continuación, han sido obtenidas utilizando un analizador BA400 y siguiendo las guías del Clinical & Laboratory Standards Institute (CLSI).  Límite de detección: 5,99 mg/dL = 0,067 mmol/L.",
        " Límite de linealidad: 600 mg/dL = 6,78 mmol/L.",
        "LIMITACIONES DEL PROCEDIMIENTO  Interferencias: La hemólisis (hemoglobina hasta 1000 mg/dL), la bilirrubina (hasta 2,5 mg/dL) no interfieren. El ácido ascórbico (hasta 5 mg/dL) no interfiere. Otros medicamentos y sustancias pueden interferir5."
      ]
    },
    "qcReferences": [],
    "missingFields": []
  },
  "TRIGLICERI": {
    "displayCode": "TRIGLICERI",
    "displayName": "TRIGLICERI",
    "canonicalNames": [
      "TRIGLICERI"
    ],
    "productEntries": [],
    "productCodesByPlatform": {},
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": false,
      "hasValuesheet": false,
      "matchedProductCount": 0
    },
    "facts": {
      "storageTempMinC": null,
      "storageTempMaxC": null,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": null,
      "detectionLimitValue": null,
      "detectionLimitUnit": null,
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": null,
      "linearityLimitUnit": null,
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [],
      "procedureLimitations": [],
      "notes": []
    },
    "qcReferences": [],
    "missingFields": [
      "Sin producto enlazado",
      "Sin IFU descargado",
      "Sin temperatura de conservación",
      "Sin estabilidad a bordo",
      "Sin límite de linealidad",
      "Sin LOD/LOQ estructurado",
      "Sin umbrales de interferencia"
    ]
  },
  "UREA_COLOR": {
    "displayCode": "UREA",
    "displayName": "Urea colorimétrica",
    "canonicalNames": [
      "UREA COLOR",
      "UREA BUN COLOR"
    ],
    "productEntries": [
      {
        "productCode": "11536",
        "platformFamily": "manual",
        "itemName": "UREA/BUN - COLOR",
        "description": "UREA/BUN - COLOR 4x50 mL",
        "format": "4x50 mL",
        "systems": null,
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "11537",
        "platformFamily": "manual",
        "itemName": "UREA/BUN - COLOR",
        "description": "UREA/BUN - COLOR 2x250 mL",
        "format": "2x250 mL",
        "systems": null,
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "manual": [
        "11536",
        "11537"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": true,
      "matchedProductCount": 2
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": null,
      "onboardStabilityUnit": null,
      "onboardStabilityRaw": null,
      "blankDeterioration": "high_blank_absorbance",
      "detectionLimitValue": 1.3,
      "detectionLimitUnit": "mg/dL",
      "detectionLimitAlternateValue": 0.6,
      "detectionLimitAlternateUnit": "mg/dL",
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 300.0,
      "linearityLimitUnit": "mg/dL",
      "linearityLimitAlternateValue": 140.0,
      "linearityLimitAlternateUnit": "mg/dL",
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 20.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La lipemia (triglicéridos 10 g/L) y la bilirrubina (20 mg/dL) no interfieren. La interfieren. Otros"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 2.0,
          "unit": "g/L",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La lipemia (triglicéridos 10 g/L) y la bilirrubina (20 mg/dL) no interfieren. La interfieren. Otros"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 10.0,
          "unit": "g/L",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La lipemia (triglicéridos 10 g/L) y la bilirrubina (20 mg/dL) no interfieren. La interfieren. Otros"
        }
      ],
      "procedureLimitations": [
        "La lipemia (triglicéridos 10 g/L) y la bilirrubina (20 mg/dL) no interfieren. La interfieren. Otros (hemoglobina 2 g/L) y niveles elevados de amonio hemólisis medicamentos y sustancias pueden interferir5"
      ],
      "notes": [
        "CONSERVAR A 2-8ºC",
        "CONSERVACIÓN Conservar a 2-8ºC. Los Reactivos y el Patrón son estables hasta la fecha de caducidad indicada en la etiqueta, siempre que se conserven bien cerrados y se evite la contaminación durante su uso. Indicaciones de deterioro:  Reactivos: Presencia de partículas, turbidez, absorbancia del blanco superior a 0,250 a 600",
        "CARACTERÍSTICAS METROLÓGICAS  Límite de detección: 1,3 mg/dL urea = 0,60 mg/dL BUN = 0,21 mmol/L urea.  Límite de linealidad: 300 mg/dL urea = 140 mg/dL BUN = 50 mmol/L urea. Cuando se obtengan valores superiores, diluir la muestra 1/5 con agua destilada y repetir la medición.",
        "Límite de linealidad: 300 mg/dL urea = 140 mg/dL",
        " Interferencias: La lipemia (triglicéridos 10 g/L) y la bilirrubina (20 mg/dL) no interfieren. La interfieren. Otros"
      ]
    },
    "qcReferences": [
      {
        "id": "UREA_COLOR::18005::0004::I::mg/dL::Ureasa - Color",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "UREA",
        "methodName": "Ureasa - Color",
        "targetValue": 54.0,
        "sd1": 3.6,
        "sd1Low": 50.4,
        "sd1High": 57.6,
        "sd2Low": 46.8,
        "sd2High": 61.2,
        "rejectLow": 43.2,
        "rejectHigh": 64.8,
        "unit": "mg/dL",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "UREA_COLOR::18005::0004::I::mmol/L::Ureasa - Color",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "UREA",
        "methodName": "Ureasa - Color",
        "targetValue": 8.96,
        "sd1": 0.6,
        "sd1Low": 8.36,
        "sd1High": 9.56,
        "sd2Low": 7.76,
        "sd2High": 10.16,
        "rejectLow": 7.17,
        "rejectHigh": 10.75,
        "unit": "mmol/L",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "UREA_COLOR::18009::0001739::I::mg/dL::Ureasa - Color",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "UREA",
        "methodName": "Ureasa - Color",
        "targetValue": 54.0,
        "sd1": 3.6,
        "sd1Low": 50.4,
        "sd1High": 57.6,
        "sd2Low": 46.8,
        "sd2High": 61.2,
        "rejectLow": 43.2,
        "rejectHigh": 64.8,
        "unit": "mg/dL",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "UREA_COLOR::18009::0001739::I::mmol/L::Ureasa - Color",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "UREA",
        "methodName": "Ureasa - Color",
        "targetValue": 8.96,
        "sd1": 0.6,
        "sd1Low": 8.36,
        "sd1High": 9.56,
        "sd2Low": 7.76,
        "sd2High": 10.16,
        "rejectLow": 7.17,
        "rejectHigh": 10.75,
        "unit": "mmol/L",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "UREA_COLOR::18010::0001747::II::mg/dL::Ureasa - Color",
        "productCode": "18010",
        "lot": "0001747",
        "controlLevel": "level_2",
        "analyteName": "UREA",
        "methodName": "Ureasa - Color",
        "targetValue": 129.0,
        "sd1": 6.0,
        "sd1Low": 123.0,
        "sd1High": 135.0,
        "sd2Low": 117.0,
        "sd2High": 141.0,
        "rejectLow": 110.0,
        "rejectHigh": 148.0,
        "unit": "mg/dL",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18010 lote 0001747"
      },
      {
        "id": "UREA_COLOR::18010::0001747::II::mmol/L::Ureasa - Color",
        "productCode": "18010",
        "lot": "0001747",
        "controlLevel": "level_2",
        "analyteName": "UREA",
        "methodName": "Ureasa - Color",
        "targetValue": 21.5,
        "sd1": 1.1,
        "sd1Low": 20.4,
        "sd1High": 22.6,
        "sd2Low": 19.3,
        "sd2High": 23.7,
        "rejectLow": 18.3,
        "rejectHigh": 24.7,
        "unit": "mmol/L",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18010 lote 0001747"
      },
      {
        "id": "UREA_COLOR::18042::59322::I::mg/dL::Ureasa - Color",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "UREA",
        "methodName": "Ureasa - Color",
        "targetValue": 56.0,
        "sd1": 3.7,
        "sd1Low": 52.3,
        "sd1High": 59.7,
        "sd2Low": 48.6,
        "sd2High": 63.4,
        "rejectLow": 44.8,
        "rejectHigh": 67.2,
        "unit": "mg/dL",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "UREA_COLOR::18042::59322::I::mmol/L::Ureasa - Color",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "UREA",
        "methodName": "Ureasa - Color",
        "targetValue": 9.3,
        "sd1": 0.62,
        "sd1Low": 8.68,
        "sd1High": 9.92,
        "sd2Low": 8.06,
        "sd2High": 10.54,
        "rejectLow": 7.44,
        "rejectHigh": 11.16,
        "unit": "mmol/L",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "UREA_COLOR::18043::58987::II::mg/dL::Ureasa - Color",
        "productCode": "18043",
        "lot": "58987",
        "controlLevel": "level_2",
        "analyteName": "UREA",
        "methodName": "Ureasa - Color",
        "targetValue": 134.0,
        "sd1": 7.0,
        "sd1Low": 127.0,
        "sd1High": 141.0,
        "sd2Low": 120.0,
        "sd2High": 148.0,
        "rejectLow": 114.0,
        "rejectHigh": 154.0,
        "unit": "mg/dL",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18043 lote 58987"
      },
      {
        "id": "UREA_COLOR::18043::58987::II::mmol/L::Ureasa - Color",
        "productCode": "18043",
        "lot": "58987",
        "controlLevel": "level_2",
        "analyteName": "UREA",
        "methodName": "Ureasa - Color",
        "targetValue": 22.3,
        "sd1": 1.1,
        "sd1Low": 21.2,
        "sd1High": 23.4,
        "sd2Low": 20.1,
        "sd2High": 24.5,
        "rejectLow": 19.0,
        "rejectHigh": 25.6,
        "unit": "mmol/L",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18043 lote 58987"
      }
    ],
    "missingFields": [
      "Sin estabilidad a bordo"
    ]
  },
  "UREA_UV": {
    "displayCode": "UREA UV",
    "displayName": "Urea UV",
    "canonicalNames": [
      "UREA UV",
      "UREA BUN UV"
    ],
    "productEntries": [
      {
        "productCode": "11516",
        "platformFamily": "manual",
        "itemName": "UREA/BUN - UV",
        "description": "UREA/BUN - UV 4x50 mL",
        "format": "4x50 mL",
        "systems": null,
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "11517",
        "platformFamily": "manual",
        "itemName": "UREA/BUN - UV",
        "description": "UREA/BUN - UV 2x250 mL",
        "format": "2x250 mL",
        "systems": null,
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "11541",
        "platformFamily": "manual",
        "itemName": "UREA/BUN - UV",
        "description": "UREA/BUN - UV 1000 mL",
        "format": "1000 mL",
        "systems": null,
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "12516",
        "platformFamily": "ax5",
        "itemName": "UREA/BUN - UV",
        "description": "UREA/BUN - UV 5x50 mL",
        "format": "5x50 mL",
        "systems": null,
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "21516",
        "platformFamily": "bax00",
        "itemName": "UREA/BUN - UV",
        "description": "UREA/BUN - UV",
        "format": "8 x 60 + 8 x 15 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "23516",
        "platformFamily": "bax00",
        "itemName": "UREA/BUN - UV",
        "description": "UREA/BUN - UV",
        "format": "4 x 60 + 4 x 15 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "21516",
        "23516"
      ],
      "BA200": [
        "21516",
        "23516"
      ],
      "A15": [
        "12516"
      ],
      "manual": [
        "11516",
        "11517",
        "11541"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": true,
      "matchedProductCount": 6
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": 720.0,
      "onboardStabilityUnit": "days",
      "onboardStabilityRaw": 30.0,
      "blankDeterioration": null,
      "detectionLimitValue": 3.69,
      "detectionLimitUnit": "mg/dL",
      "detectionLimitAlternateValue": 1.72,
      "detectionLimitAlternateUnit": "mg/dL",
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 300.0,
      "linearityLimitUnit": "mg/dL",
      "linearityLimitAlternateValue": 140.0,
      "linearityLimitAlternateUnit": "mg/dL",
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 30.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "la bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 1625 mg/dL) no interfieren"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 500.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "la bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 1625 mg/dL) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 1625.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "la bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 1625 mg/dL) no interfieren"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 5.0,
          "unit": "g/L",
          "effect": "interferes_above",
          "sourceExcerpt": "hemólisis (hemoglobina > 5 g/L) y niveles elevados de amonio interfieren"
        },
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 20.0,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "bilirrubina (< 20 mg/dL) no interfieren"
        },
        {
          "interferent": "lipemia",
          "label": "Lipemia / triglicéridos",
          "thresholdValue": 10.0,
          "unit": "g/L",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "lipemia (triglicéridos < 10 g/L) y la bilirrubina (< 20 mg/dL) no interfieren"
        }
      ],
      "procedureLimitations": [
        "la bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 1625 mg/dL) no interfieren",
        "La lipemia (triglicéridos < 10 g/L) y la bilirrubina (< 20 mg/dL) no interfieren. La hemólisis (hemoglobina > 5 g/L) y niveles elevados de amonio interfieren"
      ],
      "notes": [
        "CONSERVACIÓN Y ESTABILIDAD Conservar a 2-8ºC. Los componentes son estables hasta la fecha de caducidad indicada en la etiqueta del kit, siempre que se conserven bien cerrados y se evite la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 30 días. Indicaciones de deterioro: Absorbancia del blanco inferior al límite indicado en “Parámetros de la prueba”.",
        "CARACTERÍSTICAS METROLÓGICAS Las prestaciones metrológicas que se describen a continuación, han sido obtenidas utilizando un analizador BA400 y siguiendo las guías del Clinical & Laboratory Standards Institute (CLSI).  Límite de detección: 3,69 mg/dL urea = 1,72 mg/dL BUN = 0,614 mmol/L urea.",
        " Límite de linealidad: 300 mg/dL urea = 140 mg/dL BUN = 50 mmol/L urea. Para muestras con valores superiores, diluir manualmente o consultar los Parámetros de la prueba para dilución automática (estas muestras se diluirán con el mismo factor de dilución).",
        "LIMITACIONES DEL PROCEDIMIENTO  Interferencias: la bilirrubina (hasta 30 mg/dL), la hemólisis (hemoglobina hasta 500 mg/dL) y lipemia (triglicéridos hasta 1625 mg/dL) no interfieren. Otros medicamentos y sustancias pueden interferir6."
      ]
    },
    "qcReferences": [
      {
        "id": "UREA_UV::18005::0004::I::mg/dL::Ureasa - UV",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "UREA",
        "methodName": "Ureasa - UV",
        "targetValue": 54.0,
        "sd1": 3.6,
        "sd1Low": 50.4,
        "sd1High": 57.6,
        "sd2Low": 46.8,
        "sd2High": 61.2,
        "rejectLow": 43.2,
        "rejectHigh": 64.8,
        "unit": "mg/dL",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "UREA_UV::18009::0001739::I::mg/dL::Ureasa - UV",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "UREA",
        "methodName": "Ureasa - UV",
        "targetValue": 54.0,
        "sd1": 3.6,
        "sd1Low": 50.4,
        "sd1High": 57.6,
        "sd2Low": 46.8,
        "sd2High": 61.2,
        "rejectLow": 43.2,
        "rejectHigh": 64.8,
        "unit": "mg/dL",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "UREA_UV::18042::59322::I::mg/dL::Ureasa - UV",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "UREA",
        "methodName": "Ureasa - UV",
        "targetValue": 56.0,
        "sd1": 3.7,
        "sd1Low": 52.3,
        "sd1High": 59.7,
        "sd2Low": 48.6,
        "sd2High": 63.4,
        "rejectLow": 44.8,
        "rejectHigh": 67.2,
        "unit": "mg/dL",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      }
    ],
    "missingFields": []
  },
  "URIC": {
    "displayCode": "URIC",
    "displayName": "Ácido úrico",
    "canonicalNames": [
      "URIC ACID",
      "URIC"
    ],
    "productEntries": [
      {
        "productCode": "11521",
        "platformFamily": "manual",
        "itemName": "URIC ACID",
        "description": "URIC ACID 200 mL",
        "format": "200 mL",
        "systems": null,
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "11522",
        "platformFamily": "manual",
        "itemName": "URIC ACID",
        "description": "URIC ACID 500 mL",
        "format": "500 mL",
        "systems": null,
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "11540",
        "platformFamily": "manual",
        "itemName": "URIC ACID",
        "description": "URIC ACID 1000 mL",
        "format": "1000 mL",
        "systems": null,
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "12521",
        "platformFamily": "ax5",
        "itemName": "URIC ACID",
        "description": "URIC ACID BSA 10x50 mL",
        "format": "10x50 mL",
        "systems": "BSA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "21521",
        "platformFamily": "bax00",
        "itemName": "URIC ACID",
        "description": "URIC ACID",
        "format": "10 x 60 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      },
      {
        "productCode": "23521",
        "platformFamily": "bax00",
        "itemName": "URIC ACID",
        "description": "URIC ACID",
        "format": "4 x 60 mL",
        "systems": "BA",
        "ifuDocs": 1,
        "valuesheetDocs": 0,
        "totalDocs": 3
      }
    ],
    "productCodesByPlatform": {
      "BA400": [
        "21521",
        "23521"
      ],
      "BA200": [
        "21521",
        "23521"
      ],
      "A15": [
        "12521"
      ],
      "manual": [
        "11521",
        "11522",
        "11540"
      ]
    },
    "missingIfuCodes": [],
    "documentation": {
      "hasIfu": true,
      "hasValuesheet": true,
      "matchedProductCount": 6
    },
    "facts": {
      "storageTempMinC": 2.0,
      "storageTempMaxC": 8.0,
      "onboardStabilityHours": 1440.0,
      "onboardStabilityUnit": "months",
      "onboardStabilityRaw": 2.0,
      "blankDeterioration": "high_blank_absorbance",
      "detectionLimitValue": 0.31,
      "detectionLimitUnit": "mg/dL",
      "detectionLimitAlternateValue": null,
      "detectionLimitAlternateUnit": null,
      "quantificationLimitValue": null,
      "quantificationLimitUnit": null,
      "quantificationLimitAlternateValue": null,
      "quantificationLimitAlternateUnit": null,
      "linearityLimitValue": 25.0,
      "linearityLimitUnit": "mg/dL",
      "linearityLimitAlternateValue": null,
      "linearityLimitAlternateUnit": null,
      "interferenceThresholds": [
        {
          "interferent": "bilirubin",
          "label": "Bilirrubina",
          "thresholdValue": 2.5,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La hemólisis (hemoglobina hasta 2 g/L), la bilirrubina (hasta 2,5 mg/dL) no interfieren. La lipemia interfiere. El ácido ascórbico (hasta 2,5 mg/dL) no interfiere"
        },
        {
          "interferent": "hemolysis",
          "label": "Hemólisis / hemoglobina",
          "thresholdValue": 2.0,
          "unit": "g/L",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La hemólisis (hemoglobina hasta 2 g/L), la bilirrubina (hasta 2,5 mg/dL) no interfieren. La lipemia interfiere. El ácido ascórbico (hasta 2,5 mg/dL) no interfiere"
        },
        {
          "interferent": "ascorbic_acid",
          "label": "Ácido ascórbico",
          "thresholdValue": 2.5,
          "unit": "mg/dL",
          "effect": "no_interference_up_to",
          "sourceExcerpt": "La hemólisis (hemoglobina hasta 2 g/L), la bilirrubina (hasta 2,5 mg/dL) no interfieren. La lipemia interfiere. El ácido ascórbico (hasta 2,5 mg/dL) no interfiere"
        }
      ],
      "procedureLimitations": [
        "La hemólisis (hemoglobina hasta 2 g/L), la bilirrubina (hasta 2,5 mg/dL) no interfieren. La lipemia interfiere. El ácido ascórbico (hasta 2,5 mg/dL) no interfiere"
      ],
      "notes": [
        "CONSERVACIÓN Y ESTABILIDAD Conservar a 2-8 ºC. Los componentes son estables hasta la fecha de caducidad indicada en la etiqueta del kit, siempre que se conserven bien cerrados y se evite la contaminación durante su uso. Estabilidad a bordo: Los reactivos abiertos y conservados en el compartimento refrigerado del analizador son estables 2 meses. Indicaciones de deterioro: Absorbancia del blanco superior al límite indicado en “Parámetros de la prueba”.",
        " Límite de detección: 0,31 mg/dL = 18,5 mol/L.",
        " Límite de linealidad: 25 mg/dL = 1487 mol/L.",
        " Interferencias: La hemólisis (hemoglobina hasta 2 g/L), la bilirrubina (hasta 2,5 mg/dL) no interfieren. La lipemia interfiere. El ácido ascórbico (hasta 2,5 mg/dL) no interfiere. Otros medicamentos y sustancias pueden interferir5."
      ]
    },
    "qcReferences": [
      {
        "id": "URIC::18005::0004::I::mmol/L::Ureasa - UV",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "ÁCIDO ÚRICO",
        "methodName": "Ureasa - UV",
        "targetValue": 8.96,
        "sd1": 0.6,
        "sd1Low": 8.36,
        "sd1High": 9.56,
        "sd2Low": 7.76,
        "sd2High": 10.16,
        "rejectLow": 7.17,
        "rejectHigh": 10.75,
        "unit": "mmol/L",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "URIC::18005::0004::I::mg/dL::Uricasa/peroxidasa",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "ÁCIDO ÚRICO",
        "methodName": "Uricasa/peroxidasa",
        "targetValue": 5.46,
        "sd1": 0.27,
        "sd1Low": 5.19,
        "sd1High": 5.73,
        "sd2Low": 4.92,
        "sd2High": 6.0,
        "rejectLow": 4.64,
        "rejectHigh": 6.28,
        "unit": "mg/dL",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "URIC::18005::0004::I::μmol/L::Uricasa/peroxidasa",
        "productCode": "18005",
        "lot": "0004",
        "controlLevel": "level_1",
        "analyteName": "ÁCIDO ÚRICO",
        "methodName": "Uricasa/peroxidasa",
        "targetValue": 325.0,
        "sd1": 16.0,
        "sd1Low": 309.0,
        "sd1High": 341.0,
        "sd2Low": 293.0,
        "sd2High": 357.0,
        "rejectLow": 276.0,
        "rejectHigh": 374.0,
        "unit": "μmol/L",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18005 lote 0004"
      },
      {
        "id": "URIC::18009::0001739::I::mmol/L::Ureasa - UV",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "ÁCIDO ÚRICO",
        "methodName": "Ureasa - UV",
        "targetValue": 8.96,
        "sd1": 0.6,
        "sd1Low": 8.36,
        "sd1High": 9.56,
        "sd2Low": 7.76,
        "sd2High": 10.16,
        "rejectLow": 7.17,
        "rejectHigh": 10.75,
        "unit": "mmol/L",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "URIC::18009::0001739::I::mg/dL::Uricasa/peroxidasa",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "ÁCIDO ÚRICO",
        "methodName": "Uricasa/peroxidasa",
        "targetValue": 5.46,
        "sd1": 0.27,
        "sd1Low": 5.19,
        "sd1High": 5.73,
        "sd2Low": 4.92,
        "sd2High": 6.0,
        "rejectLow": 4.64,
        "rejectHigh": 6.28,
        "unit": "mg/dL",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "URIC::18009::0001739::I::μmol/L::Uricasa/peroxidasa",
        "productCode": "18009",
        "lot": "0001739",
        "controlLevel": "level_1",
        "analyteName": "ÁCIDO ÚRICO",
        "methodName": "Uricasa/peroxidasa",
        "targetValue": 325.0,
        "sd1": 16.0,
        "sd1Low": 309.0,
        "sd1High": 341.0,
        "sd2Low": 293.0,
        "sd2High": 357.0,
        "rejectLow": 276.0,
        "rejectHigh": 374.0,
        "unit": "μmol/L",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18009 lote 0001739"
      },
      {
        "id": "URIC::18010::0001747::II::mmol/L::Ureasa - UV",
        "productCode": "18010",
        "lot": "0001747",
        "controlLevel": "level_2",
        "analyteName": "ÁCIDO ÚRICO",
        "methodName": "Ureasa - UV",
        "targetValue": 21.5,
        "sd1": 1.1,
        "sd1Low": 20.4,
        "sd1High": 22.6,
        "sd2Low": 19.3,
        "sd2High": 23.7,
        "rejectLow": 18.3,
        "rejectHigh": 24.7,
        "unit": "mmol/L",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18010 lote 0001747"
      },
      {
        "id": "URIC::18010::0001747::II::mg/dL::Uricasa/peroxidasa",
        "productCode": "18010",
        "lot": "0001747",
        "controlLevel": "level_2",
        "analyteName": "ÁCIDO ÚRICO",
        "methodName": "Uricasa/peroxidasa",
        "targetValue": 9.35,
        "sd1": 0.47,
        "sd1Low": 8.88,
        "sd1High": 9.82,
        "sd2Low": 8.41,
        "sd2High": 10.29,
        "rejectLow": 7.95,
        "rejectHigh": 10.75,
        "unit": "mg/dL",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18010 lote 0001747"
      },
      {
        "id": "URIC::18042::59322::I::mmol/L::Ureasa - UV",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "ÁCIDO ÚRICO",
        "methodName": "Ureasa - UV",
        "targetValue": 9.3,
        "sd1": 0.62,
        "sd1Low": 8.68,
        "sd1High": 9.92,
        "sd2Low": 8.06,
        "sd2High": 10.54,
        "rejectLow": 7.44,
        "rejectHigh": 11.16,
        "unit": "mmol/L",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "URIC::18042::59322::I::mg/dL::Uricasa/peroxidasa",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "ÁCIDO ÚRICO",
        "methodName": "Uricasa/peroxidasa",
        "targetValue": 5.23,
        "sd1": 0.26,
        "sd1Low": 4.97,
        "sd1High": 5.49,
        "sd2Low": 4.71,
        "sd2High": 5.75,
        "rejectLow": 4.45,
        "rejectHigh": 6.01,
        "unit": "mg/dL",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "URIC::18042::59322::I::μmol/L::Uricasa/peroxidasa",
        "productCode": "18042",
        "lot": "59322",
        "controlLevel": "level_1",
        "analyteName": "ÁCIDO ÚRICO",
        "methodName": "Uricasa/peroxidasa",
        "targetValue": 311.0,
        "sd1": 16.0,
        "sd1Low": 295.0,
        "sd1High": 327.0,
        "sd2Low": 279.0,
        "sd2High": 343.0,
        "rejectLow": 264.0,
        "rejectHigh": 358.0,
        "unit": "μmol/L",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18042 lote 59322"
      },
      {
        "id": "URIC::18043::58987::II::mmol/L::Ureasa - UV",
        "productCode": "18043",
        "lot": "58987",
        "controlLevel": "level_2",
        "analyteName": "ÁCIDO ÚRICO",
        "methodName": "Ureasa - UV",
        "targetValue": 22.3,
        "sd1": 1.1,
        "sd1Low": 21.2,
        "sd1High": 23.4,
        "sd2Low": 20.1,
        "sd2High": 24.5,
        "rejectLow": 19.0,
        "rejectHigh": 25.6,
        "unit": "mmol/L",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18043 lote 58987"
      },
      {
        "id": "URIC::18043::58987::II::mg/dL::Uricasa/peroxidasa",
        "productCode": "18043",
        "lot": "58987",
        "controlLevel": "level_2",
        "analyteName": "ÁCIDO ÚRICO",
        "methodName": "Uricasa/peroxidasa",
        "targetValue": 10.3,
        "sd1": 0.5,
        "sd1Low": 9.8,
        "sd1High": 10.8,
        "sd2Low": 9.3,
        "sd2High": 11.3,
        "rejectLow": 8.8,
        "rejectHigh": 11.8,
        "unit": "mg/dL",
        "traceability": "SRM 909 (NIST)",
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18043 lote 58987"
      },
      {
        "id": "URIC::18054::0001036::I::NOUNIT::NOMETHOD",
        "productCode": "18054",
        "lot": "0001036",
        "controlLevel": "level_1",
        "analyteName": "ÁCIDO ÚRICO",
        "methodName": null,
        "targetValue": 200.0,
        "sd1": 13.0,
        "sd1Low": 187.0,
        "sd1High": 213.0,
        "sd2Low": 174.0,
        "sd2High": 226.0,
        "rejectLow": 160.0,
        "rejectHigh": 240.0,
        "unit": null,
        "traceability": null,
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18054 lote 0001036"
      },
      {
        "id": "URIC::18054::0001036::I::NOUNIT::NOMETHOD",
        "productCode": "18054",
        "lot": "0001036",
        "controlLevel": "level_1",
        "analyteName": "ÁCIDO ÚRICO",
        "methodName": null,
        "targetValue": 12.7,
        "sd1": 0.8,
        "sd1Low": 11.9,
        "sd1High": 13.5,
        "sd2Low": 11.1,
        "sd2High": 14.3,
        "rejectLow": 10.2,
        "rejectHigh": 15.2,
        "unit": null,
        "traceability": null,
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18054 lote 0001036"
      },
      {
        "id": "URIC::18066::0000619::II::NOUNIT::NOMETHOD",
        "productCode": "18066",
        "lot": "0000619",
        "controlLevel": "level_2",
        "analyteName": "ÁCIDO ÚRICO",
        "methodName": null,
        "targetValue": 305.0,
        "sd1": 20.0,
        "sd1Low": 285.0,
        "sd1High": 325.0,
        "sd2Low": 265.0,
        "sd2High": 345.0,
        "rejectLow": 244.0,
        "rejectHigh": 366.0,
        "unit": null,
        "traceability": null,
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18066 lote 0000619"
      },
      {
        "id": "URIC::18066::0000619::II::NOUNIT::NOMETHOD",
        "productCode": "18066",
        "lot": "0000619",
        "controlLevel": "level_2",
        "analyteName": "ÁCIDO ÚRICO",
        "methodName": null,
        "targetValue": 25.6,
        "sd1": 1.7,
        "sd1Low": 23.9,
        "sd1High": 27.3,
        "sd2Low": 22.2,
        "sd2High": 29.0,
        "rejectLow": 20.5,
        "rejectHigh": 30.7,
        "unit": null,
        "traceability": null,
        "matchConfidence": "rule",
        "sourceStatus": "validated",
        "sourceType": "internal_validation",
        "sourceReference": "einfo.bio valuesheet 18066 lote 0000619"
      }
    ],
    "missingFields": []
  }
} as const;
