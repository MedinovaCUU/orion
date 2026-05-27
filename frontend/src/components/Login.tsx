import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import './Login.css';
import BrandLockup from './BrandLockup';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) setErrorMsg(error.message);
        else setErrorMsg('Verifica tu correo electrónico para el enlace de registro.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setErrorMsg(error.message);
      }
    } catch (err) {
      setErrorMsg('Ocurrió un error inesperado');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container login-container--auth">
      <div className="card login-card login-card--auth">
        <BrandLockup
          variant="auth"
          eyebrow="BioSystems"
          title={isSignUp ? 'Alta de usuario Orion' : 'Acceso Orion'}
          subtitle="Plataforma operativa para soporte técnico, planeación de servicio y trazabilidad."
        />
        <div className="login-copy">
          <span className="login-kicker">{isSignUp ? 'Configuración inicial' : 'Acceso del personal'}</span>
          <h2 className="login-title">
            {isSignUp ? 'Crear una cuenta' : 'Iniciar sesión'}
          </h2>
          <p className="login-subtitle">
            Consola de tickets, reportes, inventario, trazabilidad y soporte de campo.
          </p>
        </div>

        {errorMsg && <div className="error-alert">{errorMsg}</div>}

        <form onSubmit={handleAuth} className="login-form">
          <div className="form-group">
            <label>Correo Electrónico</label>
            <input 
              type="email" 
              className="input-field" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              required 
            />
          </div>
          <div className="form-group">
            <label>Contraseña</label>
            <input 
              type="password" 
              className="input-field" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required 
            />
          </div>
          
          <button type="submit" className="button-primary login-btn" disabled={loading}>
            {loading ? 'Cargando...' : (isSignUp ? 'Registrarse' : 'Entrar')}
          </button>
        </form>

        <div className="login-footer">
          {isSignUp ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?'}
          <button className="link-btn" onClick={() => setIsSignUp(!isSignUp)}>
            {isSignUp ? 'Inicia sesión' : 'Regístrate aquí'}
          </button>
        </div>
      </div>
    </div>
  );
}
