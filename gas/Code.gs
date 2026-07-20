/**
 * 鮮茶樂營運儀表板 Demo API v2
 *
 * 安全邊界：
 * - 僅供匿名測試資料與作品展示，不得連接正式員工、薪資或門市資料。
 * - 公開 Web App URL 不是祕密；所有受保護動作都必須驗證短期 session token。
 * - Script ID、Spreadsheet ID、部署網址與密碼不得寫進公開 repo。
 */

var APP = {
  VERSION: '2.0.0',
  TIMEZONE: 'Asia/Taipei',
  SESSION_PREFIX: 'tealove_session_',
  LOGIN_PREFIX: 'tealove_login_',
  MAX_BODY_LENGTH: 100000,
  SHEETS: {
    ACCOUNTS: '帳號管理',
    SCHEDULE: '排班資料',
    INVENTORY: '庫存資料',
    SETTINGS: '系統設定',
    SHIFTS: '班別設定',
    AUDIT: '操作紀錄'
  }
};

function doGet() {
  return jsonResponse_(health_());
}

function doPost(e) {
  try {
    var data = parseRequest_(e);
    var action = requireString_(data.action, 'action', 40);

    if (action === 'health') return jsonResponse_(health_());
    if (action === 'login') return jsonResponse_(login_(data));

    var session = requireSession_(data.token);
    var result;

    switch (action) {
      case 'logout':
        result = logout_(data.token, session);
        break;
      case 'getSchedule':
        result = getSchedule_(data, session);
        break;
      case 'saveShift':
        result = saveShift_(data, session);
        break;
      case 'getInventory':
        result = getInventory_(session);
        break;
      case 'saveInventory':
        result = saveInventory_(data, session);
        break;
      case 'getDashboard':
        result = getDashboard_(data, session);
        break;
      case 'getAlerts':
        result = getDashboard_(data, session).alerts;
        break;
      case 'resetDemoData':
        result = resetDemoData_(session);
        break;
      default:
        throw apiError_('UNKNOWN_ACTION', '不支援的操作。');
    }

    return jsonResponse_({ success: true, apiVersion: APP.VERSION, data: result });
  } catch (error) {
    var safe = normalizeError_(error);
    return jsonResponse_({
      success: false,
      apiVersion: APP.VERSION,
      error: { code: safe.code, message: safe.message }
    });
  }
}

/** 在試算表綁定的 Apps Script 編輯器中手動執行一次。 */
function setupV2() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('請從 Demo 試算表綁定的 Apps Script 專案執行 setupV2。');

  var props = PropertiesService.getScriptProperties();
  props.setProperty('SPREADSHEET_ID', ss.getId());
  if (!props.getProperty('PASSWORD_HMAC_SECRET')) {
    props.setProperty('PASSWORD_HMAC_SECRET', Utilities.getUuid() + Utilities.getUuid());
  }

  ss.setSpreadsheetTimeZone(APP.TIMEZONE);
  ensureSheet_(ss, APP.SHEETS.SETTINGS, ['設定鍵', '設定值', '說明']);
  ensureSheet_(ss, APP.SHEETS.SHIFTS, ['班別代碼', '班別名稱', '開始時間', '結束時間', '工時', '最低人數', '最高人數', '啟用']);
  ensureSheet_(ss, APP.SHEETS.AUDIT, ['時間', '員工ID', '動作', '資源', '結果', '說明']);

  return 'setupV2 完成：' + ss.getName();
}

/** 將 C 欄 Demo 明文密碼轉成 HMAC 後清空 C 欄。只需手動執行一次。 */
function migrateDemoPasswords() {
  var ss = getSpreadsheet_();
  var sheet = requireSheet_(ss, APP.SHEETS.ACCOUNTS);
  var values = sheet.getDataRange().getValues();
  var migrated = 0;

  for (var i = 1; i < values.length; i++) {
    var username = String(values[i][1] || '').trim();
    var plainPassword = String(values[i][2] || '');
    var existingHash = String(values[i][7] || '');
    if (!username || !plainPassword || existingHash) continue;

    sheet.getRange(i + 1, 8).setValue(passwordHash_(username, plainPassword));
    sheet.getRange(i + 1, 3).clearContent();
    migrated++;
  }

  return '已遷移 ' + migrated + ' 個 Demo 帳號。';
}

/** 前端切換到 v2 後再執行，避免舊 inventory.html 找不到原 ID。 */
function migrateLegacyInventoryItem() {
  var sheet = requireSheet_(getSpreadsheet_(), APP.SHEETS.INVENTORY);
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === 'qty-weed') {
      sheet.getRange(i + 1, 1, 1, 8).setValues([[
        'qty-jelly', '椰果', 8, new Date(), '箱', 3, '正常', 'v2_migration'
      ]]);
      return '已將舊測試品項遷移為椰果。';
    }
  }
  return '找不到需遷移的舊品項。';
}

function health_() {
  var ss = getSpreadsheet_();
  var settings = getSettings_(ss);
  return {
    success: true,
    apiVersion: APP.VERSION,
    demoMode: toBoolean_(settings.demo_mode),
    timezone: APP.TIMEZONE,
    sheets: Object.keys(APP.SHEETS).reduce(function (result, key) {
      result[APP.SHEETS[key]] = !!ss.getSheetByName(APP.SHEETS[key]);
      return result;
    }, {})
  };
}

function login_(data) {
  var username = requireString_(data.username, 'username', 64);
  var password = requireString_(data.password, 'password', 128);
  assertLoginAllowed_(username);

  var sheet = requireSheet_(getSpreadsheet_(), APP.SHEETS.ACCOUNTS);
  var values = sheet.getDataRange().getValues();

  for (var i = 1; i < values.length; i++) {
    var rowUsername = String(values[i][1] || '');
    if (rowUsername !== username) continue;

    var active = values[i][6] === '' ? true : toBoolean_(values[i][6]);
    if (!active) break;

    var plainPassword = String(values[i][2] || '');
    var storedHash = String(values[i][7] || '');
    var valid = storedHash
      ? constantTimeEquals_(storedHash, passwordHash_(username, password))
      : constantTimeEquals_(plainPassword, password);

    if (!valid) break;

    if (!storedHash && plainPassword) {
      sheet.getRange(i + 1, 8).setValue(passwordHash_(username, password));
      sheet.getRange(i + 1, 3).clearContent();
    }

    var session = {
      employeeId: String(values[i][0]),
      role: String(values[i][3]),
      name: String(values[i][4]),
      rate: numberInRange_(values[i][5], 0, 10000, 'rate')
    };
    var settings = getSettings_(getSpreadsheet_());
    var ttl = numberInRange_(settings.session_ttl_seconds || 7200, 300, 21600, 'session_ttl_seconds');
    var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    CacheService.getScriptCache().put(APP.SESSION_PREFIX + token, JSON.stringify(session), ttl);
    CacheService.getScriptCache().remove(loginKey_(username));
    sheet.getRange(i + 1, 9).setValue(new Date());
    appendAudit_(session.employeeId, 'login', 'session', 'success', 'Demo 帳號登入');

    return {
      success: true,
      apiVersion: APP.VERSION,
      token: token,
      expiresIn: ttl,
      employeeId: session.employeeId,
      role: session.role,
      name: session.name,
      rate: session.rate
    };
  }

  recordLoginFailure_(username);
  throw apiError_('INVALID_CREDENTIALS', '帳號或密碼錯誤。');
}

function logout_(token, session) {
  CacheService.getScriptCache().remove(APP.SESSION_PREFIX + token);
  appendAudit_(session.employeeId, 'logout', 'session', 'success', '登出');
  return { loggedOut: true };
}

function getSchedule_(data, session) {
  var ss = getSpreadsheet_();
  var sheet = requireSheet_(ss, APP.SHEETS.SCHEDULE);
  var values = sheet.getDataRange().getValues();
  var year = data.year === undefined ? null : numberInRange_(data.year, 2020, 2100, 'year');
  var week = data.week === undefined ? null : numberInRange_(data.week, 1, 53, 'week');
  var schedule = {};

  for (var i = 1; i < values.length; i++) {
    var parsed = parseDataKey_(values[i][0]);
    if (!parsed) continue;
    if (year !== null && parsed.year !== year) continue;
    if (week !== null && parsed.week !== week) continue;
    schedule[String(values[i][0])] = String(values[i][1]);
  }

  var current = getIsoYearWeek_(new Date());
  return {
    schedule: schedule,
    employees: getEmployees_(ss),
    shifts: shiftMapToArray_(getShiftMap_(ss)),
    currentYear: current.year,
    currentWeek: current.week,
    viewer: { employeeId: session.employeeId, role: session.role }
  };
}

function saveShift_(data, session) {
  var parsed = parseDataKey_(data.dataKey);
  if (!parsed) throw apiError_('INVALID_DATA_KEY', '排班資料索引格式錯誤。');

  var shiftKey = requireString_(data.shiftKey, 'shiftKey', 30);
  var ss = getSpreadsheet_();
  var employees = getEmployees_(ss);
  var employee = employees.filter(function (item) { return item.id === parsed.employeeId; })[0];
  if (!employee || !employee.active) throw apiError_('INVALID_EMPLOYEE', '員工不存在或已停用。');
  if (session.role !== 'admin' && session.employeeId !== parsed.employeeId) {
    throw apiError_('FORBIDDEN', '你只能修改自己的班表。');
  }

  var shiftMap = getShiftMap_(ss);
  if (shiftKey !== 'off' && !shiftMap[shiftKey]) throw apiError_('INVALID_SHIFT', '班別代碼不存在。');

  return withDocumentLock_(function () {
    var sheet = requireSheet_(ss, APP.SHEETS.SCHEDULE);
    var values = sheet.getDataRange().getValues();
    var targetRow = -1;
    var occupied = 0;

    for (var i = 1; i < values.length; i++) {
      var key = String(values[i][0] || '');
      var rowParsed = parseDataKey_(key);
      if (!rowParsed) continue;
      if (key === data.dataKey) targetRow = i + 1;
      if (
        key !== data.dataKey &&
        rowParsed.year === parsed.year &&
        rowParsed.week === parsed.week &&
        rowParsed.day === parsed.day &&
        String(values[i][1]) === shiftKey
      ) occupied++;
    }

    if (shiftKey !== 'off' && occupied >= shiftMap[shiftKey].maxStaff) {
      throw apiError_('SHIFT_FULL', '該時段已達人數上限。');
    }

    if (shiftKey === 'off') {
      if (targetRow > -1) sheet.deleteRow(targetRow);
    } else {
      var row = [data.dataKey, shiftKey, new Date(), parsed.year, parsed.week, parsed.employeeId, parsed.day, session.employeeId];
      if (targetRow > -1) sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
      else sheet.appendRow(row);
    }

    appendAudit_(session.employeeId, 'saveShift', data.dataKey, 'success', shiftKey);
    return { dataKey: data.dataKey, shiftKey: shiftKey };
  });
}

function getInventory_(session) {
  var sheet = requireSheet_(getSpreadsheet_(), APP.SHEETS.INVENTORY);
  var values = sheet.getDataRange().getValues();
  var items = [];
  var lastSavedTime = null;

  for (var i = 1; i < values.length; i++) {
    if (!values[i][0]) continue;
    var updatedAt = values[i][3] instanceof Date ? values[i][3] : null;
    if (updatedAt && (!lastSavedTime || updatedAt > lastSavedTime)) lastSavedTime = updatedAt;
    items.push({
      id: String(values[i][0]),
      name: String(values[i][1]),
      quantity: numberInRange_(values[i][2], 0, 1000000, 'quantity'),
      unit: String(values[i][4] || ''),
      threshold: numberInRange_(values[i][5] || 0, 0, 1000000, 'threshold'),
      status: Number(values[i][2]) <= Number(values[i][5] || 0) ? 'low' : 'normal'
    });
  }

  return {
    items: items,
    lastSavedTime: lastSavedTime ? Utilities.formatDate(lastSavedTime, APP.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX") : null,
    viewerRole: session.role
  };
}

function saveInventory_(data, session) {
  requireAdmin_(session);
  if (!data.inventory || typeof data.inventory !== 'object' || Array.isArray(data.inventory)) {
    throw apiError_('INVALID_INVENTORY', '庫存資料格式錯誤。');
  }

  return withDocumentLock_(function () {
    var sheet = requireSheet_(getSpreadsheet_(), APP.SHEETS.INVENTORY);
    var values = sheet.getDataRange().getValues();
    var updated = [];

    for (var i = 1; i < values.length; i++) {
      var itemId = String(values[i][0] || '');
      if (!itemId || data.inventory[itemId] === undefined) continue;
      var quantity = numberInRange_(data.inventory[itemId], 0, 1000000, itemId);
      sheet.getRange(i + 1, 3).setValue(quantity);
      sheet.getRange(i + 1, 4).setValue(new Date());
      sheet.getRange(i + 1, 8).setValue(session.employeeId);
      updated.push(itemId);
    }

    if (!updated.length) throw apiError_('NO_VALID_ITEMS', '沒有可更新的庫存品項。');
    appendAudit_(session.employeeId, 'saveInventory', 'inventory', 'success', updated.join(','));
    return { updatedItems: updated };
  });
}

function getDashboard_(data, session) {
  requireAdmin_(session);
  var ss = getSpreadsheet_();
  var current = getIsoYearWeek_(new Date());
  var year = data.year === undefined ? current.year : numberInRange_(data.year, 2020, 2100, 'year');
  var week = data.week === undefined ? current.week : numberInRange_(data.week, 1, 53, 'week');
  var previous = previousYearWeek_(year, week);
  var employees = getEmployees_(ss);
  var shifts = getShiftMap_(ss);
  var rows = getScheduleRows_(ss);
  var settings = getSettings_(ss);
  var currentMetrics = calculateWeekMetrics_(rows, employees, shifts, year, week);
  var previousMetrics = calculateWeekMetrics_(rows, employees, shifts, previous.year, previous.week);
  var maxHours = numberInRange_(settings.demo_max_weekly_hours || 40, 1, 168, 'demo_max_weekly_hours');
  var minDailyStaff = numberInRange_(settings.default_min_staff || 1, 0, 100, 'default_min_staff');
  var inventory = getInventory_(session).items;

  var alerts = {
    overtime: currentMetrics.employeeHours.filter(function (item) { return item.hours > maxHours; }),
    understaffedDays: currentMetrics.dailyCounts.map(function (count, day) {
      return { day: day, count: count };
    }).filter(function (item) { return item.count < minDailyStaff; }),
    lowStock: inventory.filter(function (item) { return item.status === 'low'; })
  };

  return {
    year: year,
    week: week,
    totals: {
      hours: currentMetrics.totalHours,
      payroll: currentMetrics.totalPayroll,
      scheduledEmployees: currentMetrics.scheduledEmployees
    },
    employeeHours: currentMetrics.employeeHours,
    dailyCounts: currentMetrics.dailyCounts,
    shiftDistribution: currentMetrics.shiftDistribution,
    comparison: {
      previousYear: previous.year,
      previousWeek: previous.week,
      hours: compareNumber_(currentMetrics.totalHours, previousMetrics.totalHours),
      payroll: compareNumber_(currentMetrics.totalPayroll, previousMetrics.totalPayroll)
    },
    alerts: alerts,
    notice: '工時與提醒門檻僅供 Demo 展示，不構成勞動法令判定。'
  };
}

function resetDemoData_(session) {
  requireAdmin_(session);
  var settings = getSettings_(getSpreadsheet_());
  if (!toBoolean_(settings.demo_mode) || !toBoolean_(settings.reset_demo_enabled)) {
    throw apiError_('RESET_DISABLED', 'Demo 重設功能未啟用。');
  }

  return withDocumentLock_(function () {
    var current = getIsoYearWeek_(new Date());
    seedSchedule_(current.year, current.week);
    seedInventory_();
    appendAudit_(session.employeeId, 'resetDemoData', 'demo', 'success', current.year + '-W' + current.week);
    return { reset: true, year: current.year, week: current.week };
  });
}

function getSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw apiError_('NOT_CONFIGURED', '請先從 Demo 試算表執行 setupV2。');
  return active;
}

function getSettings_(ss) {
  var sheet = requireSheet_(ss, APP.SHEETS.SETTINGS);
  var values = sheet.getDataRange().getValues();
  var settings = {};
  for (var i = 1; i < values.length; i++) {
    if (values[i][0]) settings[String(values[i][0])] = values[i][1];
  }
  return settings;
}

function getShiftMap_(ss) {
  var sheet = requireSheet_(ss, APP.SHEETS.SHIFTS);
  var values = sheet.getDataRange().getValues();
  var result = {};
  for (var i = 1; i < values.length; i++) {
    if (!values[i][0] || !toBoolean_(values[i][7])) continue;
    result[String(values[i][0])] = {
      id: String(values[i][0]),
      name: String(values[i][1]),
      start: String(values[i][2]),
      end: String(values[i][3]),
      hours: numberInRange_(values[i][4], 0.25, 24, 'shiftHours'),
      minStaff: numberInRange_(values[i][5], 0, 100, 'minStaff'),
      maxStaff: numberInRange_(values[i][6], 1, 100, 'maxStaff')
    };
  }
  return result;
}

function shiftMapToArray_(map) {
  return Object.keys(map).map(function (key) { return map[key]; });
}

function getEmployees_(ss) {
  var sheet = requireSheet_(ss, APP.SHEETS.ACCOUNTS);
  var values = sheet.getDataRange().getValues();
  var result = [];
  for (var i = 1; i < values.length; i++) {
    if (!values[i][0]) continue;
    result.push({
      id: String(values[i][0]),
      role: String(values[i][3]),
      name: String(values[i][4]),
      rate: numberInRange_(values[i][5], 0, 10000, 'rate'),
      active: values[i][6] === '' ? true : toBoolean_(values[i][6])
    });
  }
  return result;
}

function getScheduleRows_(ss) {
  var sheet = requireSheet_(ss, APP.SHEETS.SCHEDULE);
  var values = sheet.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var parsed = parseDataKey_(values[i][0]);
    if (!parsed) continue;
    parsed.shiftKey = String(values[i][1]);
    rows.push(parsed);
  }
  return rows;
}

function calculateWeekMetrics_(rows, employees, shifts, year, week) {
  var employeeMap = {};
  var hours = {};
  var dailyCounts = [0, 0, 0, 0, 0, 0, 0];
  var shiftDistribution = {};
  var scheduled = {};
  var totalHours = 0;
  var totalPayroll = 0;

  employees.forEach(function (employee) {
    employeeMap[employee.id] = employee;
    hours[employee.id] = 0;
  });
  Object.keys(shifts).forEach(function (shiftId) {
    shiftDistribution[shiftId] = [0, 0, 0, 0, 0, 0, 0];
  });

  rows.forEach(function (row) {
    if (row.year !== year || row.week !== week || !employeeMap[row.employeeId] || !shifts[row.shiftKey]) return;
    var shiftHours = shifts[row.shiftKey].hours;
    hours[row.employeeId] += shiftHours;
    totalHours += shiftHours;
    totalPayroll += shiftHours * employeeMap[row.employeeId].rate;
    dailyCounts[row.day]++;
    shiftDistribution[row.shiftKey][row.day]++;
    scheduled[row.employeeId] = true;
  });

  return {
    totalHours: round2_(totalHours),
    totalPayroll: Math.round(totalPayroll),
    scheduledEmployees: Object.keys(scheduled).length,
    employeeHours: employees.map(function (employee) {
      return { employeeId: employee.id, name: employee.name, hours: round2_(hours[employee.id] || 0) };
    }),
    dailyCounts: dailyCounts,
    shiftDistribution: shiftDistribution
  };
}

function seedSchedule_(year, endWeek) {
  var sheet = requireSheet_(getSpreadsheet_(), APP.SHEETS.SCHEDULE);
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).clearContent();
  var rows = [];
  for (var offset = 7; offset >= 0; offset--) {
    var target = subtractIsoWeeks_(year, endWeek, offset);
    addSeedWeek_(rows, target.year, target.week);
  }
  if (rows.length) sheet.getRange(2, 1, rows.length, 8).setValues(rows);
}

function addSeedWeek_(rows, year, week) {
  function add(employeeId, day, shiftKey) {
    rows.push([year + '_' + week + '_' + employeeId + '_' + day, shiftKey, new Date(), year, week, employeeId, day, 'demo_seed']);
  }
  [0, 1, 2, 3, 4].forEach(function (day) { add('emp_admin', day, 'middle'); });
  if (week === 25 || week === 30) add('emp_admin', 5, 'custom');
  [0, 1, 3, 4].forEach(function (day) { add('emp_01', day, 'morning'); });
  if (week % 2 === 0) add('emp_01', 5, 'morning');
  [1, 2, 4, 5].forEach(function (day) {
    if (!((week === 23 || week === 26) && day === 1)) add('emp_02', day, 'evening');
  });
  [0, 2, 3, 5, 6].forEach(function (day) {
    if (!(week === 29 && day === 6)) add('emp_03', day, 'custom');
  });
}

function seedInventory_() {
  var sheet = requireSheet_(getSpreadsheet_(), APP.SHEETS.INVENTORY);
  var values = sheet.getDataRange().getValues();
  var defaults = { 'qty-tea': 4, 'qty-boba': 2, 'qty-sugar': 8, 'qty-jelly': 6, 'qty-weed': 50 };
  for (var i = 1; i < values.length; i++) {
    var itemId = String(values[i][0] || '');
    if (defaults[itemId] === undefined) continue;
    sheet.getRange(i + 1, 3).setValue(defaults[itemId]);
    sheet.getRange(i + 1, 4).setValue(new Date());
    sheet.getRange(i + 1, 8).setValue('demo_seed');
  }
}

function requireSession_(token) {
  token = requireString_(token, 'token', 160);
  if (!/^[A-Za-z0-9_-]+$/.test(token)) throw apiError_('UNAUTHORIZED', '登入狀態無效。');
  var raw = CacheService.getScriptCache().get(APP.SESSION_PREFIX + token);
  if (!raw) throw apiError_('SESSION_EXPIRED', '登入已逾時，請重新登入。');
  try { return JSON.parse(raw); }
  catch (error) { throw apiError_('UNAUTHORIZED', '登入狀態無效。'); }
}

function requireAdmin_(session) {
  if (!session || session.role !== 'admin') throw apiError_('FORBIDDEN', '此操作僅限管理員。');
}

function parseRequest_(e) {
  if (!e || !e.postData || typeof e.postData.contents !== 'string') {
    throw apiError_('BAD_REQUEST', '缺少請求內容。');
  }
  if (e.postData.contents.length > APP.MAX_BODY_LENGTH) throw apiError_('PAYLOAD_TOO_LARGE', '請求內容過大。');
  try { return JSON.parse(e.postData.contents); }
  catch (error) { throw apiError_('INVALID_JSON', 'JSON 格式錯誤。'); }
}

function parseDataKey_(value) {
  var match = String(value || '').match(/^(\d{4})_(\d{1,2})_([A-Za-z0-9_-]+)_([0-6])$/);
  if (!match) return null;
  var year = Number(match[1]);
  var week = Number(match[2]);
  if (year < 2020 || year > 2100 || week < 1 || week > 53) return null;
  return { year: year, week: week, employeeId: match[3], day: Number(match[4]) };
}

function numberInRange_(value, min, max, field) {
  var number = Number(value);
  if (!isFinite(number) || number < min || number > max) {
    throw apiError_('INVALID_NUMBER', field + ' 必須介於 ' + min + ' 與 ' + max + '。');
  }
  return number;
}

function requireString_(value, field, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw apiError_('INVALID_FIELD', field + ' 格式錯誤。');
  }
  return value.trim();
}

function assertLoginAllowed_(username) {
  var cache = CacheService.getScriptCache();
  var raw = cache.get(loginKey_(username));
  if (!raw) return;
  var state = JSON.parse(raw);
  if (state.count >= 5) throw apiError_('TOO_MANY_ATTEMPTS', '登入失敗次數過多，請稍後再試。');
}

function recordLoginFailure_(username) {
  var cache = CacheService.getScriptCache();
  var key = loginKey_(username);
  var raw = cache.get(key);
  var state = raw ? JSON.parse(raw) : { count: 0 };
  state.count++;
  cache.put(key, JSON.stringify(state), 300);
}

function loginKey_(username) {
  return APP.LOGIN_PREFIX + digestForKey_(String(username).toLowerCase());
}

function digestForKey_(value) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value);
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '').slice(0, 40);
}

function passwordHash_(username, password) {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('PASSWORD_HMAC_SECRET');
  if (!secret) throw apiError_('NOT_CONFIGURED', '請先執行 setupV2。');
  var signature = Utilities.computeHmacSha256Signature(username + ':' + password, secret);
  return Utilities.base64EncodeWebSafe(signature).replace(/=+$/g, '');
}

function constantTimeEquals_(left, right) {
  left = String(left || '');
  right = String(right || '');
  var mismatch = left.length ^ right.length;
  var length = Math.max(left.length, right.length);
  for (var i = 0; i < length; i++) mismatch |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  return mismatch === 0;
}

function appendAudit_(employeeId, action, resource, result, details) {
  try {
    var sheet = requireSheet_(getSpreadsheet_(), APP.SHEETS.AUDIT);
    sheet.appendRow([new Date(), String(employeeId || ''), String(action || ''), String(resource || ''), String(result || ''), String(details || '').slice(0, 500)]);
  } catch (ignored) {}
}

function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  return sheet;
}

function requireSheet_(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw apiError_('MISSING_SHEET', '找不到必要資料表：' + name);
  return sheet;
}

function withDocumentLock_(callback) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw apiError_('BUSY', '系統忙碌中，請稍後重試。');
  try { return callback(); }
  finally { lock.releaseLock(); }
}

function apiError_(code, message) {
  var error = new Error(message);
  error.code = code;
  return error;
}

function normalizeError_(error) {
  if (error && error.code) return { code: String(error.code), message: String(error.message) };
  console.error(error && error.stack ? error.stack : error);
  return { code: 'INTERNAL_ERROR', message: '伺服器暫時無法處理請求。' };
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function toBoolean_(value) {
  return value === true || String(value).toLowerCase() === 'true';
}

function compareNumber_(current, previous) {
  return {
    current: current,
    previous: previous,
    difference: round2_(current - previous),
    percent: previous === 0 ? null : round2_(((current - previous) / previous) * 100)
  };
}

function round2_(value) {
  return Math.round(Number(value) * 100) / 100;
}

function getIsoYearWeek_(date) {
  var localDate = Utilities.formatDate(date, APP.TIMEZONE, 'yyyy-MM-dd');
  var target = new Date(localDate + 'T00:00:00Z');
  var day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  var year = target.getUTCFullYear();
  var yearStart = new Date(Date.UTC(year, 0, 1));
  var week = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
  return { year: year, week: week };
}

function previousYearWeek_(year, week) {
  if (week > 1) return { year: year, week: week - 1 };
  return { year: year - 1, week: isoWeeksInYear_(year - 1) };
}

function subtractIsoWeeks_(year, week, count) {
  var result = { year: year, week: week };
  for (var i = 0; i < count; i++) result = previousYearWeek_(result.year, result.week);
  return result;
}

function isoWeeksInYear_(year) {
  var date = new Date(Date.UTC(year, 11, 28));
  var day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  var start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - start) / 86400000) + 1) / 7);
}
