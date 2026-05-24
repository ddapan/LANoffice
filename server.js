const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");
const { execFile } = require("node:child_process");
const { TextDecoder } = require("node:util");
const { DatabaseSync } = require("node:sqlite");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DEFAULT_STORAGE_DIR = path.join(ROOT, "storage", "files");
const PUBLIC_DIR = path.join(ROOT, "public");
const DB_PATH = path.join(DATA_DIR, "fileshare.db");
const PORT = Number(process.env.PORT || 8080);
const PERSONAL_SPACE_BASE = "/homes";

for (const dir of [DATA_DIR, DEFAULT_STORAGE_DIR, path.join(ROOT, "storage", ".trash"), PUBLIC_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);
const sessions = new Map();

const roles = new Set(["member", "dept_admin", "admin"]);
const levels = { none: 0, read: 1, write: 2, manage: 3 };
const levelNames = ["none", "read", "write", "manage"];

initDb();
seedAdmin();

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) {
      await handleApi(req, res);
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    console.error(error);
    json(res, 500, { error: "Request failed" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`OfficeShare MVP listening on http://localhost:${PORT}`);
});

function initDb() {
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      status TEXT NOT NULL DEFAULT 'active',
      must_change_password INTEGER NOT NULL DEFAULT 0,
      failed_logins INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS group_members (
      group_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      PRIMARY KEY (group_id, user_id),
      FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      subject_id INTEGER NOT NULL,
      level TEXT NOT NULL,
      inherit INTEGER NOT NULL DEFAULT 1,
      UNIQUE(path, subject_type, subject_id)
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT,
      action TEXT NOT NULL,
      target TEXT NOT NULL DEFAULT '',
      detail TEXT NOT NULL DEFAULT '',
      ip TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      definition TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS folder_notices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL,
      department TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      created_by INTEGER,
      created_by_name TEXT NOT NULL DEFAULT '',
      updated_by INTEGER,
      updated_by_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_folder_notices_path ON folder_notices(path);
    
    -- 添加标题字段的迁移（如果不存在）
    PRAGMA table_info(folder_notices);
  `);
  
  // 添加标题字段（用于已存在的数据库）
  try {
    db.prepare(`ALTER TABLE folder_notices ADD COLUMN title TEXT NOT NULL DEFAULT ''`).run();
  } catch (e) {
    // 字段可能已存在，忽略错误
  }
  
  // 创建已读记录表
  db.prepare(`
    CREATE TABLE IF NOT EXISTS folder_notice_read (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      notice_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(notice_id, user_id)
    );
  `).run();
  setDefaultSetting("shareName", "TeamShare");
  setDefaultSetting("serverHost", "192.168.1.100");
  setDefaultSetting("smbEnabled", "false");
  setDefaultSetting("storagePath", DEFAULT_STORAGE_DIR);
  setDefaultSetting("windowsSyncEnabled", "false");
  setDefaultSetting("createWindowsUsers", "true");
  setDefaultSetting("createSmbShare", "true");
  setDefaultSetting("windowsUserPrefix", "os_");
  setDefaultSetting("windowsGroupPrefix", "osg_");
  setDefaultSetting("windowsMembersGroup", "members");
  setDefaultSetting("windowsAdminsGroup", "admins");
  setDefaultSetting("noAccessAclMode", "remove");
  seedDefaultTemplates();
}

function seedAdmin() {
  const count = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  if (count > 0) return;
  const { hash, salt } = hashPassword("admin123");
  db.prepare(`
    INSERT INTO users (username, display_name, password_hash, salt, role, must_change_password)
    VALUES (?, ?, ?, ?, 'admin', 1)
  `).run("admin", "System Administrator", hash, salt);
  db.prepare(`
    INSERT INTO permissions (path, subject_type, subject_id, level, inherit)
    VALUES ('/', 'user', 1, 'manage', 1)
  `).run();
}

function setDefaultSetting(key, value) {
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}

function seedDefaultTemplates() {
  const template = teamShareTemplate();
  db.prepare(`
    INSERT OR IGNORE INTO templates (id, name, description, definition)
    VALUES (?, ?, ?, ?)
  `).run(template.id, template.name, template.description, JSON.stringify(template));
}

function getSetting(key) {
  return db.prepare("SELECT value FROM settings WHERE key = ?").get(key)?.value;
}

function getAllSettings() {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

async function deleteRecursive(filePath) {
  const stat = await fsp.stat(filePath);
  if (stat.isDirectory()) {
    const entries = await fsp.readdir(filePath);
    for (const entry of entries) {
      await deleteRecursive(path.join(filePath, entry));
    }
    await fsp.rmdir(filePath);
  } else {
    await fsp.unlink(filePath);
  }
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const route = `${req.method} ${url.pathname}`;

  if (route === "POST /api/login") return login(req, res);
  if (route === "POST /api/logout") return logout(req, res);

  const user = currentUser(req);
  if (!user) return json(res, 401, { error: "Request failed" });
  if (user.status !== "active") return json(res, 403, { error: "Request failed" });

  if (route === "GET /api/me") return json(res, 200, { user: publicUser(user) });
  if (route === "POST /api/password") return changePassword(req, res, user);
  if (user.must_change_password) return json(res, 403, { error: "Request failed" });
  if (route === "GET /api/dashboard") return dashboard(req, res, user);
  if (route === "GET /api/client/connect") return clientConnect(req, res, user);
  if (route === "GET /api/files") return listFiles(req, res, user, url);
  if (route === "GET /api/folder-tree") return folderTree(req, res, user);
  if (route === "GET /api/personal/files") return listPersonalFiles(req, res, user);
  if (route === "GET /api/personal/folder-tree") return personalFolderTree(req, res, user);
  if (route === "GET /api/folder-notices") return listFolderNotices(req, res, user, url);
  if (route === "POST /api/folder-notices") return createFolderNotice(req, res, user);
  if (route === "PATCH /api/folder-notices") return updateFolderNotice(req, res, user);
  if (route === "DELETE /api/folder-notices") return deleteFolderNotice(req, res, user, url);
  if (route === "POST /api/folder-notices/read") return markNoticeRead(req, res, user);
  if (route === "POST /api/upload") return uploadFile(req, res, user, url);
  if (route === "POST /api/folder") return createFolder(req, res, user);
  if (route === "POST /api/file") return createEmptyFile(req, res, user);
  if (route === "POST /api/rename") return renameItem(req, res, user);
  if (route === "POST /api/copy") return copyItem(req, res, user);
  if (route === "POST /api/move") return moveItem(req, res, user);
  if (route === "POST /api/delete") return deleteItem(req, res, user);
  if (route === "GET /api/download") return downloadItem(req, res, user, url);
  if (route === "GET /api/trash") return listTrash(req, res, user);
  if (route === "POST /api/trash/restore") return restoreTrash(req, res, user);
  if (route === "POST /api/trash/permanent") return permanentDeleteTrash(req, res, user);
  if (route === "POST /api/trash/clear") return clearAllTrash(req, res, user);
  if (route === "GET /api/logs") return listLogs(req, res, url, user);
  if (route === "GET /api/users") return requireAdmin(res, user) && listUsers(req, res);
  if (route === "POST /api/users") return requireAdmin(res, user) && createUser(req, res, user);
  if (route === "PATCH /api/users") return requireAdmin(res, user) && updateUser(req, res, user);
  if (route === "POST /api/users/reset-password") return requireAdmin(res, user) && resetUserPassword(req, res, user);
  if (route === "DELETE /api/users") return requireAdmin(res, user) && deleteUser(req, res, user, url);
  if (route === "GET /api/groups") return requireAdmin(res, user) && listGroups(req, res);
  if (route === "POST /api/groups") return requireAdmin(res, user) && createGroup(req, res, user);
  if (route === "PATCH /api/groups") return requireAdmin(res, user) && updateGroup(req, res, user);
  if (route === "DELETE /api/groups") return requireAdmin(res, user) && deleteGroup(req, res, user, url);
  if (route === "GET /api/permissions") return requireAdmin(res, user) && listPermissions(req, res, url);
  if (route === "POST /api/permissions") return requireAdmin(res, user) && savePermission(req, res, user);
  if (route === "POST /api/permissions/bulk") return requireAdmin(res, user) && savePermissionsBulk(req, res, user);
  if (route === "GET /api/admin/folders") return requireAdmin(res, user) && adminFolders(req, res);
  if (route === "GET /api/templates") return requireAdmin(res, user) && listTemplates(req, res);
  if (route === "POST /api/templates") return requireAdmin(res, user) && saveTemplate(req, res, user);
  if (route === "POST /api/templates/copy") return requireAdmin(res, user) && copyTemplate(req, res, user);
  if (route === "POST /api/templates/apply") return requireAdmin(res, user) && applyTemplate(req, res, user);
  if (route === "DELETE /api/templates") return requireAdmin(res, user) && deleteTemplate(req, res, user, url);
  if (route === "GET /api/settings") return requireAdmin(res, user) && getSettings(req, res);
  if (route === "GET /api/storage/status") return requireAdmin(res, user) && storageStatus(req, res);
  if (route === "PATCH /api/settings") return requireAdmin(res, user) && updateSettings(req, res, user);
  if (route === "GET /api/windows/status") return requireAdmin(res, user) && windowsStatus(req, res);
  if (route === "GET /api/windows/model") return requireAdmin(res, user) && windowsModel(req, res);
  if (route === "POST /api/windows/sync") return requireAdmin(res, user) && manualWindowsSync(req, res, user);
  if (route === "GET /api/network/addresses") return requireAdmin(res, user) && networkAddresses(req, res);
  if (route === "POST /api/admin/restart-elevated") return requireAdmin(res, user) && restartElevated(req, res, user);

  json(res, 404, { error: "Request failed" });
}

async function login(req, res) {
  const body = await readJson(req);
  const username = cleanName(body.username || "");
  const password = String(body.password || "");
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user || user.status !== "active" || !verifyPassword(password, user.salt, user.password_hash)) {
    if (user) db.prepare("UPDATE users SET failed_logins = failed_logins + 1 WHERE id = ?").run(user.id);
    log(null, username, "login_failed", "", "密码错误或账号被禁用", clientIp(req));
    return json(res, 401, { error: "Request failed" });
  }
  db.prepare("UPDATE users SET failed_logins = 0 WHERE id = ?").run(user.id);
  
  ensurePersonalBaseExists();
  ensurePersonalHomeExists(user);
  
  const sid = crypto.randomBytes(32).toString("hex");
  sessions.set(sid, { userId: user.id, expires: Date.now() + 1000 * 60 * 60 * 8 });
  setCookie(res, sid);
  log(user.id, user.username, "login", "", "登录成功", clientIp(req));
  json(res, 200, { user: publicUser(user) });
}

function logout(req, res) {
  const sid = cookie(req, "sid");
  if (sid) sessions.delete(sid);
  res.setHeader("Set-Cookie", "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
  json(res, 200, { ok: true });
}

async function dashboard(req, res, user) {
  const storageRoot = getStorageRoot();
  await ensureDir(storageRoot);
  
  let storage = { files: 0, folders: 0, bytes: 0 };
  try {
    storage = await folderStats(storageRoot);
  } catch (error) {
    console.error("Error calculating folder stats:", error);
  }
  
  let users = 0;
  let groups = 0;
  let recent = [];
  
  try {
    users = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
    groups = db.prepare("SELECT COUNT(*) AS count FROM groups").get().count;
    recent = db.prepare(`
      SELECT username, action, target, created_at FROM audit_logs
      WHERE user_id = ? OR username = ?
      ORDER BY id DESC LIMIT 8
    `).all(user.id, user.username);
  } catch (error) {
    console.error("Error querying database for dashboard:", error);
  }
  
  json(res, 200, { storage, users, groups, recent });
}

function clientConnect(req, res, user) {
  const settings = getAllSettings();
  const host = settings.serverHost || "192.168.1.100";
  const share = safeShareName(settings.shareName || "TeamShare");
  const drive = "G:";
  const windowsUser = windowsUserName(user.username, user.id, settings);
  const unc = `\\\\${host}\\${share}`;
  const command = `net use ${drive} ${unc} /user:${windowsUser} * /persistent:yes`;
  const disconnectCommand = `net use ${drive} /delete /y`;
  const bat = [
    "@echo off",
    "chcp 65001 >nul",
    "echo OfficeShare network drive setup",
    `echo User: ${windowsUser}`,
    `echo Share: ${unc}`,
    disconnectCommand,
    command,
    "if errorlevel 1 (",
    "  echo.",
    "  echo Failed to map network drive. Please check username, password, network, and SMB access.",
    "  pause",
    "  exit /b 1",
    ")",
    "echo.",
    `echo Mapped ${drive} to ${unc}`,
    "pause"
  ].join("\r\n");
  json(res, 200, {
    host,
    share,
    drive,
    unc,
    windowsUser,
    command,
    disconnectCommand,
    bat,
    notes: [
      "Use your current Web/SMB password when Windows prompts for the password.",
      "Change your password in Settings / Password; it will sync to the Windows local user.",
      "If mapping fails, ask an administrator to reset and sync your Web/SMB password.",
      "Delete old saved credentials in Windows Credential Manager if Windows keeps using an old password."
    ]
  });
}

async function changePassword(req, res, user) {
  const body = await readJson(req);
  const currentPassword = String(body.currentPassword || "");
  const password = String(body.password || "");
  if (password.length < 6) return json(res, 400, { error: "Request failed" });
  if (!user.must_change_password && !verifyPassword(currentPassword, user.salt, user.password_hash)) {
    return json(res, 400, { error: "Request failed" });
  }
  const syncResult = await syncWindowsBestEffort(user, { passwords: { [user.username]: password } });
  if (syncResult && !syncResult.ok) {
    return json(res, 500, { error: "Request failed" });
  }
  const { hash, salt } = hashPassword(password);
  db.prepare("UPDATE users SET password_hash = ?, salt = ?, must_change_password = 0 WHERE id = ?").run(hash, salt, user.id);
  log(user.id, user.username, "change_password", user.username, "用户自行修改密码", clientIp(req));
  json(res, 200, { ok: true, syncResult });
}

async function listFiles(req, res, user, url) {
  const rel = normalizeRel(url.searchParams.get("path") || "/");
  const perm = effectivePermission(user, rel);
  const canTraverse = perm >= levels.read || hasAccessibleDescendant(user, rel);
  if (!canTraverse) return json(res, 403, { error: "Request failed" });
  const full = safePath(rel);
  await ensureDir(full);
  const entries = await fsp.readdir(full, { withFileTypes: true });
  const items = [];
  for (const entry of entries) {
    const itemRel = joinRel(rel, entry.name);
    if (isSystemStorageEntry(entry.name)) continue;
    if (entry.name === "homes") continue;
    const itemPerm = entry.isDirectory() ? effectivePermission(user, itemRel) : perm;
    const itemTraversable = entry.isDirectory() && itemPerm < levels.read && hasAccessibleDescendant(user, itemRel);
    if (entry.isDirectory() && itemPerm < levels.read && !itemTraversable) continue;
    if (!entry.isDirectory() && perm < levels.read) continue;
    const stat = await fsp.stat(path.join(full, entry.name));
    items.push({
      name: entry.name,
      path: itemRel,
      type: entry.isDirectory() ? "folder" : "file",
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      permission: itemPerm >= levels.read ? levelNames[itemPerm] : "traverse"
    });
  }
  items.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, "zh-Hans-CN") : a.type === "folder" ? -1 : 1));
  json(res, 200, { path: rel, permission: perm >= levels.read ? levelNames[perm] : "traverse", items });
}

async function folderTree(req, res, user) {
  const root = getStorageRoot();
  await ensureDir(root);
  const rootPerm = effectivePermission(user, "/");
  if (rootPerm < levels.read && !hasAccessibleDescendant(user, "/")) {
    return json(res, 200, { root: { path: "/", name: "共享空间", permission: "none", children: [] } });
  }
  const tree = {
    path: "/",
    name: "共享空间",
    permission: rootPerm >= levels.read ? levelNames[rootPerm] : "traverse",
    children: await visibleFolderChildren(root, "/", user, 0)
  };
  json(res, 200, { root: tree });
}

function getPersonalHomePath(user) {
  return `${PERSONAL_SPACE_BASE}/${user.username}`;
}

function getPersonalHomeFullPath(user) {
  const storageRoot = path.resolve(getStorageRoot());
  return path.join(storageRoot, PERSONAL_SPACE_BASE, user.username);
}

function getPersonalBaseFullPath() {
  const storageRoot = path.resolve(getStorageRoot());
  return path.join(storageRoot, PERSONAL_SPACE_BASE);
}

function ensurePersonalHomeExists(user) {
  const homeFull = getPersonalHomeFullPath(user);
  fs.mkdirSync(homeFull, { recursive: true });
  return homeFull;
}

function ensurePersonalHomeForNewUser(username) {
  const storageRoot = path.resolve(getStorageRoot());
  const homeFull = path.join(storageRoot, PERSONAL_SPACE_BASE, username);
  fs.mkdirSync(homeFull, { recursive: true });
  return homeFull;
}

function ensurePersonalBaseExists() {
  const baseFull = getPersonalBaseFullPath();
  fs.mkdirSync(baseFull, { recursive: true });
  return baseFull;
}

async function listPersonalFiles(req, res, user) {
  const homePath = getPersonalHomePath(user);
  const homeFull = ensurePersonalHomeExists(user);
  
  const url = new URL(req.url, `http://${req.headers.host}`);
  const rel = normalizeRel(url.searchParams.get("path") || homePath);
  
  if (!rel.startsWith(homePath)) {
    return json(res, 403, { error: "Invalid personal space path" });
  }
  
  const relParts = rel.replace(homePath, "").split("/").filter(Boolean);
  let full = homeFull;
  for (const part of relParts) {
    full = path.join(full, part);
  }
  await ensureDir(full);
  
  let entries = [];
  try {
    entries = await fsp.readdir(full, { withFileTypes: true });
  } catch {
    entries = [];
  }
  
  const items = [];
  for (const entry of entries) {
    if (isSystemStorageEntry(entry.name)) continue;
    const itemRel = joinRel(rel, entry.name);
    const stat = await fsp.stat(path.join(full, entry.name));
    items.push({
      name: entry.name,
      path: itemRel,
      type: entry.isDirectory() ? "folder" : "file",
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      permission: "manage"
    });
  }
  
  items.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, "zh-Hans-CN") : a.type === "folder" ? -1 : 1));
  json(res, 200, { path: rel, permission: "manage", items, isPersonal: true });
}

async function personalFolderTree(req, res, user) {
  const homePath = getPersonalHomePath(user);
  const homeFull = ensurePersonalHomeExists(user);
  
  const children = await visiblePersonalFolderChildren(homeFull, homePath, 0);
  const tree = {
    path: homePath,
    name: "个人空间",
    permission: "manage",
    children: children
  };
  json(res, 200, { root: tree });
}

async function visiblePersonalFolderChildren(full, rel, depth) {
  if (depth >= 5) return [];
  const entries = await fsp.readdir(full, { withFileTypes: true });
  const children = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || isSystemStorageEntry(entry.name)) continue;
    const childRel = joinRel(rel, entry.name);
    children.push({
      path: childRel,
      name: entry.name,
      permission: "manage",
      children: await visiblePersonalFolderChildren(path.join(full, entry.name), childRel, depth + 1)
    });
  }
  children.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
  return children;
}

function ensureNoticePathVisible(res, user, rel) {
  const perm = effectivePermission(user, rel);
  if (perm >= levels.read || hasAccessibleDescendant(user, rel)) return true;
  json(res, 403, { error: "Request failed" });
  return false;
}

async function listFolderNotices(req, res, user, url) {
  const rel = normalizeRel(url.searchParams.get("path") || "/");
  if (!ensureNoticePathVisible(res, user, rel)) return;
  const full = safePath(rel);
  const stat = await fsp.stat(full).catch(() => null);
  if (!stat || !stat.isDirectory()) return json(res, 404, { error: "Request failed" });
  
  // 获取已读记录
  const readNotices = new Set();
  db.prepare(`
    SELECT notice_id FROM folder_notice_read WHERE user_id = ?
  `).all(user.id).forEach(row => readNotices.add(row.notice_id));
  
  const items = db.prepare(`
    SELECT id, path, department, title, content, created_by, created_by_name, updated_by_name, created_at, updated_at
    FROM folder_notices
    WHERE path = ?
    ORDER BY datetime(updated_at) DESC, id DESC
  `).all(rel).map((row) => ({
    id: row.id,
    path: row.path,
    department: row.department || "",
    title: row.title || "",
    content: row.content,
    createdBy: row.created_by,
    createdByName: row.created_by_name || "",
    updatedByName: row.updated_by_name || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isRead: readNotices.has(row.id)
  }));
  json(res, 200, { path: rel, items });
}

async function createFolderNotice(req, res, user) {
  const body = await readJson(req);
  const rel = normalizeRel(body.path || "/");
  if (!ensureNoticePathVisible(res, user, rel)) return;
  const full = safePath(rel);
  const stat = await fsp.stat(full).catch(() => null);
  if (!stat || !stat.isDirectory()) return json(res, 404, { error: "Request failed" });
  const title = String(body.title || "").trim().slice(0, 100);
  const content = String(body.content || "").trim().slice(0, 1000);
  if (!content) return json(res, 400, { error: "Request failed" });
  const result = db.prepare(`
    INSERT INTO folder_notices
    (path, title, content, created_by, created_by_name, updated_by, updated_by_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(rel, title, content, user.id, user.display_name || user.username, user.id, user.display_name || user.username);
  
  // 自动标记创建者为已读
  try {
    db.prepare(`
      INSERT OR IGNORE INTO folder_notice_read (notice_id, user_id)
      VALUES (?, ?)
    `).run(result.lastInsertRowid, user.id);
  } catch (e) {
    // 忽略错误
  }
  
  log(user.id, user.username, "notice_create", rel, `${title || "No title"}: ${content.slice(0, 50)}`, clientIp(req));
  json(res, 200, { ok: true });
}

async function updateFolderNotice(req, res, user) {
  const body = await readJson(req);
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return json(res, 400, { error: "Request failed" });
  const current = db.prepare("SELECT id, path, created_by, department FROM folder_notices WHERE id = ?").get(id);
  if (!current) return json(res, 404, { error: "Request failed" });
  if (!ensureNoticePathVisible(res, user, current.path)) return;
  if (user.role !== "admin" && current.created_by !== user.id) {
    return json(res, 403, { error: "没有权限编辑此公告" });
  }
  const title = String(body.title || "").trim().slice(0, 100);
  const content = String(body.content || "").trim().slice(0, 1000);
  if (!content) return json(res, 400, { error: "Request failed" });
  db.prepare(`
    UPDATE folder_notices
    SET title = ?, content = ?, updated_by = ?, updated_by_name = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(title, content, user.id, user.display_name || user.username, id);
  log(user.id, user.username, "notice_update", current.path, `#${id}`, clientIp(req));
  json(res, 200, { ok: true });
}

function deleteFolderNotice(req, res, user, url) {
  const id = Number(url.searchParams.get("id") || "");
  if (!Number.isInteger(id) || id <= 0) return json(res, 400, { error: "Request failed" });
  const current = db.prepare("SELECT id, path, created_by FROM folder_notices WHERE id = ?").get(id);
  if (!current) return json(res, 404, { error: "Request failed" });
  if (!ensureNoticePathVisible(res, user, current.path)) return;
  if (user.role !== "admin" && current.created_by !== user.id) {
    return json(res, 403, { error: "没有权限删除此公告" });
  }
  db.prepare("DELETE FROM folder_notices WHERE id = ?").run(id);
  // 删除相关的已读记录
  db.prepare("DELETE FROM folder_notice_read WHERE notice_id = ?").run(id);
  log(user.id, user.username, "notice_delete", current.path, `#${id}`, clientIp(req));
  json(res, 200, { ok: true });
}

async function markNoticeRead(req, res, user) {
  const body = await readJson(req);
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return json(res, 400, { error: "Request failed" });
  // 检查公告是否存在且可见
  const current = db.prepare("SELECT id, path FROM folder_notices WHERE id = ?").get(id);
  if (!current) return json(res, 404, { error: "Request failed" });
  if (!ensureNoticePathVisible(res, user, current.path)) return;
  // 标记为已读
  try {
    db.prepare(`
      INSERT OR IGNORE INTO folder_notice_read (notice_id, user_id)
      VALUES (?, ?)
    `).run(id, user.id);
  } catch (e) {
    // 忽略错误
  }
  json(res, 200, { ok: true });
}

async function visibleFolderChildren(full, rel, user, depth) {
  if (depth >= 5) return [];
  const entries = await fsp.readdir(full, { withFileTypes: true });
  const children = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || isSystemStorageEntry(entry.name)) continue;
    if (entry.name === "homes") continue;
    const childRel = joinRel(rel, entry.name);
    const perm = effectivePermission(user, childRel);
    const traversable = perm >= levels.read || hasAccessibleDescendant(user, childRel);
    if (!traversable) continue;
    children.push({
      path: childRel,
      name: entry.name,
      permission: perm >= levels.read ? levelNames[perm] : "traverse",
      children: await visibleFolderChildren(path.join(full, entry.name), childRel, user, depth + 1)
    });
  }
  children.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
  return children;
}

async function uploadFile(req, res, user, url) {
  const rel = normalizeRel(url.searchParams.get("path") || "/");
  const conflict = String(url.searchParams.get("conflict") || "");
  if (effectivePermission(user, rel) < levels.write) return json(res, 403, { error: "Request failed" });
  const full = safePath(rel);
  await ensureDir(full);
  const parsed = await readMultipart(req);
  if (!parsed.file) return json(res, 400, { error: "Request failed" });
  let filename = safeFileName(parsed.file.filename);
  if (!filename) return json(res, 400, { error: "Request failed" });
  let dest = path.join(full, filename);
  if (fs.existsSync(dest)) {
    if (conflict === "rename") {
      dest = nextAvailablePath(dest);
      filename = path.basename(dest);
    } else if (conflict === "version") {
      await versionExisting(dest, filename);
    } else {
      return json(res, 409, conflictPayload("当前目录已有同名文件", rel, filename, "file"));
    }
  }
  await fsp.writeFile(dest, parsed.file.data);
  log(user.id, user.username, "upload", joinRel(rel, filename), `${parsed.file.data.length} bytes`, clientIp(req));
  json(res, 200, { ok: true, name: filename, path: joinRel(rel, filename) });
}

async function createFolder(req, res, user) {
  const body = await readJson(req);
  const parent = normalizeRel(body.path || "/");
  if (effectivePermission(user, parent) < levels.write) return json(res, 403, { error: "Request failed" });
  let name = safeFileName(body.name || "");
  if (!name) return json(res, 400, { error: "Request failed" });
  let full = path.join(safePath(parent), name);
  if (fs.existsSync(full)) {
    if (body.conflict === "rename") {
      full = nextAvailablePath(full);
      name = path.basename(full);
    } else {
      return json(res, 409, conflictPayload("Duplicate folder exists in current directory", parent, name, "folder"));
    }
  }
  await fsp.mkdir(full, { recursive: false });
  log(user.id, user.username, "mkdir", joinRel(parent, name), "", clientIp(req));
  json(res, 200, { ok: true, name, path: joinRel(parent, name) });
}

async function createEmptyFile(req, res, user) {
  const body = await readJson(req);
  const parent = normalizeRel(body.path || "/");
  if (effectivePermission(user, parent) < levels.write) return json(res, 403, { error: "Request failed" });
  let name = safeFileName(body.name || "");
  if (!name) return json(res, 400, { error: "Request failed" });
  const parentFull = safePath(parent);
  await ensureDir(parentFull);
  let full = path.join(parentFull, name);
  if (fs.existsSync(full)) {
    if (body.conflict === "rename") {
      full = nextAvailablePath(full);
      name = path.basename(full);
    } else {
      return json(res, 409, conflictPayload("Duplicate file exists in current directory", parent, name, "file"));
    }
  }
  await fsp.writeFile(full, "");
  log(user.id, user.username, "touch", joinRel(parent, name), "", clientIp(req));
  json(res, 200, { ok: true, name, path: joinRel(parent, name) });
}

async function renameItem(req, res, user) {
  const body = await readJson(req);
  const rel = normalizeRel(body.path || "/");
  const parent = parentRel(rel);
  if (effectivePermission(user, parent) < levels.write) return json(res, 403, { error: "Request failed" });
  const name = safeFileName(body.name || "");
  if (!name) return json(res, 400, { error: "Request failed" });
  const from = safePath(rel);
  const to = path.join(safePath(parent), name);
  await fsp.rename(from, to);
  log(user.id, user.username, "rename", rel, `to ${joinRel(parent, name)}`, clientIp(req));
  json(res, 200, { ok: true });
}

async function copyItem(req, res, user) {
  const body = await readJson(req);
  const rel = normalizeRel(body.path || "/");
  if (rel === "/") return json(res, 400, { error: "Request failed" });
  const targetDir = normalizeRel(body.targetDir || "/");
  const sourceParent = parentRel(rel);
  if (effectivePermission(user, sourceParent) < levels.read) return json(res, 403, { error: "Request failed" });
  if (effectivePermission(user, targetDir) < levels.write) return json(res, 403, { error: "Request failed" });
  const from = safePath(rel);
  const stat = await fsp.stat(from);
  let baseName = safeFileName(body.name || path.basename(rel));
  if (!baseName) return json(res, 400, { error: "Request failed" });
  const targetFull = safePath(targetDir);
  await ensureDir(targetFull);
  let to = path.join(targetFull, baseName);
  if (fs.existsSync(to)) {
    if (body.conflict === "rename") {
      to = nextAvailablePath(to);
      baseName = path.basename(to);
    } else {
      return json(res, 409, conflictPayload("Duplicate item exists in target directory", targetDir, baseName, stat.isDirectory() ? "folder" : "file"));
    }
  }
  if (stat.isDirectory()) {
    await fsp.cp(from, to, { recursive: true, errorOnExist: true });
  } else {
    await fsp.copyFile(from, to);
  }
  log(user.id, user.username, "copy", rel, `to ${joinRel(targetDir, baseName)}`, clientIp(req));
  json(res, 200, { ok: true, name: baseName, path: joinRel(targetDir, baseName) });
}

async function moveItem(req, res, user) {
  const body = await readJson(req);
  const rel = normalizeRel(body.path || "/");
  if (rel === "/") return json(res, 400, { error: "Request failed" });
  const targetDir = normalizeRel(body.targetDir || "/");
  const sourceParent = parentRel(rel);
  if (effectivePermission(user, sourceParent) < levels.write) return json(res, 403, { error: "Request failed" });
  if (effectivePermission(user, targetDir) < levels.write) return json(res, 403, { error: "Request failed" });
  let baseName = safeFileName(body.name || path.basename(rel));
  if (!baseName) return json(res, 400, { error: "Request failed" });
  const from = safePath(rel);
  const targetFull = safePath(targetDir);
  await ensureDir(targetFull);
  let to = path.join(targetFull, baseName);
  if (fs.existsSync(to)) {
    if (body.conflict === "rename") {
      to = nextAvailablePath(to);
      baseName = path.basename(to);
    } else {
      const stat = await fsp.stat(from);
      return json(res, 409, conflictPayload("Duplicate item exists in target directory", targetDir, baseName, stat.isDirectory() ? "folder" : "file"));
    }
  }
  await fsp.rename(from, to);
  log(user.id, user.username, "move", rel, `to ${joinRel(targetDir, baseName)}`, clientIp(req));
  json(res, 200, { ok: true, name: baseName, path: joinRel(targetDir, baseName) });
}

async function deleteItem(req, res, user) {
  const body = await readJson(req);
  const rel = normalizeRel(body.path || "/");
  if (rel === "/") return json(res, 400, { error: "Request failed" });
  const parent = parentRel(rel);
  if (effectivePermission(user, parent) < levels.write) return json(res, 403, { error: "Request failed" });
  const from = safePath(rel);
  const trashName = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}_${path.basename(rel)}`;
  const trashDir = getTrashRoot();
  await ensureDir(trashDir);
  const to = path.join(trashDir, trashName);
  await fsp.rename(from, to);
  await fsp.writeFile(`${to}.json`, JSON.stringify({ originalPath: rel, deletedBy: user.username, deletedById: user.id, deletedAt: new Date().toISOString() }, null, 2));
  log(user.id, user.username, "delete", rel, "moved to trash", clientIp(req));
  json(res, 200, { ok: true });
}

async function downloadItem(req, res, user, url) {
  const rel = normalizeRel(url.searchParams.get("path") || "/");
  const parent = parentRel(rel);
  if (effectivePermission(user, parent) < levels.read) return json(res, 403, { error: "Request failed" });
  const full = safePath(rel);
  const stat = await fsp.stat(full);
  if (stat.isDirectory()) return json(res, 400, { error: "Request failed" });
  log(user.id, user.username, "download", rel, "", clientIp(req));
  res.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "Content-Length": stat.size,
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(full))}`
  });
  fs.createReadStream(full).pipe(res);
}

async function listTrash(req, res, user) {
  const trashDir = getTrashRoot();
  await ensureDir(trashDir);
  const files = await fsp.readdir(trashDir);
  const items = [];
  for (const file of files.filter((name) => name.endsWith(".json"))) {
    const metaPath = path.join(trashDir, file);
    const meta = JSON.parse(await fsp.readFile(metaPath, "utf8"));
    if (user.role !== "admin" && meta.deletedById !== user.id) continue;
    const trashName = file.slice(0, -5);
    items.push({ trashName, ...meta });
  }
  items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  json(res, 200, { items });
}

async function restoreTrash(req, res, user) {
  const body = await readJson(req);
  const trashName = safeTrashName(body.trashName || "");
  const trashDir = getTrashRoot();
  const metaPath = path.join(trashDir, `${trashName}.json`);
  const meta = JSON.parse(await fsp.readFile(metaPath, "utf8"));
  if (user.role !== "admin" && meta.deletedById !== user.id) return json(res, 403, { error: "Request failed" });
  const dest = safePath(meta.originalPath);
  await ensureDir(path.dirname(dest));
  if (fs.existsSync(dest)) return json(res, 409, { error: "Request failed" });
  await fsp.rename(path.join(trashDir, trashName), dest);
  await fsp.unlink(metaPath);
  log(user.id, user.username, "restore", meta.originalPath, "", clientIp(req));
  json(res, 200, { ok: true });
}

async function permanentDeleteTrash(req, res, user) {
  const body = await readJson(req);
  const trashName = safeTrashName(body.trashName || "");
  const trashDir = getTrashRoot();
  const metaPath = path.join(trashDir, `${trashName}.json`);
  const meta = JSON.parse(await fsp.readFile(metaPath, "utf8"));
  if (user.role !== "admin" && meta.deletedById !== user.id) return json(res, 403, { error: "Request failed" });
  
  const itemPath = path.join(trashDir, trashName);
  await deleteRecursive(itemPath);
  await fsp.unlink(metaPath);
  log(user.id, user.username, "permanent_delete", meta.originalPath, "", clientIp(req));
  json(res, 200, { ok: true });
}

async function clearAllTrash(req, res, user) {
  if (user.role !== "admin") return json(res, 403, { error: "Request failed" });
  
  const trashDir = getTrashRoot();
  const files = await fsp.readdir(trashDir);
  
  for (const file of files) {
    if (file.endsWith(".json")) {
      const metaPath = path.join(trashDir, file);
      const meta = JSON.parse(await fsp.readFile(metaPath, "utf8"));
      const itemPath = path.join(trashDir, meta.trashName);
      
      if (fs.existsSync(itemPath)) {
        await deleteRecursive(itemPath);
      }
      await fsp.unlink(metaPath);
      log(user.id, user.username, "clear_trash", meta.originalPath, "", clientIp(req));
    }
  }
  
  json(res, 200, { ok: true });
}

function listLogs(req, res, url, user) {
  const limit = Number(url.searchParams.get("limit") || 100);
  const ownOnly = url.searchParams.get("scope") === "mine";
  const rows = user.role === "admin" && !ownOnly
    ? db.prepare("SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?").all(limit)
    : db.prepare("SELECT * FROM audit_logs WHERE user_id = ? OR username = ? ORDER BY id DESC LIMIT ?").all(user.id, user.username, limit);
  json(res, 200, { items: rows });
}

function listUsers(req, res) {
  const rows = db.prepare("SELECT id, username, display_name, role, status, must_change_password, failed_logins, created_at FROM users ORDER BY id").all();
  json(res, 200, { items: rows });
}

async function createUser(req, res, actor) {
  const body = await readJson(req);
  const username = cleanName(body.username || "");
  const password = String(body.password || "123456");
  const role = roles.has(body.role) ? body.role : "member";
  if (!username) return json(res, 400, { error: "Request failed" });
  const { hash, salt } = hashPassword(password);
  db.prepare(`
    INSERT INTO users (username, display_name, password_hash, salt, role, status, must_change_password)
    VALUES (?, ?, ?, ?, ?, 'active', 1)
  `).run(username, String(body.displayName || username), hash, salt, role);
  
  ensurePersonalHomeForNewUser(username);
  
  log(actor.id, actor.username, "create_user", username, "", "");
  await syncWindowsBestEffort(actor, { passwords: { [username]: password } });
  json(res, 200, { ok: true });
}

async function updateUser(req, res, actor) {
  const body = await readJson(req);
  const id = Number(body.id);
  const current = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!current) return json(res, 404, { error: "Request failed" });
  const role = roles.has(body.role) ? body.role : current.role;
  const status = ["active", "disabled", "locked"].includes(body.status) ? body.status : current.status;
  db.prepare("UPDATE users SET display_name = ?, role = ?, status = ? WHERE id = ?").run(String(body.displayName || current.display_name), role, status, id);
  log(actor.id, actor.username, "update_user", current.username, "", "");
  const syncResult = await syncWindowsBestEffort(actor);
  json(res, 200, { ok: true, syncResult });
}

async function resetUserPassword(req, res, actor) {
  const body = await readJson(req);
  const id = Number(body.id);
  const current = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!current) return json(res, 404, { error: "Request failed" });
  const password = randomPassword();
  const syncResult = await syncWindowsBestEffort(actor, { passwords: { [current.username]: password } });
  if (syncResult && !syncResult.ok) {
    return json(res, 500, { error: "Request failed" });
  }
  const { hash, salt } = hashPassword(password);
  db.prepare("UPDATE users SET password_hash = ?, salt = ?, must_change_password = 1 WHERE id = ?").run(hash, salt, id);
  log(actor.id, actor.username, "reset_password", current.username, "admin reset password", clientIp(req));
  json(res, 200, { ok: true, password, syncResult });
}

function deleteUser(req, res, actor, url) {
  const id = Number(url.searchParams.get("id"));
  if (id === actor.id) return json(res, 400, { error: "Request failed" });
  const target = db.prepare("SELECT username FROM users WHERE id = ?").get(id);
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
  log(actor.id, actor.username, "delete_user", target?.username || String(id), "", "");
  syncWindowsBestEffort(actor).catch(() => {});
  json(res, 200, { ok: true });
}

function listGroups(req, res) {
  const groups = db.prepare("SELECT * FROM groups ORDER BY id").all();
  for (const group of groups) {
    group.members = db.prepare(`
      SELECT u.id, u.username, u.display_name FROM users u
      JOIN group_members gm ON gm.user_id = u.id WHERE gm.group_id = ?
      ORDER BY u.username
    `).all(group.id);
  }
  json(res, 200, { items: groups });
}

async function createGroup(req, res, actor) {
  const body = await readJson(req);
  const name = String(body.name || "").trim();
  if (!name) return json(res, 400, { error: "Request failed" });
  db.prepare("INSERT INTO groups (name, description) VALUES (?, ?)").run(name, String(body.description || ""));
  log(actor.id, actor.username, "create_group", name, "", "");
  await syncWindowsBestEffort(actor);
  json(res, 200, { ok: true });
}

async function updateGroup(req, res, actor) {
  const body = await readJson(req);
  const id = Number(body.id);
  db.prepare("UPDATE groups SET name = ?, description = ? WHERE id = ?").run(String(body.name || ""), String(body.description || ""), id);
  db.prepare("DELETE FROM group_members WHERE group_id = ?").run(id);
  for (const userId of body.memberIds || []) {
    db.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)").run(id, Number(userId));
  }
  log(actor.id, actor.username, "update_group", String(body.name || id), "", "");
  await syncWindowsBestEffort(actor);
  json(res, 200, { ok: true });
}

function deleteGroup(req, res, actor, url) {
  const id = Number(url.searchParams.get("id"));
  const target = db.prepare("SELECT name FROM groups WHERE id = ?").get(id);
  db.prepare("DELETE FROM groups WHERE id = ?").run(id);
  log(actor.id, actor.username, "delete_group", target?.name || String(id), "", "");
  syncWindowsBestEffort(actor).catch(() => {});
  json(res, 200, { ok: true });
}

function listPermissions(req, res, url) {
  const rel = normalizeRel(url.searchParams.get("path") || "/");
  const rows = db.prepare("SELECT * FROM permissions WHERE path = ? ORDER BY subject_type, subject_id").all(rel);
  json(res, 200, { items: rows });
}

async function savePermission(req, res, actor) {
  const body = await readJson(req);
  const rel = normalizeRel(body.path || "/");
  const subjectType = body.subjectType === "group" ? "group" : "user";
  const subjectId = Number(body.subjectId);
  const level = levels[body.level] === undefined ? "none" : body.level;
  db.prepare(`
    INSERT INTO permissions (path, subject_type, subject_id, level, inherit)
    VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(path, subject_type, subject_id) DO UPDATE SET level = excluded.level
  `).run(rel, subjectType, subjectId, level);
  log(actor.id, actor.username, "save_permission", rel, `${subjectType}:${subjectId}=${level}`, "");
  await syncWindowsBestEffort(actor);
  json(res, 200, { ok: true });
}

async function savePermissionsBulk(req, res, actor) {
  const body = await readJson(req);
  const rel = normalizeRel(body.path || "/");
  await ensureDir(safePath(rel));
  const entries = Array.isArray(body.entries) ? body.entries : [];
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM permissions WHERE path = ?").run(rel);
    const insert = db.prepare(`
      INSERT INTO permissions (path, subject_type, subject_id, level, inherit)
      VALUES (?, ?, ?, ?, 1)
    `);
    for (const entry of entries) {
      const subjectType = entry.subjectType === "user" ? "user" : "group";
      const subjectId = Number(entry.subjectId);
      const level = String(entry.level || "inherit");
      if (level === "inherit" || level === "") continue;
      if (levels[level] === undefined) throw new Error(`权限级别无效: ${level}`);
      assertSubjectExists(subjectType, subjectId);
      insert.run(rel, subjectType, subjectId, level);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  log(actor.id, actor.username, "save_permission_matrix", rel, `${entries.length} entries`, "");
  const syncResult = await syncWindowsBestEffort(actor);
  json(res, 200, { ok: true, syncResult });
}

async function adminFolders(req, res) {
  const root = getStorageRoot();
  await ensureDir(root);
  const items = [{ path: "/", name: "Share", depth: 0 }];
  await collectFolders(root, "/", 0, items);
  const filteredItems = items.filter((item) => !item.path.startsWith(PERSONAL_SPACE_BASE));
  json(res, 200, { root, items: filteredItems });
}

async function collectFolders(full, rel, depth, items) {
  if (depth >= 5) return;
  const entries = await fsp.readdir(full, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || isSystemStorageEntry(entry.name)) continue;
    if (rel === "/" && entry.name === "homes") continue;
    const childRel = joinRel(rel, entry.name);
    items.push({ path: childRel, name: entry.name, depth: depth + 1 });
    await collectFolders(path.join(full, entry.name), childRel, depth + 1, items);
  }
}

function assertSubjectExists(subjectType, subjectId) {
  const table = subjectType === "group" ? "groups" : "users";
  const row = db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(subjectId);
  if (!row) throw new Error(`${subjectType} not found: ${subjectId}`);
}

function listTemplates(req, res) {
  const rows = db.prepare("SELECT id, name, description, definition, updated_at FROM templates ORDER BY name").all();
  const items = rows.map(templateFromRow).filter(Boolean);
  json(res, 200, { items });
}

async function applyTemplate(req, res, actor) {
  const body = await readJson(req);
  const template = getTemplateById(body.templateId || "small-team-standard");
  if (!template) return json(res, 404, { error: "Request failed" });

  const createdFolders = [];
  const createdGroups = [];
  const savedPermissions = [];

  for (const folder of template.folders) {
    const rel = normalizeRel(folder.path);
    await ensureDir(safePath(rel));
    createdFolders.push(rel);
  }

  const groupIds = {};
  for (const group of template.groups) {
    const existing = db.prepare("SELECT id FROM groups WHERE name = ?").get(group.name);
    if (existing) {
      groupIds[group.key] = existing.id;
      continue;
    }
    const result = db.prepare("INSERT INTO groups (name, description) VALUES (?, ?)").run(group.name, group.description || "");
    groupIds[group.key] = Number(result.lastInsertRowid);
    createdGroups.push(group.name);
  }

  for (const permission of template.permissions) {
    const subjectId = groupIds[permission.groupKey];
    if (!subjectId) continue;
    db.prepare(`
      INSERT INTO permissions (path, subject_type, subject_id, level, inherit)
      VALUES (?, 'group', ?, ?, 1)
      ON CONFLICT(path, subject_type, subject_id) DO UPDATE SET level = excluded.level
    `).run(normalizeRel(permission.path), subjectId, permission.level);
    savedPermissions.push(`${permission.path}:${permission.groupKey}=${permission.level}`);
  }

  log(actor.id, actor.username, "apply_template", template.name, `${createdFolders.length} folders, ${createdGroups.length} groups, ${savedPermissions.length} permissions`, "");
  await syncWindowsBestEffort(actor);
  json(res, 200, { ok: true, createdFolders, createdGroups, savedPermissions });
}

async function saveTemplate(req, res, actor) {
  const body = await readJson(req);
  const template = normalizeTemplate(body.template || body);
  validateTemplate(template);
  db.prepare(`
    INSERT INTO templates (id, name, description, definition, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      definition = excluded.definition,
      updated_at = CURRENT_TIMESTAMP
  `).run(template.id, template.name, template.description || "", JSON.stringify(template));
  log(actor.id, actor.username, "save_template", template.name, "", "");
  json(res, 200, { ok: true, template });
}

async function copyTemplate(req, res, actor) {
  const body = await readJson(req);
  const source = getTemplateById(body.templateId);
  if (!source) return json(res, 404, { error: "Request failed" });
  const copy = {
    ...source,
    id: uniqueTemplateId(`${source.id}-copy`),
    name: `${source.name} Copy`
  };
  db.prepare("INSERT INTO templates (id, name, description, definition) VALUES (?, ?, ?, ?)")
    .run(copy.id, copy.name, copy.description || "", JSON.stringify(copy));
  log(actor.id, actor.username, "copy_template", copy.name, `from ${source.id}`, "");
  json(res, 200, { ok: true, template: copy });
}

function deleteTemplate(req, res, actor, url) {
  const id = String(url.searchParams.get("id") || "");
  if (!id) return json(res, 400, { error: "Request failed" });
  const existing = getTemplateById(id);
  if (!existing) return json(res, 404, { error: "Request failed" });
  db.prepare("DELETE FROM templates WHERE id = ?").run(id);
  log(actor.id, actor.username, "delete_template", existing.name, id, "");
  json(res, 200, { ok: true });
}

function getTemplateById(id) {
  const row = db.prepare("SELECT id, name, description, definition, updated_at FROM templates WHERE id = ?").get(id);
  return templateFromRow(row);
}

function templateFromRow(row) {
  if (!row) return null;
  try {
    const definition = JSON.parse(row.definition);
    return { ...definition, id: row.id, name: row.name, description: row.description, updatedAt: row.updated_at };
  } catch {
    return null;
  }
}

function normalizeTemplate(input) {
  const id = safeTemplateId(input.id || input.name || `template-${Date.now()}`);
  return {
    id,
    name: String(input.name || id).trim(),
    description: String(input.description || "").trim(),
    groups: Array.isArray(input.groups) ? input.groups : [],
    folders: Array.isArray(input.folders) ? input.folders : [],
    permissions: Array.isArray(input.permissions) ? input.permissions : []
  };
}

function validateTemplate(template) {
  if (!template.id || !template.name) throw new Error("模板 ID 和名称不能为空");
  for (const folder of template.folders) normalizeRel(folder.path);
  const groupKeys = new Set(template.groups.map((group) => String(group.key || "")));
  for (const permission of template.permissions) {
    normalizeRel(permission.path);
    if (!groupKeys.has(permission.groupKey)) throw new Error(`模板权限引用了不存在的群组 key: ${permission.groupKey}`);
    if (levels[permission.level] === undefined) throw new Error(`权限级别无效: ${permission.level}`);
  }
}

function safeTemplateId(value) {
  return String(value).trim().toLowerCase().replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || `template-${Date.now()}`;
}

function uniqueTemplateId(base) {
  let id = safeTemplateId(base);
  let index = 2;
  while (db.prepare("SELECT id FROM templates WHERE id = ?").get(id)) {
    id = `${safeTemplateId(base)}-${index}`;
    index += 1;
  }
  return id;
}

function getSettings(req, res) {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  json(res, 200, { settings: Object.fromEntries(rows.map((row) => [row.key, row.value])) });
}

async function storageStatus(req, res) {
  const settings = getAllSettings();
  const storageRoot = getStorageRoot();
  const shareName = safeShareName(settings.shareName || "TeamShare");
  const exists = fs.existsSync(storageRoot);
  const topItems = exists
    ? (await fsp.readdir(storageRoot, { withFileTypes: true }))
      .filter((entry) => !isSystemStorageEntry(entry.name))
      .map((entry) => ({ name: entry.name, type: entry.isDirectory() ? "folder" : "file" }))
    : [];
  const systemItems = exists
    ? (await fsp.readdir(storageRoot, { withFileTypes: true }))
      .filter((entry) => isSystemStorageEntry(entry.name))
      .map((entry) => ({ name: entry.name, type: entry.isDirectory() ? "folder" : "file" }))
    : [];
  let smbPath = "";
  let smbMode = "";
  if (process.platform === "win32") {
    const script = `Get-SmbShare -Name ${psQuote(shareName)} -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Path`;
    const modeScript = `Get-SmbShare -Name ${psQuote(shareName)} -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FolderEnumerationMode`;
    const pathResult = await runCommand("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], { allowFailure: true });
    const modeResult = await runCommand("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", modeScript], { allowFailure: true });
    smbPath = pathResult.code === 0 ? pathResult.stdout.trim() : "";
    smbMode = modeResult.code === 0 ? modeResult.stdout.trim() : "";
  }
  json(res, 200, {
    storageRoot,
    exists,
    shareName,
    smbPath,
    smbMode,
    samePath: Boolean(smbPath) && path.resolve(smbPath).toLowerCase() === path.resolve(storageRoot).toLowerCase(),
    topItems,
    systemItems,
    note: "The Web file list reads the shared directory directly. SMB changes may not include Web operator logs, and SMB deletes do not enter the Web recycle bin."
  });
}

async function updateSettings(req, res, actor) {
  const body = await readJson(req);
  for (const key of ["shareName", "serverHost", "smbEnabled", "storagePath", "windowsSyncEnabled", "createWindowsUsers", "createSmbShare", "windowsUserPrefix", "windowsGroupPrefix", "windowsMembersGroup", "windowsAdminsGroup", "noAccessAclMode"]) {
    if (body[key] !== undefined) db.prepare("UPDATE settings SET value = ? WHERE key = ?").run(String(body[key]), key);
  }
  await ensureDir(getStorageRoot());
  await ensureDir(getTrashRoot());
  log(actor.id, actor.username, "update_settings", "settings", "", "");
  await syncWindowsBestEffort(actor);
  json(res, 200, { ok: true });
}

async function windowsStatus(req, res) {
  const status = {
    platform: process.platform,
    supported: process.platform === "win32",
    elevated: false,
    storageRoot: getStorageRoot(),
    shareName: getSetting("shareName") || "TeamShare",
    windowsSyncEnabled: getSetting("windowsSyncEnabled") === "true"
  };
  if (status.supported) {
    const check = await runCommand("net", ["session"], { allowFailure: true });
    status.elevated = check.code === 0;
    status.message = check.code === 0
      ? "The service has administrator privileges and can sync Windows users, groups, shares and NTFS ACL."
      : "The service is not running as administrator. Windows sync will fail until it is restarted as administrator.";
  } else {
    status.message = "This host is not Windows, so SMB and NTFS ACL sync are unavailable.";
  }
  json(res, 200, status);
}

function windowsModel(req, res) {
  const settings = getAllSettings();
  const users = db.prepare("SELECT id, username, display_name, role, status FROM users ORDER BY username").all();
  const groups = db.prepare("SELECT id, name, description FROM groups ORDER BY name").all();
  const permissions = db.prepare("SELECT * FROM permissions ORDER BY path, subject_type, subject_id").all();
  const userRows = users.map((user) => ({
    ...user,
    windowsName: windowsUserName(user.username, user.id, settings),
    systemGroups: [
      user.status === "active" ? windowsSystemGroupName(settings.windowsMembersGroup || "members", settings) : "",
      user.role === "admin" ? windowsSystemGroupName(settings.windowsAdminsGroup || "admins", settings) : ""
    ].filter(Boolean)
  }));
  const groupRows = groups.map((group) => ({
    ...group,
    windowsName: windowsGroupName(group.name, group.id, settings),
    members: db.prepare(`
      SELECT u.id, u.username, u.display_name FROM users u
      JOIN group_members gm ON gm.user_id = u.id WHERE gm.group_id = ?
      ORDER BY u.username
    `).all(group.id)
  }));
  const permissionRows = permissions.map((permission) => {
    const mapped = permission.subject_type === "group"
      ? groupRows.find((group) => group.id === permission.subject_id)
      : userRows.find((user) => user.id === permission.subject_id);
    return {
      ...permission,
      windowsIdentity: mapped?.windowsName || "",
      ntfsRight: ntfsRightLabel(permission.level, settings.noAccessAclMode || "remove")
    };
  });
  json(res, 200, {
    storageRoot: getStorageRoot(),
    shareName: safeShareName(settings.shareName || "TeamShare"),
    sharePrincipal: "Authenticated Users",
    membersGroup: windowsSystemGroupName(settings.windowsMembersGroup || "members", settings),
    adminsGroup: windowsSystemGroupName(settings.windowsAdminsGroup || "admins", settings),
    noAccessAclMode: settings.noAccessAclMode || "remove",
    users: userRows,
    groups: groupRows,
    permissions: permissionRows
  });
}

function ntfsRightLabel(level, noAccessAclMode) {
  if (level === "read") return "RX - 读取/遍历";
  if (level === "write") return "M - 修改";
  if (level === "manage") return "F - 完全控制";
  if (level === "none" && noAccessAclMode === "deny") return "Deny F - 显式拒绝";
  return "移除显式授权";
}

function teamShareTemplate() {
  return {
    id: "small-team-standard",
    name: "Small Team Standard File Structure",
    description: "Default folders, groups and permissions for a small team file share.",
    groups: [
      { key: "all", name: "All Members", description: "All normal members" },
      { key: "management", name: "Management", description: "Management and system administrators" },
      { key: "finance", name: "Finance", description: "Finance files" },
      { key: "sales", name: "Sales", description: "Sales files" },
      { key: "design", name: "Design", description: "Design files" },
      { key: "tech", name: "Tech", description: "Technical files" },
      { key: "admin", name: "Admin", description: "Administrative files" },
      { key: "project", name: "Project", description: "Project collaboration" }
    ],
    folders: [
      { path: "/Public", note: "Shared public files" },
      { path: "/Public/Policies", note: "" },
      { path: "/Public/Templates", note: "" },
      { path: "/Departments", note: "Department files" },
      { path: "/Departments/Finance", note: "" },
      { path: "/Departments/Sales", note: "" },
      { path: "/Departments/Design", note: "" },
      { path: "/Departments/Tech", note: "" },
      { path: "/Projects", note: "Project collaboration and archive" },
      { path: "/Projects/Archived", note: "" },
      { path: "/Clients", note: "Client files" },
      { path: "/Contracts", note: "Contracts and quotes" },
      { path: "/Contracts/Quotes", note: "" },
      { path: "/Assets", note: "Images, video, fonts and source files" },
      { path: "/Assets/Source", note: "" },
      { path: "/Delivery", note: "Delivery archive" },
      { path: "/Temp", note: "Temporary exchange" }
    ],
    permissions: [
      { path: "/Public", groupKey: "all", level: "read" },
      { path: "/Public/Templates", groupKey: "all", level: "write" },
      { path: "/Temp", groupKey: "all", level: "write" },
      { path: "/Departments/Finance", groupKey: "finance", level: "write" },
      { path: "/Departments/Sales", groupKey: "sales", level: "write" },
      { path: "/Departments/Design", groupKey: "design", level: "write" },
      { path: "/Departments/Tech", groupKey: "tech", level: "write" },
      { path: "/Projects", groupKey: "project", level: "write" },
      { path: "/Projects/Archived", groupKey: "all", level: "read" },
      { path: "/Clients", groupKey: "sales", level: "write" },
      { path: "/Contracts", groupKey: "finance", level: "write" },
      { path: "/Contracts", groupKey: "management", level: "manage" },
      { path: "/Assets", groupKey: "design", level: "write" },
      { path: "/Delivery", groupKey: "project", level: "read" },
      { path: "/Delivery", groupKey: "management", level: "manage" }
    ]
  };
}

async function manualWindowsSync(req, res, actor) {
  const result = await syncWindowsSecurity({});
  log(actor.id, actor.username, result.ok ? "windows_sync" : "windows_sync_failed", "windows", result.summary, "");
  if (!result.ok) result.error = result.summary;
  json(res, result.ok ? 200 : 500, result);
}

function networkAddresses(req, res) {
  const interfaces = os.networkInterfaces();
  const items = [];
  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const address of addresses || []) {
      if (address.family !== "IPv4" || address.internal) continue;
      items.push({
        name,
        address: address.address,
        cidr: address.cidr || "",
        mac: address.mac || ""
      });
    }
  }
  json(res, 200, { items });
}

async function restartElevated(req, res, actor) {
  if (process.platform !== "win32") return json(res, 400, { error: "Request failed" });
  const restartScript = path.join(ROOT, "scripts", "restart-elevated.ps1");
  const script = [
    "Start-Process",
    "-FilePath", "powershell.exe",
    "-ArgumentList", psQuote([
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", restartScript,
      "-NodePath", process.execPath,
      "-AppDir", ROOT,
      "-DelaySeconds", "2"
    ].map(psArg).join(" ")),
    "-Verb", "RunAs"
  ].join(" ");
  const result = await runCommand("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], { allowFailure: true });
  if (result.code !== 0) {
    log(actor.id, actor.username, "restart_elevated_failed", "server", result.stderr || result.stdout, "");
    return json(res, 500, { error: "Request failed" });
  }
  log(actor.id, actor.username, "restart_elevated", "server", "requested", "");
  json(res, 200, { ok: true, message: "Restart requested. Confirm the Windows UAC prompt if it appears." });
  setTimeout(() => process.exit(0), 800);
}

function effectivePermission(user, rel) {
  if (user.role === "admin") return levels.manage;
  const groupIds = db.prepare("SELECT group_id FROM group_members WHERE user_id = ?").all(user.id).map((row) => row.group_id);
  const candidates = ancestors(rel);
  let best = levels.none;
  let denied = false;
  for (const candidate of candidates) {
    const userPerm = db.prepare("SELECT level FROM permissions WHERE path = ? AND subject_type = 'user' AND subject_id = ?").get(candidate, user.id);
    if (userPerm?.level === "none") denied = true;
    if (userPerm && userPerm.level !== "none") best = Math.max(best, levels[userPerm.level] || 0);
    for (const groupId of groupIds) {
      const groupPerm = db.prepare("SELECT level FROM permissions WHERE path = ? AND subject_type = 'group' AND subject_id = ?").get(candidate, groupId);
      if (groupPerm?.level === "none") denied = true;
      if (groupPerm && groupPerm.level !== "none") best = Math.max(best, levels[groupPerm.level] || 0);
    }
  }
  if (denied) return levels.none;
  return best;
}

function hasAccessibleDescendant(user, rel) {
  if (user.role === "admin") return true;
  const base = normalizeRel(rel);
  const groupIds = db.prepare("SELECT group_id FROM group_members WHERE user_id = ?").all(user.id).map((row) => row.group_id);
  const subjectClauses = ["(subject_type = 'user' AND subject_id = ?)"];
  const params = [user.id];
  if (groupIds.length) {
    subjectClauses.push(`(subject_type = 'group' AND subject_id IN (${groupIds.map(() => "?").join(",")}))`);
    params.push(...groupIds);
  }
  const pathPrefix = base === "/" ? "/%" : `${base}/%`;
  const rows = db.prepare(`
    SELECT DISTINCT path FROM permissions
    WHERE level != 'none' AND path LIKE ? AND (${subjectClauses.join(" OR ")})
    ORDER BY length(path)
  `).all(pathPrefix, ...params);
  return rows.some((row) => effectivePermission(user, row.path) >= levels.read);
}

async function syncWindowsBestEffort(actor, options = {}) {
  if (getSetting("windowsSyncEnabled") !== "true") return null;
  const result = await syncWindowsSecurity(options);
  log(
    actor?.id,
    actor?.username,
    result.ok ? "windows_sync_auto" : "windows_sync_auto_failed",
    "windows",
    result.summary,
    ""
  );
  return result;
}

async function syncWindowsSecurity(options = {}) {
  const steps = [];
  const summaryParts = [];
  const settings = getAllSettings();
  if (process.platform !== "win32") {
    return { ok: false, summary: "This host is not Windows; sync is unavailable.", steps };
  }

  const adminCheck = await runStep(steps, "检查管理员权限", "net", ["session"], true);
  if (adminCheck.code !== 0) {
    return {
      ok: false,
      summary: "The service is not running as administrator. Restart it as administrator and sync again.",
      steps
    };
  }

  const storageRoot = getStorageRoot();
  await ensureDir(storageRoot);

  const users = db.prepare("SELECT id, username, status FROM users ORDER BY id").all();
  const groups = db.prepare("SELECT id, name FROM groups ORDER BY id").all();
  const permissions = db.prepare("SELECT * FROM permissions ORDER BY path, subject_type, subject_id").all();
  const passwords = options.passwords || {};

  const userMap = new Map(users.map((user) => [user.id, windowsUserName(user.username, user.id, settings)]));
  const groupMap = new Map(groups.map((group) => [group.id, windowsGroupName(group.name, group.id, settings)]));
  const membersGroup = windowsSystemGroupName(settings.windowsMembersGroup || "members", settings);
  const adminsGroup = windowsSystemGroupName(settings.windowsAdminsGroup || "admins", settings);

  if (settings.createWindowsUsers !== "false") {
    for (const user of users) {
      const winUser = userMap.get(user.id);
      const password = passwords[user.username] || crypto.randomBytes(12).toString("base64url");
      const existing = await runStep(steps, `检查 Windows 用户 ${winUser}`, "net", ["user", winUser], true);
      if (existing.code === 0) {
        if (passwords[user.username]) {
          await runStep(steps, `更新 Windows 用户密码 ${winUser}`, "net", ["user", winUser, password], true);
        }
      } else {
        await runStep(steps, `创建 Windows 用户 ${winUser}`, "net", ["user", winUser, password, "/add", "/y"], true);
      }
      await runStep(steps, `设置 Windows 用户状态 ${winUser}`, "net", ["user", winUser, user.status === "active" ? "/active:yes" : "/active:no"], true);
    }
    summaryParts.push(`同步 ${users.length} 个 Windows 用户`);
  }

  await ensureLocalGroup(steps, membersGroup);
  await ensureLocalGroup(steps, adminsGroup);
  for (const user of users) {
    const winUser = userMap.get(user.id);
    if (!winUser || user.status !== "active") continue;
    await runStep(steps, `鍔犲叆鎴愬憳缁?${membersGroup}: ${winUser}`, "net", ["localgroup", membersGroup, winUser, "/add"], true);
    if (user.role === "admin") {
      await runStep(steps, `加入管理员组 ${adminsGroup}: ${winUser}`, "net", ["localgroup", adminsGroup, winUser, "/add"], true);
    }
  }

  for (const group of groups) {
    const winGroup = groupMap.get(group.id);
    await ensureLocalGroup(steps, winGroup);
    const members = db.prepare("SELECT user_id FROM group_members WHERE group_id = ?").all(group.id);
    for (const member of members) {
      const winUser = userMap.get(member.user_id);
      if (winUser) await runStep(steps, `鍔犲叆缁?${winGroup}: ${winUser}`, "net", ["localgroup", winGroup, winUser, "/add"], true);
    }
  }
  summaryParts.push(`synced ${groups.length} Windows groups`);

  if (settings.createSmbShare !== "false") {
    const shareName = safeShareName(settings.shareName || "TeamShare");
    await runStep(steps, `删除旧 SMB 共享 ${shareName}`, "net", ["share", shareName, "/delete", "/y"], true);
    await runStep(steps, `创建 SMB 共享 ${shareName}`, "net", ["share", `${shareName}=${storageRoot}`, "/grant:Authenticated Users,FULL", "/remark:OfficeShare managed share"], false);
    await runStep(
      steps,
      `启用共享访问枚举 ${shareName}`,
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `Set-SmbShare -Name ${psQuote(shareName)} -FolderEnumerationMode AccessBased -Force`],
      true
    );
    summaryParts.push(`鍏变韩 \\\\${settings.serverHost || "server"}\\${shareName}`);
  }

  await hardenManagedAclRoot(steps, storageRoot);
  await applyAcl(steps, storageRoot, membersGroup, "read-root", settings);
  await applyAcl(steps, storageRoot, adminsGroup, "manage", settings);

  const homesFull = path.join(storageRoot, PERSONAL_SPACE_BASE);
  await ensureDir(homesFull);
  await hardenManagedAclRoot(steps, homesFull);
  await applyAcl(steps, homesFull, membersGroup, "read-root", settings);
  await applyAcl(steps, homesFull, adminsGroup, "manage", settings);
  summaryParts.push(`同步个人空间根目录权限`);

  for (const user of users) {
    if (user.status !== "active") continue;
    const winUser = userMap.get(user.id);
    if (!winUser) continue;
    const userHomeFull = path.join(homesFull, user.username);
    await ensureDir(userHomeFull);
    await runStep(steps, "移除个人文件夹继承", "icacls", [userHomeFull, "/inheritance:r"], true);
    await runStep(steps, `移除个人文件夹其他用户权限`, "icacls", [userHomeFull, "/remove:g", "Authenticated Users"], true);
    await runStep(steps, `授权所有者 ${winUser} 完全控制 ${userHomeFull}`, "icacls", [userHomeFull, "/grant", `${winUser}:(OI)(CI)F`], false);
    await runStep(steps, `授权管理员组 ${adminsGroup} 完全控制 ${userHomeFull}`, "icacls", [userHomeFull, "/grant", `${adminsGroup}:(OI)(CI)F`], false);
  }
  summaryParts.push(`同步 ${users.length} 个用户个人文件夹权限`);

  for (const permission of permissions) {
    if (permission.path.startsWith(PERSONAL_SPACE_BASE)) continue;
    const fullPath = safePath(permission.path);
    await ensureDir(fullPath);
    const identity = permission.subject_type === "group"
      ? groupMap.get(permission.subject_id)
      : userMap.get(permission.subject_id);
    if (!identity) continue;
    await applyAcl(steps, fullPath, identity, permission.level, settings);
  }
  summaryParts.push(`应用 ${permissions.length} 条共享空间 NTFS ACL`);

  const failed = steps.filter((step) => !step.ok && !step.allowedFailure);
  return {
    ok: failed.length === 0,
    summary: failed.length === 0 ? summaryParts.join("; ") : `Sync failed: ${failed.length} step(s); check details`,
    steps
  };
}

async function ensureLocalGroup(steps, groupName) {
  const existing = await runStep(steps, `检查 Windows 组 ${groupName}`, "net", ["localgroup", groupName], true);
  if (existing.code !== 0) {
    await runStep(steps, `创建 Windows 组 ${groupName}`, "net", ["localgroup", groupName, "/add"], false);
  }
}

async function hardenManagedAclRoot(steps, storageRoot) {
  await runStep(steps, "固化共享根目录 ACL 继承", "icacls", [storageRoot, "/inheritance:d"], true);
  for (const principal of [
    "*S-1-1-0",
    "*S-1-5-11",
    "*S-1-5-32-545",
    "Everyone",
    "Authenticated Users",
    "Users"
  ]) {
    await runStep(steps, `移除共享根目录显式允许 ${principal}`, "icacls", [storageRoot, "/remove:g", principal], true);
    await runStep(steps, `移除共享根目录显式拒绝 ${principal}`, "icacls", [storageRoot, "/remove:d", principal], true);
  }
}

async function applyAcl(steps, fullPath, identity, level, settings = getAllSettings()) {
  await runStep(steps, `移除 ${identity} 的旧拒绝 ACL`, "icacls", [fullPath, "/remove:d", identity], true);
  await runStep(steps, `移除 ${identity} 的旧允许 ACL`, "icacls", [fullPath, "/remove:g", identity], true);
  if (level === "read-root") {
    await runStep(steps, `grant ${identity} root traverse`, "icacls", [fullPath, "/grant", `${identity}:RX`], false);
    return;
  }
  if (level === "none") {
    if (settings.noAccessAclMode === "deny") {
      await runStep(steps, `拒绝 ${identity} 访问 ${fullPath}`, "icacls", [fullPath, "/deny", `${identity}:(OI)(CI)F`], false);
    } else {
      await runStep(steps, `无权限：仅移除 ${identity} 的显式 ACL`, "cmd.exe", ["/c", "exit", "0"], true);
    }
    return;
  }
  const right = { read: "RX", write: "M", manage: "F" }[level] || "RX";
  await runStep(steps, `授权 ${identity} ${level} ${fullPath}`, "icacls", [fullPath, "/grant", `${identity}:(OI)(CI)${right}`], false);
}

async function runStep(steps, title, command, args, allowedFailure) {
  const result = await runCommand(command, args, { allowFailure: true });
  const step = {
    title,
    command: `${command} ${args.join(" ")}`,
    ok: result.code === 0,
    allowedFailure: Boolean(allowedFailure),
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr
  };
  steps.push(step);
  return step;
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true, timeout: 30000, encoding: "buffer" }, (error, stdout, stderr) => {
      const result = {
        code: error?.code || 0,
        stdout: trimOutput(decodeCommandOutput(stdout)),
        stderr: trimOutput(decodeCommandOutput(stderr) || error?.message || "")
      };
      if (error && !options.allowFailure) reject(Object.assign(error, result));
      else resolve(result);
    });
  });
}

function decodeCommandOutput(buffer) {
  if (!buffer?.length) return "";
  if (process.platform === "win32") {
    for (const encoding of ["gb18030", "gbk"]) {
      try {
        return new TextDecoder(encoding).decode(buffer);
      } catch {
        // Try the next Windows code page alias.
      }
    }
  }
  return new TextDecoder("utf-8").decode(buffer);
}

function trimOutput(value) {
  return String(value || "").replace(/\s+$/g, "").slice(0, 4000);
}

function windowsUserName(username, id, settings = getAllSettings()) {
  return `${settings.windowsUserPrefix || "os_"}${asciiIdentity(username, `user${id}`)}`.slice(0, 20);
}

function windowsGroupName(name, id, settings = getAllSettings()) {
  return `${settings.windowsGroupPrefix || "osg_"}${asciiIdentity(name, `group${id}`)}`.slice(0, 256);
}

function windowsSystemGroupName(name, settings = getAllSettings()) {
  return `${settings.windowsGroupPrefix || "osg_"}${asciiIdentity(name, "system")}`.slice(0, 256);
}

function asciiIdentity(value, fallback) {
  const clean = String(value || "")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^[_\W]+|[_\W]+$/g, "")
    .toLowerCase();
  return clean || fallback;
}

function safeShareName(name) {
  return String(name || "TeamShare").replace(/[\\/:*?"<>|[\];=,+]/g, "_").trim().slice(0, 80) || "TeamShare";
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function psArg(value) {
  return `"${String(value).replace(/"/g, '`"')}"`;
}

function ancestors(rel) {
  const clean = normalizeRel(rel);
  const parts = clean.split("/").filter(Boolean);
  const out = ["/"];
  let cur = "";
  for (const part of parts) {
    cur += `/${part}`;
    out.push(cur);
  }
  return out;
}

function currentUser(req) {
  const sid = cookie(req, "sid");
  if (!sid) return null;
  const session = sessions.get(sid);
  if (!session || session.expires < Date.now()) {
    sessions.delete(sid);
    return null;
  }
  session.expires = Date.now() + 1000 * 60 * 60 * 8;
  return db.prepare("SELECT * FROM users WHERE id = ?").get(session.userId);
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    role: user.role,
    status: user.status,
    department: userDepartment(user),
    mustChangePassword: Boolean(user.must_change_password)
  };
}

function userDepartment(user, fallback = "") {
  const preferred = String(fallback || "").trim();
  if (preferred) return preferred;
  const groups = db.prepare(`
    SELECT g.name FROM groups g
    JOIN group_members gm ON gm.group_id = g.id
    WHERE gm.user_id = ?
    ORDER BY g.name
  `).all(user.id).map((row) => row.name).filter(Boolean);
  if (groups.length) return groups[0];
  if (user.role === "admin") return "System Administrator";
  if (user.role === "dept_admin") return "Department Administrator";
  return "Member";
}

function requireAdmin(res, user) {
  if (user.role !== "admin") {
    json(res, 403, { error: "Request failed" });
    return false;
  }
  return true;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return { hash, salt };
}

function randomPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const symbols = "!@#$%";
  const pick = (chars) => chars[crypto.randomInt(chars.length)];
  const chars = [
    pick("ABCDEFGHJKLMNPQRSTUVWXYZ"),
    pick("abcdefghijkmnopqrstuvwxyz"),
    pick("23456789"),
    pick(symbols)
  ];
  for (let i = chars.length; i < 14; i += 1) chars.push(pick(alphabet + symbols));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function verifyPassword(password, salt, hash) {
  const actual = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(hash, "hex"));
}

function log(userId, username, action, target, detail, ip) {
  db.prepare("INSERT INTO audit_logs (user_id, username, action, target, detail, ip) VALUES (?, ?, ?, ?, ?, ?)")
    .run(userId, username || "", action, target || "", detail || "", ip || "");
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function readMultipart(req) {
  const contentType = req.headers["content-type"] || "";
  const match = contentType.match(/boundary=(.+)$/);
  if (!match) return {};
  const boundary = `--${match[1]}`;
  const buffer = Buffer.concat(await collect(req));
  const raw = buffer.toString("binary");
  const parts = raw.split(boundary).slice(1, -1);
  for (const part of parts) {
    const splitAt = part.indexOf("\r\n\r\n");
    if (splitAt < 0) continue;
    const headers = part.slice(0, splitAt);
    let data = Buffer.from(part.slice(splitAt + 4), "binary");
    if (data.slice(-2).toString("binary") === "\r\n") data = data.slice(0, -2);
    const name = /name="([^"]+)"/.exec(headers)?.[1];
    const filenameStar = /filename\*=UTF-8''([^;\r\n]*)/i.exec(headers)?.[1];
    const rawFilename = /filename="([^"]*)"/.exec(headers)?.[1];
    const filename = decodeMultipartFilename(filenameStar, rawFilename);
    if (name === "file" && filename) return { file: { filename, data } };
  }
  return {};
}

function decodeMultipartFilename(filenameStar, rawFilename) {
  if (filenameStar) {
    try {
      return decodeURIComponent(filenameStar);
    } catch {
      return filenameStar;
    }
  }
  if (!rawFilename) return "";
  if ([...rawFilename].some((char) => char.codePointAt(0) > 255)) return rawFilename;
  try {
    return Buffer.from(rawFilename, "latin1").toString("utf8");
  } catch {
    return rawFilename;
  }
}

async function collect(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks;
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let file = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  file = file.replace(/\\/g, "/");
  if (file.includes("..")) return res.writeHead(400).end("Bad request");
  const full = path.join(PUBLIC_DIR, file);
  if (!full.startsWith(PUBLIC_DIR)) return res.writeHead(403).end("Forbidden");
  try {
    const stat = await fsp.stat(full);
    if (!stat.isFile()) throw new Error("not file");
    res.writeHead(200, { "Content-Type": mime(full) });
    fs.createReadStream(full).pipe(res);
  } catch {
    const index = path.join(PUBLIC_DIR, "index.html");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    fs.createReadStream(index).pipe(res);
  }
}

function mime(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".ico": "image/x-icon"
  }[ext] || "application/octet-stream";
}

function safePath(rel) {
  const clean = normalizeRel(rel);
  const storageRoot = path.resolve(getStorageRoot());
  const full = path.resolve(storageRoot, `.${clean}`);
  if (!full.startsWith(storageRoot)) throw new Error("Invalid path");
  return full;
}

function getStorageRoot() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'storagePath'").get();
  return path.resolve(row?.value || DEFAULT_STORAGE_DIR);
}

function getTrashRoot() {
  return path.join(getStorageRoot(), ".trash");
}

function isSystemStorageEntry(name) {
  return name === ".trash" || name === ".versions";
}

function normalizeRel(input) {
  let value = decodeURIComponent(String(input || "/")).replace(/\\/g, "/");
  if (!value.startsWith("/")) value = `/${value}`;
  const normalized = path.posix.normalize(value);
  if (normalized.includes("..")) throw new Error("Invalid path");
  return normalized === "." ? "/" : normalized;
}

function joinRel(parent, name) {
  return normalizeRel(`${parent === "/" ? "" : parent}/${name}`);
}

function parentRel(rel) {
  const clean = normalizeRel(rel);
  const parent = path.posix.dirname(clean);
  return parent === "." ? "/" : parent;
}

function safeFileName(name) {
  return String(name).trim().replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
}

function safeTrashName(name) {
  return String(name).replace(/[^a-zA-Z0-9_.\-\u4e00-\u9fa5]/g, "");
}

function cleanName(name) {
  return String(name).trim().replace(/[^\w.\-\u4e00-\u9fa5]/g, "").slice(0, 40);
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function versionExisting(dest, filename) {
  const versionDir = path.join(path.dirname(dest), ".versions");
  await ensureDir(versionDir);
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  await fsp.rename(dest, path.join(versionDir, `${path.parse(filename).name}_${stamp}${path.extname(filename)}`));
}

function nextAvailablePath(fullPath) {
  const dir = path.dirname(fullPath);
  const ext = path.extname(fullPath);
  const stem = path.basename(fullPath, ext);
  for (let index = 1; index < 1000; index += 1) {
    const candidate = path.join(dir, `${stem} (${index})${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  return path.join(dir, `${stem}_${Date.now()}${ext}`);
}

function conflictPayload(error, parent, name, type) {
  return {
    error,
    code: "NAME_CONFLICT",
    conflict: {
      parent,
      name,
      type,
      existingPath: joinRel(parent, name)
    }
  };
}

async function folderStats(dir) {
  let files = 0;
  let folders = 0;
  let bytes = 0;
  async function walk(current) {
    try {
      const entries = await fsp.readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        // 跳过 homes 文件夹和系统存储项
        const isRoot = path.resolve(current) === path.resolve(dir);
        if (isRoot && entry.name === "homes") continue;
        if (isSystemStorageEntry(entry.name)) continue;
        
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          folders += 1;
          await walk(full);
        } else {
          files += 1;
          const stat = await fsp.stat(full).catch(() => null);
          if (stat) bytes += stat.size;
        }
      }
    } catch (error) {
      // 忽略任何文件夹遍历错误，继续统计
      console.error("Error walking folder for stats:", error);
    }
  }
  await walk(dir);
  return { files, folders, bytes };
}

function cookie(req, name) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [key, value] = part.trim().split("=");
    if (key === name) return value;
  }
  return "";
}

function setCookie(res, sid) {
  res.setHeader("Set-Cookie", `sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`);
}

function clientIp(req) {
  return req.socket.remoteAddress || "";
}





