const map = L.map("map").setView([23.6345, -102.5528], 5);

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
  maxZoom: 19
}).addTo(map);

let geojsonData = null;
let indicadoresData = null;
let capaEstados = null;
let estadoSeleccionadoId = null;

const indicadorSelect = document.getElementById("indicadorSelect");
const anioSelect = document.getElementById("anioSelect");
const detalleEstado = document.getElementById("detalleEstado");

function normalizarClave(valor) {
  return String(valor ?? "").trim().padStart(2, "0");
}

function obtenerValor(cveEntidad, indicador, anio) {
  const registro = indicadoresData?.[anio]?.[cveEntidad];
  if (!registro) return null;
  const val = Number(registro[indicador]);
  return Number.isFinite(val) ? val : null;
}

function obtenerUmbrales(indicador, anio) {
  const valores = Object.values(indicadoresData?.[anio] || {})
    .map((item) => Number(item[indicador]))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  if (!valores.length) return [0, 25, 50, 75];
  const min = valores[0];
  const max = valores[valores.length - 1];
  const paso = (max - min) / 4;
  return [
    min,
    min + paso,
    min + paso * 2,
    min + paso * 3
  ];
}

function obtenerColor(valor, umbrales) {
  const colores = ["#eff6ff", "#bfdbfe", "#60a5fa", "#2563eb", "#1e3a8a"];
  if (valor === null || valor === undefined) return "#e5e7eb";
  if (valor >= umbrales[3]) return colores[4];
  if (valor >= umbrales[2]) return colores[3];
  if (valor >= umbrales[1]) return colores[2];
  if (valor >= umbrales[0]) return colores[1];
  return colores[0];
}

function formatearValor(valor, indicador) {
  if (valor === null || valor === undefined) return "Sin dato";
  if (indicador === "escolaridad") return `${valor.toFixed(1)} años`;
  return valor.toLocaleString("es-MX");
}

const leyenda = L.control({ position: "bottomright" });

leyenda.onAdd = function () {
  this._div = L.DomUtil.create("div", "legend");
  this.actualizar();
  return this._div;
};

leyenda.actualizar = function () {
  if (!this._div || !indicadoresData) return;
  const indicador = indicadorSelect.value;
  const anio = anioSelect.value;
  const umbrales = obtenerUmbrales(indicador, anio);
  const colores = ["#bfdbfe", "#60a5fa", "#2563eb", "#1e3a8a"];

  let html = `<strong>${indicadorSelect.options[indicadorSelect.selectedIndex].text} (${anio})</strong><br/>`;
  for (let i = 0; i < umbrales.length; i++) {
    const inicio = formatearValor(umbrales[i], indicador);
    const fin = umbrales[i + 1] !== undefined ? formatearValor(umbrales[i + 1], indicador) : "Máx";
    html += `<i style="background:${colores[i] || "#1e3a8a"}"></i> ${inicio} – ${fin}<br/>`;
  }
  this._div.innerHTML = html;
};

leyenda.addTo(map);

function estiloEstado(feature) {
  const cve = normalizarClave(
    feature.properties.CVEGEO ?? feature.properties.CVE_ENT ?? feature.properties.id
  );
  const valor = obtenerValor(cve, indicadorSelect.value, anioSelect.value);
  const umbrales = obtenerUmbrales(indicadorSelect.value, anioSelect.value);
  const esSeleccionado = estadoSeleccionadoId === cve;

  return {
    fillColor: obtenerColor(valor, umbrales),
    weight: esSeleccionado ? 3 : 1.2,
    opacity: 1,
    color: esSeleccionado ? "#111827" : "#4b5563",
    fillOpacity: 0.8
  };
}

function mostrarDetalle(props, cve) {
  const nombre = props.NOMGEO ?? props.NOM_ENT ?? props.name ?? `Entidad ${cve}`;
  const valorActual = obtenerValor(cve, indicadorSelect.value, anioSelect.value);
  const etiqueta = indicadorSelect.options[indicadorSelect.selectedIndex].text;

  detalleEstado.innerHTML = `
    <p><strong>Estado:</strong> ${nombre} (Clave: ${cve})</p>
    <p><strong>Año:</strong> ${anioSelect.value}</p>
    <p><strong>${etiqueta}:</strong> ${formatearValor(valorActual, indicadorSelect.value)}</p>
  `;
}

function renderizarEstados() {
  if (!geojsonData || !indicadoresData) return;

  if (capaEstados) {
    map.removeLayer(capaEstados);
  }

  capaEstados = L.geoJSON(geojsonData, {
    style: estiloEstado,
    onEachFeature: (feature, layer) => {
      const cve = normalizarClave(
        feature.properties.CVEGEO ?? feature.properties.CVE_ENT ?? feature.properties.id
      );
      const nombre = feature.properties.NOMGEO ?? feature.properties.NOM_ENT ?? feature.properties.name ?? `Entidad ${cve}`;

      layer.bindTooltip("", { sticky: true });

      layer.on("mouseover", () => {
        const valor = obtenerValor(cve, indicadorSelect.value, anioSelect.value);
        layer.setTooltipContent(
          `<strong>${nombre}</strong><br/>${formatearValor(valor, indicadorSelect.value)}`
        );
        layer.setStyle({ weight: 2.5, color: "#111827" });
        layer.bringToFront();
      });

      layer.on("mouseout", () => {
        capaEstados.resetStyle(layer);
      });

      layer.on("click", () => {
        estadoSeleccionadoId = cve;
        capaEstados.setStyle(estiloEstado);
        mostrarDetalle(feature.properties, cve);
      });
    }
  }).addTo(map);

  leyenda.actualizar();
}

function cargarCapaPuntos(puntosData) {
  const clusterGroup = L.markerClusterGroup();

  (puntosData.features || puntosData || []).forEach((item) => {
    const coords = item.geometry?.coordinates;
    const props = item.properties || item;

    let lat, lng;
    if (Array.isArray(coords) && coords.length >= 2) {
      lng = Number(coords[0]);
      lat = Number(coords[1]);
    } else {
      lat = Number(props.lat);
      lng = Number(props.lng);
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const marker = L.marker([lat, lng]);
    const titulo = props.nombre ?? "Punto de interés";
    const tipo = props.tipo ?? "Categoría";
    const estado = props.estado ?? "";

    marker.bindPopup(`<strong>${titulo}</strong><br/>${tipo}${estado ? ` — ${estado}` : ""}`);
    clusterGroup.addLayer(marker);
  });

  map.addLayer(clusterGroup);
}

async function iniciarMapa() {
  const [resGeo, resInd, resPuntos] = await Promise.all([
    fetch("./data/estados.geojson"),
    fetch("./data/indicadores.json"),
    fetch("./data/puntos.json")
  ]);

  geojsonData = await resGeo.json();
  indicadoresData = await resInd.json();
  const puntosData = await resPuntos.json();

  renderizarEstados();
  cargarCapaPuntos(puntosData);
}

indicadorSelect.addEventListener("change", renderizarEstados);
anioSelect.addEventListener("change", renderizarEstados);

iniciarMapa();