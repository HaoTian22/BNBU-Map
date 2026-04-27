#!/bin/bash

# 切换到脚本所在目录
cd "$(dirname "$0")" || exit 1

# Overpass API 端点
OVERPASS_API="https://overpass-api.de/api/interpreter"

# 输出文件
OUTPUT_FILE="POI.json"
TEMP_FILE="POI.json.tmp"

# 添加时间戳用于日志
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$TIMESTAMP] 正在从 Overpass API 获取数据..."
echo "[$TIMESTAMP] 查询内容来自: Overpass.txt"
echo "[$TIMESTAMP] 输出文件: $OUTPUT_FILE"
echo ""

# 读取Overpass查询内容
QUERY=$(cat Overpass.txt)

# 重试配置
MAX_RETRIES=3
RETRY_DELAY=10

# 使用循环进行重试
for attempt in $(seq 1 $MAX_RETRIES); do
  echo "[$TIMESTAMP] 尝试获取数据 (第 $attempt 次)..."
  
  # 使用 curl 发送 POST 请求到临时文件
  curl -X POST \
    "$OVERPASS_API" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --data-urlencode "data=$QUERY" \
    -o "$TEMP_FILE" \
    --silent --show-error \
    --max-time 60

  # 检查curl是否执行成功
  if [ $? -eq 0 ]; then
    echo "[$TIMESTAMP] ✓ 网络请求成功"
    break
  else
    echo "[$TIMESTAMP] ✗ 网络请求失败 (第 $attempt 次)"
    
    if [ $attempt -lt $MAX_RETRIES ]; then
      echo "[$TIMESTAMP] 等待 ${RETRY_DELAY} 秒后重试..."
      sleep $RETRY_DELAY
    else
      echo "[$TIMESTAMP] ✗ 已达到最大重试次数 ($MAX_RETRIES 次)，放弃操作"
      echo "[$TIMESTAMP] 请检查网络连接或 Overpass API 是否可用"
      rm -f "$TEMP_FILE"
      exit 1
    fi
  fi
done

# 检查文件是否存在且不为空
if [ ! -f "$TEMP_FILE" ] || [ ! -s "$TEMP_FILE" ]; then
  echo "[$TIMESTAMP] ✗ 文件为空或不存在！"
  echo "[$TIMESTAMP] Overpass API 可能返回了错误"
  rm -f "$TEMP_FILE"
  exit 1
fi

# 检查是否为有效的JSON格式（包含elements数组）
if ! grep -q '"elements"' "$TEMP_FILE"; then
  echo "[$TIMESTAMP] ✗ 返回的数据格式无效！"
  echo "[$TIMESTAMP] 文件内容："
  head -n 5 "$TEMP_FILE"
  rm -f "$TEMP_FILE"
  exit 1
fi

# 统计元素数量
ELEMENT_COUNT=$(grep -o '"type"' "$TEMP_FILE" | wc -l)

# 检查是否有数据
if [ "$ELEMENT_COUNT" -eq 0 ]; then
  echo "[$TIMESTAMP] ⚠ 警告: 没有找到任何POI数据！"
  echo "[$TIMESTAMP] 请检查 Overpass.txt 中的查询条件"
  rm -f "$TEMP_FILE"
  exit 1
fi

# 所有检查通过，用临时文件替换正式文件
mv "$TEMP_FILE" "$OUTPUT_FILE"

# 显示成功信息
echo "[$TIMESTAMP] ✓ 数据验证通过！"
echo "[$TIMESTAMP] ✓ 已更新文件: $OUTPUT_FILE"

# 显示文件大小
FILE_SIZE=$(ls -lh "$OUTPUT_FILE" | awk '{print $5}')
echo "[$TIMESTAMP] ✓ 文件大小: $FILE_SIZE"

# 显示元素数量
echo "[$TIMESTAMP] ✓ 元素数量: $ELEMENT_COUNT 个"
echo "[$TIMESTAMP] 更新完成"
