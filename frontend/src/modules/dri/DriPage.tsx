import DriDashboard from './components/DriDashboard';
import './dri.css';

export default function DriPage({ subPermissions }: { subPermissions?: string[] }) {
  return <DriDashboard subPermissions={subPermissions} />;
}
