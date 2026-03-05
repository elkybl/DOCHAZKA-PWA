function _getProps() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty("EXPORT_TOKEN");
  const baseUrl = props.getProperty("BASE_URL");
  if (!token) throw new Error("Chybí Script Property EXPORT_TOKEN");
  if (!baseUrl) throw new Error("Chybí Script Property BASE_URL");
  return { token, baseUrl };
}

function _isoToCzDate(isoDay) {
  // isoDay: YYYY-MM-DD
  if (!isoDay) return "";
  const parts = isoDay.split("-");
  if (parts.length !== 3) return isoDay;
  return `${Number(parts[2])}.${Number(parts[1])}.${parts[0]}`;
}

function syncMyDochazka() {
  const { token, baseUrl } = _getProps();

  const from = "2026-01-01T00:00:00.000Z";
  const to   = "2026-12-31T23:59:59.999Z";

  const url = `${baseUrl}/api/export/user?token=${encodeURIComponent(token)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const txt = res.getContentText();
  const data = JSON.parse(txt);
  if (!data.rows) throw new Error("Export failed: " + txt);

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName("Export") || ss.insertSheet("Export");

  // keep only unpaid or last ~183 days (half-year)
  const now = new Date();
  const cutoff = new Date(now.getTime() - 183 * 86400000);

  const rows = (data.rows || []).filter(r => {
    const paid = !!r.paid;
    const day = String(r.day || "");
    // parse YYYY-MM-DD
    const dt = day && day.length >= 10 ? new Date(day + "T00:00:00Z") : null;
    if (!paid) return true;
    if (!dt) return false;
    return dt >= cutoff;
  });

  sh.clearContents();

  const header = ["day","user_name","action","work_notes","hours_raw","hours_rounded","site_hours","prog_hours","km","work_pay","travel_pay","material","total_to_pay","paid","material_notes","offsite_notes"];
  sh.getRange(1,1,1,header.length).setValues([header]);
  sh.setFrozenRows(1);

  const values = rows.map(r => ([
    r.day ?? "",
    r.user_name ?? "",
    r.action ?? ((r.sites||[]).join(", ")),
    (r.work_notes||[]).join(" | "),
    r.hours_raw ?? "",
    r.hours_rounded ?? r.hours ?? "",
    r.site_hours ?? "",
    r.prog_hours ?? "",
    r.km ?? "",
    r.work_pay ?? r.hours_pay ?? "",
    r.travel_pay ?? r.km_pay ?? "",
    r.material ?? "",
    r.total_to_pay ?? r.total ?? "",
    r.paid ? "ANO" : "NE",
    (r.material_notes||[]).join(" | "),
    (r.offsite_notes||[]).join(" | "),
  ]));

  if (values.length) sh.getRange(2,1,values.length,header.length).setValues(values);

  buildReport_();
}

function buildReport_() {
  const ss = SpreadsheetApp.getActive();
  const src = ss.getSheetByName("Export");
  if (!src) throw new Error("Chybí list Export");

  const data = src.getDataRange().getValues();
  if (data.length < 2) {
    const rep = ss.getSheetByName("Report") || ss.insertSheet("Report");
    rep.clearContents();
    return;
  }

  const header = data[0];
  const idx = {};
  header.forEach((h, i) => idx[String(h)] = i);

  const rows = data.slice(1).filter(r => r[idx["day"]]);

  // group by action
  const groups = new Map();
  for (const r of rows) {
    const action = String(r[idx["action"]] || "Bez akce");
    if (!groups.has(action)) groups.set(action, []);
    groups.get(action).push(r);
  }

  const rep = ss.getSheetByName("Report") || ss.insertSheet("Report");
  rep.clearContents();

  // layout columns like template: A,B,C,D,E,(F-J blank),K,L,M,(N blank),O,P,Q,R
  const hdr = ["Datum","Jméno","Akce","Co se dělalo","h","","","","","", "kč/h","Dopr","Σ","", "km","kč/km/hod","Materiál","Materiál poznámka"];
  rep.getRange(1,1,1,hdr.length).setValues([hdr]);
  rep.setFrozenRows(1);

  // widths (from your template)
  const widths = {A:11.38,B:12.25,C:17.25,D:50.13,E:5.13,K:12.5,L:12.88,M:14.13,O:3.75,P:8.5,Q:8.88,R:36.75};
  Object.keys(widths).forEach(k => rep.setColumnWidth(_colToIndex(k), Math.round(widths[k]*7))); // approx excel->px

  // header style
  rep.getRange(1,1,1,hdr.length)
     .setFontWeight("bold")
     .setBackground("#DDDDDD")
     .setVerticalAlignment("middle");

  let outRow = 2;

  // sort actions alphabetically
  const actions = Array.from(groups.keys()).sort((a,b)=>a.localeCompare(b,'cs'));

  for (const action of actions) {
    const rs = groups.get(action);

    // sort rows by day asc then name
    rs.sort((a,b)=>{
      const da=String(a[idx["day"]]); const db=String(b[idx["day"]]);
      if (da!==db) return da<db?-1:1;
      const na=String(a[idx["user_name"]]); const nb=String(b[idx["user_name"]]);
      return na.localeCompare(nb,'cs');
    });

    let sumHours=0, sumTravel=0, sumTotal=0, sumKm=0, sumMat=0;

    for (const r of rs) {
      const dayIso = String(r[idx["day"]]);
      const name = String(r[idx["user_name"]]);
      const work = String(r[idx["work_notes"]] || "");
      const h = Number(r[idx["hours_rounded"]] || 0);
      const km = Number(r[idx["km"]] || 0);
      const workPay = Number(r[idx["work_pay"]] || 0);
      const travelPay = Number(r[idx["travel_pay"]] || 0);
      const mat = Number(r[idx["material"]] || 0);
      const total = Number(r[idx["total_to_pay"]] || 0);
      const matNote = String(r[idx["material_notes"]] || "");

      const rateH = h > 0 ? workPay / h : "";
      const rateKm = km > 0 ? travelPay / km : "";

      // write row into specific columns
      rep.getRange(outRow,1,1,18).setValues([[
        _isoToCzDate(dayIso),
        name,
        action,
        work,
        h || "",
        "", "", "", "", "",
        rateH === "" ? "" : rateH,
        travelPay || "",
        total || "",
        "",
        km || "",
        rateKm === "" ? "" : rateKm,
        mat || "",
        matNote
      ]]);

      sumHours += h;
      sumKm += km;
      sumTravel += travelPay;
      sumMat += mat;
      sumTotal += total;

      outRow++;
    }

    // celkem row
    rep.getRange(outRow,1,1,18).setValues([[
      "Celkem",
      "",
      action,
      "",
      sumHours || "",
      "", "", "", "", "",
      "",
      sumTravel || "",
      sumTotal || "",
      "",
      sumKm || "",
      "",
      sumMat || "",
      ""
    ]]);

    rep.getRange(outRow,1,1,18)
       .setFontWeight("bold")
       .setBackground("#F0F0F0");

    outRow++;

    // spacer row
    outRow++;
  }

  // formats
  // h column (E)
  rep.getRange(2,5,Math.max(0,outRow-2),1).setNumberFormat("0.0");
  // currency columns K,L,M,Q
  rep.getRange(2,11,Math.max(0,outRow-2),1).setNumberFormat("#,##0.00 \"Kč\"");
  rep.getRange(2,12,Math.max(0,outRow-2),1).setNumberFormat("#,##0.00 \"Kč\"");
  rep.getRange(2,13,Math.max(0,outRow-2),1).setNumberFormat("#,##0.00 \"Kč\"");
  rep.getRange(2,17,Math.max(0,outRow-2),1).setNumberFormat("#,##0.00 \"Kč\"");
  // km (O) and rateKm (P)
  rep.getRange(2,15,Math.max(0,outRow-2),1).setNumberFormat("0.0");
  rep.getRange(2,16,Math.max(0,outRow-2),1).setNumberFormat("0.00 \"Kč\"");
  // wrap long text
  rep.getRange(1,4,outRow,1).setWrap(true);
  rep.getRange(1,18,outRow,1).setWrap(true);
  rep.autoResizeColumn(4);
  rep.autoResizeColumn(18);
}

function _colToIndex(col) {
  // A=1
  let n = 0;
  for (let i=0;i<col.length;i++) n = n*26 + (col.charCodeAt(i)-64);
  return n;
}

function installOnOpenTrigger() {
  // creates onOpen trigger for this spreadsheet
  const triggers = ScriptApp.getProjectTriggers();
  for (const t of triggers) {
    if (t.getHandlerFunction && t.getHandlerFunction() === "syncMyDochazka") {
      // already exists
      return;
    }
  }
  ScriptApp.newTrigger("syncMyDochazka").forSpreadsheet(SpreadsheetApp.getActive()).onOpen().create();
}
