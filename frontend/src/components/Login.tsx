import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import './Login.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate('/dashboard');
    });
  }, [navigate]);

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
        else navigate('/dashboard');
      }
    } catch (err) {
      setErrorMsg('Ocurrió un error inesperado');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="card login-card">
        <h2 className="login-title">
          {isSignUp ? 'Crear una cuenta' : 'Iniciar sesión'}
        </h2>
        <p className="login-subtitle">
          Sistema de Tickets y Soporte Biosystems
        </p>

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
