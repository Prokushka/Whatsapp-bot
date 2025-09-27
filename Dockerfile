FROM node:20
# Рабочая директория
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    unzip \
    chromium \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libdrm2 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libpango-1.0-0 \
    libcairo2 \
    && rm -rf /var/lib/apt/lists/*

# Рабочая папка
WORKDIR /usr/src/app

# Копируем package.json и ставим зависимости
COPY package*.json ./

RUN npm install

# Копируем код
COPY . .

# Указываем порт
EXPOSE 3000

# Запускаем nodemon для разработки
CMD ["npm", "run", "dev"]

