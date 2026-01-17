@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

REM Overpass API 端点
set "OVERPASS_API=https://overpass-api.de/api/interpreter"

REM 输出文件
set "OUTPUT_FILE=POI.json"
set "TEMP_FILE=POI.json.tmp"

REM 查询文件
set "QUERY_FILE=Overpass.txt"

echo 正在从 Overpass API 获取数据...
echo 查询内容来自: %QUERY_FILE%
echo 输出文件: %OUTPUT_FILE%
echo.

REM 检查 curl 是否可用
where curl >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo 错误: 未找到 curl 命令
    echo 请确保安装了 curl 或使用 Windows 10/11
    pause
    exit /b 1
)

REM 检查查询文件是否存在
if not exist "%QUERY_FILE%" (
    echo 错误: 找不到 %QUERY_FILE% 文件
    pause
    exit /b 1
)

REM 使用 curl 发送 POST 请求到临时文件
curl -X POST "%OVERPASS_API%" ^
  -H "Content-Type: application/x-www-form-urlencoded" ^
  --data-urlencode "data@%QUERY_FILE%" ^
  -o "%TEMP_FILE%" ^
  --progress-bar

REM 检查curl是否执行成功
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ✗ 网络请求失败！
    echo 请检查网络连接或 Overpass API 是否可用
    del "%TEMP_FILE%" 2>nul
    pause
    exit /b 1
)

REM 检查文件是否存在
if not exist "%TEMP_FILE%" (
    echo.
    echo ✗ 文件不存在！
    echo Overpass API 可能返回了错误
    pause
    exit /b 1
)

REM 检查文件大小是否为0
for %%A in ("%TEMP_FILE%") do set "FILE_SIZE=%%~zA"
if %FILE_SIZE% EQU 0 (
    echo.
    echo ✗ 文件为空！
    echo Overpass API 可能返回了错误
    del "%TEMP_FILE%" 2>nul
    pause
    exit /b 1
)

REM 检查是否为有效的JSON格式（包含elements数组）
findstr /C:"\"elements\"" "%TEMP_FILE%" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ✗ 返回的数据格式无效！
    echo 文件内容前几行：
    more +1 "%TEMP_FILE%" | findstr /N "^" | findstr "^[1-5]:"
    del "%TEMP_FILE%" 2>nul
    pause
    exit /b 1
)

REM 统计元素数量（简单计数type出现次数）
for /f %%C in ('findstr /R /C:"\"type\"" "%TEMP_FILE%" ^| find /C "\""') do set "ELEMENT_COUNT=%%C"

REM 检查是否有数据
if %ELEMENT_COUNT% EQU 0 (
    echo.
    echo ⚠ 警告: 没有找到任何POI数据！
    echo 请检查 Overpass.txt 中的查询条件
    del "%TEMP_FILE%" 2>nul
    pause
    exit /b 1
)

REM 所有检查通过，用临时文件替换正式文件
move /Y "%TEMP_FILE%" "%OUTPUT_FILE%" >nul

REM 显示成功信息
echo.
echo ✓ 数据验证通过！
echo ✓ 已更新文件: %OUTPUT_FILE%

REM 显示文件信息
set /a "FILE_SIZE_KB=%FILE_SIZE% / 1024"
echo ✓ 文件大小: %FILE_SIZE_KB% KB

REM 显示元素数量
set /a "ELEMENT_COUNT=%ELEMENT_COUNT% / 2"
echo ✓ 元素数量: 约 %ELEMENT_COUNT% 个

echo.
echo 数据已更新，请刷新网页查看最新内容

echo.
pause
