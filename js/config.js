// Configuración del proyecto de Firebase (no es secreta: identifica el proyecto).
// Es el mismo proyecto que la app de cuadrillas: comparten usuarios y base de datos.
export const firebaseConfig = {
  apiKey: 'AIzaSyBGU7LNm1I36GN_vjzOmEHO6yVB1oClMFo',
  authDomain: 'ot-cuadrillas.firebaseapp.com',
  projectId: 'ot-cuadrillas',
  storageBucket: 'ot-cuadrillas.firebasestorage.app',
  messagingSenderId: '936584539568',
  appId: '1:936584539568:web:5f8a5ec142f97629bd3a75'
};

// Cuenta que siempre tiene permisos de supervisor (debe coincidir con firestore.rules).
export const CORREO_ADMIN = 'angelsridi27@gmail.com';

// Los usuarios entran con un usuario corto; internamente se usa usuario@DOMINIO.
export const DOMINIO_USUARIOS = 'cuadrillas.app';

// Script de la planilla APP_Poda que recibe las fotos y las manda a SharePoint
// (implementación de la app web de API_PWA; la URL no cambia al publicar versiones nuevas).
export const URL_FOTOS = 'https://script.google.com/macros/s/AKfycbz0IMl0nAI7lY8rtjzImtL0_URi38BNl3EETrYz1XiPKWCrdMZiMpM_PG4kfoh53UQ4CQ/exec';

export const VERSION_APP = '1.1.0';
