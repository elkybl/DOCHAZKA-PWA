/**
 * Google Sheets sync + report (grouped by Akce with subtotals).
 *
 * Script Properties (Project Settings -> Script properties):
 *   BASE_URL = https://your-vercel-domain.vercel.app
 *   EXPORT_TOKEN = long token from public.users.export_token
 *
 * Optional:
 *   DATE_FROM / DATE_TO in ISO (if not set -> current year)
 */
function syncMyDochazka() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty("EXPORT_TOKEN");
  const baseUrl = props.getProperty("BASE_URL");

  if (!token) throw new Error("Chybí Script Property EXPORT_TOKEN");
  if (!baseUrl) throw new Error("Chybí Script Property BASE_URL");

  const from = props.getProperty("DATE_FROM") || new Date(new Date().getFullYear(), 0, 1).toISOString();
  const to = props.getProperty("DATE_TO") || new Date(new Date().getFullYear(), 11, 31, 23, 59, 59, 999).toISOString();

  const url = `${baseUrl}/api/export/user?token=${encodeURIComponent(token)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const txt = res.getContentText();
  const data = JSON.parse(txt);
  if (!data.rows) throw new Error("Export failed: " + txt);

  writeExport_(data.rows);
  buildReport_();
}

function writeExport_(rows) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName("Export") || ss.insertSheet("Export");
  sh.clearContents();

  const header = [
    "Den","Jméno","Akce",
    "Hodiny raw","Hodiny rounded","Hod. stavba","Hod. program",
    "KM","Práce Kč","Doprava Kč","Materiál","Celkem k vyplacení",
    "Kč/h (avg)","Kč/km (avg)","Paid",
    "Práce","Offsite","Materiál pozn."
  ];
  sh.getRange(1, 1, 1, header.length).setValues([header]);
  sh.setFrozenRows(1);

  const values = rows.map(r => ([
    r.day ?? "",
    r.user_name ?? "",
    (r.sites||[]).join(", "),
    r.hours_raw ?? "",
    r.hours_rounded ?? r.hours ?? "",
    r.site_hours ?? "",
    r.prog_hours ?? "",
    r.km ?? "",
    r.work_pay ?? r.hours_pay ?? "",
    r.travel_pay ?? r.km_pay ?? "",
    r.material ?? "",
    r.total_to_pay ?? r.total ?? "",
    r.hourly_avg ?? ((r.hours_rounded || r.hours) ? ( (r.work_pay ?? r.hours_pay ?? 0) / (r.hours_rounded ?? r.hours) ) : ""),
    r.km_avg ?? (r.km ? ( (r.travel_pay ?? r.km_pay ?? 0) / r.km ) : ""),
    r.paid ? "ANO" : "NE",
    (r.work_notes||[]).join(" | "),
    (r.offsite_notes||[]).join(" | "),
    (r.material_notes||[]).join(" | "),
  ]));

  if (values.length) sh.getRange(2, 1, values.length, header.length).setValues(values);

  // basic formatting
  sh.getRange(1,1,sh.getLastRow(),header.length).setWrap(true);
  sh.autoResizeColumns(1, header.length);
}

/**
 * Creates a "Report" sheet similar to the screenshot:
 * grouped by Akce (action/site) with a subtotal row "Celkem" under each group.
 */
function buildReport_() {
  const ss = SpreadsheetApp.getActive();
  const src = ss.getSheetByName("Export");
  if (!src) throw new Error("Chybí list Export. Nejdřív spusť syncMyDochazka().");

  const lastRow = src.getLastRow();
  const lastCol = src.getLastColumn();
  if (lastRow < 2) return;

  const data = src.getRange(2,1,lastRow-1,lastCol).getValues();

  // Export header indexes (match writeExport_)
  const IDX_DAY = 0;
  const IDX_NAME = 1;
  const IDX_ACTION = 2;
  const IDX_H = 4;          // hours rounded
  const IDX_KM = 7;
  const IDX_WORKPAY = 8;
  const IDX_TRAVELPAY = 9;
  const IDX_MAT = 10;
  const IDX_TOTAL = 11;
  const IDX_HAVG = 12;
  const IDX_KMAVG = 13;
  const IDX_WORKNOTES = 15;
  const IDX_OFFNOTES = 16;
  const IDX_MATNOTES = 17;

  // Build rows for report
  const rows = data.map(r => ({
    day: r[IDX_DAY],
    name: r[IDX_NAME],
    action: r[IDX_ACTION],
    notes: [r[IDX_WORKNOTES], r[IDX_OFFNOTES]].filter(Boolean).join(" | "),
    h: Number(r[IDX_H] || 0),
    havg: Number(r[IDX_HAVG] || 0),
    travelPay: Number(r[IDX_TRAVELPAY] || 0),
    total: Number(r[IDX_TOTAL] || 0),
    km: Number(r[IDX_KM] || 0),
    kmavg: Number(r[IDX_KMAVG] || 0),
    mat: Number(r[IDX_MAT] || 0),
    matNotes: r[IDX_MATNOTES] || ""
  }));

  // sort by action, then day
  rows.sort((a,b) => {
    const aa = String(a.action||"");
    const bb = String(b.action||"");
    if (aa !== bb) return aa.localeCompare(bb);
    return String(a.day||"").localeCompare(String(b.day||""));
  });

  const rep = ss.getSheetByName("Report") || ss.insertSheet("Report");
  rep.clearContents();

  const header = ["Datum","Jméno","Akce","Co se dělalo","h","Kč/h","Dopr","Σ","km","Kč/km","Materiál","Materiál poznámka"];
  rep.getRange(1,1,1,header.length).setValues([header]);
  rep.setFrozenRows(1);

  const out = [];
  let curAction = null;
  let sumH=0, sumTravel=0, sumTotal=0, sumKm=0, sumMat=0;

  function pushSubtotal(actionName) {
    if (actionName == null) return;
    out.push([
      "Celkem", "", actionName, "",
      sumH,
      "", // avg hour rate not meaningful on subtotal
      sumTravel,
      sumTotal,
      sumKm,
      "", // avg km rate not meaningful on subtotal
      sumMat,
      ""
    ]);
  }

  for (const r of rows) {
    if (curAction !== null && r.action !== curAction) {
      pushSubtotal(curAction);
      // blank row between groups (like screenshot spacing)
      out.push(["","","","","","","","","","","",""]);
      sumH=0; sumTravel=0; sumTotal=0; sumKm=0; sumMat=0;
    }
    curAction = r.action;

    out.push([
      r.day, r.name, r.action, r.notes,
      r.h,
      r.havg ? Math.round(r.havg*100)/100 : "",
      r.travelPay ? Math.round(r.travelPay*100)/100 : "",
      r.total ? Math.round(r.total*100)/100 : "",
      r.km ? Math.round(r.km*10)/10 : "",
      r.kmavg ? Math.round(r.kmavg*100)/100 : "",
      r.mat ? Math.round(r.mat*100)/100 : "",
      r.matNotes
    ]);

    sumH += r.h;
    sumTravel += r.travelPay;
    sumTotal += r.total;
    sumKm += r.km;
    sumMat += r.mat;
  }
  pushSubtotal(curAction);

  if (out.length) rep.getRange(2,1,out.length,header.length).setValues(out);

  rep.getRange(1,1,rep.getLastRow(),header.length).setWrap(true);
  rep.autoResizeColumns(1, header.length);
}

/** Convenience: create an onOpen trigger (run once). */
function installOnOpenTrigger() {
  // deletes previous triggers for this function
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === "syncMyDochazka") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("syncMyDochazka").forSpreadsheet(SpreadsheetApp.getActive()).onOpen().create();
}
