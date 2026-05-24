# LANOffice

面向 20 人以内小团队的局域网轻量办公文件协作服务器。文件保存在 Windows 本机目录中，Web 负责用户、群组、权限、目录模板、回收站和审计管理，SMB 负责映射为网络驱动器。

## 启动

```powershell
npm start
```

默认地址：

```text
http://localhost:8080
```

默认管理员：

```text
admin / admin123
```

## 主要功能

- 文件工作台：概览、文件浏览、上传、下载、回收站
- 连接向导：按当前登录用户生成 Windows 映射网络驱动器命令和 `.bat` 脚本
- 服务器配置：共享目录、SMB、Windows 同步、NTFS ACL 策略
- 用户管理：应用用户到 Windows 本地用户映射
- Web/SMB 密码重置：管理员可让 Web 密码和 Windows 本地用户密码一起更新
- 群组管理：应用群组到 Windows 本地组映射
- 权限管理：文件夹级权限同步为 NTFS ACL
- 目录模板：可编辑、复制、删除、导入/导出 JSON，并一键应用
- 操作日志和登录日志

## 权限模型

- SMB 共享层只放行认证用户：`Authenticated Users: Full Control`
- 细粒度访问控制由 NTFS ACL 决定
- 所有启用用户加入成员系统组，默认 `osg_members`
- 管理员用户加入管理员系统组，默认 `osg_admins`
- 成员系统组在共享根目录只有遍历/列出权限，不向子目录继承
- 应用群组权限同步为 Windows 本地组 ACL
- “无权限”默认只移除显式授权；必要时可切换为“显式拒绝”
- 权限同步以文件夹为单位，暂不做单文件 ACL

## 连接向导

用户侧“连接”页会按当前登录用户生成命令：

```bat
net use G: \\192.168.3.27\TeamShare /user:os_username * /persistent:yes
```

密码使用 `*`，Windows 会提示输入密码，避免明文出现在命令或脚本中。页面也可以下载 `.bat` 脚本。

这里输入的是 Windows/SMB 映射账号密码。管理员可在“服务器配置 / 用户”中为用户填写新密码并点击“重置密码”，系统会同时更新 Web 登录密码和 Windows 本地用户密码。

## 目录模板

内置“小团队标准文件结构”模板，包含：

- `Public_公共资料`
- `Departments_部门文件`
- `Projects_项目文件`
- `Clients_客户资料`
- `Contracts_合同报价`
- `Assets_素材库`
- `Delivery_交付归档`
- `Temp_临时交换`

模板支持：

- 新建模板
- 编辑模板 JSON
- 复制模板
- 删除模板
- 复制导出 JSON
- 一键应用模板

应用模板会创建目录、推荐群组和基础权限。已有目录和群组会保留，不会清空数据。

## 数据位置

- SQLite 数据库：`data/fileshare.db`
- 默认文件根目录：`storage/files`
- 默认回收站目录：`storage/files/.trash`

管理员可以在“服务器配置 / 服务器”里修改本地共享文件夹地址。

## SMB 使用建议

Windows 同步需要服务进程以管理员身份运行，否则 Windows 会拒绝创建本地用户、组、SMB 共享和修改 NTFS ACL。

建议流程：

1. 以管理员身份启动 LANOffice，或在服务器配置页点击“以管理员权限重启服务”。
2. 启用“保存用户、群组、权限时同步 Windows”。
3. 创建应用用户，系统会创建映射 Windows 本地用户，例如 `os_zhangsan`。
4. 创建应用群组，系统会创建映射 Windows 本地组，例如 `osg_finance`。
5. 保存文件夹权限，系统会用 `icacls` 写入对应目录 ACL。
6. 用户在“连接”页复制命令或下载 `.bat` 脚本映射网络驱动器。
