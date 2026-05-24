@echo off
echo ========================================
echo   LANOffice 打包脚本
echo ========================================
echo.

echo [1/4] 检查 Node.js...
node --version
if %errorlevel% neq 0 (
    echo 错误: 未找到 Node.js
    pause
    exit /b 1
)

echo.
echo [2/4] 安装 pkg (如需要)...
npm list -g pkg >nul 2>&1
if %errorlevel% neq 0 (
    echo 正在安装 pkg...
    npm install -g pkg
)

echo.
echo [3/4] 开始打包...
pkg -t node22-win-x64 -o LANOffice.exe server.js

if %errorlevel% neq 0 (
    echo 打包失败！
    pause
    exit /b 1
)

echo.
echo [4/4] 准备发布包...
if not exist "release" mkdir release
copy /Y LANOffice.exe release\ >nul
xcopy /E /I /Y public release\public\ >nul
copy /Y README.md release\ >nul 2>&1

echo.
echo ========================================
echo   打包完成！
echo ========================================
echo.
echo 发布包在 release 目录中：
echo   LANOffice.exe
echo   public/
echo.
echo 使用时请将整个 release 文件夹一起发布！
echo.
pause
