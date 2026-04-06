import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import Tickets from './Tickets';
import Services from './Services';
import Refacciones from './Refacciones';
import Tutoriales from './Tutoriales';

export default function Dashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'tickets' | 'servicios' | 'refacciones' | 'tutoriales'>('tickets');

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2>Dashboard Biosystems</h2>
        <button onClick={handleLogout} className="button-primary">Cerrar Sesión</button>
      </header>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button onClick={() => setActiveTab('tickets')} className={`button-primary ${activeTab !== 'tickets' ? 'inactive' : ''}`} style={activeTab !== 'tickets' ? {background: 'var(--bg-secondary)', color: 'var(--text-secondary)'} : {}}>Tickets</button>
        <button onClick={() => setActiveTab('servicios')} className={`button-primary ${activeTab !== 'servicios' ? 'inactive' : ''}`} style={activeTab !== 'servicios' ? {background: 'var(--bg-secondary)', color: 'var(--text-secondary)'} : {}}>Servicios</button>
        <button onClick={() => setActiveTab('refacciones')} className={`button-primary ${activeTab !== 'refacciones' ? 'inactive' : ''}`} style={activeTab !== 'refacciones' ? {background: 'var(--bg-secondary)', color: 'var(--text-secondary)'} : {}}>Refacciones</button>
        <button onClick={() => setActiveTab('tutoriales')} className={`button-primary ${activeTab !== 'tutoriales' ? 'inactive' : ''}`} style={activeTab !== 'tutoriales' ? {background: 'var(--bg-secondary)', color: 'var(--text-secondary)'} : {}}>Tutoriales</button>
      </div>

      <div className="card">
        {activeTab === 'tickets' && <Tickets />}
        {activeTab === 'servicios' && <Services />}
        {activeTab === 'refacciones' && <Refacciones />}
        {activeTab === 'tutoriales' && <Tutoriales />}
      </div>
    </div>
  );
}
