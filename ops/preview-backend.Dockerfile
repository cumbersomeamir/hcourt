FROM mcr.microsoft.com/playwright:v1.55.0-noble

WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000
CMD ["npm", "start"]
