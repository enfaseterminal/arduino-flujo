import {
  assertSvg,
  createExportSvg,
  createLegendPageSvg,
  downloadBlob,
  finiteBounds,
  sanitizeClone,
  sanitizeFilename,
} from "./export-manager.js";
import { getApplicationUrl } from "./application-url.js";

function createPdfTile(source, tile) {
  const root = source.cloneNode(true);
  root.setAttribute("width", `${tile.width}px`);
  root.setAttribute("height", `${tile.height}px`);
  root.setAttribute("viewBox", `${tile.x} ${tile.y} ${tile.width} ${tile.height}`);
  return root;
}

const TECHNICAL_PAGE = {
  width: 595.28,
  height: 841.89,
  margin: 42,
  footerY: 824,
};

function setPdfFont(pdf, style = "normal", family = "helvetica") {
  pdf.setFont?.(family, style);
}

function splitReportText(text, maxCharacters) {
  const lines = [];
  for (const sourceLine of String(text).split(/\r?\n/)) {
    if (!sourceLine) {
      lines.push("");
      continue;
    }
    for (let offset = 0; offset < sourceLine.length; offset += maxCharacters) {
      lines.push(sourceLine.slice(offset, offset + maxCharacters));
    }
  }
  return lines;
}

function splitCodeLines(source, maxCharacters) {
  return String(source)
    .split(/\r?\n/)
    .flatMap((line, index) => {
      const fragments = line
        ? Array.from({ length: Math.ceil(line.length / maxCharacters) }, (_unused, fragment) =>
            line.slice(fragment * maxCharacters, (fragment + 1) * maxCharacters),
          )
        : [""];
      return fragments.map((text) => ({ sourceLine: index + 1, text }));
    });
}

function pageSizeForSvg(svg) {
  const viewBox = (svg.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  const width = viewBox.length === 4 && Number.isFinite(viewBox[2])
    ? viewBox[2]
    : Number.parseFloat(svg.getAttribute("width"));
  const height = viewBox.length === 4 && Number.isFinite(viewBox[3])
    ? viewBox[3]
    : Number.parseFloat(svg.getAttribute("height"));
  if (![width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new TypeError("Las dimensiones de la imagen para la hoja técnica no son válidas.");
  }
  return { width, height };
}

function componentReferenceMap(components) {
  const prefixes = { led: "D", resistor: "R", button: "SW", potentiometer: "RV" };
  const counters = { led: 0, resistor: 0, button: 0, potentiometer: 0 };
  return new Map(components.map((component) => {
    counters[component.type] += 1;
    const reference = `${prefixes[component.type] ?? "X"}${counters[component.type]}`;
    return [component.id, { component, reference }];
  }));
}

function describeComponent(component) {
  const properties = component.properties ?? {};
  switch (component.type) {
    case "led":
      return { label: "LED", value: properties.color ?? "No especificado" };
    case "resistor":
      return {
        label: "Resistencia",
        value: `${properties.ohms ?? "?"} Ω · ±${properties.tolerance ?? "?"} % · ${properties.bandCount ?? "?"} bandas`,
      };
    case "button":
      return { label: "Pulsador", value: properties.pressed ? "Presionado" : "Liberado" };
    case "potentiometer":
      return { label: "Potenciómetro", value: `${properties.value ?? "?"}/1023` };
    default:
      return { label: component.type || "Componente", value: "No especificado" };
  }
}

function describeEndpoint(endpoint, references) {
  if (endpoint.startsWith("arduino:")) return `Arduino ${endpoint.slice("arduino:".length)}`;
  const separator = endpoint.lastIndexOf(":");
  const component = references.get(endpoint.slice(0, separator));
  if (!component) return endpoint;
  const terminalNames = {
    anode: "ánodo",
    cathode: "cátodo",
    lead1: "terminal 1",
    lead2: "terminal 2",
    contact1: "contacto 1",
    contact2: "contacto 2",
    end1: "extremo 1",
    wiper: "cursor",
    end2: "extremo 2",
  };
  return `${component.reference} · ${terminalNames[endpoint.slice(separator + 1)] ?? endpoint.slice(separator + 1)}`;
}

function createPdfReportRows(components, wires) {
  const references = componentReferenceMap(components);
  const componentRows = components.map((component) => {
    const { reference } = references.get(component.id);
    const description = describeComponent(component);
    return [reference, `${description.label} · ${component.id}`, description.value];
  });
  const wireRows = wires.map((wire) => [
    describeEndpoint(wire.from, references),
    describeEndpoint(wire.to, references),
  ]);
  return { componentRows, wireRows };
}

export async function exportPdf(
  svg,
  bounds,
  functionName,
  options = {},
  pdfFactory,
  renderSvg,
) {
  assertSvg(svg);
  finiteBounds(bounds);
  if (!pdfFactory || !renderSvg) {
    const [jspdfModule, svg2pdfModule] = await Promise.all([
      pdfFactory ? Promise.resolve(null) : import("jspdf"),
      renderSvg ? Promise.resolve(null) : import("svg2pdf.js/dist/svg2pdf.es.min.js"),
    ]);
    pdfFactory ??= (config) => new jspdfModule.jsPDF(config);
    renderSvg ??= svg2pdfModule.svg2pdf;
  }
  const metadata = options.metadata ?? {};
  const filename = sanitizeFilename(
    String(metadata.projectName ?? "").trim() || functionName,
    "pdf",
  );
  const sections = options.sections ?? {};
  const components = Array.isArray(options.components) ? options.components : [];
  const wires = Array.isArray(options.wires) ? options.wires : [];
  const reportRows = createPdfReportRows(components, wires);
  const includeDiagram = sections.diagram !== false;
  const includeCode = sections.code === true;
  const includeCircuit = sections.circuit === true && options.circuitSvg;
  const includeComponents = sections.components === true;
  const includeConnections = sections.connections === true;
  const applicationUrl = options.applicationUrl ?? getApplicationUrl();
  const urlLines = splitReportText(applicationUrl, 130);
  const footerTop = TECHNICAL_PAGE.footerY - ((urlLines.length - 1) * 7.5 + 22);
  const diagramDocument = includeDiagram
    ? createExportSvg(svg, bounds, { ...options, includeLegend: options.includeLegend !== false })
    : null;
  const pdf = pdfFactory({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
    compress: true,
  });
  const pageTitles = [];
  let pageNumber = 0;

  function addPage(title) {
    if (pageNumber > 0) pdf.addPage("a4", "portrait");
    pageNumber += 1;
    pageTitles.push(title);
    return { width: TECHNICAL_PAGE.width, height: TECHNICAL_PAGE.height };
  }

  function drawPageHeading(title, subtitle = "") {
    setPdfFont(pdf, "bold");
    pdf.setFontSize(18);
    pdf.setTextColor(32, 41, 56);
    pdf.text(title, TECHNICAL_PAGE.margin, 54);
    if (subtitle) {
      setPdfFont(pdf, "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(98, 111, 130);
      pdf.text(subtitle, TECHNICAL_PAGE.margin, 72);
    }
    pdf.setDrawColor(220, 226, 234);
    pdf.setLineWidth(0.7);
    pdf.line(TECHNICAL_PAGE.margin, 86, TECHNICAL_PAGE.width - TECHNICAL_PAGE.margin, 86);
  }

  async function drawSvgSection(sectionTitle, sectionSvg, subtitle) {
    addPage(sectionTitle);
    drawPageHeading(sectionTitle, subtitle);
    const dimensions = pageSizeForSvg(sectionSvg);
    const area = {
      x: TECHNICAL_PAGE.margin,
      y: 102,
      width: TECHNICAL_PAGE.width - TECHNICAL_PAGE.margin * 2,
      height: footerTop - 112,
    };
    const scale = Math.min(area.width / dimensions.width, area.height / dimensions.height);
    const width = dimensions.width * scale;
    const height = dimensions.height * scale;
    sanitizeClone(sectionSvg);
    try {
      return await renderSvg(sectionSvg, pdf, {
        x: area.x + (area.width - width) / 2,
        y: area.y + (area.height - height) / 2,
        width,
        height,
      });
    } catch (error) {
      throw new Error(`No se pudo representar «${sectionTitle}»: ${error.message}`, { cause: error });
    }
  }

  addPage("Portada");
  pdf.setDrawColor(20, 125, 120);
  pdf.setLineWidth(4);
  pdf.line(TECHNICAL_PAGE.margin, 92, TECHNICAL_PAGE.width - TECHNICAL_PAGE.margin, 92);
  setPdfFont(pdf, "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(20, 125, 120);
  pdf.text("ARDUINO FLOWCHART · HOJA TÉCNICA", TECHNICAL_PAGE.margin, 72);
  setPdfFont(pdf, "bold");
  pdf.setFontSize(28);
  pdf.setTextColor(32, 41, 56);
  const projectName = String(metadata.projectName ?? "").trim() || "No especificado";
  const titleLines = splitReportText(projectName, 34);
  pdf.text(titleLines, TECHNICAL_PAGE.margin, 166);
  let cursorY = 166 + titleLines.length * 34 + 14;
  setPdfFont(pdf, "normal");
  pdf.setFontSize(13);
  pdf.setTextColor(98, 111, 130);
  pdf.text("Ficha técnica de proyecto electrónico", TECHNICAL_PAGE.margin, cursorY);
  cursorY += 48;

  const coverFields = [
    ["Autor", String(metadata.author ?? "").trim() || "No especificado"],
    ["Fecha", String(metadata.date ?? "").trim() || "No especificado"],
    ["Versión", String(metadata.version ?? "").trim() || "No especificada"],
    ["Función del diagrama", functionName],
  ];
  for (const [label, value] of coverFields) {
    pdf.setDrawColor(229, 233, 240);
    pdf.line(TECHNICAL_PAGE.margin, cursorY - 14, TECHNICAL_PAGE.width - TECHNICAL_PAGE.margin, cursorY - 14);
    setPdfFont(pdf, "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(71, 85, 105);
    pdf.text(label, TECHNICAL_PAGE.margin, cursorY);
    setPdfFont(pdf, "normal");
    pdf.setTextColor(32, 41, 56);
    const valueLines = splitReportText(value, 48);
    pdf.text(valueLines, TECHNICAL_PAGE.margin + 150, cursorY);
    cursorY += Math.max(34, valueLines.length * 14 + 10);
  }
  const description = String(metadata.description ?? "").trim();
  if (description) {
    cursorY += 18;
    setPdfFont(pdf, "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(71, 85, 105);
    pdf.text("Descripción", TECHNICAL_PAGE.margin, cursorY);
    cursorY += 18;
    setPdfFont(pdf, "normal");
    pdf.setTextColor(32, 41, 56);
    const descriptionLines = splitReportText(description, 92);
    pdf.text(descriptionLines, TECHNICAL_PAGE.margin, cursorY);
  }
  setPdfFont(pdf, "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(98, 111, 130);
  pdf.text("Documento generado con Arduino Flowchart", TECHNICAL_PAGE.margin, Math.min(764, footerTop - 20));

  if (diagramDocument) {
    await drawSvgSection("Diagrama de flujo", diagramDocument, `${functionName} · etiquetas visuales y comentarios incluidos`);
  }
  if (includeCode) {
    const codeLines = splitCodeLines(options.sourceCode ?? "", 104);
    const linesPerPage = Math.max(1, Math.min(65, Math.floor((footerTop - 116) / 10)));
    const totalCodePages = Math.max(1, Math.ceil(codeLines.length / linesPerPage));
    for (let index = 0; index < totalCodePages; index += 1) {
      addPage("Código fuente");
      drawPageHeading(
        "Código fuente",
        `${functionName} · página ${index + 1} de ${totalCodePages}`,
      );
      setPdfFont(pdf, "normal", "courier");
      pdf.setFontSize(7.5);
      const pageLines = codeLines.slice(index * linesPerPage, (index + 1) * linesPerPage);
      pageLines.forEach((line, lineIndex) => {
        const y = 106 + lineIndex * 10;
        pdf.setTextColor(117, 129, 150);
        pdf.text(String(line.sourceLine), TECHNICAL_PAGE.margin, y);
        pdf.setTextColor(39, 50, 68);
        pdf.text(line.text || " ", TECHNICAL_PAGE.margin + 32, y);
      });
    }
  }
  if (includeCircuit) {
    await drawSvgSection(
      "Montaje electrónico",
      options.circuitSvg,
      "Render del laboratorio · Arduino Uno, protoboard, componentes y conexiones",
    );
  }

  async function drawTableSection(title, headers, rows, emptyMessage) {
    const rowsPerPage = Math.max(1, Math.min(25, Math.floor((footerTop - 152) / 25)));
    const pageCount = Math.max(1, Math.ceil(rows.length / rowsPerPage));
    for (let page = 0; page < pageCount; page += 1) {
      addPage(title);
      drawPageHeading(title, pageCount > 1 ? `Página ${page + 1} de ${pageCount}` : "");
      const columnWidths = headers.length === 3 ? [82, 190, 239] : [254, 257];
      let x = TECHNICAL_PAGE.margin;
      setPdfFont(pdf, "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(71, 85, 105);
      headers.forEach((header, index) => {
        pdf.text(header, x, 108);
        x += columnWidths[index];
      });
      pdf.setDrawColor(20, 125, 120);
      pdf.setLineWidth(1);
      pdf.line(TECHNICAL_PAGE.margin, 117, TECHNICAL_PAGE.width - TECHNICAL_PAGE.margin, 117);
      const pageRows = rows.slice(page * rowsPerPage, (page + 1) * rowsPerPage);
      if (!pageRows.length) {
        setPdfFont(pdf, "normal");
        pdf.setFontSize(10);
        pdf.setTextColor(98, 111, 130);
        pdf.text(emptyMessage, TECHNICAL_PAGE.margin, 142);
      }
      pageRows.forEach((row, rowIndex) => {
        const y = 138 + rowIndex * 25;
        let columnX = TECHNICAL_PAGE.margin;
        setPdfFont(pdf, "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(39, 50, 68);
        row.forEach((cell, columnIndex) => {
          const value = String(cell);
          const maxChars = columnIndex === 0 ? 21 : columnIndex === 1 ? 44 : 52;
          pdf.text(splitReportText(value, maxChars).slice(0, 2), columnX, y);
          columnX += columnWidths[columnIndex];
        });
        pdf.setDrawColor(229, 233, 240);
        pdf.setLineWidth(0.4);
        pdf.line(TECHNICAL_PAGE.margin, y + 9, TECHNICAL_PAGE.width - TECHNICAL_PAGE.margin, y + 9);
      });
    }
  }

  if (includeComponents) {
    await drawTableSection(
      "Listado de componentes",
      ["Referencia", "Componente", "Valor / estado"],
      reportRows.componentRows,
      "El montaje no contiene componentes.",
    );
  }
  if (includeConnections) {
    await drawTableSection(
      "Conexiones y cableado",
      ["Origen", "Destino"],
      reportRows.wireRows,
      "El montaje no contiene conexiones.",
    );
  }

  for (let index = 0; index < pageTitles.length; index += 1) {
    pdf.setPage?.(index + 1);
    pdf.setDrawColor(220, 226, 234);
    pdf.setLineWidth(0.6);
    pdf.line(TECHNICAL_PAGE.margin, footerTop, TECHNICAL_PAGE.width - TECHNICAL_PAGE.margin, footerTop);
    setPdfFont(pdf, "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(98, 111, 130);
    pdf.text(`${index + 1} / ${pageTitles.length}`, TECHNICAL_PAGE.margin, TECHNICAL_PAGE.footerY);
    urlLines.forEach((line, lineIndex) => {
      pdf.text(
        line,
        TECHNICAL_PAGE.width - TECHNICAL_PAGE.margin,
        TECHNICAL_PAGE.footerY - (urlLines.length - lineIndex - 1) * 7.5,
        { align: "right" },
      );
    });
  }

  const blob = pdf.output("blob");
  if (!(blob instanceof Blob) || blob.size === 0) throw new Error("No se pudo generar el PDF.");
  downloadBlob(blob, filename);
  return { filename, blob, pages: pageTitles.length };
}

export const PDF_EXPORT_IMPLEMENTED = true;
