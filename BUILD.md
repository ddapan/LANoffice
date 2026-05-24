# 打包指南

## 方法一：使用脚本（推荐）

双击运行 `build.bat` 即可完成打包。

## 方法二：手动打包

### 1. 安装 pkg

```bash
npm install -g pkg
```

### 2. 执行打包

```bash
npm run pkg
```

### 3. 准备发布包

将以下文件放到同一个文件夹：

```
LANOffice/
├── LANOffice.exe
└── public/              (必须和 exe 同目录)
```

---

## 发布包结构

```
LANOffice/
├── LANOffice.exe        (主程序)
├── public/              (前端资源)
└── data/                (运行后自动生成)
    ├── fileshare.db
    └── server.log
```

---

## 运行说明

1. 双击 `LANOffice.exe`
2. 浏览器会自动打开 `http://localhost:8080`
3. 默认账号：`admin` / 密码：`admin123`

---

## 注意事项

- `public` 文件夹必须和 `LANOffice.exe` 放在同一个目录
- 首次运行会自动在用户目录下生成 `.lanoffice` 文件夹存放数据
- 建议以管理员身份运行以便配置 SMB 和 NTFS 权限
