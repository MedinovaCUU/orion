import { createContext, useContext } from 'react';

/** True mientras el splash de la app está en pantalla; los fallbacks de rutas lo consultan para no montar un segundo splash. */
export const SplashVisibleContext = createContext(false);
export const useSplashVisible = () => useContext(SplashVisibleContext);
