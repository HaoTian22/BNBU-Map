## 更新 POI 数据 / Update POI Data

项目包含自动获取最新 POI（兴趣点）数据的脚本：

### Windows 用户：
双击运行 `fetch-poi.bat` 或在命令行中执行：
```bash
fetch-poi.bat
```

### Linux/Mac 用户：
首先给脚本添加执行权限：
```bash
chmod +x fetch-poi.sh
```
然后运行：
```bash
./fetch-poi.sh
```

脚本会自动：
1. 读取 `Overpass.txt` 中的查询语句
2. 从 Overpass API 获取最新的校园数据
3. 保存为 `POI.json` 文件
4. 刷新网页即可看到最新数据

### 自定义查询：
如需修改查询范围或条件，请编辑 `Overpass.txt` 文件。

### Linux 定时自动更新：

使用 cron 设置定时任务，每天自动更新POI数据：

1. 编辑 crontab：
```bash
crontab -e
```

2. 添加定时任务（示例）：
```bash
# 每天凌晨3点更新POI数据
0 3 * * * cd /path/to/BNBU-Map && ./fetch-poi.sh >> logs/poi-update.log 2>&1

# 或者每12小时更新一次
0 */12 * * * cd /path/to/BNBU-Map && ./fetch-poi.sh >> logs/poi-update.log 2>&1

# 或者每周一早上8点更新
0 8 * * 1 cd /path/to/BNBU-Map && ./fetch-poi.sh >> logs/poi-update.log 2>&1
```

3. 创建日志目录：
```bash
mkdir -p logs
```

4. 查看定时任务：
```bash
crontab -l
```

5. 查看更新日志：
```bash
tail -f logs/poi-update.log
```

**Cron 时间格式说明：**
```
* * * * *
│ │ │ │ └─ 星期几 (0-7, 0和7都代表周日)
│ │ │ └─── 月份 (1-12)
│ │ └───── 日期 (1-31)
│ └─────── 小时 (0-23)
└───────── 分钟 (0-59)
```

