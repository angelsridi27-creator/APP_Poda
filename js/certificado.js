// Certificado de un tramo en PDF, con el formato de la Hoja_Modelo de APP_Poda:
// encabezado de la Gerencia, fechas, designación del tramo, grilla de vanos de 9 por fila
// con el estado debajo (vacío si está pendiente), observaciones y firmas.
// Se arma en el equipo: funciona sin señal una vez que la app la abrió con conexión.
import { vanosDeTramo, infoEstado, PENDIENTE, CERTIFICADO, fechaAR, hoyISO } from './logica.js';

const W = 595.28, H = 841.89, M = 28, CW = W - 2 * M;
const POR_FILA = 9;
const COL_A = CW * 0.1;                  // columna "PODA"
const COL = (CW - COL_A) / POR_FILA;      // cada vano
const ALTO_VANO = 17, ALTO_ESTADO = 30;

// Solo caracteres que la fuente estándar (WinAnsi) puede dibujar.
function limpiar(s) {
  return String(s ?? '').normalize('NFC').replace(/[\r\t\n]/g, ' ')
    .replace(/[^\x20-\x7E -ÿ–—‘’“”•…]/g, '');
}

/** Datos que van en el certificado (se separa para poder probarlo sin PDF). */
export function datosCertificado(tramo, { inicio = '', fin = '', fechaCert = '', detalle = '' } = {}) {
  const vanos = vanosDeTramo(tramo);
  const celdas = vanos.map(v => ({ vano: v.v, estado: infoEstado(v.estado).id === PENDIENTE ? '' : infoEstado(v.estado).id }));
  const certificados = vanos.filter(v => v.estado === CERTIFICADO);
  const ultimaCert = certificados.map(v => v.fecha || '').sort().pop() || '';
  const empresas = [...new Set(vanos.map(v => v.empresa).filter(Boolean))];
  return {
    titulo: `TRAMO ${tramo.tramoTxt || tramo.tramo} - ${tramo.linea}`,
    zona: tramo.zona || '',
    empresas,
    inicio, fin,
    fechaCert: fechaCert || ultimaCert,
    celdas,
    total: vanos.length,
    certificados: certificados.length,
    detalle
  };
}

/** Texto sugerido para "Detalle y pendientes". */
export function detalleSugerido(tramo) {
  const vanos = vanosDeTramo(tramo);
  const cert = vanos.filter(v => v.estado === CERTIFICADO).length;
  if (cert === vanos.length) return `Tramo completo: ${cert} vanos certificados.`;
  const grupos = {};
  for (const v of vanos) {
    if (v.estado === CERTIFICADO) continue;
    const e = infoEstado(v.estado).id === PENDIENTE ? 'Sin trabajar' : infoEstado(v.estado).id;
    (grupos[e] = grupos[e] || []).push(v.v);
  }
  return `${cert} de ${vanos.length} vanos certificados. Pendientes: ` +
    Object.entries(grupos).map(([e, l]) => `${e}: ${l.join(', ')}`).join(' · ') + '.';
}

export function nombreArchivo(tramo, fecha = hoyISO()) {
  const base = `Certificado Tramo ${tramo.tramoTxt || tramo.tramo} - ${tramo.linea} - ${fecha}`;
  return base.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() + '.pdf';
}

/** Arma el PDF. Devuelve los bytes (Uint8Array). */
export async function generarPDF(tramo, opciones = {}, quien = '') {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const d = datosCertificado(tramo, opciones);
  const doc = await PDFDocument.create();
  doc.setTitle(limpiar(`Certificado de poda - ${d.titulo}`));
  doc.setAuthor(limpiar(quien || 'App de poda EPEC'));
  doc.setCreator('App de poda EPEC');
  const f = {
    n: await doc.embedFont(StandardFonts.Helvetica),
    b: await doc.embedFont(StandardFonts.HelveticaBold),
    i: await doc.embedFont(StandardFonts.HelveticaOblique)
  };
  let logo = null;
  try {
    const r = await fetch(new URL('../icons/epec.png', import.meta.url));
    if (r.ok) logo = await doc.embedPng(new Uint8Array(await r.arrayBuffer()));
  } catch (_) { /* sin logo */ }

  const NEGRO = rgb(0, 0, 0), GRIS = rgb(0.82, 0.82, 0.82), GRIS_T = rgb(0.4, 0.4, 0.4);
  let page;
  const pages = [];
  const nueva = () => { page = doc.addPage([W, H]); pages.push(page); };

  // y = distancia desde el borde superior
  const rect = (x, y, w, h, { fill = null, borde = true } = {}) => page.drawRectangle({
    x, y: H - y - h, width: w, height: h,
    color: fill || undefined, borderColor: borde ? NEGRO : undefined, borderWidth: borde ? 0.7 : 0
  });
  const ancho = (t, fuente, tam) => fuente.widthOfTextAtSize(limpiar(t), tam);
  const texto = (t, x, y, { fuente = f.n, tam = 10, color = NEGRO } = {}) =>
    page.drawText(limpiar(t), { x, y: H - y - tam * 0.8, size: tam, font: fuente, color });
  const centrado = (t, x, y, w, h, op = {}) => {
    const tam = op.tam || 10;
    const fuente = op.fuente || f.n;
    let tm = tam;
    while (tm > 6 && ancho(t, fuente, tm) > w - 4) tm -= 0.5;
    texto(t, x + (w - ancho(t, fuente, tm)) / 2, y + (h - tm) / 2 + tm * 0.1, { ...op, tam: tm });
  };
  // corta en renglones para un ancho dado
  const renglones = (t, fuente, tam, w) => {
    const out = [];
    for (const parrafo of String(t || '').split(/\n/)) {
      let linea = '';
      for (const p of parrafo.split(/\s+/).filter(Boolean)) {
        const prueba = linea ? linea + ' ' + p : p;
        if (ancho(prueba, fuente, tam) <= w || !linea) linea = prueba;
        else { out.push(linea); linea = p; }
      }
      out.push(linea);
    }
    return out;
  };
  const banda = (t, y, h, { izq = false, tam = 13 } = {}) => {
    rect(M, y, CW, h, { fill: GRIS });
    if (izq) texto(t, M + 4, y + (h - tam) / 2 + 1, { tam });
    else centrado(t, M, y, CW, h, { tam });
    return y + h;
  };

  // ---------- Página 1: encabezado ----------
  nueva();
  let y = M;
  const altoEnc = 42;
  const anchoLogo = CW * 0.2;
  rect(M, y, CW, altoEnc);
  page.drawLine({ start: { x: M + anchoLogo, y: H - y }, end: { x: M + anchoLogo, y: H - y - altoEnc }, thickness: 0.7, color: NEGRO });
  if (logo) {
    const k = Math.min((anchoLogo - 16) / logo.width, (altoEnc - 10) / logo.height);
    page.drawImage(logo, { x: M + (anchoLogo - logo.width * k) / 2, y: H - y - (altoEnc + logo.height * k) / 2, width: logo.width * k, height: logo.height * k });
  } else {
    centrado('EPEC', M, y, anchoLogo, altoEnc, { fuente: f.b, tam: 18, color: rgb(0, 0.44, 0.29) });
  }
  centrado('GERENCIA DE TRANSMISIÓN', M + anchoLogo, y + 5, CW - anchoLogo, 16, { fuente: f.i, tam: 11 });
  centrado('DEPARTAMENTO DE REDES DE ALTA TENSION - SERVICIO DE PODA EN LAT', M + anchoLogo, y + 21, CW - anchoLogo, 16, { fuente: f.i, tam: 10.5 });
  y += altoEnc;
  y = banda('MANTENIMIENTO DE LAT - INFORME DE TRABAJO REALIZADO', y, 22, { izq: true, tam: 12.5 });
  y += 8;

  // Fechas
  const etq = CW * 0.27, val = CW * 0.18, alto = 18;
  for (const [t, v] of [['FECHA INICIO TRABAJO', d.inicio], ['FECHA FIN DE TRABAJO', d.fin]]) {
    rect(M, y, etq, alto); rect(M + etq, y, val, alto);
    texto(t, M + 4, y + 4.5, { tam: 9.5 });
    centrado(fechaAR(v), M + etq, y, val, alto, { tam: 10 });
    y += alto;
  }
  y += 6;
  rect(M + CW - etq - val, y, etq, alto); rect(M + CW - val, y, val, alto);
  texto('FECHA DE CERTIFICACIÓN', M + CW - etq - val + 4, y + 4.5, { tam: 9.5 });
  centrado(fechaAR(d.fechaCert), M + CW - val, y, val, alto, { tam: 11 });
  y += alto + 10;

  // Designación
  y = banda('INSTALACION A REALIZAR EL SERVICIO', y, 22);
  const altoDes = 34;
  rect(M, y, CW, altoDes);
  texto('DESIGNACIÓN:', M + 4, y + 5, { tam: 10 });
  centrado(d.titulo, M + CW * 0.2, y + 2, CW * 0.8, 18, { fuente: f.b, tam: 13 });
  const sub = [d.zona, d.empresas.length ? 'Empresa: ' + d.empresas.join(', ') : ''].filter(Boolean).join('  ·  ');
  if (sub) centrado(sub, M + CW * 0.2, y + 19, CW * 0.8, 12, { tam: 8.5, color: GRIS_T });
  y += altoDes;

  // ---------- Grilla de vanos ----------
  y = banda('TRABAJOS SEGÚN RELEVAMIENTO', y, 22);
  const filas = [];
  for (let i = 0; i < d.celdas.length; i += POR_FILA) filas.push(d.celdas.slice(i, i + POR_FILA));
  const PIE = 26;
  for (const fila of filas) {
    if (y + ALTO_VANO + ALTO_ESTADO > H - M - PIE) {
      nueva();
      y = M;
      rect(M, y, CW, 22);
      texto(d.titulo, M + 4, y + 6, { fuente: f.b, tam: 10.5 });
      const cont = 'continuación';
      texto(cont, M + CW - ancho(cont, f.i, 9) - 4, y + 7, { fuente: f.i, tam: 9, color: GRIS_T });
      y += 22;
      y = banda('TRABAJOS SEGÚN RELEVAMIENTO', y, 20, { tam: 11.5 });
    }
    rect(M, y, COL_A, ALTO_VANO + ALTO_ESTADO);
    centrado('PODA', M, y, COL_A, ALTO_VANO + ALTO_ESTADO, { fuente: f.b, tam: 9.5 });
    for (let c = 0; c < POR_FILA; c++) {
      const x = M + COL_A + c * COL;
      const celda = fila[c];
      rect(x, y, COL, ALTO_VANO);
      rect(x, y + ALTO_VANO, COL, ALTO_ESTADO);
      if (!celda) continue;
      centrado(celda.vano, x, y, COL, ALTO_VANO, { fuente: f.b, tam: 10 });
      if (celda.estado) {
        const ls = renglones(celda.estado, f.n, 8, COL - 4).slice(0, 3);
        const y0 = y + ALTO_VANO + (ALTO_ESTADO - ls.length * 9.5) / 2;
        ls.forEach((l, k) => centrado(l, x, y0 + k * 9.5, COL, 9.5, { tam: 8 }));
      }
    }
    y += ALTO_VANO + ALTO_ESTADO;
  }
  const resumen = `${d.certificados} de ${d.total} vanos certificados`;
  texto(resumen, M + CW - ancho(resumen, f.n, 8.5), y + 3, { tam: 8.5, color: GRIS_T });
  y += 16;

  // ---------- Observaciones y firmas ----------
  const lineasDet = renglones(d.detalle, f.n, 9.5, CW - 10);
  const altoDet = Math.max(90, 22 + lineasDet.length * 12.5 + 8);
  const altoFirmas = 22 + 80;
  if (y + 22 + altoDet + altoFirmas + 8 > H - M - PIE) {
    nueva();
    y = M;
    rect(M, y, CW, 22);
    texto(d.titulo, M + 4, y + 6, { fuente: f.b, tam: 10.5 });
    y += 30;
  }
  y = banda('OBSERVACIONES', y, 22);
  rect(M, y, CW, altoDet);
  texto('DETALLE y PENDIENTES:', M + 4, y + 6, { fuente: f.b, tam: 9.5 });
  lineasDet.forEach((l, k) => texto(l, M + 5, y + 22 + k * 12.5, { tam: 9.5 }));
  y += altoDet + 8;
  y = banda('RESPONSABLES DE LA ACTIVIDAD', y, 22);
  rect(M, y, CW, 80);
  const anchoF = CW / 3;
  ['Firma - Encargado EPEC', 'Firma - Representante Técnico', 'Firma - Representante Ambiente'].forEach((t, k) => {
    const x = M + k * anchoF;
    page.drawLine({ start: { x: x + 18, y: H - y - 52 }, end: { x: x + anchoF - 18, y: H - y - 52 }, thickness: 0.6, color: NEGRO, dashArray: [1.5, 1.5] });
    centrado(t, x, y + 56, anchoF, 14, { tam: 9 });
  });

  // ---------- Pie en todas las páginas ----------
  const ahora = new Date();
  const hora = ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });
  pages.forEach((p, k) => {
    page = p;
    const izq = `Generado con la app de poda el ${fechaAR(hoyISO(ahora))} ${hora}${quien ? ' por ' + quien : ''}`;
    texto(izq, M, H - M - 10, { tam: 7.5, color: GRIS_T });
    const der = `Página ${k + 1} de ${pages.length}`;
    texto(der, M + CW - ancho(der, f.n, 7.5), H - M - 10, { tam: 7.5, color: GRIS_T });
  });

  return doc.save();
}
