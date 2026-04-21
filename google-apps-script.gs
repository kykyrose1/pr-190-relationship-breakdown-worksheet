// ═══════════════════════════════════════════════════════════════════
//  PR-190 Relationship Breakdown — Google Sheets Web App
//
//  SETUP INSTRUCTIONS:
//  1. Open Google Sheets → Extensions → Apps Script
//  2. Delete any existing code and paste this entire file
//  3. Click Save (Ctrl+S)
//  4. Click Deploy → New deployment
//     - Type: Web app
//     - Execute as: Me
//     - Who has access: Anyone
//  5. Click Deploy → copy the Web App URL
//  6. Paste that URL into script.js as the value of SHEETS_WEBHOOK_URL
//  7. Re-deploy to Vercel: run `vercel --prod --yes` in the project folder
//
//  NOTE: The first row submitted will auto-create the header row.
//  To re-create headers, delete row 1 and submit again.
// ═══════════════════════════════════════════════════════════════════

const HEADERS = [
  'Submitted At',
  'Group Code',
  'Group Members',
  'Q1: Core Issue',
  'Q2: Factors Checked',
  'Q2: Factors Explanation',
  'Q3: Breakdown Point',
  'Q4: Red Flags',
  'Q5: Responsibility',
  'Q6: Reputation Impact',
  'Q7: Audience Interpretation',
  'Q8: Why It\'s a PR Issue',
  'Q9: Immediate Actions',
  'Q10: Communication Strategy',
  'Q11: Long-Term Changes',
  'Q12: Relationship Management',
  'Q13: Key Takeaway',
  'Q14: Control vs Trust',
];

function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

    // Write header row on first submission
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#003366').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }

    const data = JSON.parse(e.postData.contents);

    sheet.appendRow([
      data.submittedAt             || '',
      data.groupCode               || '',
      data.members                 || '',
      data.p1_core_issue           || '',
      data.p1_factors_checks       || '',
      data.p1_factors_explanation  || '',
      data.p2_breakdown_point      || '',
      data.p2_red_flags            || '',
      data.p2_responsibility       || '',
      data.p3_reputation           || '',
      data.p3_audience             || '',
      data.p3_pr_issue             || '',
      data.p4_immediate            || '',
      data.p4_communication        || '',
      data.p4_prevention           || '',
      data.p4_relationship         || '',
      data.p5_takeaway             || '',
      data.p5_opinion              || '',
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// doGet is required for the deployment to be recognized as a Web App
function doGet() {
  return ContentService
    .createTextOutput('PR-190 Sheets endpoint is active.')
    .setMimeType(ContentService.MimeType.TEXT);
}
