# Orion DHL Tracking Agent para Windows

Este agente usa Google Chrome o Microsoft Edge en modo interactivo minimizado para consultar el portal público de DHL. No necesita una API key de DHL y nunca recibe la `service_role` de Supabase.

DHL bloquea los navegadores headless con un desafío HTTP 428. Por eso el agente abre un perfil exclusivo de Chrome y se conecta por CDP sin activar el indicador de automatización del navegador.

## Funcionamiento

- Todos los usuarios agregan guías desde Orion y se guardan en `public.shipping_trackings`.
- El agente pregunta a Supabase cada 15 segundos si hay trabajo disponible.
- Supabase solo entrega una guía automática cuando nunca se ha consultado o han pasado cinco minutos desde el último intento.
- Una solicitud manual se entrega al siguiente pulso, incluso si la guía aparece como entregada.
- Al quedar entregada, una guía sale de la cola automática.
- Varios equipos pueden ejecutar el agente simultáneamente; el bloqueo en Supabase evita consultas duplicadas.

## Requisitos

- Windows 10 u 11 de 64 bits.
- Acceso a internet.
- Google Chrome o Microsoft Edge instalado.
- PowerShell ejecutado como administrador desde la cuenta de Windows que operará el agente.
- `SUPABASE_URL`, publishable/anon key y `TRACKING_AGENT_TOKEN` proporcionados por el administrador de Orion.

Internet Explorer no es compatible con el portal moderno de DHL.

## Instalación

1. Copia esta carpeta al equipo Windows.
2. Haz doble clic en `INSTALAR-ORION.cmd` y acepta el permiso de administrador.
3. Alternativamente, abre PowerShell como administrador y ejecuta:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install.ps1
```

El instalador solicita las dos credenciales, instala Node.js 22 si hace falta y registra `Orion DHL Tracking Agent` para iniciar con Windows en la sesión interactiva actual. Chrome queda minimizado y utiliza un perfil separado dentro de `C:\ProgramData\OrionTrackingAgent\data\chrome-profile`.

El paquete privado preparado por el administrador puede incluir `agent-credentials.json`; en ese caso no solicita claves y elimina ese archivo de la carpeta extraída cuando termina. El ZIP original todavía contiene la credencial y debe borrarse después de instalar.

Después de reiniciar, la tarea arranca al iniciar sesión. Si el equipo dedicado debe recuperarse sin intervención humana tras un corte eléctrico, configura el encendido automático en BIOS y el inicio de sesión automático de esa cuenta de Windows. Ejecutarlo como `SYSTEM` no es compatible porque DHL bloquea el navegador headless y Windows no permite un navegador gráfico en la sesión de servicio.

## Operación

```powershell
.\status.ps1
.\run-once.ps1
```

También puedes abrir `VER-ESTADO.cmd` para ver la tarea y los últimos eventos sin escribir comandos.

Si la instalación falla, la ventana permanece abierta con el motivo y guarda el diagnóstico en:

```text
C:\ProgramData\OrionTrackingAgent-install.log
```

Si Windows no permite registrar la tarea programada, el instalador configura automáticamente un acceso equivalente en la carpeta Inicio de la cuenta actual.

El botón `Actualizar por agente` en Orion fuerza una revisión remota. `run-once.ps1` procesa inmediatamente la cola disponible si el servicio no está ejecutándose.

Los logs están en:

```text
C:\ProgramData\OrionTrackingAgent\data\agent.log
```

Ante un error de lectura del portal, las capturas quedan en `data\screenshots`.

## Desinstalación

Ejecuta `uninstall.ps1` como administrador. La tarea se elimina y los logs quedan preservados para diagnóstico.
