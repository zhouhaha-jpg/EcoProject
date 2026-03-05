# Node + Python 双环境，用于运行 MILP 优化
FROM node:22-slim

# 安装 Python3 及 pip
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# 安装 Python 依赖（numpy, scipy）
COPY python/requirements.txt /tmp/requirements.txt
RUN pip3 install --break-system-packages --no-cache-dir -r /tmp/requirements.txt

# 应用代码
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

EXPOSE 5000
ENV PORT=5000
CMD ["node", "index.js"]
