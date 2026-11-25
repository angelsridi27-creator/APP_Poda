// Fotos de los vanos: se achican en el teléfono, quedan en una cola guardada en el equipo
// y se envían al script de la planilla, que las reenvía por correo a SharePoint.
// Sin señal no se pierden: se mandan solas cuando vuelve la conexión.
import { auth } from './db.js';
import { URL_FOTOS } from './config.js';

const BASE = 'poda-fotos';
const ALMACEN = 'cola';
export const MAX_POR_ENVIO = 6;
const LADO_MAX = 1600;
const CALIDAD = 0.72;

// ---------------- Cola en el equipo (IndexedDB) ----------------

let abierta = null;
function abrir() {
  if (!abierta) {
    abierta = new Promise((ok, no) => {
      const r = indexedDB.open(BASE, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(ALMACEN, { keyPath: 'id' });
      r.onsuccess = () => ok(r.result);
      r.onerror = () => no(r.error);
    });
  }
  return abierta;
}

async function op(modo, fn) {
  const base = await abrir();
  return new Promise((ok, no) => {
    const tx = base.transaction(ALMACEN, modo);
    const req = fn(tx.objectStore(ALMACEN));
    tx.oncomplete = () => ok(req ? req.result : undefined);
    tx.onerror = () => no(tx.error);
    tx.onabort = () => no(tx.error || new Error('Sin espacio en el equipo'));
  });
}

export const listar = () => op('readonly', s => s.getAll()).then(l => (l || []).sort((a, b) => a.creado - b.creado));
export const descartar = id => op('readwrite', s => s.delete(id));
const guardar = item => op('readwrite', s => s.put(item));

// ---------------- Achicar la foto ----------------

async function cargarImagen(archivo) {
  try {
    return await createImageBitmap(archivo, { imageOrientation: 'from-image' });
  } catch (_) {
    const url = URL.createObjectURL(archivo);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}

/** Devuelve la foto como JPEG en base64 (sin el prefijo data:), de hasta 1600 px de lado. */
export async function comprimir(archivo) {
  const img = await cargarImagen(archivo);
  const w = img.width, h = img.height;
  const k = Math.min(1, LADO_MAX / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  if (img.close) img.close();
  const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', CALIDAD));
  if (!blob) throw new Error('No se pudo procesar la imagen');
  return new Promise((ok, no) => {
    const fr = new FileReader();
    fr.onload = () => ok(String(fr.result).split(',')[1]);
    fr.onerror = () => no(fr.error);
    fr.readAsDataURL(blob);
  });
}

/**
 * Agrega fotos de un vano a la cola. Devuelve cuántas quedaron.
 * Se arma un envío (un correo) cada 6 fotos.
 */
export async function encolar(tramo, vano, archivos, perfil) {
  const fotos = [];
  for (const a of archivos) {
    if (!/^image\//.test(a.type || 'image/')) continue;
    fotos.push(await comprimir(a));
  }
  for (let i = 0; i < fotos.length; i += MAX_POR_ENVIO) {
    await guardar({
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      tramoId: tramo.id, clave: vano.clave, vano: vano.v || '', linea: tramo.linea || '',
      tramoTxt: tramo.tramoTxt || String(tramo.tramo || ''),
      fotos: fotos.slice(i, i + MAX_POR_ENVIO),
      uid: perfil.uid, creado: Date.now(), intentos: 0, error: '', definitivo: false
    });
  }
  return fotos.length;
}

/** Cantidad de fotos esperando, por tramo y clave de vano. */
export function resumen(cola) {
  const porVano = {};
  let fotos = 0, conError = 0;
  for (const it of cola) {
    const k = it.tramoId + '|' + it.clave;
    porVano[k] = (porVano[k] || 0) + it.fotos.length;
    fotos += it.fotos.length;
    if (it.definitivo) conError++;
  }
  return { porVano, fotos, envios: cola.length, conError };
}

// ---------------- Envío ----------------

let enviando = null;

/**
 * Manda todo lo que esté en la cola. Se puede llamar seguido: si ya está enviando, espera
 * a que termine. Devuelve { enviadas, error } con el último problema, si hubo.
 */
export function procesar() {
  if (!enviando) enviando = enviarTodo().finally(() => { enviando = null; });
  return enviando;
}

async function enviarTodo() {
  const res = { enviadas: 0, error: '' };
  if (!URL_FOTOS) return { ...res, error: 'Falta configurar la dirección de envío de fotos.' };
  if (!navigator.onLine || !auth.currentUser) return res;
  for (const it of await listar()) {
    if (it.definitivo) continue;
    if (it.uid && it.uid !== auth.currentUser.uid) continue; // fotos de otro usuario de este equipo
    let r;
    try {
      const idToken = await auth.currentUser.getIdToken();
      const resp = await fetch(URL_FOTOS, {
        method: 'POST',
        // texto plano: así el navegador no hace la consulta previa que Apps Script no responde
        body: JSON.stringify({
          action: 'podaAppFoto', id: it.id, idToken, tramoId: it.tramoId, clave: it.clave, fotos: it.fotos
        })
      });
      r = await resp.json();
    } catch (err) {
      // sin señal o se cortó: queda para el próximo intento
      it.intentos++; it.error = 'No se pudo conectar'; await guardar(it);
      return { ...res, error: 'No se pudo conectar con el servidor de fotos.' };
    }
    if (r && r.ok) {
      await descartar(it.id);
      res.enviadas += it.fotos.length;
      continue;
    }
    it.intentos++;
    it.error = (r && r.mensaje) || 'Error desconocido';
    // datos o permisos: reintentar no sirve; queda a la vista para descartarla
    it.definitivo = r && (r.error === 'datos' || r.error === 'permiso');
    await guardar(it);
    if (!it.definitivo) return { ...res, error: it.error }; // sesión o cuota: se corta y se reintenta después
    res.error = it.error;
  }
  return res;
}
