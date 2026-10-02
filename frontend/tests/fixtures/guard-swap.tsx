import { createRoot } from 'react-dom/client';
import { useMemo, useState } from 'react';
import WeekendGuardsPanel from '../../src/modules/service-planning/components/WeekendGuardsPanel';
import { buildWeekendGuardSchedule } from '../../src/modules/service-planning/helpers/weekendGuards';
import type { WeekendGuardOverrideMap } from '../../src/modules/service-planning/types/servicePlanning.types';
import '../../src/modules/service-planning/servicePlanning.css';
function App(){
 const [overrides,setOverrides]=useState<WeekendGuardOverrideMap>({});
 const schedule=useMemo(()=>buildWeekendGuardSchedule([],overrides,new Date('2026-10-02T12:00:00')),[overrides]);
 return <><WeekendGuardsPanel schedule={schedule} overrides={overrides} selectedMonth="2026-10" currentUserName="Test" canEdit onSaveOverrides={setOverrides}/><pre data-testid="saved">{JSON.stringify(overrides)}</pre></>;
}
createRoot(document.getElementById('root')!).render(<App/>);
