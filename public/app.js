const state = {
  user: null,
  view: "dashboard",
  settingsTab: "connect",
  configTab: "server",
  path: "/",
  users: [],
  groups: [],
  windowsModel: null,
  connect: null,
  selectedTemplate: null,
  selectedPermissionPath: "/",
  folderItems: [],
  folderNotices: [],
  currentItems: [],
  fileSearch: "",
  fileSearchTimer: null,
  fileSearchSeq: 0,
  selectedFiles: new Set(),
  expandedTree: new Set(["/"]),
  multiSelect: false,
  fileViewMode: "list",
  fileMode: "files",
  selectedTrashItems: new Set(),
  trashMultiSelect: false,
  personalPath: "/",
  personalExpandedTree: new Set()
};

const $ = (id) => document.getElementById(id);
let activeModalCancel = null;
const FILE_TREE_WIDTH_KEY = "fileTreePaneWidth";
const FILE_TREE_MIN_WIDTH = 220;
const FILE_TREE_MAX_WIDTH = 680;

function normalizeUiText() {
  document.title = "LANOffice";
  const setText = (selector, text) => {
    const el = document.querySelector(selector);
    if (el) el.textContent = text;
  };
  const setAttr = (selector, attr, value) => {
    const el = document.querySelector(selector);
    if (el) el.setAttribute(attr, value);
  };
  const setLabelByControl = (selector, text) => {
    const control = document.querySelector(selector);
    const label = control?.closest("label");
    if (!label) return;
    if (label.firstChild && label.firstChild.nodeType === Node.TEXT_NODE) {
      label.firstChild.nodeValue = text;
    } else {
      label.insertBefore(document.createTextNode(text), label.firstChild || null);
    }
  };
  setText(".login-panel .eyebrow", "LANOffice");
  setText(".login-panel h1", "团队文件服务");
  const loginUserLabel = document.querySelector("#loginForm label:nth-of-type(1)");
  if (loginUserLabel) loginUserLabel.innerHTML = '用户名<input name="username" autocomplete="username">';
  const loginPassLabel = document.querySelector("#loginForm label:nth-of-type(2)");
  if (loginPassLabel) loginPassLabel.innerHTML = '密码<input name="password" type="password" autocomplete="current-password">';
  setText("#loginForm button[type='submit']", "登录");
  setText(".nav-label", "用户页面");
  setText(".nav[data-view='dashboard'] .nav-text", "概览");
  setText(".nav[data-view='files'] .nav-text", "文件管理");
  setText(".nav[data-view='settings'] .nav-text", "设置");
  setText(".nav[data-view='config'] .nav-text", "服务器配置");
  setText("#logout .nav-text", "退出");
  setAttr(".nav[data-view='dashboard']", "title", "概览");
  setAttr(".nav[data-view='files']", "title", "文件管理");
  setAttr(".nav[data-view='settings']", "title", "设置");
  setAttr(".nav[data-view='config']", "title", "服务器配置");
  setAttr("#logout", "title", "退出");
  setText("#title", "文件工作台");
  setText("#subtitle", "日常上传、下载、浏览和恢复文件");
  setText("#refreshFilesBtn", "刷新");
  setText("#newFolderNoticeBtn", "新建公告");
  setText("#newFileBtn", "新建文件");
  setText("#newFolderBtn", "新建文件夹");
  setAttr("#shareSelectedBtn", "title", "分享");
  setAttr("#renameSelectedBtn", "title", "重命名");
  setAttr("#copySelectedBtn", "title", "复制");
  setAttr("#moveSelectedBtn", "title", "移动");
  setAttr("#deleteSelectedBtn", "title", "删除");
  setAttr("#downloadSelectedBtn", "title", "下载");
  setAttr("#infoSelectedBtn", "title", "信息");
  setAttr("#multiSelectBtn", "title", "多选");
  setAttr("#viewModeBtn", "title", "切换视图");
  setAttr("#sidebarToggle", "title", "折叠侧栏");
  setText(".file-pane-title strong", "共享空间");
  setAttr("#fileSearchToggle", "title", "搜索");
  setAttr("#fileSearchInput", "placeholder", "搜索当前文件夹及子文件夹");
  setText("#folderNoticeCard .folder-notice-head strong", "公告区");
  setAttr("#uploadActionBtn", "title", "上传文件");
  setAttr("#uploadActionBtn", "aria-label", "上传文件");
  setAttr("#newFileBtn", "title", "新建文件");
  setAttr("#newFileBtn", "aria-label", "新建文件");
  setAttr("#newFolderBtn", "title", "新建文件夹");
  setAttr("#newFolderBtn", "aria-label", "新建文件夹");
  const fileTh = document.querySelectorAll(".file-table thead th");
  if (fileTh[0]) fileTh[0].textContent = "名称";
  if (fileTh[1]) fileTh[1].textContent = "大小";
  if (fileTh[2]) fileTh[2].textContent = "最后修改";
  if (fileTh[3]) fileTh[3].textContent = "权限";
  const trashTh = document.querySelectorAll("#trash thead th");
  if (trashTh[0]) trashTh[0].textContent = "原路径";
  if (trashTh[1]) trashTh[1].textContent = "删除人";
  if (trashTh[2]) trashTh[2].textContent = "删除时间";
  if (trashTh[3]) trashTh[3].textContent = "操作";
  setText("[data-settings-tab='connect']", "连接");
  setText("[data-settings-tab='password']", "修改密码");
  setText("[data-settings-tab='logs']", "日志");
  setText("[data-config-tab='server']", "服务器");
  setText("[data-config-tab='users']", "用户");
  setText("[data-config-tab='groups']", "群组");
  setText("[data-config-tab='permissions']", "权限");
  setText("[data-config-tab='templates']", "目录模板");
  setText("#connectPanel .hint-panel strong", "映射网络驱动器");
  setText("#connectPanel .hint-panel span", "根据当前登录用户生成 Windows 映射脚本。输入的是当前用户自己设置的 Web/SMB 密码。");
  setText("#connectPanel .code-panel p:nth-of-type(1)", "当前用户");
  setText("#connectPanel .code-panel p:nth-of-type(2)", "Windows 一键脚本");
  setText("#connectPanel .code-panel p:nth-of-type(3)", "断开映射命令");
  setText("#passwordPanel .hint-panel strong", "修改密码");
  setText("#passwordPanel .hint-panel span", "修改后会同步更新 Web 登录密码和 Windows/SMB 映射密码。");
  setText("#settingsForm button", "保存服务器配置");
  setLabelByControl("#settingsForm [name='storagePath']", "本地共享文件夹路径");
  setLabelByControl("#settingsForm [name='serverHost']", "服务器地址");
  setLabelByControl("#hostAddressSelect", "检测到的主机 IP");
  setLabelByControl("#settingsForm [name='shareName']", "SMB 共享名称");
  setLabelByControl("#settingsForm [name='smbEnabled']", "启用 SMB 挂载说明");
  setLabelByControl("#settingsForm [name='windowsUserPrefix']", "Windows 用户名前缀");
  setLabelByControl("#settingsForm [name='windowsGroupPrefix']", "Windows 组名前缀");
  setLabelByControl("#settingsForm [name='windowsMembersGroup']", "成员系统组名");
  setLabelByControl("#settingsForm [name='windowsAdminsGroup']", "管理员系统组名");
  setLabelByControl("#settingsForm [name='noAccessAclMode']", "无权限时 ACL 处理");
  setLabelByControl("#settingsForm [name='windowsSyncEnabled']", "保存用户、群组、权限时同步 Windows");
  setLabelByControl("#settingsForm [name='createWindowsUsers']", "自动创建本地 Windows 用户");
  setLabelByControl("#settingsForm [name='createSmbShare']", "自动创建 SMB 共享");
  setText("#settingsForm [name='noAccessAclMode'] option[value='remove']", "移除授权");
  setText("#settingsForm [name='noAccessAclMode'] option[value='deny']", "显式拒绝");
  setText("#restartElevatedBtn", "以管理员权限重启服务");
  setText("#syncWindowsBtn", "立即同步到 Windows");
  setText("#copyConnectCommandBtn", "复制命令");
  setText("#downloadConnectBatBtn", "下载 .bat 脚本");
  setText("#passwordForm button", "修改并同步密码");
  setLabelByControl("#passwordForm [name='currentPassword']", "当前密码");
  setLabelByControl("#passwordForm [name='password']", "新密码");
  setLabelByControl("#passwordForm [name='confirmPassword']", "确认新密码");
  setText("#usersPanel .hint-panel strong", "用户映射");
  setText("#usersPanel .hint-panel span", "应用用户用于 Web 登录；映射 Windows 用户用于 SMB 挂载认证。");
  setText("#userForm button", "创建用户");
  setAttr("#userForm [name='username']", "placeholder", "用户名");
  setAttr("#userForm [name='displayName']", "placeholder", "显示名称");
  setAttr("#userForm [name='password']", "placeholder", "初始密码");
  setText("#userForm option[value='member']", "普通成员");
  setText("#userForm option[value='dept_admin']", "部门管理员");
  setText("#userForm option[value='admin']", "系统管理员");
  setText("#groupsPanel .hint-panel strong", "群组授权");
  setText("#groupsPanel .hint-panel span", "优先给群组配置文件夹权限，必要时再给个人授权。");
  setText("#groupForm button", "创建群组");
  setAttr("#groupForm [name='name']", "placeholder", "群组名称");
  setAttr("#groupForm [name='description']", "placeholder", "说明");
  setText("#permissionsPanel .hint-panel strong", "共享文件夹权限");
  setText("#permissionsPanel .hint-panel span", "先选择目录，再配置群组或用户的访问权限。");
  setText("#refreshPermFoldersBtn", "刷新");
  setText("#savePermissionMatrixBtn", "保存并同步");
  setText("#templatesPanel .hint-panel strong", "初始化模板");
  setText("#templatesPanel .hint-panel span", "模板会创建标准目录、推荐群组和基础权限。");
  setText("#templateEditor button[type='submit']", "保存模板");
  setText("#newTemplateBtn", "新建空模板");
  setText("#exportTemplateBtn", "复制当前 JSON");
  setAttr("#modalCloseBtn", "title", "关闭");
}

function initSidebarToggle() {
  const app = $("app");
  const btn = $("sidebarToggle");
  if (!app || !btn) return;
  const collapsed = localStorage.getItem("sidebarCollapsed") === "1";
  app.classList.toggle("sidebar-collapsed", collapsed);
  btn.title = collapsed ? "灞曞紑渚ф爮" : "鎶樺彔渚ф爮";
  btn.textContent = collapsed ? ">" : "<";
  btn.onclick = () => {
    const next = !app.classList.contains("sidebar-collapsed");
    app.classList.toggle("sidebar-collapsed", next);
    localStorage.setItem("sidebarCollapsed", next ? "1" : "0");
    btn.title = next ? "灞曞紑渚ф爮" : "鎶樺彔渚ф爮";
    btn.textContent = next ? ">" : "<";
  };
}

function initFilePaneResize() {
  const station = document.querySelector(".file-station");
  const splitter = $("filePaneSplitter");
  if (!station || !splitter) return;

  const mobileQuery = window.matchMedia("(max-width: 800px)");
  const getLayoutMax = () => {
    const total = station.getBoundingClientRect().width || 0;
    return Math.max(FILE_TREE_MIN_WIDTH, Math.min(FILE_TREE_MAX_WIDTH, total - 360));
  };
  const clamp = (width) => {
    const value = Number(width);
    if (!Number.isFinite(value)) return FILE_TREE_MIN_WIDTH;
    return Math.max(FILE_TREE_MIN_WIDTH, Math.min(getLayoutMax(), Math.round(value)));
  };
  const applyWidth = (width, persist = false) => {
    if (mobileQuery.matches) {
      station.style.removeProperty("--file-tree-width");
      return;
    }
    const next = clamp(width);
    station.style.setProperty("--file-tree-width", `${next}px`);
    if (persist) localStorage.setItem(FILE_TREE_WIDTH_KEY, String(next));
  };
  const currentWidth = () => {
    const pane = station.querySelector(".file-tree-pane");
    return pane ? pane.getBoundingClientRect().width : FILE_TREE_MIN_WIDTH;
  };
  const restoreWidth = () => {
    const stored = Number(localStorage.getItem(FILE_TREE_WIDTH_KEY));
    if (Number.isFinite(stored)) {
      applyWidth(stored, false);
      return;
    }
    applyWidth(currentWidth(), false);
  };

  let startX = 0;
  let startWidth = FILE_TREE_MIN_WIDTH;
  let dragging = false;
  let pointerId = null;

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    station.classList.remove("resizing");
    applyWidth(currentWidth(), true);
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    window.removeEventListener("pointercancel", handlePointerUp);
    if (pointerId !== null && splitter.releasePointerCapture) {
      try { splitter.releasePointerCapture(pointerId); } catch {}
    }
    pointerId = null;
  };
  const handlePointerMove = (event) => {
    if (!dragging) return;
    const delta = event.clientX - startX;
    applyWidth(startWidth + delta, false);
  };
  const handlePointerUp = () => {
    endDrag();
  };

  splitter.addEventListener("pointerdown", (event) => {
    if (mobileQuery.matches) return;
    event.preventDefault();
    dragging = true;
    pointerId = event.pointerId;
    startX = event.clientX;
    startWidth = currentWidth();
    station.classList.add("resizing");
    if (splitter.setPointerCapture) {
      try { splitter.setPointerCapture(pointerId); } catch {}
    }
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  });

  window.addEventListener("resize", () => {
    if (mobileQuery.matches) {
      station.style.removeProperty("--file-tree-width");
      return;
    }
    const width = Number(localStorage.getItem(FILE_TREE_WIDTH_KEY));
    if (Number.isFinite(width)) {
      applyWidth(width, false);
    } else {
      applyWidth(currentWidth(), false);
    }
  });

  restoreWidth();
}
const ICON_PATHS = {
  share: "M15 8a3 3 0 1 0-2.83-4H12a3 3 0 0 0 .17 1L7.91 7.07a3 3 0 0 0-1.82-.62H6a3 3 0 1 0 1.91 5.31l4.26 2.13a3 3 0 1 0 .67-1.34l-4.26-2.13a3 3 0 0 0 0-.94l4.26-2.13A3 3 0 0 0 15 8Z",
  edit: "M3 14.25V17h2.75L14.81 7.94l-2.75-2.75L3 14.25Zm13.71-8.04a1 1 0 0 0 0-1.41l-1.5-1.5a1 1 0 0 0-1.41 0l-1.09 1.09 2.75 2.75 1.25-1.13Z",
  copy: "M8 3h9a2 2 0 0 1 2 2v9h-2V5H8V3Zm-3 4h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm0 2v9h9V9H5Z",
  move: "M12 2l4 4h-3v5h5V8l4 4-4 4v-3h-5v5h3l-4 4-4-4h3v-5H6v3l-4-4 4-4v3h5V6H8l4-4Z",
  delete: "M6 7h12l-1 13a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 7Zm3-4h6l1 2h4v2H4V5h4l1-2Zm1 7v8h2v-8h-2Zm4 0v8h2v-8h-2Z",
  download: "M11 3h2v8h3l-4 4-4-4h3V3Zm-6 14h14v2H5v-2Z",
  info: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1 5h2v2h-2V7Zm0 4h2v6h-2v-6Z",
  check: "M20 6 9 17l-5-5 1.4-1.4L9 14.2 18.6 4.6 20 6Z",
  list: "M4 5h4v4H4V5Zm6 0h10v2H10V5ZM4 10h4v4H4v-4Zm6 1h10v2H10v-2ZM4 15h4v4H4v-4Zm6 1h10v2H10v-2Z",
  grid: "M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z",
  card: "M4 5h16v14H4V5Zm2 2v10h12V7H6Zm2 2h8v2H8V9Zm0 4h5v2H8v-2Z",
  up: "M12 6 6 12h4v6h4v-6h4l-6-6Z",
  refresh: "M12 4a8 8 0 1 1-7.5 10h2.2a6 6 0 1 0 1.6-6.3L11 10H4V3l2.9 2.9A7.97 7.97 0 0 1 12 4Z",
  upload: "M5 20h14a2 2 0 0 0 2-2v-3h-2v3H5v-3H3v3a2 2 0 0 0 2 2Zm7-16 5 5h-3v5h-4V9H7l5-5Z",
  filePlus: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm1 7V3.5L18.5 9H15Zm-1 5h-2v2h-2v-2H8v-2h2v-2h2v2h2v2Z",
  folderPlus: "M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2Zm3 8h-2v2H9v-2H7v-2h2V8h2v2h2v2Z",
  folder: "M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H3V6Zm0 3h18v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z",
  image: "M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm2 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm14 9-4.5-5-3.5 4.5-2.5-3L4 17h16Z",
  pdf: "M6 2h8l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 1.5V7h3.5L13 3.5ZM7 12h2.5a2 2 0 0 1 0 4H8v2H7v-6Zm1 1v2h1.5a1 1 0 0 0 0-2H8Zm4-.9c2.1 0 3.3 1.2 3.3 2.9S14.1 18 12 18h-2v-5.9h2Zm-1 1.1v3.7h1c1.5 0 2.2-.7 2.2-1.9s-.8-1.8-2.2-1.8h-1Zm5-1.2h4v1h-3v1.5h2.5v1H17V18h-1v-6Z",
  doc: "M6 2h8l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 1.5V7h3.5L13 3.5ZM7 11h7v1.5H7V11Zm0 3h7v1.5H7V14Zm0 3h5v1.5H7V17Z",
  xls: "M6 2h8l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 1.5V7h3.5L13 3.5ZM7 11h3l1 1.6 1-1.6h3l-2.4 3.5L15 18h-3l-1-1.6L10 18H7l2.4-3.5L7 11Z",
  zip: "M8 2h8v2H8V2Zm0 4h8v2H8V6Zm1 4h6v2H9v-2Zm-1 4h8v6H8v-6Z",
  file: "M6 2h8l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 1.5V7h3.5L13 3.5Z",
  expand: "M8 5l8 7-8 7V5Z",
  collapse: "M16 12 8 19V5l8 7Z",
  dot: "M11 11h2v2h-2z",
  restore: "M3 12a9 9 0 1 1 9 9 9 9 0 0 1-9-9Zm9-4a4 4 0 1 0 4 4 4 4 0 0 0-4-4Zm1.41 3.59L9.59 8 11 9.41l2.83-2.83-2.83-2.83L11 3.76l-2.12 2.12L5.29 9.47l.71.71 4.24 4.24.71.71 3.54-3.54Z",
  trash: "M16.5 9.4 7.55 4.24A2 2 0 0 0 5 6.08V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9.41a2 2 0 0 0-.5-1.01ZM5 18h10v-3H5v3Zm1.5-9.59 1.45 1.45A1.5 1.5 0 0 0 8 11.41V18h8v-3a1.5 1.5 0 0 0-2.95-.59L6.5 8.41ZM10 9h4v10h-4V9Z"
};

function icon(name, className = "ui-icon") {
  const path = ICON_PATHS[name] || ICON_PATHS.file;
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${path}"></path></svg>`;
}

function initToolbarIcons() {
  const map = {
    uploadActionBtn: "upload",
    newFileBtn: "filePlus",
    newFolderBtn: "folderPlus",
    shareSelectedBtn: "share",
    renameSelectedBtn: "edit",
    copySelectedBtn: "copy",
    moveSelectedBtn: "move",
    deleteSelectedBtn: "delete",
    downloadSelectedBtn: "download",
    infoSelectedBtn: "info",
    multiSelectBtn: "check",
    trashMultiSelectBtn: "check",
    trashRestoreSelectedBtn: "restore",
    trashDeleteSelectedBtn: "delete",
    trashClearAllBtn: "trash"
  };
  Object.entries(map).forEach(([id, name]) => {
    const el = $(id);
    if (!el) return;
    if (id === "uploadActionBtn") {
      const input = el.querySelector("input");
      el.innerHTML = icon(name);
      if (input) el.appendChild(input);
      return;
    }
    el.innerHTML = icon(name);
  });
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: options.body instanceof FormData ? {} : { "Content-Type": "application/json" },
    ...options
  });
  if (res.status === 401) {
    showLogin();
    throw new Error("请先登录");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || "请求失败");
    error.status = res.status;
    error.code = data.code;
    error.conflict = data.conflict;
    throw error;
  }
  return data;
}

function toast(message) {
  $("notice").textContent = message;
  setTimeout(() => {
    if ($("notice").textContent === message) $("notice").textContent = "";
  }, 3200);
}

function showLogin() {
  $("login").classList.remove("hidden");
  $("app").classList.add("hidden");
}

function showApp() {
  $("login").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("who").textContent = `${state.user.displayName} / ${roleName(state.user.role)}`;
  document.querySelectorAll(".admin-only").forEach((el) => el.classList.toggle("hidden", state.user.role !== "admin"));
}

function roleName(role) {
  return { admin: "系统管理员", dept_admin: "部门管理员", member: "普通成员" }[role] || role;
}

function statusName(status) {
  return { active: "启用", disabled: "禁用", locked: "锁定" }[status] || status;
}

function levelName(level) {
  return { none: "无权限", traverse: "可遍历", read: "只读", write: "读写", manage: "管理" }[level] || level;
}

function subjectName(type, id) {
  const list = type === "group" ? state.groups : state.users;
  const item = list.find((entry) => Number(entry.id) === Number(id));
  return item?.username || item?.name || id;
}

function size(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function getCurrentPath() {
  return state.fileMode === "personal" ? state.personalPath : state.path;
}

function initToolbarEvents() {
  $("refreshFilesBtn").addEventListener("click", () => renderFiles().catch((error) => toast(error.message)));
  $("shareSelectedBtn").addEventListener("click", () => runFileAction("分享", shareSelected));
  $("renameSelectedBtn").addEventListener("click", () => runFileAction("重命名", renameSelected));
  $("copySelectedBtn").addEventListener("click", () => runFileAction("复制", copySelected));
  $("moveSelectedBtn").addEventListener("click", () => runFileAction("绉诲姩", moveSelected));
  $("deleteSelectedBtn").addEventListener("click", () => runFileAction("删除", deleteSelected));
  $("downloadSelectedBtn").addEventListener("click", () => runFileAction("下载", downloadSelected));
  $("infoSelectedBtn").addEventListener("click", () => runFileAction("信息", showSelectedInfo));
  $("multiSelectBtn").addEventListener("click", () => {
    state.multiSelect = !state.multiSelect;
    if (!state.multiSelect && state.selectedFiles.size > 1) {
      state.selectedFiles = new Set([selectedItems()[0]?.path].filter(Boolean));
      renderSelectedRows();
    }
    updateFileToolbar();
  });
  $("viewModeBtn").addEventListener("click", () => {
    const modes = ["list", "icon", "card"];
    state.fileViewMode = modes[(modes.indexOf(state.fileViewMode) + 1) % modes.length];
    renderFileItems(state.currentItems);
    updateFileToolbar();
  });
  $("newFolderBtn").addEventListener("click", () => runFileAction("新建文件夹", async () => {
    const name = await inputModal("新建文件夹", "文件夹名称", "新建文件夹");
    if (!name) return;
    await api("/api/folder", { method: "POST", body: JSON.stringify({ path: state.path, name }) });
    await renderFiles();
  }));
  $("newFolderNoticeBtn").addEventListener("click", async () => {
    const payload = await folderNoticeModal("新建公告", { content: "" });
    if (!payload) return;
    if (!payload.content) {
      toast("公告内容不能为空");
      return;
    }
    await api("/api/folder-notices", {
      method: "POST",
      body: JSON.stringify({ path: state.path, title: payload.title, content: payload.content })
    });
    toast("公告已发布");
    await renderFiles();
  });
  $("newFileBtn").addEventListener("click", () => runFileAction("新建文件", async () => {
    const name = await inputModal("新建文件", "文件名", "新建文件.txt");
    if (!name) return;
    await api("/api/file", { method: "POST", body: JSON.stringify({ path: state.path, name }) });
    await renderFiles();
  }));
  $("uploadInput").addEventListener("change", async (event) => {
    for (const file of event.target.files) {
      const form = new FormData();
      form.append("file", file);
      await api(`/api/upload?path=${encodeURIComponent(state.path)}`, { method: "POST", body: form });
    }
    event.target.value = "";
    toast("上传完成");
    await renderFiles();
  });
  $("fileSearchInput").addEventListener("input", (event) => {
    state.fileSearch = String(event.target.value || "");
    if (state.fileSearchTimer) clearTimeout(state.fileSearchTimer);
    state.fileSearchTimer = setTimeout(() => {
      if (state.fileMode === "trash") {
        renderTrash().catch((error) => toast(error.message));
        return;
      }
      applyFileSearch(state.fileSearch).catch((error) => toast(error.message));
    }, 220);
  });
  $("fileSearchInput").addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    if (state.fileSearchTimer) clearTimeout(state.fileSearchTimer);
    state.fileSearchSeq++;
    state.fileSearch = "";
    event.currentTarget.value = "";
    if (state.fileMode === "trash") {
      renderTrash().catch((error) => toast(error.message));
      return;
    }
    applyFileSearch("").catch((error) => toast(error.message));
  });
  $("fileSearchToggle").addEventListener("click", () => $("fileSearchInput").focus());
  
  $("trashMultiSelectBtn").addEventListener("click", toggleTrashMultiSelect);
  $("trashRestoreSelectedBtn").addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    runFileAction("还原", restoreSelectedTrashInline);
  }, true);
  $("trashDeleteSelectedBtn").addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    runFileAction("删除", deleteSelectedTrashInline);
  }, true);
  $("trashClearAllBtn").addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    runFileAction("娓呯┖", clearAllTrashInline);
  }, true);
  $("trashRestoreSelectedBtn").addEventListener("click", () => runFileAction("还原", restoreSelectedTrash));
  $("trashDeleteSelectedBtn").addEventListener("click", () => runFileAction("删除", deleteSelectedTrash));
  $("trashClearAllBtn").addEventListener("click", () => runFileAction("娓呯┖", clearAllTrash));
  
  $("trashSearchInput")?.addEventListener("input", (event) => {
    const query = event.target.value.toLowerCase();
    document.querySelectorAll("#trashRows tr").forEach((row) => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(query) ? "" : "none";
    });
  });
  bindConflictAwareFileActions();
}

function bindConflictAwareFileActions() {
  $("newFolderBtn").addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    runFileAction("新建文件夹", createFolderWithConflict);
  }, true);
  $("newFileBtn").addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    runFileAction("新建文件", createFileWithConflict);
  }, true);
  $("copySelectedBtn").addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    runFileAction("复制", copySelected);
  }, true);
  $("moveSelectedBtn").addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    runFileAction("移动", moveSelected);
  }, true);
  $("uploadInput").addEventListener("change", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    runFileAction("上传", () => uploadFilesWithConflict(event));
  }, true);
}

async function bootstrap() {
  normalizeUiText();
  initSidebarToggle();
  initToolbarIcons();
  initToolbarEvents();
  initFilePaneResize();
  try {
    const { user } = await api("/api/me");
    state.user = user;
    showApp();
    await ensurePasswordChanged();
    await loadView("dashboard");
  } catch {
    showLogin();
  }
}

async function ensurePasswordChanged() {
  if (!state.user?.mustChangePassword) return;
  while (true) {
    const password = await inputModal("修改密码", "首次登录必须修改密码，请输入新密码（至少 6 位）", "");
    if (!password) continue;
    try {
      await api("/api/password", { method: "POST", body: JSON.stringify({ password }) });
      state.user.mustChangePassword = false;
      toast("完成");
      return;
    } catch (error) {
      await messageModal("修改失败", error.message);
    }
  }
}

async function loadView(view) {
  if (view === "trash") {
    state.fileMode = "trash";
    view = "files";
  } else if (view === "files") {
    state.fileMode = "files";
  }
  state.view = view;
  document.querySelectorAll(".view").forEach((el) => el.classList.add("hidden"));
  document.querySelectorAll(".nav").forEach((el) => el.classList.toggle("active", el.dataset.view === view));
  $(view).classList.remove("hidden");
  if (view === "dashboard") {
    $("title").textContent = "概览";
    $("subtitle").textContent = "查看容量、文件数量和最近动态";
    await renderDashboard();
  }
  if (view === "files") {
    $("title").textContent = "文件管理";
    $("subtitle").textContent = "日常上传、下载、浏览和恢复文件";
    await renderFiles();
  }
  if (view === "trash") {
    $("title").textContent = "文件管理";
    $("subtitle").textContent = "查看和恢复自己删除的文件";
    const [trashData, tree] = await Promise.all([
      api("/api/trash"),
      api("/api/folder-tree")
    ]);
    renderFileTree(tree.root);
    await renderTrash();
  }
  if (view === "personal") {
    $("title").textContent = "文件管理";
    $("subtitle").textContent = "个人文件空间";
    await renderPersonalFiles();
  }
  if (view === "settings") {
    $("title").textContent = "设置";
    $("subtitle").textContent = "连接向导、密码和个人操作日志";
    await loadSettingsTab(state.settingsTab);
  }
  if (view === "config") {
    $("title").textContent = "服务器配置";
    $("subtitle").textContent = "配置共享目录、Windows 身份映射、NTFS ACL 和审计日志";
    await loadConfigTab(state.configTab);
  }
}

async function loadSettingsTab(tab) {
  state.settingsTab = tab;
  document.querySelectorAll("[data-settings-tab]").forEach((el) => el.classList.toggle("active", el.dataset.settingsTab === tab));
  ["connect", "password", "settingsLogs"].forEach((name) => $(`${name}Panel`).classList.toggle("hidden", name !== tab && !(tab === "logs" && name === "settingsLogs")));
  if (tab === "connect") await renderConnect();
  if (tab === "password") $("passwordSyncResult").textContent = "";
  if (tab === "logs") await renderSettingsLogs();
}

async function loadConfigTab(tab) {
  state.configTab = tab;
  document.querySelectorAll("[data-config-tab]").forEach((el) => el.classList.toggle("active", el.dataset.configTab === tab));
  ["server", "users", "groups", "permissions", "templates"].forEach((name) => $(`${name}Panel`).classList.toggle("hidden", name !== tab));
  if (tab === "server") await renderSettings();
  if (tab === "users") await renderUsers();
  if (tab === "groups") await renderGroups();
  if (tab === "permissions") await renderPermissions();
  if (tab === "templates") await renderTemplates();
}

async function renderDashboard() {
  try {
    const data = await api("/api/dashboard");
    $("dashboardPanel").innerHTML = `
    <div class="metrics">
      <div class="metric"><span>文件数量</span><strong>${data.storage.files}</strong></div>
      <div class="metric"><span>文件夹数量</span><strong>${data.storage.folders}</strong></div>
      <div class="metric"><span>已用容量</span><strong>${size(data.storage.bytes)}</strong></div>
      <div class="metric"><span>用户 / 群组</span><strong>${data.users} / ${data.groups}</strong></div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>时间</th><th>用户</th><th>动作</th><th>对象</th></tr></thead>
        <tbody>${data.recent.map((row) => `<tr><td>${row.created_at}</td><td>${escapeHtml(row.username)}</td><td>${escapeHtml(row.action)}</td><td>${escapeHtml(row.target)}</td></tr>`).join("")}</tbody>
      </table>
    </div>`;
  } catch (error) {
    $("dashboardPanel").innerHTML = `
    <div class="panel" style="color: var(--color-danger); text-align: center;">
      <p>加载概览数据失败，请刷新页面重试</p>
      <p style="font-size: 0.8em; opacity: 0.7;">${escapeHtml(error.message || "未知错误")}</p>
    </div>`;
  }
}

async function renderFiles() {
  document.querySelector(".file-browser-pane")?.classList.toggle("multi-select-on", state.multiSelect);
  document.querySelector(".file-browser-pane")?.classList.toggle("trash-mode", state.fileMode === "trash");
  if (state.fileMode === "trash") {
    const tree = await api("/api/folder-tree");
    renderFileTree(tree.root);
    await renderTrash();
    return;
  }
  if (state.fileMode === "personal") {
    const [data, personalTree, sharedTree] = await Promise.all([
      api(`/api/personal/files?path=${encodeURIComponent(state.personalPath || "")}`),
      api("/api/personal/folder-tree"),
      api("/api/folder-tree")
    ]);
    state.personalPath = data.path;
    state.folderItems = data.items;
    state.currentItems = data.items;
    state.selectedFiles = new Set([...state.selectedFiles].filter((selected) => data.items.some((item) => item.path === selected)));
    renderPersonalBreadcrumb(data.path);
    await renderFileTree(sharedTree.root, true);
    renderFileItems(state.folderItems);
    updateFileToolbar();
    return;
  }
  $("title").textContent = "文件管理";
  $("subtitle").textContent = "日常上传、下载、浏览和恢复文件";
  $("folderNoticeCard")?.classList.remove("hidden");
  const [data, tree, notices] = await Promise.all([
    api(`/api/files?path=${encodeURIComponent(state.path)}`),
    api("/api/folder-tree"),
    api(`/api/folder-notices?path=${encodeURIComponent(state.path)}`).catch(() => ({ items: [] }))
  ]);
  state.folderItems = data.items;
  state.folderNotices = Array.isArray(notices.items) ? notices.items : [];
  state.currentItems = data.items;
  state.selectedFiles = new Set([...state.selectedFiles].filter((selected) => data.items.some((item) => item.path === selected)));
  state.expandedTree.add("/");
  const searchInput = $("fileSearchInput");
  if (searchInput) {
    searchInput.value = state.fileSearch;
    searchInput.placeholder = "搜索当前文件夹及子文件夹";
    searchInput.title = `${data.path} / ${levelName(data.permission)}`;
  }
  renderBreadcrumb(data.path);
  renderFolderNotices();
  renderFileTree(tree.root);
  if (state.fileSearch.trim()) {
    await applyFileSearch(state.fileSearch);
  } else {
    renderFileItems(state.folderItems);
    updateFileToolbar();
  }
}

async function renderPersonalFiles() {
  state.fileMode = "personal";
  document.querySelector(".file-browser-pane")?.classList.toggle("multi-select-on", state.multiSelect);
  document.querySelector(".file-browser-pane")?.classList.toggle("trash-mode", false);
  $("folderNoticeCard")?.classList.add("hidden");
  
  const [data, tree] = await Promise.all([
    api("/api/personal/files"),
    api("/api/personal/folder-tree")
  ]);
  
  // 确保个人空间根目录是展开的
  state.personalExpandedTree.add(tree.root.path);
  
  state.personalPath = data.path;
  state.folderItems = data.items;
  state.currentItems = data.items;
  state.selectedFiles = new Set();
  renderPersonalBreadcrumb(data.path);
  
  // 获取共享空间的树，然后一起渲染
  const sharedTree = await api("/api/folder-tree");
  await renderFileTree(sharedTree.root, true);
  renderFileItems(state.folderItems);
  updateFileToolbar();
}

function renderPersonalBreadcrumb(path) {
  const username = state.user?.username || "个人空间";
  $("breadcrumb").innerHTML = `
    <button class="path-chip" onclick="openPersonalMode()">${escapeHtml(username)}</button>
  `;
  const searchInput = $("fileSearchInput");
  if (searchInput) {
    searchInput.value = "";
    searchInput.placeholder = "搜索个人空间";
    searchInput.title = path;
  }
}

function renderFolderNotices() {
  const list = $("folderNoticeList");
  if (!list) return;
  if (!state.folderNotices.length) {
    list.innerHTML = `<div class="folder-notice-empty">当前文件夹暂无公告</div>`;
    return;
  }
  const isAdmin = state.user?.role === "admin";
  list.innerHTML = state.folderNotices.map((item) => {
    const ownerName = item.createdByName || state.user?.displayName || "未知";
    const owner = `【${ownerName}】`;
    const time = new Date(item.updatedAt || item.createdAt).toLocaleString();
    const canManage = isAdmin || item.createdBy === state.user?.id;
    const title = item.title || item.content.replace(/\s+/g, ' ').substring(0, 30) + (item.content.length > 30 ? '...' : '');
    const isUnread = !item.isRead;
    const titleClass = isUnread ? 'folder-notice-title-unread' : 'folder-notice-title-read';
    const actionsHtml = canManage ? `
      <div class="folder-notice-actions">
        <button class="link-button" onclick="editFolderNotice(${Number(item.id)})">编辑</button>
        <button class="link-button" onclick="deleteFolderNotice(${Number(item.id)})">删除</button>
      </div>
    ` : "";
    return `
      <article class="folder-notice-item">
        <span class="folder-notice-dept">${escapeHtml(owner)}</span>
        <p class="folder-notice-content folder-notice-title ${titleClass}" onclick="viewNoticeDetail(${Number(item.id)})" style="cursor: pointer;">${escapeHtml(title)}</p>
        <span class="folder-notice-meta">${escapeHtml(time)} 路 ${escapeHtml(ownerName)}</span>
        ${actionsHtml}
      </article>
    `;
  }).join("");
}

function viewNoticeDetail(id) {
  const notice = state.folderNotices.find(n => Number(n.id) === Number(id));
  if (!notice) return;
  
  // 标记为已读
  api("/api/folder-notices/read", {
    method: "POST",
    body: JSON.stringify({ id })
  }).then(() => {
    // 更新本地状态
    notice.isRead = true;
    renderFolderNotices();
  }).catch(() => {
    // 忽略错误
  });
  
  // 确定弹窗标题
  const modalTitle = notice.title || notice.content.replace(/\s+/g, ' ').substring(0, 20) + (notice.content.length > 20 ? '...' : '');
  
  // 显示详情弹窗
  activeModalCancel = () => null;
  openModal(modalTitle, `
    <div class="folder-notice-detail">
      <p class="folder-notice-detail-content">${escapeHtml(notice.content).replace(/\n/g, '<br>')}</p>
    </div>
  `, `
    <button type="button" data-modal-ok>关闭</button>
  `);
  document.querySelector("[data-modal-ok]").onclick = () => {
    activeModalCancel = null;
    closeModal(false);
  };
}

function folderNoticeModal(title, initial = {}) {
  return new Promise((resolve) => {
    activeModalCancel = () => resolve(null);
    openModal(title, `
      <label class="modal-field">公告标题<input id="noticeTitleInput" type="text" value="${escapeHtml(initial.title || "")}" maxlength="100"></label>
      <label class="modal-field">公告内容<textarea id="noticeContentInput" class="notice-editor-content" rows="6" maxlength="1000">${escapeHtml(initial.content || "")}</textarea></label>
    `, `
      <button type="button" class="muted-button" data-modal-cancel>取消</button>
      <button type="button" data-modal-ok>保存</button>
    `);
    const titleInput = $("noticeTitleInput");
    const contentInput = $("noticeContentInput");
    titleInput?.focus();
    document.querySelector("[data-modal-cancel]").onclick = () => { closeModal(); };
    document.querySelector("[data-modal-ok]").onclick = () => {
      const title = String(titleInput?.value || "").trim();
      const content = String(contentInput?.value || "").trim();
      activeModalCancel = null;
      closeModal(false);
      resolve({ title, content });
    };
    contentInput?.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        document.querySelector("[data-modal-ok]")?.click();
      }
    });
  });
}

function setFileTableHeader(cells) {
  const header = document.querySelector("#files .file-table thead tr");
  if (!header) return;
  header.innerHTML = cells.map((cell) => `<th>${cell}</th>`).join("");
}

function renderFileItems(items) {
  const body = $("fileRows");
  const table = body.closest(".file-table");
  setFileTableHeader(["名称", "大小", "最后修改", "权限"]);
  table.className = `file-table ${state.fileViewMode === "list" ? "" : `file-table-${state.fileViewMode}`}`;
  if (!items.length) {
    body.innerHTML = `<tr><td colspan="4">${state.fileSearch ? "当前目录无匹配结果" : "当前文件夹为空"}</td></tr>`;
    return;
  }
  if (state.fileViewMode === "list") {
    body.innerHTML = items.map((item) => `
    <tr class="file-row ${state.selectedFiles.has(item.path) ? "selected" : ""}" data-path="${escapeAttr(item.path)}" onclick="selectFileRow('${encodeURIComponent(item.path)}')" ondblclick="${item.type === "folder" ? `openFolder('${encodeURIComponent(item.path)}')` : `downloadFile('${encodeURIComponent(item.path)}')`}">
      <td class="file-name-cell">
        <input class="file-check" type="checkbox" ${state.selectedFiles.has(item.path) ? "checked" : ""} onclick="event.stopPropagation(); toggleFileSelection('${encodeURIComponent(item.path)}')">
        <span class="file-icon">${fileIcon(item)}</span>
        ${item.type === "folder"
          ? `<button class="link-button" onclick="event.stopPropagation(); openFolder('${encodeURIComponent(item.path)}')">${escapeHtml(item.name)}</button>`
          : `<span>${escapeHtml(item.name)}</span>`}
      </td>
      <td>${item.type === "folder" ? "" : size(item.size)}</td>
      <td>${new Date(item.modifiedAt).toLocaleString()}</td>
      <td>${levelName(item.permission)}</td>
    </tr>`).join("");
    return;
  }
  body.innerHTML = `<tr><td colspan="4"><div class="file-tile-grid ${state.fileViewMode === "card" ? "card-view" : ""}">
    ${items.map((item) => `
      <button class="file-tile ${state.selectedFiles.has(item.path) ? "selected" : ""}" data-path="${escapeAttr(item.path)}" onclick="selectFileRow('${encodeURIComponent(item.path)}')" ondblclick="${item.type === "folder" ? `openFolder('${encodeURIComponent(item.path)}')` : `downloadFile('${encodeURIComponent(item.path)}')`}">
        <input class="file-check" type="checkbox" ${state.selectedFiles.has(item.path) ? "checked" : ""} onclick="event.stopPropagation(); toggleFileSelection('${encodeURIComponent(item.path)}')">
        <span class="tile-icon">${fileIcon(item)}</span>
        <strong>${escapeHtml(item.name)}</strong>
                <small>${item.type === "folder" ? "文件夹" : size(item.size)} · ${levelName(item.permission)}</small>
        ${state.fileViewMode === "card" ? `<small>${new Date(item.modifiedAt).toLocaleString()}</small>` : ""}
      </button>
    `).join("")}
  </div></td></tr>`;
}

function collectSearchFolderPaths(basePath) {
  const root = $("fileTree")?.__treeDataRoot;
  const start = root ? findTreeNode(basePath) : null;
  if (!start) return [basePath];
  const paths = [];
  const walk = (node) => {
    paths.push(node.path);
    for (const child of node.children || []) walk(child);
  };
  walk(start);
  return paths;
}

async function applyFileSearch(keyword) {
  const term = String(keyword || "").trim().toLowerCase();
  if (!term) {
    state.currentItems = state.folderItems;
    renderFileItems(state.currentItems);
    updateFileToolbar();
    return;
  }
  const seq = ++state.fileSearchSeq;
  $("fileRows").innerHTML = `<tr><td colspan="4">搜索中...</td></tr>`;
  const paths = collectSearchFolderPaths(state.path);
  const responses = await Promise.all(
    paths.map((path) =>
      api(`/api/files?path=${encodeURIComponent(path)}`).catch(() => ({ items: [] }))
    )
  );
  if (seq !== state.fileSearchSeq) return;
  const matches = [];
  for (const response of responses) {
    for (const item of response.items || []) {
      if (String(item.name || "").toLowerCase().includes(term)) matches.push(item);
    }
  }
  const seen = new Set();
  state.currentItems = matches.filter((item) => {
    if (seen.has(item.path)) return false;
    seen.add(item.path);
    return true;
  });
  state.selectedFiles.clear();
  renderFileItems(state.currentItems);
  updateFileToolbar();
}

function fileIcon(item) {
  const iconBase = "/iconfont/icon_wo0x4ewpce";
  const iconImg = (name) => `<img class="file-type-icon-img" src="${iconBase}/${name}" alt="" loading="lazy">`;
  if (item.type === "folder") return iconImg("wenjianjia-1.svg");
  const ext = item.name.split(".").pop()?.toLowerCase();
  if (["jpg", "jpeg"].includes(ext)) return iconImg("jpg-1.svg");
  if (["png", "gif", "webp"].includes(ext)) return iconImg("png-1.svg");
  if (["pdf"].includes(ext)) return iconImg("pdf-1.svg");
  if (["doc", "docx"].includes(ext)) return iconImg("word-1.svg");
  if (["xls", "xlsx"].includes(ext)) return iconImg("excel-1.svg");
  if (["ppt", "pptx"].includes(ext)) return iconImg("ppt-1.svg");
  if (["zip", "rar", "7z"].includes(ext)) return iconImg("zip-1.svg");
  if (["txt", "md", "log"].includes(ext)) return iconImg("txt-1.svg");
  return iconImg("yuanwenjian-1.svg");
}

function renderBreadcrumb(rel) {
  const parts = rel.split("/").filter(Boolean);
  const crumbs = [{ name: "共享空间", path: "/" }];
  let current = "";
  for (const part of parts) {
    current += `/${part}`;
    crumbs.push({ name: part, path: current });
  }
  $("breadcrumb").innerHTML = crumbs.map((crumb, index) => `
    <button class="crumb ${index === crumbs.length - 1 ? "active" : ""}" onclick="openFolder('${encodeURIComponent(crumb.path)}')">${escapeHtml(crumb.name)}</button>
  `).join(`<span class="crumb-separator">/</span>`);
}

async function renderFileTree(sharedRoot, isPersonal = false) {
  let personalTree = null;
  try {
    personalTree = await api("/api/personal/folder-tree");
  } catch {
    personalTree = { root: { path: "/homes", name: "个人空间", permission: "manage", children: [] } };
  }
  
  const sharedHtml = renderTreeNode(sharedRoot, 0);
  const personalHtml = renderPersonalTreeNode(personalTree.root, 0);
  
  $("fileTree").innerHTML = sharedHtml + personalHtml;
  
  document.querySelector(".trash-row")?.classList.toggle("active", state.fileMode === "trash");
  document.querySelector(".personal-row")?.classList.toggle("active", state.fileMode === "personal");
  $("fileTree").__treeDataRoot = { sharedRoot, personalRoot: personalTree.root };
}

function renderPersonalTreeNode(node, depth) {
  const active = node.path === state.personalPath ? "active" : "";
  const hasChildren = (node.children || []).length > 0;
  const expanded = state.personalExpandedTree && state.personalExpandedTree.has(node.path);
  const childHtml = hasChildren && expanded ? (node.children || []).map((child) => renderPersonalTreeNode(child, depth + 1)).join("") : "";
  const displayName = depth === 0 ? "个人空间" : node.name;
  return `
    <div class="tree-node">
      <button class="tree-row ${active} ${depth === 0 ? "personal-row" : ""}" onclick="openPersonalFolder('${encodeURIComponent(node.path)}')" style="padding-left:${10 + depth * 14}px">
        <span class="tree-icon ${hasChildren ? "" : "empty"}" onclick="event.stopPropagation(); togglePersonalTreeNode('${encodeURIComponent(node.path)}')">${hasChildren ? (expanded ? icon("collapse") : icon("expand")) : ""}</span>
        <span class="${depth === 0 ? "tree-name-bold" : ""}">${escapeHtml(displayName)}</span>
        <small>管理</small>
      </button>
      ${childHtml}
    </div>`;
}

function renderTreeNode(node, depth) {
  const active = node.path === state.path ? "active" : "";
  const hasChildren = (node.children || []).length > 0;
  const expanded = state.expandedTree.has(node.path);
  const childHtml = hasChildren && expanded ? (node.children || []).map((child) => renderTreeNode(child, depth + 1)).join("") : "";
  return `
    <div class="tree-node">
      <button class="tree-row ${active}" onclick="openTreeFolder('${encodeURIComponent(node.path)}')" style="padding-left:${10 + depth * 14}px">
        <span class="tree-icon ${hasChildren ? "" : "empty"}" onclick="event.stopPropagation(); toggleTreeNode('${encodeURIComponent(node.path)}')">${hasChildren ? (expanded ? icon("collapse") : icon("expand")) : ""}</span>
        <span class="${depth === 1 ? "tree-name-bold" : ""}">${escapeHtml(node.name)}</span>
        <small>${levelName(node.permission)}</small>
      </button>
      ${childHtml}
    </div>`;
}

window.openFolder = async (encodedPath) => {
  state.fileMode = "files";
  if (state.fileSearchTimer) clearTimeout(state.fileSearchTimer);
  state.fileSearchSeq++;
  state.path = decodeURIComponent(encodedPath);
  state.fileSearch = "";
  const searchInput = $("fileSearchInput");
  if (searchInput) searchInput.value = "";
  state.expandedTree.add(state.path);
  state.selectedFiles.clear();
  await renderFiles();
};

window.openTreeFolder = async (encodedPath) => {
  const path = decodeURIComponent(encodedPath);
  if (path === "/personal-root") {
    await openPersonalMode();
    return;
  }
  state.fileMode = "files";
  if (state.fileSearchTimer) clearTimeout(state.fileSearchTimer);
  state.fileSearchSeq++;
  const node = findTreeNode(path);
  if (node && (node.children || []).length > 0) {
    if (state.expandedTree.has(path)) state.expandedTree.delete(path);
    else state.expandedTree.add(path);
  }
  state.path = path;
  state.fileSearch = "";
  const searchInput = $("fileSearchInput");
  if (searchInput) searchInput.value = "";
  state.selectedFiles.clear();
  await renderFiles();
};

window.openTrashMode = async () => {
  state.fileMode = "trash";
  state.selectedFiles.clear();
  state.selectedTrashItems.clear();
  state.trashMultiSelect = false;
  state.fileSearch = "";
  const searchInput = $("fileSearchInput");
  if (searchInput) {
    searchInput.value = "";
    searchInput.placeholder = "搜索";
  }
  document.querySelector(".trash-row")?.classList.add("active");
  document.querySelector(".personal-row")?.classList.remove("active");
  await loadView("trash");
};

window.openPersonalMode = async () => {
  state.fileMode = "personal";
  state.selectedFiles = new Set();
  document.querySelector(".trash-row")?.classList.remove("active");
  await renderPersonalFiles();
};

window.openPersonalFolder = async (encodedPath) => {
  state.fileMode = "personal";
  if (state.fileSearchTimer) clearTimeout(state.fileSearchTimer);
  state.fileSearchSeq++;
  const path = decodeURIComponent(encodedPath);
  const node = findPersonalTreeNode(path);
  if (node && (node.children || []).length > 0) {
    if (state.personalExpandedTree.has(path)) state.personalExpandedTree.delete(path);
    else state.personalExpandedTree.add(path);
  }
  state.personalPath = path;
  state.fileSearch = "";
  const searchInput = $("fileSearchInput");
  if (searchInput) searchInput.value = "";
  state.selectedFiles.clear();
  await renderFiles();
};

window.togglePersonalTreeNode = async (encodedPath) => {
  const path = decodeURIComponent(encodedPath);
  if (state.personalExpandedTree.has(path)) state.personalExpandedTree.delete(path);
  else state.personalExpandedTree.add(path);
  await renderFiles();
};

function findPersonalTreeNode(path) {
  const treeRoot = $("fileTree").__treeDataRoot?.personalRoot;
  if (!treeRoot) return null;
  const search = (node) => {
    if (node.path === path) return node;
    for (const child of node.children || []) {
      const found = search(child);
      if (found) return found;
    }
    return null;
  };
  return search(treeRoot);
}

window.toggleTreeNode = async (encodedPath) => {
  const path = decodeURIComponent(encodedPath);
  const node = findTreeNode(path);
  if (node && (!node.children || node.children.length === 0)) return;
  if (state.expandedTree.has(path)) state.expandedTree.delete(path);
  else state.expandedTree.add(path);
  const tree = await api("/api/folder-tree");
  renderFileTree(tree.root);
};

function findTreeNode(path) {
  const walk = (node) => {
    if (!node) return null;
    if (node.path === path) return node;
    for (const child of node.children || []) {
      const found = walk(child);
      if (found) return found;
    }
    return null;
  };
  const root = document.getElementById("fileTree")?.__treeDataRoot;
  return walk(root);
}

window.selectFileRow = (encodedPath) => {
  const path = decodeURIComponent(encodedPath);
  if (state.multiSelect) {
    if (state.selectedFiles.has(path)) state.selectedFiles.delete(path);
    else state.selectedFiles.add(path);
  } else {
    state.selectedFiles = new Set([path]);
  }
  renderSelectedRows();
  updateFileToolbar();
};

window.toggleFileSelection = (encodedPath) => {
  const path = decodeURIComponent(encodedPath);
  if (state.selectedFiles.has(path)) state.selectedFiles.delete(path);
  else state.selectedFiles.add(path);
  renderSelectedRows();
  updateFileToolbar();
};

function renderSelectedRows() {
  document.querySelectorAll(".file-row, .file-tile").forEach((row) => {
    const item = state.currentItems.find((entry) => entry.path === row.dataset.path);
    row.classList.toggle("selected", item ? state.selectedFiles.has(item.path) : false);
    const checkbox = row.querySelector(".file-check");
    if (checkbox && item) checkbox.checked = state.selectedFiles.has(item.path);
  });
}

window.downloadFile = (encodedPath) => {
  location.href = `/api/download?path=${encodedPath}`;
};

window.editFolderNotice = async (id) => {
  const target = state.folderNotices.find((item) => Number(item.id) === Number(id));
  if (!target) return;
  const payload = await folderNoticeModal("编辑公告", {
    title: target.title || "",
    content: target.content || ""
  });
  if (!payload) return;
  if (!payload.content) {
    toast("公告内容不能为空");
    return;
  }
  await api("/api/folder-notices", {
    method: "PATCH",
    body: JSON.stringify({ id: Number(id), title: payload.title, content: payload.content })
  });
  toast("完成");
  await renderFiles();
};

window.deleteFolderNotice = async (id) => {
  const ok = await confirmModal("删除公告", "确认删除这条公告吗？", "删除");
  if (!ok) return;
  await api(`/api/folder-notices?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  toast("完成");
  await renderFiles();
};

function selectedItems() {
  return state.currentItems.filter((item) => state.selectedFiles.has(item.path));
}

async function createFolderWithConflict() {
  const name = await inputModal("新建文件夹", "文件夹名称", "新建文件夹");
  if (!name) return;
  const currentPath = getCurrentPath();
  await apiWithNameConflict(() =>
    api("/api/folder", { method: "POST", body: JSON.stringify({ path: currentPath, name }) }),
    () => api("/api/folder", { method: "POST", body: JSON.stringify({ path: currentPath, name, conflict: "rename" }) }),
    { title: "文件夹已存在", name, allowVersion: false }
  );
  await renderFiles();
}

async function createFileWithConflict() {
  const name = await inputModal("新建文件", "文件名", "新建文件.txt");
  if (!name) return;
  const currentPath = getCurrentPath();
  await apiWithNameConflict(() =>
    api("/api/file", { method: "POST", body: JSON.stringify({ path: currentPath, name }) }),
    () => api("/api/file", { method: "POST", body: JSON.stringify({ path: currentPath, name, conflict: "rename" }) }),
    { title: "文件已存在", name, allowVersion: false }
  );
  await renderFiles();
}

async function uploadFilesWithConflict(event) {
  const files = [...event.target.files];
  for (const file of files) {
    await uploadOneFileWithConflict(file);
  }
  event.target.value = "";
  toast("上传完成");
  await renderFiles();
}

async function uploadOneFileWithConflict(file) {
  const currentPath = getCurrentPath();
  const send = (conflict = "") => {
    const form = new FormData();
    form.append("file", file);
    const suffix = conflict ? `&conflict=${encodeURIComponent(conflict)}` : "";
    return api(`/api/upload?path=${encodeURIComponent(currentPath)}${suffix}`, { method: "POST", body: form });
  };
  await apiWithNameConflict(() => send(), (action) => send(action), {
    title: "文件已存在",
    name: file.name,
    allowVersion: true
  });
}

async function apiWithNameConflict(action, retry, options) {
  try {
    return await action();
  } catch (error) {
    if (error.status !== 409 && error.code !== "NAME_CONFLICT") throw error;
    const choice = await conflictChoiceModal(options);
    if (!choice) return null;
    return retry(choice);
  }
}

function conflictChoiceModal({ title, name, allowVersion }) {
  return new Promise((resolve) => {
    activeModalCancel = () => resolve("");
    const versionButton = allowVersion
      ? `<button type="button" data-conflict-version>覆盖并保留旧版本</button>`
      : "";
    openModal(title, `
      <p class="modal-message">当前位置已经存在同名项目：${escapeHtml(name)}</p>
      <p class="modal-message">请选择处理方式。</p>
    `, `
      <button type="button" class="muted-button" data-modal-cancel>取消</button>
      <button type="button" data-conflict-rename>自动重命名</button>
      ${versionButton}
    `);
    document.querySelector("[data-modal-cancel]").onclick = () => closeModal();
    document.querySelector("[data-conflict-rename]").onclick = () => {
      activeModalCancel = null;
      closeModal(false);
      resolve("rename");
    };
    document.querySelector("[data-conflict-version]")?.addEventListener("click", () => {
      activeModalCancel = null;
      closeModal(false);
      resolve("version");
    });
  });
}

function updateFileToolbar() {
  const items = selectedItems();
  const one = items.length === 1;
  const any = items.length > 0;
  $("shareSelectedBtn").classList.toggle("inactive", !one);
  $("renameSelectedBtn").classList.toggle("inactive", !one);
  $("copySelectedBtn").classList.toggle("inactive", !one);
  $("moveSelectedBtn").classList.toggle("inactive", !one);
  $("deleteSelectedBtn").classList.toggle("inactive", !any);
  $("downloadSelectedBtn").classList.toggle("inactive", !one || items[0]?.type !== "file");
  $("infoSelectedBtn").classList.toggle("inactive", !one);
  $("multiSelectBtn").classList.toggle("active", state.multiSelect);
  $("viewModeBtn").innerHTML = icon({ list: "list", icon: "grid", card: "card" }[state.fileViewMode] || "list");
  searchInput.placeholder = "搜索";
  document.querySelector(".file-browser-pane")?.classList.toggle("multi-select-on", state.multiSelect);
}

async function runFileAction(label, action) {
  try {
    await action();
  } catch (error) {
    toast(`${label}失败：${error.message}`);
  }
}

window.renameItem = async (encodedPath) => {
  const oldPath = decodeURIComponent(encodedPath);
  const name = await inputModal("输入名称", "名称", "新建项目");
  if (!name) return;
  await api("/api/rename", { method: "POST", body: JSON.stringify({ path: oldPath, name }) });
  toast("已重命名");
  await renderFiles();
};

window.deleteItem = async (encodedPath) => {
  const target = decodeURIComponent(encodedPath);
  if (!await confirmModal("删除", `删除 ${target}？文件会进入回收站。`, "删除")) return;
  await api("/api/delete", { method: "POST", body: JSON.stringify({ path: target }) });
  toast("已移入回收站");
  await renderFiles();
};

async function selectedSingle(actionName) {
  const items = selectedItems();
  if (items.length !== 1) {
    toast(`请先选择一个项目再${actionName}`);
    return null;
  }
  return items[0];
}

async function shareSelected() {
  const item = await selectedSingle("分享");
  if (!item) return;
  const data = await api("/api/client/connect");
  const smbPath = `${data.unc}${item.path.replace(/\//g, "\\")}`;
  await copyText(smbPath);
  toast("完成");
}

async function renameSelected() {
  const item = await selectedSingle("操作");
  if (item) await window.renameItem(encodeURIComponent(item.path));
}

async function copySelected() {
  const item = await selectedSingle("复制");
  if (!item) return;
  const targetDir = await directoryModal("复制", "请选择目标目录");
  if (!targetDir) return;
  await apiWithNameConflict(
    () => api("/api/copy", { method: "POST", body: JSON.stringify({ path: item.path, targetDir }) }),
    () => api("/api/copy", { method: "POST", body: JSON.stringify({ path: item.path, targetDir, conflict: "rename" }) }),
    { title: "目标目录已有同名项目", name: item.name, allowVersion: false }
  );
  toast("完成");
  state.selectedFiles.clear();
  await renderFiles();
}

async function moveSelected() {
  const item = await selectedSingle("绉诲姩");
  if (!item) return;
  const targetDir = await directoryModal("移动", "请选择目标目录");
  if (!targetDir) return;
  await apiWithNameConflict(
    () => api("/api/move", { method: "POST", body: JSON.stringify({ path: item.path, targetDir }) }),
    () => api("/api/move", { method: "POST", body: JSON.stringify({ path: item.path, targetDir, conflict: "rename" }) }),
    { title: "目标目录已有同名项目", name: item.name, allowVersion: false }
  );
  toast("完成");
  state.selectedFiles.clear();
  await renderFiles();
}

async function deleteSelected() {
  const items = selectedItems();
  if (!items.length) return;
  if (!await confirmModal("删除", `删除选中的 ${items.length} 个项目？文件会进入回收站。`, "删除")) return;
  for (const item of items) {
    await api("/api/delete", { method: "POST", body: JSON.stringify({ path: item.path }) });
  }
  state.selectedFiles.clear();
  toast("已移入回收站");
  await renderFiles();
}

async function downloadSelected() {
  const item = await selectedSingle("下载");
  if (!item) return;
  if (item.type === "folder") {
    toast("完成");
    return;
  }
  window.downloadFile(encodeURIComponent(item.path));
}

async function showSelectedInfo() {
  const item = await selectedSingle("查看信息");
  if (!item) return;
  await messageModal("信息", [
    `名称: ${item.name}`,
    `类型: ${item.type === "folder" ? "文件夹" : "文件"}`,
    `路径: ${item.path}`,
    `大小: ${item.type === "folder" ? "-" : size(item.size)}`,
    `权限: ${levelName(item.permission)}`,
    `最后修改: ${new Date(item.modifiedAt).toLocaleString()}`
  ].join("\n"));
}

async function renderTrash() {
  const data = await api("/api/trash");
  const body = $("fileRows");
  const table = body.closest(".file-table");
  table.className = "file-table";
  setFileTableHeader([
    state.trashMultiSelect ? '<input type="checkbox" id="trashSelectAll">' : "",
    "名称",
    "原路径",
    "删除人",
    "删除时间",
    "操作"
  ]);
  $("title").textContent = "回收站";
  $("subtitle").textContent = "查看、恢复或永久删除已删除文件";
  $("breadcrumb").innerHTML = `
    <button class="crumb" onclick="openFolder('${encodeURIComponent("/")}')">共享空间</button>
    <span class="crumb-separator">/</span>
    <button class="crumb active" type="button">回收站</button>
  `;
  $("folderNoticeCard")?.classList.add("hidden");
  const searchInput = $("fileSearchInput");
  if (searchInput) {
    searchInput.placeholder = "搜索回收站";
    searchInput.placeholder = "搜索";
  }
  document.querySelector(".trash-row")?.classList.add("active");
  const term = String(state.fileSearch || "").trim().toLowerCase();
  const items = term
    ? data.items.filter((item) => `${item.originalPath} ${item.deletedBy} ${item.trashName}`.toLowerCase().includes(term))
    : data.items;
  if (!items.length) {
    body.innerHTML = `<tr><td colspan="6">回收站为空</td></tr>`;
    updateTrashToolbar();
    return;
  }
  body.innerHTML = items.map((item) => {
    const name = item.originalPath.split("/").pop() || item.originalPath;
    const isSelected = state.selectedTrashItems.has(item.trashName);
    return `
      <tr class="file-row trash-item-row ${isSelected ? "selected" : ""}" data-trash-name="${escapeAttr(item.trashName)}" onclick="selectTrashRow('${encodeURIComponent(item.trashName)}')">
        <td>${state.trashMultiSelect ? `<input type="checkbox" class="trash-item-checkbox" data-trash-name="${escapeAttr(item.trashName)}" ${isSelected ? "checked" : ""} onclick="event.stopPropagation(); toggleTrashSelection('${encodeURIComponent(item.trashName)}')">` : ""}</td>
        <td class="file-name-cell"><span class="file-icon">${fileIcon({ type: "file", name })}</span><span>${escapeHtml(name)}</span></td>
        <td>${escapeHtml(item.originalPath)}</td>
        <td>${escapeHtml(item.deletedBy)}</td>
        <td>${new Date(item.deletedAt).toLocaleString()}</td>
        <td>
          <button class="link-button" onclick="event.stopPropagation(); restoreTrash('${encodeURIComponent(item.trashName)}')">恢复</button>
          <button class="link-button danger" onclick="event.stopPropagation(); permanentDeleteTrash('${encodeURIComponent(item.trashName)}')">删除</button>
        </td>
      </tr>`;
  }).join("");
  const selectAll = $("trashSelectAll");
  if (selectAll) {
    selectAll.checked = items.length > 0 && items.every((item) => state.selectedTrashItems.has(item.trashName));
    selectAll.addEventListener("change", (event) => {
      if (event.target.checked) items.forEach((item) => state.selectedTrashItems.add(item.trashName));
      else items.forEach((item) => state.selectedTrashItems.delete(item.trashName));
      renderTrash().catch((error) => toast(error.message));
    });
  }
  updateTrashToolbar();
}

function updateTrashToolbar() {
  const count = state.selectedTrashItems.size;
  $("trashRestoreSelectedBtn").classList.toggle("inactive", count === 0);
  $("trashDeleteSelectedBtn").classList.toggle("inactive", count === 0);
  $("trashMultiSelectBtn").classList.toggle("active", state.trashMultiSelect);
  document.querySelector(".file-browser-pane")?.classList.toggle("trash-multi-select-on", state.trashMultiSelect);
}

window.selectTrashRow = (encodedTrashName) => {
  const trashName = decodeURIComponent(encodedTrashName);
  if (state.trashMultiSelect) {
    if (state.selectedTrashItems.has(trashName)) state.selectedTrashItems.delete(trashName);
    else state.selectedTrashItems.add(trashName);
  } else {
    state.selectedTrashItems = new Set([trashName]);
  }
  renderTrash().catch((error) => toast(error.message));
};

window.toggleTrashSelection = (encodedTrashName) => {
  const trashName = decodeURIComponent(encodedTrashName);
  if (state.selectedTrashItems.has(trashName)) state.selectedTrashItems.delete(trashName);
  else state.selectedTrashItems.add(trashName);
  renderTrash().catch((error) => toast(error.message));
};

function toggleTrashMultiSelect() {
  state.trashMultiSelect = !state.trashMultiSelect;
  if (!state.trashMultiSelect) state.selectedTrashItems.clear();
  renderTrash().catch((error) => toast(error.message));
}

window.restoreTrash = async (trashName) => {
  const name = decodeURIComponent(trashName);
  await api("/api/trash/restore", { method: "POST", body: JSON.stringify({ trashName: name }) });
  state.selectedTrashItems.delete(name);
  toast("已恢复");
  await renderFiles();
};

window.permanentDeleteTrash = async (trashName) => {
  const name = decodeURIComponent(trashName);
  if (!await confirmModal("永久删除", `确定要永久删除 "${name}" 吗？此操作不可恢复。`, "删除")) return;
  await api("/api/trash/permanent", { method: "POST", body: JSON.stringify({ trashName: name }) });
  state.selectedTrashItems.delete(name);
  toast("已永久删除");
  await renderFiles();
};

async function restoreSelectedTrashInline() {
  if (state.selectedTrashItems.size === 0) return;
  const count = state.selectedTrashItems.size;
  for (const trashName of state.selectedTrashItems) {
    await api("/api/trash/restore", { method: "POST", body: JSON.stringify({ trashName }) });
  }
  state.selectedTrashItems.clear();
  toast(`已恢复 ${count} 项`);
  await renderFiles();
}

async function deleteSelectedTrashInline() {
  if (state.selectedTrashItems.size === 0) return;
  const count = state.selectedTrashItems.size;
  if (!await confirmModal("永久删除", `确定要永久删除选中的 ${count} 项吗？此操作不可恢复。`, "删除")) return;
  for (const trashName of state.selectedTrashItems) {
    await api("/api/trash/permanent", { method: "POST", body: JSON.stringify({ trashName }) });
  }
  state.selectedTrashItems.clear();
  toast("已永久删除");
  await renderFiles();
}

async function clearAllTrashInline() {
  if (!await confirmModal("清空回收站", "确定要清空回收站吗？此操作不可恢复。", "清空")) return;
  await api("/api/trash/clear", { method: "POST" });
  state.selectedTrashItems.clear();
  toast("回收站已清空");
  await renderFiles();
}

async function renderConnect() {
  const data = await api("/api/client/connect");
  state.connect = data;
  $("connectUser").textContent = `${state.user.username} -> ${data.windowsUser}`;
  $("connectCommand").textContent = data.command;
  $("disconnectCommand").textContent = data.disconnectCommand;
  $("connectNotes").textContent = data.notes.join("\n");
}

async function renderUsers() {
  const [data, model] = await Promise.all([api("/api/users"), api("/api/windows/model")]);
  state.users = data.items;
  state.windowsModel = model;
  $("userRows").innerHTML = data.items.map((u) => {
    const mapped = model.users.find((item) => item.id === u.id);
    return `
      <tr>
        <td>${escapeHtml(u.username)}</td>
        <td><code class="inline-code">${escapeHtml(mapped?.windowsName || "")}</code></td>
        <td>${(mapped?.systemGroups || []).map((name) => `<span class="pill">${escapeHtml(name)}</span>`).join("") || "-"}</td>
        <td><input value="${escapeAttr(u.display_name)}" data-user-name="${u.id}"></td>
        <td>
          <select data-user-role="${u.id}">
            ${["member", "dept_admin", "admin"].map((r) => `<option value="${r}" ${u.role === r ? "selected" : ""}>${roleName(r)}</option>`).join("")}
          </select>
        </td>
        <td>
          <select data-user-status="${u.id}">
            ${["active", "disabled", "locked"].map((s) => `<option value="${s}" ${u.status === s ? "selected" : ""}>${statusName(s)}</option>`).join("")}
          </select>
        </td>
        <td>${u.failed_logins}</td>
        <td class="actions"><button onclick="saveUser(${u.id})">保存</button><button onclick="resetUserPassword(${u.id})">随机重置密码</button><button class="danger" onclick="removeUser(${u.id})">删除</button></td>
      </tr>`;
  }).join("");
}

window.saveUser = async (id) => {
  const payload = {
    id,
    displayName: document.querySelector(`[data-user-name="${id}"]`).value,
    role: document.querySelector(`[data-user-role="${id}"]`).value,
    status: document.querySelector(`[data-user-status="${id}"]`).value
  };
  await api("/api/users", {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  toast("用户已保存并同步");
  await refreshDirectoryState();
  await loadConfigTab("users");
};

window.resetUserPassword = async (id) => {
  if (!await confirmModal("随机重置密码", "将为该用户生成一个随机新密码，并同步到 Windows/SMB 密码。继续？", "重置")) return;
  const result = await api("/api/users/reset-password", {
    method: "POST",
    body: JSON.stringify({ id })
  });
  
  // 只显示密码
  await messageModal("密码重置成功", `新密码: ${result.password}`);
  
  toast("完成");
  await refreshDirectoryState();
  await loadConfigTab("users");
};

window.removeUser = async (id) => {
  if (!await confirmModal("确认", "确定继续？", "确定")) return;
  await api(`/api/users?id=${id}`, { method: "DELETE" });
  await refreshDirectoryState();
  await loadConfigTab("users");
};

async function renderGroups() {
  const [groups, users, model] = await Promise.all([api("/api/groups"), api("/api/users"), api("/api/windows/model")]);
  state.groups = groups.items;
  state.users = users.items;
  state.windowsModel = model;
  $("groupRows").innerHTML = groups.items.map((g) => {
    const memberIds = new Set(g.members.map((m) => m.id));
    const mapped = model.groups.find((item) => item.id === g.id);
    return `
      <article class="group-card">
        <div class="mapping-line"><span>Windows 组</span><code class="inline-code">${escapeHtml(mapped?.windowsName || "")}</code></div>
        <input value="${escapeAttr(g.name)}" data-group-name="${g.id}">
        <input value="${escapeAttr(g.description)}" data-group-desc="${g.id}">
        <div class="members">
          ${users.items.map((u) => `<label><input type="checkbox" data-group-member="${g.id}" value="${u.id}" ${memberIds.has(u.id) ? "checked" : ""}> ${escapeHtml(u.username)}</label>`).join("")}
        </div>
        <div class="actions"><button onclick="saveGroup(${g.id})">保存成员</button><button class="danger" onclick="removeGroup(${g.id})">删除</button></div>
      </article>`;
  }).join("") || "暂无群组";
}

window.saveGroup = async (id) => {
  const memberIds = [...document.querySelectorAll(`[data-group-member="${id}"]:checked`)].map((el) => Number(el.value));
  await api("/api/groups", {
    method: "PATCH",
    body: JSON.stringify({
      id,
      name: document.querySelector(`[data-group-name="${id}"]`).value,
      description: document.querySelector(`[data-group-desc="${id}"]`).value,
      memberIds
    })
  });
  toast("群组已保存并同步");
  await refreshDirectoryState();
  await loadConfigTab("groups");
};

window.removeGroup = async (id) => {
  if (!await confirmModal("确认", "确定继续？", "确定")) return;
  await api(`/api/groups?id=${id}`, { method: "DELETE" });
  await refreshDirectoryState();
  await loadConfigTab("groups");
};

async function renderPermissions() {
  const [folders, users, groups, model] = await Promise.all([
    api("/api/admin/folders"),
    api("/api/users"),
    api("/api/groups"),
    api("/api/windows/model")
  ]);
  state.users = users.items;
  state.groups = groups.items;
  state.windowsModel = model;
  if (!folders.items.some((item) => item.path === state.selectedPermissionPath)) state.selectedPermissionPath = "/";
  renderPermissionFolders(folders.items);
  await renderPermissionMatrix();
}

async function refreshDirectoryState() {
  const [users, groups] = await Promise.all([api("/api/users"), api("/api/groups")]);
  state.users = users.items;
  state.groups = groups.items;
}

function renderPermissionFolders(items) {
  $("permFolderList").innerHTML = items.map((item) => `
    <button class="folder-row ${item.path === state.selectedPermissionPath ? "active" : ""}" onclick="selectPermissionPath('${escapeAttr(encodeURIComponent(item.path))}')">
      <span style="padding-left:${item.depth * 14}px">${escapeHtml(item.depth === 0 ? item.name : item.name)}</span>
      <code>${escapeHtml(item.path)}</code>
    </button>
  `).join("");
}

window.selectPermissionPath = async (encodedPath) => {
  state.selectedPermissionPath = decodeURIComponent(encodedPath);
  await renderPermissions();
};

async function renderPermissionMatrix() {
  const path = state.selectedPermissionPath || "/";
  $("permCurrentPath").textContent = path;
  const data = await api(`/api/permissions?path=${encodeURIComponent(path)}`);
  const explicit = new Map(data.items.map((item) => [`${item.subject_type}:${item.subject_id}`, item.level]));
  const rows = [
    ...state.groups.map((group) => ({ type: "group", id: group.id, name: group.name, windowsName: state.windowsModel.groups.find((item) => item.id === group.id)?.windowsName || "" })),
    ...state.users.map((user) => ({ type: "user", id: user.id, name: user.username, windowsName: state.windowsModel.users.find((item) => item.id === user.id)?.windowsName || "" }))
  ];
  $("permRows").innerHTML = rows.map((row) => {
    const key = `${row.type}:${row.id}`;
    const level = explicit.get(key) || "inherit";
    const effective = effectivePermissionLabel(row.type, row.id, path, level);
    return `<tr>
      <td>${row.type === "group" ? "群组" : "用户"}</td>
      <td>${escapeHtml(row.name)}</td>
      <td><code class="inline-code">${escapeHtml(row.windowsName)}</code></td>
      <td>
        <select data-perm-subject="${escapeAttr(key)}">
          ${permissionOptions(level)}
        </select>
      </td>
      <td>${escapeHtml(effective)}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="5">暂无用户或群组</td></tr>`;
}

function permissionOptions(current) {
  return [
    ["inherit", "未设置 / 继承"],
    ["none", "无权限"],
    ["read", "只读"],
    ["write", "读写"],
    ["manage", "管理"]
  ].map(([value, label]) => `<option value="${value}" ${current === value ? "selected" : ""}>${label}</option>`).join("");
}

function effectivePermissionLabel(type, id, rel, explicitLevel) {
  if (explicitLevel !== "inherit") return `${levelName(explicitLevel)}（本目录）`;
  const inherited = inheritedPermission(type, id, rel);
  return inherited ? `${levelName(inherited.level)}（继承自 ${inherited.path}）` : "无权限（未设置）";
}

function inheritedPermission(type, id, rel) {
  const ancestors = pathAncestors(rel).filter((item) => item !== rel).reverse();
  for (const path of ancestors) {
    const perm = state.windowsModel.permissions.find((item) => item.path === path && item.subject_type === type && Number(item.subject_id) === Number(id));
    if (perm) return { path, level: perm.level };
  }
  return null;
}

function pathAncestors(rel) {
  const parts = String(rel || "/").split("/").filter(Boolean);
  const out = ["/"];
  let cur = "";
  for (const part of parts) {
    cur += `/${part}`;
    out.push(cur);
  }
  return out;
}

async function renderSettings() {
  const [data, status, addresses, model] = await Promise.all([
    api("/api/settings"),
    api("/api/windows/status"),
    api("/api/network/addresses"),
    api("/api/windows/model")
  ]);
  state.windowsModel = model;
  const form = $("settingsForm");
  form.storagePath.value = data.settings.storagePath || "";
  form.serverHost.value = data.settings.serverHost || "";
  form.shareName.value = data.settings.shareName || "";
  form.smbEnabled.checked = data.settings.smbEnabled === "true";
  form.windowsUserPrefix.value = data.settings.windowsUserPrefix || "os_";
  form.windowsGroupPrefix.value = data.settings.windowsGroupPrefix || "osg_";
  form.windowsMembersGroup.value = data.settings.windowsMembersGroup || "members";
  form.windowsAdminsGroup.value = data.settings.windowsAdminsGroup || "admins";
  form.noAccessAclMode.value = data.settings.noAccessAclMode || "remove";
  form.windowsSyncEnabled.checked = data.settings.windowsSyncEnabled === "true";
  form.createWindowsUsers.checked = data.settings.createWindowsUsers !== "false";
  form.createSmbShare.checked = data.settings.createSmbShare !== "false";
  renderHostAddressSelect(addresses.items || [], data.settings.serverHost || "");
  renderAclModelSummary(model);
  $("windowsStatus").textContent = `${status.message}\n共享目录: ${status.storageRoot}\nSMB: \\\\${data.settings.serverHost || "server"}\\${data.settings.shareName || "TeamShare"}`;
  renderMount(data.settings);
  await renderStorageStatus();
}

function renderAclModelSummary(model) {
  $("aclModelSummary").innerHTML = `
    <div class="model-card"><span>SMB 共享层</span><strong>${escapeHtml(model.sharePrincipal)}: Full Control</strong></div>
    <div class="model-card"><span>成员系统组</span><strong>${escapeHtml(model.membersGroup)}</strong></div>
    <div class="model-card"><span>管理员系统组</span><strong>${escapeHtml(model.adminsGroup)}</strong></div>
    <div class="model-card"><span>无权限处理</span><strong>${model.noAccessAclMode === "deny" ? "显式拒绝" : "移除授权"}</strong></div>`;
}

function renderHostAddressSelect(items, current) {
  const select = $("hostAddressSelect");
  const options = [`<option value="">手动输入</option>`].concat(
    items.map((item) => `<option value="${escapeAttr(item.address)}" ${item.address === current ? "selected" : ""}>${escapeHtml(item.address)} - ${escapeHtml(item.name)}</option>`)
  );
  select.innerHTML = options.join("");
}

function renderMount(settings) {
  const host = settings.serverHost || "192.168.1.100";
  const share = settings.shareName || "TeamShare";
  const userPrefix = settings.windowsUserPrefix || "os_";
  $("winMount").textContent = `net use Z: \\\\${host}\\${share} /user:${userPrefix}username password`;
  $("macMount").textContent = `smb://${host}/${share}`;
}

async function renderStorageStatus() {
  const data = await api("/api/storage/status");
  $("storageStatus").textContent = [
    `Web 管理目录: ${data.storageRoot}`,
    `SMB 共享路径: ${data.smbPath || "未检测到共享"}`,
    `路径一致: ${data.samePath ? "是" : "否"}`,
    `共享访问枚举: ${data.smbMode || "-"}`,
    `可显示顶层项目: ${data.topItems.length ? data.topItems.map((item) => `${item.type === "folder" ? "[文件夹]" : "[文件]"} ${item.name}`).join("; ") : "无"}`,
    `系统目录: ${data.systemItems.length ? data.systemItems.map((item) => item.name).join("; ") : "无"}`,
    "",
    data.note
  ].join("\n");
}

async function renderSettingsLogs() {
  const data = await api("/api/logs?limit=200&scope=mine");
  $("settingsLogRows").innerHTML = data.items.map((row) => `<tr><td>${row.created_at}</td><td>${escapeHtml(row.username)}</td><td>${escapeHtml(row.action)}</td><td>${escapeHtml(row.target)}</td><td>${escapeHtml(row.detail)}</td></tr>`).join("");
}

async function renderTemplates() {
  const data = await api("/api/templates");
  if (!state.selectedTemplate && data.items.length) state.selectedTemplate = data.items[0];
  $("templateRows").innerHTML = data.items.map((template) => `
    <article class="template-card">
      <div class="template-head">
        <div>
          <h3>${escapeHtml(template.name)}</h3>
          <p>${escapeHtml(template.description)}</p>
        </div>
        <div class="actions">
          <button onclick="selectTemplate('${escapeAttr(template.id)}')">编辑</button>
          <button onclick="copyTemplate('${escapeAttr(template.id)}')">复制</button>
          <button onclick="applyTemplate('${escapeAttr(template.id)}')">应用模板</button>
          <button class="danger" onclick="deleteTemplate('${escapeAttr(template.id)}')">删除</button>
        </div>
      </div>
      <div class="template-columns">
        <div>
          <strong>推荐群组</strong>
          <ul>${template.groups.map((group) => `<li>${escapeHtml(group.name)}</li>`).join("")}</ul>
        </div>
        <div>
          <strong>顶层目录</strong>
          <ul>${template.folders.filter((folder) => folder.path.split("/").filter(Boolean).length === 1).map((folder) => `<li>${escapeHtml(folder.path)}</li>`).join("")}</ul>
        </div>
        <div>
          <strong>基础权限</strong>
          <ul>${template.permissions.slice(0, 8).map((permission) => `<li>${escapeHtml(permission.path)} / ${escapeHtml(permission.groupKey)} / ${levelName(permission.level)}</li>`).join("")}</ul>
        </div>
      </div>
    </article>`).join("");
  if (state.selectedTemplate) {
    const current = data.items.find((item) => item.id === state.selectedTemplate.id) || data.items[0];
    state.selectedTemplate = current || null;
    $("templateEditor").definition.value = current ? JSON.stringify(stripTemplateRuntimeFields(current), null, 2) : "";
  }
}

window.selectTemplate = async (templateId) => {
  const data = await api("/api/templates");
  state.selectedTemplate = data.items.find((item) => item.id === templateId) || null;
  await renderTemplates();
};

window.copyTemplate = async (templateId) => {
  await api("/api/templates/copy", { method: "POST", body: JSON.stringify({ templateId }) });
  toast("完成");
  state.selectedTemplate = null;
  await renderTemplates();
};

window.deleteTemplate = async (templateId) => {
  if (!await confirmModal("确认", "确定继续？", "确定")) return;
  await api(`/api/templates?id=${encodeURIComponent(templateId)}`, { method: "DELETE" });
  toast("完成");
  state.selectedTemplate = null;
  await renderTemplates();
};

window.applyTemplate = async (templateId) => {
  if (!await confirmModal("应用模板", "应用目录模板会创建目录、群组和推荐权限。已有数据不会清空。继续？", "应用")) return;
  toast("正在应用模板并同步 Windows...");
  const result = await api("/api/templates/apply", { method: "POST", body: JSON.stringify({ templateId }) });
  $("syncResult").textContent = `模板已应用\n创建目录: ${result.createdFolders.length}\n创建群组: ${result.createdGroups.length}\n写入权限: ${result.savedPermissions.length}`;
  toast("完成");
  await refreshDirectoryState();
  await renderTemplates();
};

function stripTemplateRuntimeFields(template) {
  const { updatedAt, ...clean } = template;
  return clean;
}

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("loginError").textContent = "";
  const form = new FormData(event.currentTarget);
  try {
    const { user } = await api("/api/login", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) });
    state.user = user;
    showApp();
    await ensurePasswordChanged();
    await loadView("dashboard");
  } catch (error) {
    $("loginError").textContent = error.message;
  }
});

$("logout").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  showLogin();
});

document.querySelectorAll(".nav").forEach((button) => {
  button.addEventListener("click", () => loadView(button.dataset.view).catch((error) => toast(error.message)));
});

document.querySelectorAll("[data-settings-tab]").forEach((button) => {
  button.addEventListener("click", () => loadSettingsTab(button.dataset.settingsTab).catch((error) => toast(error.message)));
});

document.querySelectorAll("[data-config-tab]").forEach((button) => {
  button.addEventListener("click", () => loadConfigTab(button.dataset.configTab).catch((error) => toast(error.message)));
});
// skipped damaged text

$("fileSearchInput").addEventListener("input", (event) => {
  state.fileSearch = String(event.target.value || "");
  if (state.fileSearchTimer) clearTimeout(state.fileSearchTimer);
  state.fileSearchTimer = setTimeout(() => {
    applyFileSearch(state.fileSearch).catch((error) => toast(error.message));
  }, 220);
});

$("fileSearchInput").addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  event.preventDefault();
  if (state.fileSearchTimer) clearTimeout(state.fileSearchTimer);
  state.fileSearchSeq++;
  state.fileSearch = "";
  event.currentTarget.value = "";
  applyFileSearch("").catch((error) => toast(error.message));
});
$("fileSearchToggle").addEventListener("click", () => $("fileSearchInput").focus());

$("passwordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form));
  if (!payload.currentPassword) {
    toast("完成");
    return;
  }
  if (!payload.password || payload.password.length < 6) {
    toast("完成");
    return;
  }
  if (payload.password !== payload.confirmPassword) {
    toast("完成");
    return;
  }
  setBusy(form, true, "正在修改密码并同步 Windows...");
  try {
    const result = await api("/api/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword: payload.currentPassword, password: payload.password })
    });
    $("title").textContent = "文件管理";
    form.reset();
    state.user.mustChangePassword = false;
    toast("密码已修改并生效");
  } finally {
    setBusy(form, false);
  }
});

$("userForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form));
  setBusy(form, true, "正在创建用户并同步 Windows...");
  try {
    await api("/api/users", { method: "POST", body: JSON.stringify(payload) });
    form.reset();
    await refreshDirectoryState();
    await loadConfigTab("users");
    toast("用户已创建并刷新");
  } finally {
    setBusy(form, false);
  }
});

$("groupForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form));
  setBusy(form, true, "正在创建群组并同步 Windows...");
  try {
    await api("/api/groups", { method: "POST", body: JSON.stringify(payload) });
    form.reset();
    await refreshDirectoryState();
    await loadConfigTab("groups");
    toast("群组已创建并刷新");
  } finally {
    setBusy(form, false);
  }
});

$("templateEditor").addEventListener("submit", async (event) => {
  event.preventDefault();
  let template;
  try {
    template = JSON.parse(event.currentTarget.definition.value);
  } catch {
    toast("模板 JSON 格式无效");
    return;
  }
  await api("/api/templates", { method: "POST", body: JSON.stringify({ template }) });
  toast("完成");
  state.selectedTemplate = template;
  await renderTemplates();
});

$("newTemplateBtn").addEventListener("click", () => {
  const template = {
    id: `custom-${Date.now()}`,
    name: "自定义模板",
    description: "",
    groups: [],
    folders: [],
    permissions: []
  };
  state.selectedTemplate = template;
  $("templateEditor").definition.value = JSON.stringify(template, null, 2);
});

$("exportTemplateBtn").addEventListener("click", async () => {
  await copyText($("templateEditor").definition.value);
  toast("完成");
});

$("refreshPermFoldersBtn").addEventListener("click", () => renderPermissions().catch((error) => toast(error.message)));

$("savePermissionMatrixBtn").addEventListener("click", async () => {
  const entries = [...document.querySelectorAll("[data-perm-subject]")].map((select) => {
    const [subjectType, subjectId] = select.dataset.permSubject.split(":");
    return { subjectType, subjectId: Number(subjectId), level: select.value };
  });
  $("permSyncResult").textContent = "正在保存并同步 Windows ACL...";
  try {
    const result = await api("/api/permissions/bulk", {
      method: "POST",
      body: JSON.stringify({ path: state.selectedPermissionPath, entries })
    });
    $("title").textContent = "文件管理";
    if (result.syncResult) {
      $("permSyncResult").textContent = formatSyncResult(result.syncResult);
    } else {
      $("permSyncResult").textContent = "保存完成";
    }
    toast("完成");
    await renderPermissions();
  } catch (error) {
    $("permSyncResult").textContent = error.message;
    toast("目录权限保存失败");
  }
});

$("settingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = Object.fromEntries(form);
  payload.smbEnabled = event.currentTarget.smbEnabled.checked ? "true" : "false";
  payload.windowsSyncEnabled = event.currentTarget.windowsSyncEnabled.checked ? "true" : "false";
  payload.createWindowsUsers = event.currentTarget.createWindowsUsers.checked ? "true" : "false";
  payload.createSmbShare = event.currentTarget.createSmbShare.checked ? "true" : "false";
  await api("/api/settings", { method: "PATCH", body: JSON.stringify(payload) });
  toast("服务器配置已保存");
  await renderSettings();
});

$("hostAddressSelect").addEventListener("change", (event) => {
  if (event.target.value) $("settingsForm").serverHost.value = event.target.value;
});

$("syncWindowsBtn").addEventListener("click", async () => {
  if (!await confirmModal("同步 Windows", "将应用用户、群组、文件夹权限同步到 Windows 本地账户、组、SMB 共享和 NTFS ACL。继续？", "同步")) return;
  $("syncResult").textContent = "同步中...";
  try {
    const result = await api("/api/windows/sync", { method: "POST", body: JSON.stringify({}) });
    $("syncResult").textContent = formatSyncResult(result);
    toast("Windows 同步完成");
    await renderSettings();
  } catch (error) {
    $("syncResult").textContent = error.message;
    toast("Windows 同步失败");
  }
});

$("restartElevatedBtn").addEventListener("click", async () => {
  if (!await confirmModal("确认", "确定继续？", "确定")) return;
  try {
    const result = await api("/api/admin/restart-elevated", { method: "POST", body: JSON.stringify({}) });
    toast(result.message || "已请求管理员权限重启");
    $("title").textContent = "文件管理";
  } catch (error) {
    $("syncResult").textContent = error.message;
    toast("完成");
  }
});

$("copyConnectCommandBtn").addEventListener("click", async () => {
  if (!state.connect) await renderConnect();
  await copyText(state.connect.command);
  toast("完成");
});

$("downloadConnectBatBtn").addEventListener("click", async () => {
  if (!state.connect) await renderConnect();
  downloadText("OfficeShare-map-drive.bat", state.connect.bat, "application/octet-stream");
});

function formatSyncResult(result) {
  const lines = [result.summary || ""];
  for (const step of result.steps || []) {
    const status = step.ok ? "OK" : step.allowedFailure ? "SKIP" : "FAIL";
    lines.push(`${status} ${step.title}`);
    if (!step.ok && !step.allowedFailure && (step.stderr || step.stdout)) lines.push(step.stderr || step.stdout);
    if (!step.ok && step.allowedFailure && (step.stderr || step.stdout)) lines.push(`  ${step.stderr || step.stdout}`);
  }
  return lines.join("\n");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

function downloadText(filename, text, mime) {
  const blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function setBusy(form, busy, message = "") {
  if (message) toast(message);
  [...form.elements].forEach((element) => {
    element.disabled = busy;
  });
}

function openModal(title, bodyHtml, actions) {
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = bodyHtml;
  $("modalActions").innerHTML = actions || "";
  $("modalOverlay").classList.remove("hidden");
}

function closeModal(resolveCancel = true) {
  if (resolveCancel && activeModalCancel) {
    const cancel = activeModalCancel;
    activeModalCancel = null;
    cancel();
  }
  $("modalOverlay").classList.add("hidden");
  $("modalTitle").textContent = "";
  $("modalBody").innerHTML = "";
  $("modalActions").innerHTML = "";
}

function inputModal(title, label, value = "") {
  return new Promise((resolve) => {
    activeModalCancel = () => resolve("");
    openModal(title, `<label class="modal-field">${escapeHtml(label)}<input id="modalInput" value="${escapeAttr(value)}"></label>`, `
      <button type="button" class="muted-button" data-modal-cancel>取消</button>
      <button type="button" data-modal-ok>确定</button>
    `);
    const input = $("modalInput");
    input.focus();
    input.select();
    document.querySelector("[data-modal-cancel]").onclick = () => { closeModal(); };
    document.querySelector("[data-modal-ok]").onclick = () => { const result = input.value.trim(); activeModalCancel = null; closeModal(false); resolve(result); };
    input.onkeydown = (event) => {
      if (event.key === "Enter") document.querySelector("[data-modal-ok]").click();
      if (event.key === "Escape") document.querySelector("[data-modal-cancel]").click();
    };
  });
}

function confirmModal(title, message, okText = "纭畾") {
  return new Promise((resolve) => {
    activeModalCancel = () => resolve(false);
    openModal(title, `<p class="modal-message">${escapeHtml(message)}</p>`, `
      <button type="button" class="muted-button" data-modal-cancel>取消</button>
      <button type="button" class="danger" data-modal-ok>${escapeHtml(okText)}</button>
    `);
    document.querySelector("[data-modal-cancel]").onclick = () => { closeModal(); };
    document.querySelector("[data-modal-ok]").onclick = () => { activeModalCancel = null; closeModal(false); resolve(true); };
  });
}

function messageModal(title, message) {
  return new Promise((resolve) => {
    activeModalCancel = () => resolve();
    openModal(title, `<pre class="modal-message">${escapeHtml(message)}</pre>`, `<button type="button" data-modal-ok>确定</button>`);
    document.querySelector("[data-modal-ok]").onclick = () => { activeModalCancel = null; closeModal(false); resolve(); };
  });
}

async function directoryModal(title, helpText) {
  let tree = await api("/api/folder-tree");
  let selected = state.path;
  return new Promise((resolve) => {
    activeModalCancel = () => resolve("");
    const actions = () => `
      <button type="button" class="muted-button" data-modal-new-folder>新建文件夹</button>
      <span class="modal-spacer"></span>
      <button type="button" class="muted-button" data-modal-cancel>取消</button>
      <button type="button" data-modal-ok>${escapeHtml(title)}</button>
    `;
    const bind = () => {
      document.querySelectorAll("[data-dir-choice]").forEach((button) => {
        button.onclick = () => {
          selected = decodeURIComponent(button.dataset.dirChoice);
          render();
        };
      });
      document.querySelector("[data-modal-cancel]").onclick = () => { closeModal(); };
      document.querySelector("[data-modal-ok]").onclick = () => { activeModalCancel = null; closeModal(false); resolve(selected); };
      document.querySelector("[data-modal-new-folder]").onclick = async () => {
        const name = await inputModal("输入名称", "名称", "新建项目");
        activeModalCancel = () => resolve("");
        openModal(title, "", actions());
        if (name) {
          await apiWithNameConflict(
            () => api("/api/folder", { method: "POST", body: JSON.stringify({ path: selected, name }) }),
            () => api("/api/folder", { method: "POST", body: JSON.stringify({ path: selected, name, conflict: "rename" }) }),
            { title: "文件夹已存在", name, allowVersion: false }
          );
          tree = await api("/api/folder-tree");
        }
        render();
      };
    };
    const render = () => {
      $("modalBody").innerHTML = `
        <p class="modal-message">${escapeHtml(helpText)}</p>
        <div id="modalDirectoryTree" class="modal-directory-tree">${renderDirectoryChoice(tree.root, selected, 0)}</div>
        <p class="modal-current">当前目录: <code>${escapeHtml(selected)}</code></p>
      `;
      bind();
    };
    openModal(title, "", actions());
    render();
  });
}

function renderDirectoryChoice(node, selected, depth) {
  const active = node.path === selected ? "active" : "";
  return `
    <button class="directory-choice ${active}" data-dir-choice="${escapeAttr(encodeURIComponent(node.path))}" style="padding-left:${12 + depth * 18}px">
      <span>${icon("folder", "ui-icon")}</span><span>${escapeHtml(node.name)}</span>
    </button>
    ${(node.children || []).map((child) => renderDirectoryChoice(child, selected, depth + 1)).join("")}
  `;
}

$("modalCloseBtn").addEventListener("click", closeModal);
$("modalOverlay").addEventListener("click", (event) => {
  if (event.target === $("modalOverlay")) closeModal();
});

bootstrap();



