@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

REM 切换到脚本所在目录
cd /d "%~dp0"

REM GitHub 仓库信息
set "GITHUB_USER=HaoTian22"
set "GITHUB_REPO=BNBU-Map"
set "GITHUB_BRANCH=main"
set "GITHUB_RAW_URL=https://raw.githubusercontent.com/%GITHUB_USER%/%GITHUB_REPO%/%GITHUB_BRANCH%"

REM 配置文件
set "CONFIG_FILE=files-to-update.txt"

REM 添加时间戳
for /f "tokens=1-4 delims=/ " %%a in ("%date%") do (
    set "DATE=%%a-%%b-%%c"
)
for /f "tokens=1-2 delims=: " %%a in ("%time%") do (
    set "TIME=%%a:%%b"
)
set "TIMESTAMP=%DATE% %TIME%"

echo [%TIMESTAMP%] 开始从 GitHub 更新文件...
echo [%TIMESTAMP%] 仓库: %GITHUB_USER%/%GITHUB_REPO%
echo [%TIMESTAMP%] 分支: %GITHUB_BRANCH%
echo.

REM 检查 curl 是否可用
where curl >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [%TIMESTAMP%] 错误: 未找到 curl 命令
    echo [%TIMESTAMP%] 请确保安装了 curl 或使用 Windows 10/11
    pause
    exit /b 1
)

REM 检查配置文件并读取文件列表
if not exist "%CONFIG_FILE%" (
    echo [%TIMESTAMP%] 警告: 配置文件 %CONFIG_FILE% 不存在
    echo [%TIMESTAMP%] 使用默认文件列表
    set "FILES=index.html fetch-poi.sh fetch-poi.bat Overpass.txt update-from-github.sh update-from-github.bat"
) else (
    echo [%TIMESTAMP%] 从配置文件读取更新列表: %CONFIG_FILE%
    REM 读取文件列表（忽略注释和空行）
    set "FILES="
    for /f "usebackq tokens=* delims=" %%a in ("%CONFIG_FILE%") do (
        set "LINE=%%a"
        REM 跳过注释行和空行
        if not "!LINE:~0,1!"=="#" if not "!LINE!"=="" (
            set "FILES=!FILES! %%a"
        )
    )
    echo [%TIMESTAMP%] 已读取文件列表
    echo.
)

REM 创建备份目录
for /f "tokens=1-6 delims=/:. " %%a in ("%date% %time%") do (
    set "BACKUP_DIR=backups\%%a%%b%%c_%%d%%e%%f"
)
mkdir "%BACKUP_DIR%" 2>nul

REM 统计更新结果
set "SUCCESS_COUNT=0"
set "FAIL_COUNT=0"
set "SKIP_COUNT=0"

REM 更新每个文件
for %%F in (%FILES%) do (
    echo [%TIMESTAMP%] 处理文件: %%F
    
    REM 备份现有文件
    if exist "%%F" (
        copy "%%F" "%BACKUP_DIR%\%%F" >nul 2>&1
        echo [%TIMESTAMP%]   已备份到: %BACKUP_DIR%\%%F
    )
    
    REM 下载新文件到临时位置
    set "TEMP_FILE=%%F.tmp"
    curl -f -s -S -L "%GITHUB_RAW_URL%/%%F" -o "%%F.tmp" --max-time 30
    
    if !ERRORLEVEL! EQU 0 (
        REM 检查下载的文件是否为空
        for %%A in ("%%F.tmp") do set "FILE_SIZE=%%~zA"
        
        if !FILE_SIZE! GTR 0 (
            REM 如果本地文件存在，比较是否有变化
            if exist "%%F" (
                fc /b "%%F" "%%F.tmp" >nul 2>&1
                if !ERRORLEVEL! EQU 0 (
                    echo [%TIMESTAMP%]   ⊙ 文件无变化，跳过更新
                    del "%%F.tmp" 2>nul
                    set /a "SKIP_COUNT=!SKIP_COUNT! + 1"
                ) else (
                    move /Y "%%F.tmp" "%%F" >nul
                    echo [%TIMESTAMP%]   ✓ 文件已更新
                    set /a "SUCCESS_COUNT=!SUCCESS_COUNT! + 1"
                )
            ) else (
                move /Y "%%F.tmp" "%%F" >nul
                echo [%TIMESTAMP%]   ✓ 文件已创建
                set /a "SUCCESS_COUNT=!SUCCESS_COUNT! + 1"
            )
        ) else (
            echo [%TIMESTAMP%]   ✗ 下载的文件为空
            del "%%F.tmp" 2>nul
            set /a "FAIL_COUNT=!FAIL_COUNT! + 1"
        )
    ) else (
        echo [%TIMESTAMP%]   ✗ 下载失败
        del "%%F.tmp" 2>nul
        set /a "FAIL_COUNT=!FAIL_COUNT! + 1"
    )
    echo.
)

REM 显示更新摘要
echo [%TIMESTAMP%] ================================
echo [%TIMESTAMP%] 更新完成！
echo [%TIMESTAMP%] 成功更新: %SUCCESS_COUNT% 个文件
echo [%TIMESTAMP%] 跳过更新: %SKIP_COUNT% 个文件（无变化）
echo [%TIMESTAMP%] 更新失败: %FAIL_COUNT% 个文件
echo [%TIMESTAMP%] 备份位置: %BACKUP_DIR%
echo [%TIMESTAMP%] ================================

REM 如果有更新成功的文件，建议刷新网页
if %SUCCESS_COUNT% GTR 0 (
    echo [%TIMESTAMP%] 提示: 请刷新网页查看最新内容
)

echo.
pause
