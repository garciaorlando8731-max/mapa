const map = L.map("map").setView([23.6345, -102.5528], 5);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
  maxZoom: 19
}).addTo(map);

const paleta = ["#eff6ff", "#bfdbfe", "#60a5fa", "#2563eb", "#1e3a8a"];
const clusterGroup = L.markerClusterGroup().addTo(map);

const indicadorSelect = document.getElementById("indicadorSelect");
const anioSelect = document.getElementById("anioSelect");
const categoriaSelect = document.getElementById("categoriaSelect");
const detalleEstado = document.getElementById("detalleEstado");
const estadoCarga = document.getElementById("estadoCarga");

let geojsonData, indicadoresData, puntosData = [], capaEstados, estadoSeleccionadoId = null;

const getClave = (f) => {
  const p = f.properties || {};
  const raw = String(p.CVEGEO ?? p.CVE_ENT ?? p.CVE_EDO ?? p.clave_ent ?? p.clave ?? p.id ?? f.id ?? "").trim();
  const dig = raw.replace(/\D/g, "");
  return dig.length === 1 || dig.length === 2 ? dig.padStart(2, "0") : raw;
};

const getNombre = (f, cve) => {
  const p = f.properties || {};
  return p.NOMGEO ?? p.NOM_ENT ?? p.NOM_EDO ?? p.nombre ?? p.name ?? `Entidad ${cve}`;
};

const getValor = (cve, ind = indicadorSelect.value, anio = anioSelect.value) => {
  const reg = indicadoresData?.[anio]?.[cve] ?? indicadoresData?.[anio]?.[String(Number(cve))];
  const n = Number(reg?.[ind]);
  return Number.isFinite(n) ? n : null;
};

const getUmbrales = (ind, anio) => {
  const vals = Object.values(indicadoresData?.[anio] || {})
    .map((x) => Number(x?.[ind])).filter(Number.isFinite).sort((a, b) => a - b);
  if (!vals.length) return [0, 25, 50, 75];
  const min = vals[0], paso = (vals[vals.length - 1] - min) / 4;
  return [min, min + paso, min + paso * 2, min + paso * 3];
};

const getColor = (val, umb) => {
  if (val === null || val === undefined) return "#e5e7eb";
  for (let i = umb.length - 1; i >= 0; i--) {
    if (val >= umb[i]) return paleta[i + 1];
  }
  return paleta[0];
};

const fmtValor = (val, ind) =>
  val === null || val === undefined
    ? "Sin dato"
    : ind === "escolaridad"
      ? `${val.toFixed(1)} años`
      : `${Math.round(val).toLocaleString("es-MX")} hab.`;

const leyenda = L.control({ position: "bottomright" });
leyenda.onAdd = function () {
  this._div = L.DomUtil.create("div", "legend");
  this.actualizar();
  return this._div;
};
leyenda.actualizar = function () {
  if (!this._div || !indicadoresData) return;
  const ind = indicadorSelect.value, anio = anioSelect.value;
  const etiqueta = indicadorSelect.options[indicadorSelect.selectedIndex].text;
  const umb = getUmbrales(ind, anio);

  let html = `<strong>${etiqueta} (${anio})</strong>
    <div class="legend-item"><span class="legend-color" style="background:${paleta[0]}"></span><span>Menor a ${fmtValor(umb[0], ind)}</span></div>`;

  for (let i = 0; i < umb.length; i++) {
    const fin = i < umb.length - 1 ? fmtValor(umb[i + 1], ind) : "Máximo";
    html += `<div class="legend-item"><span class="legend-color" style="background:${paleta[i + 1]}"></span><span>${fmtValor(umb[i], ind)} – ${fin}</span></div>`;
  }
  html += `<div class="legend-item"><span class="legend-color" style="background:#e5e7eb"></span><span>Sin dato</span></div>`;
  this._div.innerHTML = html;
};
leyenda.addTo(map);

const estiloEstado = (f) => {
  const cve = getClave(f);
  const sel = estadoSeleccionadoId === cve;
  return {
    fillColor: getColor(getValor(cve), getUmbrales(indicadorSelect.value, anioSelect.value)),
    weight: sel ? 3 : 1.2,
    opacity: 1,
    color: sel ? "#0f172a" : "#475569",
    fillOpacity: 0.78
  };
};

function mostrarDetalle(f, cve) {
  const anio = anioSelect.value;
  detalleEstado.innerHTML = `
    <p><strong>Estado:</strong> ${getNombre(f, cve)}</p>
    <p><strong>Clave de entidad:</strong> ${cve || "N/D"}</p>
    <p><strong>Año consultado:</strong> ${anio}</p>
    <p><strong>Población total:</strong> ${fmtValor(getValor(cve, "poblacion", anio), "poblacion")}</p>
    <p><strong>Escolaridad promedio:</strong> ${fmtValor(getValor(cve, "escolaridad", anio), "escolaridad")}</p>
  `;
}

function renderizarEstados() {
  if (!geojsonData || !indicadoresData) return;
  if (capaEstados) map.removeLayer(capaEstados);

  capaEstados = L.geoJSON(geojsonData, {
    style: estiloEstado,
    onEachFeature: (f, layer) => {
      const cve = getClave(f), nombre = getNombre(f, cve);
      layer.bindTooltip("", { sticky: true });
      layer.on("mouseover", () => {
        const ind = indicadorSelect.value;
        const etq = indicadorSelect.options[indicadorSelect.selectedIndex].text;
        layer.setTooltipContent(`<strong>${nombre}</strong><br/>${etq}: ${fmtValor(getValor(cve, ind), ind)}`);
        layer.setStyle({ weight: 2.5, color: "#0f172a" }).bringToFront();
      });
      layer.on("mouseout", () => capaEstados.resetStyle(layer));
      layer.on("click", () => {
        estadoSeleccionadoId = cve;
        capaEstados.setStyle(estiloEstado);
        mostrarDetalle(f, cve);
      });
    }
  }).addTo(map);

  leyenda.actualizar();
}

function renderizarPuntos() {
  clusterGroup.clearLayers();
  const cat = categoriaSelect.value;
  const items = Array.isArray(puntosData) ? puntosData : (puntosData?.features || []);

  items.forEach((item) => {
    const p = item.properties || item, c = item.geometry?.coordinates;
    const lat = Number(Array.isArray(c) ? c[1] : p.lat);
    const lng = Number(Array.isArray(c) ? c[0] : p.lng);
    const tipo = p.tipo || "Punto de interés";
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (cat !== "todos" && tipo !== cat)) return;

    const m = L.marker([lat, lng]).bindPopup(
      `<strong>${p.nombre || "Sin nombre"}</strong><br/>Tipo: ${tipo}${p.estado ? `<br/>Estado: ${p.estado}` : ""}`
    );
    clusterGroup.addLayer(m);
  });
}

const cargarJSON = async (ruta) => {
  const r = await fetch(ruta);
  if (!r.ok) throw new Error(`No se pudo cargar ${ruta} (HTTP ${r.status})`);
  return r.json();
};

async function iniciarMapa() {
  estadoCarga.textContent = "";
  try {
    [geojsonData, indicadoresData, puntosData] = await Promise.all([
      cargarJSON("./data/estados.geojson"),
      cargarJSON("./data/indicadores.json"),
      cargarJSON("./data/puntos.json")
    ]);
    renderizarEstados();
    renderizarPuntos();
  } catch (err) {
    console.error(err);
    estadoCarga.textContent = `Aviso: ${err.message}. Revisa los archivos en ./data/.`;
  }
}

indicadorSelect.addEventListener("change", renderizarEstados);
anioSelect.addEventListener("change", () => {
  renderizarEstados();
  capaEstados?.eachLayer((l) => {
    if (getClave(l.feature) === estadoSeleccionadoId) mostrarDetalle(l.feature, estadoSeleccionadoId);
  });
});
categoriaSelect.addEventListener("change", renderizarPuntos);

iniciarMapa();