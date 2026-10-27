
# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

# Instala dependências sem executar automaticamente scripts de terceiros
RUN npm ci --ignore-scripts

# Prepara os engines do Prisma explicitamente
RUN npm rebuild @prisma/engines

COPY prisma ./prisma

# Utiliza o Prisma instalado no projeto, sem baixar pacotes via npx
RUN ./node_modules/.bin/prisma generate

COPY . .

RUN npm run build


# Production stage
FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./

# Instala somente dependências de produção
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

# Executa a aplicação sem privilégios de root
USER node

CMD ["node", "dist/server.js"]
