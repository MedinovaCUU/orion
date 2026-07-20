begin;

-- These two SAT identities were previously resolved to legacy catalog rows with
-- ambiguous ids (LACTATO_DE and PROTEINA_T). Materialize stable DRI identities so
-- equipment_qc_latest always points to an actual reagent row.
insert into public.reagents (
  id, name, calibration_mode, reported_method, reagent_type, operational_note,
  preliminary_risk, source_status, confidence, source_type, source_reference,
  reference_code, platforms, analytical_family, reaction_kind, reagent_scheme,
  uses_r1, uses_r2, mechanical_subsystems, technical_profile
)
values
  (
    'LDH', 'Lactate Dehydrogenase (LDH)', 'Lineal', 'Cinético UV (piruvato)', 'Monoreactiva',
    'Revisar blanco, temperatura de reacción, estabilidad a bordo y control de calidad por lote.',
    'Medio', 'IFU EInfo verificada', 'confirmed', 'ifu',
    'einfo.bio IFU M21580-02 · código 21580', 'LDH', array['BA400','BA200'],
    'enzimas', 'kinetic', 'monoreactive', true, false,
    array['reagent_arm_r1','optical_system','incubator','fridge'],
    jsonb_build_object(
      'identity', jsonb_build_object(
        'reagentKey','LDH','displayCode','LDH','displayName','Lactato deshidrogenasa',
        'canonicalNames',jsonb_build_array('LDH','LACTATE DEHYDROGENASE','LACTATO DESHIDROGENASA')
      ),
      'ifuFacts', jsonb_build_object(
        'productCodes',jsonb_build_array('21580','23580'),
        'storageTemperatureC',jsonb_build_array(2,8),
        'sourceReference','einfo.bio/0006213/21580/es · IFU M21580-02'
      ),
      'qc_reference', jsonb_build_object(
        'sourceStatus','validated','sourceType','manual',
        'sourceReference','einfo.bio synchronization 2026-07-20',
        'references',jsonb_build_array(
          jsonb_build_object('id','LDH::18009::0004::level_1::U/L::Piruvato','productCode','18009','lot','0004','controlLevel','level_1','analyteName','LDH','methodName','Piruvato','unit','U/L','targetValue',427.0,'sd1',26.0,'sd1Low',401.0,'sd1High',453.0,'sd2Low',375.0,'sd2High',479.0,'rejectLow',350.0,'rejectHigh',504.0,'traceability','BMC','matchConfidence','validated','sourceStatus','validated','sourceType','manual','sourceReference','einfo.bio Value Sheet 18009 lote 0004'),
          jsonb_build_object('id','LDH::18010::0003::level_2::U/L::Piruvato','productCode','18010','lot','0003','controlLevel','level_2','analyteName','LDH','methodName','Piruvato','unit','U/L','targetValue',846.0,'sd1',51.0,'sd1Low',795.0,'sd1High',897.0,'sd2Low',744.0,'sd2High',948.0,'rejectLow',694.0,'rejectHigh',998.0,'traceability','BMC','matchConfidence','validated','sourceStatus','validated','sourceType','manual','sourceReference','einfo.bio Value Sheet 18010 lote 0003')
        )
      )
    )
  ),
  (
    'PROT_T', 'Total Protein Bireagent', 'Lineal', 'Punto final (Biuret)', 'Bireactiva',
    'Revisar blanco, contaminación por arrastre, proporción R1/R2 y control de calidad por lote.',
    'Medio', 'IFU EInfo verificada', 'confirmed', 'ifu',
    'einfo.bio IFU M21513-01 · código 21513', 'PROT T', array['BA400','BA200'],
    'proteínas', 'endpoint', 'bireactive', true, true,
    array['reagent_arm_r1','reagent_arm_r2','optical_system','fridge'],
    jsonb_build_object(
      'identity', jsonb_build_object(
        'reagentKey','PROT_T','displayCode','PROT T','displayName','Proteína total bireactiva',
        'canonicalNames',jsonb_build_array('T-PROT B','PROTEIN TOTAL BIREAGENT','PROTEINA TOTAL')
      ),
      'ifuFacts', jsonb_build_object(
        'productCodes',jsonb_build_array('21513','23513'),
        'storageTemperatureC',jsonb_build_array(2,8),
        'sourceReference','einfo.bio/0006213/21513/es · IFU M21513-01'
      ),
      'qc_reference', jsonb_build_object(
        'sourceStatus','validated','sourceType','manual',
        'sourceReference','einfo.bio synchronization 2026-07-20',
        'references',jsonb_build_array(
          jsonb_build_object('id','PROT_T::18009::0004::level_1::g/dL::Biuret','productCode','18009','lot','0004','controlLevel','level_1','analyteName','PROTEINA TOTAL','methodName','Biuret','unit','g/dL','targetValue',5.12,'sd1',0.20,'sd1Low',4.92,'sd1High',5.32,'sd2Low',4.72,'sd2High',5.52,'rejectLow',4.51,'rejectHigh',5.73,'traceability','SRM 927 (NIST)','matchConfidence','validated','sourceStatus','validated','sourceType','manual','sourceReference','einfo.bio Value Sheet 18009 lote 0004'),
          jsonb_build_object('id','PROT_T::18010::0003::level_2::g/dL::Biuret','productCode','18010','lot','0003','controlLevel','level_2','analyteName','PROTEINA TOTAL','methodName','Biuret','unit','g/dL','targetValue',8.24,'sd1',0.33,'sd1Low',7.91,'sd1High',8.57,'sd2Low',7.58,'sd2High',8.90,'rejectLow',7.25,'rejectHigh',9.23,'traceability','SRM 927 (NIST)','matchConfidence','validated','sourceStatus','validated','sourceType','manual','sourceReference','einfo.bio Value Sheet 18010 lote 0003')
        )
      )
    )
  )
on conflict (id) do update set
  name=excluded.name, calibration_mode=excluded.calibration_mode,
  reported_method=excluded.reported_method, reagent_type=excluded.reagent_type,
  operational_note=excluded.operational_note, preliminary_risk=excluded.preliminary_risk,
  source_status=excluded.source_status, confidence=excluded.confidence,
  source_type=excluded.source_type, source_reference=excluded.source_reference,
  reference_code=excluded.reference_code, platforms=excluded.platforms,
  analytical_family=excluded.analytical_family, reaction_kind=excluded.reaction_kind,
  reagent_scheme=excluded.reagent_scheme, uses_r1=excluded.uses_r1, uses_r2=excluded.uses_r2,
  mechanical_subsystems=excluded.mechanical_subsystems,
  technical_profile=excluded.technical_profile, updated_at=timezone('utc',now());

commit;
