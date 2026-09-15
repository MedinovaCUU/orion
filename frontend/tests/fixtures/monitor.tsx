// Entrada exclusiva de las pruebas del navegador; no forma parte de las rutas de la aplicación.
import { createRoot } from 'react-dom/client';
import EquipmentMonitoring from '../../src/modules/equipment-monitoring/EquipmentMonitoring';

createRoot(document.getElementById('root')!).render(<EquipmentMonitoring />);
