#!/bin/bash

# 切换到脚本所在目录
cd "$(dirname "$0")" || exit 1

# GitHub 仓库信息
GITHUB_USER="HaoTian22"
GITHUB_REPO="BNBU-Map"
GITHUB_BRANCH="main"
GITHUB_RAW_URL="https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}"

# 配置文件
CONFIG_FILE="files-to-update.txt"

# 添加时间戳用于日志
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$TIMESTAMP] 开始从 GitHub 更新文件..."
echo "[$TIMESTAMP] 仓库: ${GITHUB_USER}/${GITHUB_REPO}"
echo "[$TIMESTAMP] 分支: ${GITHUB_BRANCH}"
echo ""

# 第一步：从 GitHub 更新文件列表
echo "[$TIMESTAMP] 第一步：从 GitHub 更新配置文件 $CONFIG_FILE ..."
CONFIG_TEMP="${CONFIG_FILE}.tmp"
if curl -f -s -S -L "${GITHUB_RAW_URL}/${CONFIG_FILE}" -o "$CONFIG_TEMP" --max-time 30 && [ -s "$CONFIG_TEMP" ]; then
  if [ -f "$CONFIG_FILE" ] && cmp -s "$CONFIG_FILE" "$CONFIG_TEMP"; then
    echo "[$TIMESTAMP]   ⊙ 配置文件无变化"
    rm -f "$CONFIG_TEMP"
  else
    mv "$CONFIG_TEMP" "$CONFIG_FILE"
    echo "[$TIMESTAMP]   ✓ 配置文件已更新"
  fi
else
  rm -f "$CONFIG_TEMP"
  echo "[$TIMESTAMP]   ✗ 配置文件下载失败，使用本地现有版本"
fi
echo ""

# 第二步：从（已更新的）配置文件读取文件列表
echo "[$TIMESTAMP] 第二步：读取文件列表并更新各文件..."
if [ ! -f "$CONFIG_FILE" ]; then
  echo "[$TIMESTAMP] 警告: 配置文件 $CONFIG_FILE 不存在，使用默认文件列表"
  # 默认文件列表
  FILES_TO_UPDATE=(
    "index.html"
    "fetch-poi.sh"
    "fetch-poi.bat"
    "Overpass.txt"
    "update-from-github.sh"
    "update-from-github.bat"
  )
else
  # 从配置文件读取，忽略注释和空行
  mapfile -t FILES_TO_UPDATE < <(grep -v '^#' "$CONFIG_FILE" | grep -v '^[[:space:]]*$' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  echo "[$TIMESTAMP] 找到 ${#FILES_TO_UPDATE[@]} 个文件需要检查"
  echo ""
fi

# 创建备份目录
BACKUP_DIR="backups/$(date '+%Y%m%d_%H%M%S')"
mkdir -p "$BACKUP_DIR"

# 统计更新结果
SUCCESS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

# 下载并更新每个文件（跳过已在第一步更新的配置文件）
for FILE in "${FILES_TO_UPDATE[@]}"; do
  # 配置文件已在第一步更新，跳过
  if [ "$FILE" = "$CONFIG_FILE" ]; then
    echo "[$TIMESTAMP] 跳过文件: $FILE（已在第一步更新）"
    SKIP_COUNT=$((SKIP_COUNT + 1))
    echo ""
    continue
  fi

  echo "[$TIMESTAMP] 处理文件: $FILE"
  
  # 检查本地文件是否存在
  if [ -f "$FILE" ]; then
    # 备份现有文件
    cp "$FILE" "$BACKUP_DIR/$FILE"
    echo "[$TIMESTAMP]   已备份到: $BACKUP_DIR/$FILE"
  fi
  
  # 下载新文件到临时位置
  TEMP_FILE="${FILE}.tmp"
  if curl -f -s -S -L "${GITHUB_RAW_URL}/${FILE}" -o "$TEMP_FILE" --max-time 30; then
    # 检查下载的文件是否为空
    if [ -s "$TEMP_FILE" ]; then
      # 如果本地文件存在，比较是否有变化
      if [ -f "$FILE" ]; then
        if cmp -s "$FILE" "$TEMP_FILE"; then
          echo "[$TIMESTAMP]   ⊙ 文件无变化，跳过更新"
          rm -f "$TEMP_FILE"
          SKIP_COUNT=$((SKIP_COUNT + 1))
        else
          mv "$TEMP_FILE" "$FILE"
          echo "[$TIMESTAMP]   ✓ 文件已更新"
          SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
          
          # 如果是脚本文件，添加执行权限
          if [[ "$FILE" == *.sh ]]; then
            chmod +x "$FILE"
            echo "[$TIMESTAMP]   ✓ 已添加执行权限"
          fi
        fi
      else
        # 本地文件不存在，直接保存
        mv "$TEMP_FILE" "$FILE"
        echo "[$TIMESTAMP]   ✓ 文件已创建"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        
        # 如果是脚本文件，添加执行权限
        if [[ "$FILE" == *.sh ]]; then
          chmod +x "$FILE"
          echo "[$TIMESTAMP]   ✓ 已添加执行权限"
        fi
      fi
    else
      echo "[$TIMESTAMP]   ✗ 下载的文件为空"
      rm -f "$TEMP_FILE"
      FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
  else
    echo "[$TIMESTAMP]   ✗ 下载失败"
    rm -f "$TEMP_FILE"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
  echo ""
done

# 显示更新摘要
echo "[$TIMESTAMP] ================================"
echo "[$TIMESTAMP] 更新完成！"
echo "[$TIMESTAMP] 成功更新: $SUCCESS_COUNT 个文件"
echo "[$TIMESTAMP] 跳过更新: $SKIP_COUNT 个文件（无变化）"
echo "[$TIMESTAMP] 更新失败: $FAIL_COUNT 个文件"
echo "[$TIMESTAMP] 备份位置: $BACKUP_DIR"
echo "[$TIMESTAMP] ================================"

# 如果有更新成功的文件，建议刷新网页
if [ $SUCCESS_COUNT -gt 0 ]; then
  echo "[$TIMESTAMP] 提示: 请刷新网页查看最新内容"
fi

# 返回适当的退出码
if [ $FAIL_COUNT -gt 0 ]; then
  exit 1
else
  exit 0
fi
