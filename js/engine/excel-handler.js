(function (root) {
  "use strict";

  if (typeof document === "undefined") return;

  const {
    loadProvincesFromRows,
    dataSummary,
    buildScenario,
    constants,
  } = root.OfflineModel || {};

  const XLSX_NS =
    "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const REL_NS =
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const state = {
    file: null,
    bytes: null,
    zip: null,
    sheetPaths: new Map(),
    provinces: null,
    summary: null,
    pending: null,
    pendingResolve: null,
    pendingReject: null,
  };

  function response(payload, status = 200) {
    return {
      ok: status >= 200 && status < 300,
      status,
      async json() {
        return payload;
      },
    };
  }

  const xmlParser = new DOMParser();
  const xmlSerializer = new XMLSerializer();
  const parseXml = (text) =>
    xmlParser.parseFromString(text, "application/xml");

  function columnIndex(reference) {
    const match = String(reference || "").match(/[A-Z]+/i);
    if (!match) return 0;
    return [...match[0].toUpperCase()].reduce(
      (value, character) =>
        value * 26 + character.charCodeAt(0) - 64,
      0,
    ) - 1;
  }

  function cellText(cell, sharedStrings) {
    const type = cell.getAttribute("t");
    if (type === "inlineStr") {
      return [...cell.getElementsByTagName("t")]
        .map((node) => node.textContent || "")
        .join("");
    }
    const valueNode = cell.getElementsByTagName("v")[0];
    const raw = valueNode?.textContent ?? "";
    if (type === "s") return sharedStrings[Number(raw)] ?? "";
    if (type === "str") return raw;
    if (type === "b") return raw === "1";
    if (type === "e") return raw;
    if (raw === "") return null;
    const number = Number(raw);
    return Number.isFinite(number) ? number : raw;
  }

  async function readSharedStrings(zip) {
    const entry = zip.file("xl/sharedStrings.xml");
    if (!entry) return [];
    const documentXml = parseXml(await entry.async("text"));
    return [...documentXml.getElementsByTagName("si")].map((item) =>
      [...item.getElementsByTagName("t")]
        .map((node) => node.textContent || "")
        .join(""),
    );
  }

  async function workbookSheetPaths(zip) {
    const workbook = parseXml(
      await zip.file("xl/workbook.xml").async("text"),
    );
    const relationships = parseXml(
      await zip.file("xl/_rels/workbook.xml.rels").async("text"),
    );
    const targets = new Map(
      [...relationships.getElementsByTagName("Relationship")].map(
        (relationship) => [
          relationship.getAttribute("Id"),
          relationship.getAttribute("Target"),
        ],
      ),
    );
    const result = new Map();
    [...workbook.getElementsByTagName("sheet")].forEach((sheet) => {
      const name = sheet.getAttribute("name");
      const relationshipId =
        sheet.getAttributeNS(REL_NS, "id") ||
        sheet.getAttribute("r:id");
      const target = targets.get(relationshipId);
      if (!target) return;
      const normalized = target.startsWith("/")
        ? target.slice(1)
        : target.startsWith("xl/")
          ? target
          : `xl/${target.replace(/^\.?\//, "")}`;
      result.set(name, normalized);
    });
    return result;
  }

  async function readSheetRows(zip, sheetPath, sharedStrings) {
    const entry = zip.file(sheetPath);
    if (!entry) throw new Error(`Excel sayfası okunamadı: ${sheetPath}`);
    const xml = parseXml(await entry.async("text"));
    const rows = [];
    [...xml.getElementsByTagName("row")].forEach((rowNode) => {
      const rowIndex = Math.max(
        0,
        Number(rowNode.getAttribute("r") || rows.length + 1) - 1,
      );
      const row = rows[rowIndex] || [];
      [...rowNode.getElementsByTagName("c")].forEach((cell) => {
        row[columnIndex(cell.getAttribute("r"))] = cellText(
          cell,
          sharedStrings,
        );
      });
      rows[rowIndex] = row;
    });
    const width = Math.max(0, ...rows.map((row) => row.length));
    return rows.map((row) =>
      Array.from({ length: width }, (_, index) =>
        row[index] === undefined ? null : row[index],
      ),
    );
  }

  // VERİ GİZLİLİĞİ: Varsayılan kadro sayıları şablon olarak sıfırlanmıştır.
  // Gerçek değerler yüklenen Excel dosyasından ("Hazırlık" sayfası) dinamik olarak okunur.
  const PREPARATION_FALLBACK = Object.freeze({
    "İstanbul": 0,
    Ankara: 0,
    "İzmir": 0,
  });

  function normalizedTurkishText(value) {
    return String(value ?? "")
      .trim()
      .toLocaleLowerCase("tr-TR")
      .replace(/\s+/g, " ");
  }

  function findSheetPath(paths, expectedName) {
    const normalizedExpected = normalizedTurkishText(expectedName);
    for (const [name, path] of paths.entries()) {
      if (normalizedTurkishText(name) === normalizedExpected) return path;
    }
    return null;
  }

  function preparationCityName(value) {
    const normalized = normalizedTurkishText(value);
    if (normalized === "istanbul") return "\u0130stanbul";
    if (normalized === "ankara") return "Ankara";
    if (normalized === "izmir") return "\u0130zmir";
    return null;
  }

  function preparationTeamFromRows(rows) {
    const result = { ...PREPARATION_FALLBACK };
    (rows || []).forEach((row) => {
      const city = preparationCityName(row?.[0]);
      if (!city) return;
      const value = Number(row?.[1]);
      if (Number.isFinite(value) && value >= 0) {
        result[city] = Math.round(value);
      }
    });
    return result;
  }

  async function parseSelectedWorkbook(file) {
    if (!root.JSZip) {
      throw new Error("Çevrimdışı Excel okuyucusu yüklenemedi.");
    }
    const bytes = await file.arrayBuffer();
    const zip = await root.JSZip.loadAsync(bytes);
    const paths = await workbookSheetPaths(zip);
    for (const required of ["Özet Çalışma"]) {
      if (!paths.has(required)) {
        throw new Error(
          `'${required}' sayfası bulunamadı. Model Excel dosyasını seçin.`,
        );
      }
    }
    const shared = await readSharedStrings(zip);
    const mainRows = await readSheetRows(
      zip,
      paths.get("Özet Çalışma"),
      shared,
    );
    const preparationPath = findSheetPath(paths, "Haz\u0131rl\u0131k");
    const preparationRows = preparationPath
      ? await readSheetRows(zip, preparationPath, shared)
      : [];
    const preparationTeam = preparationTeamFromRows(preparationRows);
    const provinces = loadProvincesFromRows(mainRows);
    state.file = file;
    state.bytes = bytes;
    state.zip = zip;
    state.sheetPaths = paths;
    state.provinces = provinces;
    state.summary = {
      ...dataSummary(provinces, file),
      preparation_team: preparationTeam,
      preparation_sheet_found: Boolean(preparationPath),
    };
    return state.summary;
  }

  function buildOverlay() {
    const overlay = document.createElement("div");
    overlay.id = "offlineExcelOverlay";
    overlay.innerHTML = `
      <div class="offline-file-card" role="dialog" aria-modal="true" aria-labelledby="offlineFileTitle">
        <div class="offline-file-icon" aria-hidden="true">XL</div>
        <p class="offline-file-kicker">ÇEVRİMDIŞI • VERİ BİLGİSAYARINIZDA KALIR</p>
        <h2 id="offlineFileTitle">Model Excel’ini seçin</h2>
        <p class="offline-file-copy">Dashboard, <strong>Danisman_Model_Verisi.xlsx</strong> dosyasını yalnızca bu tarayıcı sekmesinde okur. Dosya hiçbir sunucuya gönderilmez.</p>
        <input id="offlineExcelInput" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden />
        <button id="offlineChooseButton" type="button">Excel dosyasını seç</button>
        <button id="offlineCancelButton" class="offline-cancel" type="button" hidden>Vazgeç</button>
        <p id="offlineFileError" class="offline-file-error" aria-live="polite"></p>
        <small>HTML ve Excel dosyalarını aynı klasörde tutmanız kullanım kolaylığı sağlar.</small>
      </div>`;
    document.body.appendChild(overlay);
    const input = overlay.querySelector("#offlineExcelInput");
    const choose = overlay.querySelector("#offlineChooseButton");
    const cancel = overlay.querySelector("#offlineCancelButton");
    choose.addEventListener("click", () => {
      input.value = "";
      input.click();
    });
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      choose.disabled = true;
      choose.textContent = "Excel doğrulanıyor…";
      overlay.querySelector("#offlineFileError").textContent = "";
      try {
        const summary = await parseSelectedWorkbook(file);
        overlay.classList.add("offline-hidden");
        state.pendingResolve?.(summary);
        clearPending();
      } catch (error) {
        overlay.querySelector("#offlineFileError").textContent =
          error.message || String(error);
        state.pendingReject?.(error);
        clearPending();
      } finally {
        choose.disabled = false;
        choose.textContent = "Excel dosyasını seç";
      }
    });
    cancel.addEventListener("click", () => {
      overlay.classList.add("offline-hidden");
      state.pendingResolve?.(state.summary);
      clearPending();
    });
    return overlay;
  }

  function clearPending() {
    state.pending = null;
    state.pendingResolve = null;
    state.pendingReject = null;
  }

  const overlay = buildOverlay();

  function selectWorkbook(force) {
    if (state.summary && !force) return Promise.resolve(state.summary);
    if (state.pending) return state.pending;
    overlay.classList.remove("offline-hidden");
    overlay.querySelector("#offlineCancelButton").hidden = !state.summary;
    state.pending = new Promise((resolve, reject) => {
      state.pendingResolve = resolve;
      state.pendingReject = reject;
    });
    return state.pending;
  }

  root.fetch = async function offlineFetch(url, options = {}) {
    const path = String(url);
    try {
      if (path === "/api/summary") {
        return response(await selectWorkbook(false));
      }
      if (path === "/api/reload") {
        return response({
          summary: await selectWorkbook(true),
        });
      }
      if (path === "/api/calculate") {
        if (!state.provinces) await selectWorkbook(false);
        const payload = options.body ? JSON.parse(options.body) : {};
        return response(buildScenario(state.provinces, payload));
      }
      return response(
        {
          error:
            "Çevrimdışı sürüm internet isteği yapmaz. Yalnızca yerel model uçları kullanılabilir.",
        },
        404,
      );
    } catch (error) {
      return response({ error: error.message || String(error) }, 400);
    }
  };

  function findCell(documentXml, reference) {
    return [...documentXml.getElementsByTagName("c")].find(
      (cell) => cell.getAttribute("r") === reference,
    );
  }

  function setCellValue(documentXml, reference, value) {
    const cell = findCell(documentXml, reference);
    if (!cell) {
      throw new Error(
        `${reference} hücresi bulunamadı. Teslim edilen model Excel’ini kullanın.`,
      );
    }
    [...cell.childNodes].forEach((node) => {
      if (["f", "v", "is"].includes(node.localName)) cell.removeChild(node);
    });
    if (typeof value === "number" && Number.isFinite(value)) {
      cell.removeAttribute("t");
      const node = documentXml.createElementNS(XLSX_NS, "v");
      node.textContent = String(value);
      cell.appendChild(node);
    } else {
      cell.setAttribute("t", "inlineStr");
      const inline = documentXml.createElementNS(XLSX_NS, "is");
      const text = documentXml.createElementNS(XLSX_NS, "t");
      text.setAttributeNS(
        "http://www.w3.org/XML/1998/namespace",
        "xml:space",
        "preserve",
      );
      text.textContent = String(value ?? "");
      inline.appendChild(text);
      cell.appendChild(inline);
    }
  }

  function excelColumn(index) {
    let value = index + 1;
    let result = "";
    while (value > 0) {
      const remainder = (value - 1) % 26;
      result = String.fromCharCode(65 + remainder) + result;
      value = Math.floor((value - 1) / 26);
    }
    return result;
  }

  async function patchSheet(zip, sheetPath, updates) {
    const xml = parseXml(await zip.file(sheetPath).async("text"));
    for (const [reference, value] of updates) {
      setCellValue(xml, reference, value);
    }
    zip.file(
      sheetPath,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${xmlSerializer.serializeToString(
        xml.documentElement,
      )}`,
    );
  }

  root.downloadUpdatedExcel = async function downloadUpdatedExcel(
    activeScenario,
    activePayload,
  ) {
    if (!state.bytes || !state.provinces) {
      throw new Error("Önce model Excel’ini seçin.");
    }
    if (!activeScenario?.rows?.length) {
      throw new Error("İndirilecek hesaplanmış senaryo bulunamadı.");
    }
    const zip = await root.JSZip.loadAsync(state.bytes.slice(0));
    const scenario = activeScenario;
    const payload = activePayload || {};
    const requiredSheets = ["Model Ayarları", "Dashboard Sonuçları"];
    for (const sheetName of requiredSheets) {
      if (!state.sheetPaths.has(sheetName)) {
        throw new Error(
          `'${sheetName}' sayfası bulunamadı. Teslim edilen model Excel’ini kullanın.`,
        );
      }
    }
    const settingsUpdates = [
      ["B4", scenario.summary.model_version],
      ["B5", scenario.summary.mode],
      ["B6", scenario.summary.target_total],
      ["B7", scenario.summary.current_total],
      ["B8", scenario.summary.model_optimal_total],
      ["B9", scenario.summary.weights.population],
      [
        "B10",
        scenario.summary.absolute_group_weights.wealth_finance,
      ],
      [
        "B11",
        scenario.summary.absolute_group_weights.market_activity,
      ],
      [
        "B12",
        scenario.summary.absolute_group_weights.competitor_activity,
      ],
      [
        "B13",
        scenario.summary.absolute_group_weights.foreign_demand,
      ],
      ...Object.entries(scenario.summary.multipliers).map(
        ([, value], index) => [`B${17 + index}`, value],
      ),
    ];
    await patchSheet(
      zip,
      state.sheetPaths.get("Model Ayarları"),
      settingsUpdates,
    );
    const resultValues = scenario.rows.map((row) => [
      row.city,
      row.current_advisors,
      row.recommended_advisors,
      row.difference,
      row.action,
      row.population,
      row.score,
      row.recommendation,
      row.policy_count,
      row.market_index,
      row.market_index_100,
      row.market_share_percent / 100,
      row.population_share_percent / 100,
      row.growth_share_percent / 100,
      row.class_multiplier,
      row.organization_type,
      row.explanation,
    ]);
    const resultUpdates = [];
    resultValues.forEach((row, rowIndex) => {
      row.forEach((value, column) => {
        resultUpdates.push([
          `${excelColumn(column)}${5 + rowIndex}`,
          value,
        ]);
      });
    });
    await patchSheet(
      zip,
      state.sheetPaths.get("Dashboard Sonuçları"),
      resultUpdates,
    );
    if (zip.file("xl/calcChain.xml")) {
      zip.remove("xl/calcChain.xml");
    }
    const blob = await zip.generateAsync({
      type: "blob",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Danisman_Model_Senaryosu_GMY_${scenario.summary.target_total}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    if (typeof root.showToast === "function") {
      root.showToast(
        "Aktif senaryo ve model ayarları Excel’e yazıldı.",
      );
    }
  };
})(globalThis);