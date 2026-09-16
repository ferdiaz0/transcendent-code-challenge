# Optional: run without installing Node 22 locally.
#   docker build -t community-voices .
#   docker run -p 3000:3000 -e ANTHROPIC_API_KEY=sk-ant-... -v community-voices-data:/app/data community-voices
FROM node:22-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000
CMD ["npm", "start"]
