/**
 * Pawse website forms → one Google Spreadsheet, one tab per form.
 *
 * Setup:
 * 1. Create a Google Spreadsheet. Add sheets (tabs): Sponsor, Stall, Feedback, Volunteer.
 * 2. Extensions → Apps Script. Paste this file. Set SPREADSHEET_ID below.
 * 3. Deploy → New deployment → Web app.
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Copy the Web app URL into pawse.html (window.PAWSE_FORMS.submitUrl).
 *
 * The site POSTs application/x-www-form-urlencoded with field "payload" (JSON).
 */

var SPREADSHEET_ID = "REPLACE_WITH_YOUR_SPREADSHEET_ID";

var FORM_SHEETS = {
  sponsor: {
    name: "Sponsor",
    headers: [
      "Timestamp",
      "Name",
      "Organisation",
      "Email",
      "Phone",
      "City",
      "Website or Instagram",
      "How do you want to show up?",
    ],
    fields: ["sentAt", "name", "organisation", "email", "phone", "city", "link", "presence"],
  },
  stall: {
    name: "Stall",
    headers: [
      "Timestamp",
      "Name",
      "Stall or brand name",
      "Email",
      "Phone",
      "City",
      "Stall type",
      "Instagram or website",
      "Notes",
    ],
    fields: ["sentAt", "name", "brand", "email", "phone", "city", "stallType", "link", "note"],
  },
  feedback: {
    name: "Feedback",
    headers: [
      "Timestamp",
      "Name",
      "Email",
      "I am",
      "Which edition",
      "Rating",
      "What should stay",
      "What should change",
    ],
    fields: ["sentAt", "name", "email", "role", "edition", "rating", "loved", "improve"],
  },
  volunteer: {
    name: "Volunteer",
    headers: [
      "Timestamp",
      "Name",
      "Email",
      "Phone",
      "City",
      "Contribution category",
      "Prior experience",
    ],
    fields: [
      "sentAt",
      "name",
      "email",
      "phone",
      "city",
      "volunteerCategory",
      "priorExperience",
    ],
  },
};

function doGet() {
  return ContentService.createTextOutput(
    JSON.stringify({ ok: true, service: "Pawse forms", sheets: Object.keys(FORM_SHEETS) })
  ).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var raw = (e && e.parameter && e.parameter.payload) || (e && e.postData && e.postData.contents);
    if (!raw) {
      return jsonOut({ ok: false, error: "Missing payload" });
    }
    var data = typeof raw === "string" ? JSON.parse(raw) : raw;
    var formType = String(data.formType || data.kind || "")
      .toLowerCase()
      .trim();
    if (formType === "sponsor" || data.kind === "Sponsor") formType = "sponsor";
    if (formType === "stall" || data.kind === "Stall") formType = "stall";
    if (formType === "feedback" || data.kind === "Feedback") formType = "feedback";
    if (formType === "volunteer" || data.kind === "Volunteer") formType = "volunteer";

    var config = FORM_SHEETS[formType];
    if (!config) {
      return jsonOut({ ok: false, error: "Unknown form type: " + formType });
    }

    if (!data.sentAt) {
      data.sentAt = new Date().toISOString();
    }

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(config.name);
    if (!sheet) {
      sheet = ss.insertSheet(config.name);
    }

    ensureHeaderRow_(sheet, config.headers);

    var row = config.fields.map(function (key) {
      var v = data[key];
      if (v === undefined || v === null || v === "") return "";
      return String(v);
    });
    sheet.appendRow(row);

    return jsonOut({ ok: true, formType: formType, sheet: config.name });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function ensureHeaderRow_(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    return;
  }
  var existing = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  var empty = existing.every(function (c) {
    return c === "" || c === null;
  });
  if (empty) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
