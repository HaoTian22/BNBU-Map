#!/bin/bash

cd "$(dirname "$0")" || exit 1

# 主端点 + 备用镜像（406/超时时依次尝试）
OVERPASS_ENDPOINTS=(
  "https://overpass-api.de/api/interpreter"
  "https://overpass.kumi.systems/api/interpreter"
  "https://overpass.private.coffee/api/interpreter"
)

OUTPUT_FILE="POI.json"
TEMP_FILE="POI.json.tmp"

# 自定义 User-Agent（必须唯一、非默认，否则会被 406 拒绝）
USER_AGENT="HowieUmap/1.0"

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$TIMESTAMP] 正在从 Overpass API 获取数据..."
echo "[$TIMESTAMP] 查询内容来自: Overpass.txt"
echo "[$TIMESTAMP] 输出文件: $OUTPUT_FILE"
echo ""

QUERY=$(cat Overpass.txt)

MAX_RETRIES=3
RETRY_DELAY=10
SUCCESS=0

for ENDPOINT in "${OVERPASS_ENDPOINTS[@]}"; do
  echo "[$TIMESTAMP] 尝试端点: $ENDPOINT"

  for attempt in $(seq 1 $MAX_RETRIES); do
    echo "[$TIMESTAMP] 尝试获取数据 (第 $attempt 次)..."

    HTTP_CODE=$(curl -X POST \
      "$ENDPOINT" \
      -H "User-Agent: $USER_AGENT" \
      -H "Accept: application/json" \
      -H "Content-Type: application/x-www-form-urlencoded" \
      --data-urlencode "data=$QUERY" \
      -o "$TEMP_FILE" \
      -w "%{http_code}" \
      --silent --show-error \
      --max-time 60)

    CURL_EXIT=$?

    if [ $CURL_EXIT -eq 0 ] && [ "$HTTP_CODE" = "200" ]; then
      echo "[$TIMESTAMP] ✓ 网络请求成功 (HTTP $HTTP_CODE)"
      SUCCESS=1
      break 2
    else
      echo "[$TIMESTAMP] ✗ 请求失败 (curl退出码: $CURL_EXIT, HTTP状态: $HTTP_CODE)"
      if [ "$HTTP_CODE" = "406" ]; then
        echo "[$TIMESTAMP] ⚠ 406 Not Acceptable，可能是 User-Agent 被拒绝或该端点限流，切换端点..."
        break
      fi
      if [ $attempt -lt $MAX_RETRIES ]; then
        echo "[$TIMESTAMP] 等待 ${RETRY_DELAY} 秒后重试..."
        sleep $RETRY_DELAY
      fi
    fi
  done
done

if [ "$SUCCESS" -ne 1 ]; then
  echo "[$TIMESTAMP] ✗ 所有端点均失败，放弃操作"
  rm -f "$TEMP_FILE"
  exit 1
fi

if [ ! -f "$TEMP_FILE" ] || [ ! -s "$TEMP_FILE" ]; then
  echo "[$TIMESTAMP] ✗ 文件为空或不存在！"
  rm -f "$TEMP_FILE"
  exit 1
fi

if ! grep -q '"elements"' "$TEMP_FILE"; then
  echo "[$TIMESTAMP] ✗ 返回的数据格式无效！"
  head -n 5 "$TEMP_FILE"
  rm -f "$TEMP_FILE"
  exit 1
fi

ELEMENT_COUNT=$(grep -o '"type"' "$TEMP_FILE" | wc -l)

if [ "$ELEMENT_COUNT" -eq 0 ]; then
  echo "[$TIMESTAMP] ⚠ 警告: 没有找到任何POI数据！"
  rm -f "$TEMP_FILE"
  exit 1
fi

mv "$TEMP_FILE" "$OUTPUT_FILE"

echo "[$TIMESTAMP] ✓ 数据验证通过！"
echo "[$TIMESTAMP] ✓ 已更新文件: $OUTPUT_FILE"

FILE_SIZE=$(ls -lh "$OUTPUT_FILE" | awk '{print $5}')
echo "[$TIMESTAMP] ✓ 文件大小: $FILE_SIZE"
echo "[$TIMESTAMP] ✓ 元素数量: $ELEMENT_COUNT 个"

SEO_TS=$(date '+%Y-%m-%d %H:%M:%S')
if command -v node >/dev/null 2>&1; then
  echo "[$SEO_TS] 正在生成 SEO 文件 (sitemap.xml + poi-directory.html)..."
  if node generate-seo.js; then
    echo "[$SEO_TS] ✓ SEO 文件已更新"
  else
    echo "[$SEO_TS] ⚠ SEO 文件生成失败（不影响 POI 数据）"
  fi
else
  echo "[$SEO_TS] ⚠ 未找到 node，跳过 SEO 文件生成"
fi

echo "[$TIMESTAMP] 更新完成"