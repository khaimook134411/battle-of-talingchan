FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3001

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# the server only needs its own code, shared rules and the card data
COPY tsconfig.json ./
COPY src/server ./src/server
COPY src/shared ./src/shared
COPY public/data ./public/data

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://localhost:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npx", "tsx", "src/server/index.ts"]
