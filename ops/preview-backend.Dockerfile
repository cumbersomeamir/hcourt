FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr && rm -rf /var/lib/apt/lists/*
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000
CMD ["npm", "start"]
